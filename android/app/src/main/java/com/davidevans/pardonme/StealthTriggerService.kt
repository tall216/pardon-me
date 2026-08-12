package com.davidevans.pardonme

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media.VolumeProviderCompat

/**
 * StealthTriggerService — background volume-key capture.
 *
 * THE PROBLEM
 * Android delivers KeyEvents only to the foreground activity. PardonMe needs the
 * opposite: the app must be closed (or the phone locked) and a double-press of a
 * volume key must fire a fake call. Activity key handling cannot do this.
 *
 * THE MECHANISM
 * The one sanctioned path is the media button pipeline. When an app owns an
 * ACTIVE MediaSession with a REMOTE VolumeProvider, the system routes hardware
 * volume keys to that provider instead of changing stream volume — even while
 * the screen is off or another app is in front. Media players use this to
 * control cast/remote devices; we use it to observe presses.
 *
 * Requirements for the system to keep routing to us, each handled below:
 *   1. The session must be active and hold a PLAYING playback state, otherwise
 *      the routing is handed back to the audio stream after a short timeout.
 *   2. Something must keep the process alive: a foreground service with a
 *      persistent (minimum-importance) notification.
 *   3. A silent looping track keeps the session credible as "playing media"
 *      without producing audible sound.
 *
 * PRIVACY / SCOPE
 * This is not an AccessibilityService and reads nothing but volume adjustments
 * directed at our own session. No key logging, no screen reading, no other app's
 * data is visible to it.
 *
 * TRADE-OFF (documented honestly)
 * While armed, the volume keys adjust our session rather than media volume, and
 * a persistent "armed" notification is shown (Android requires it for a
 * foreground service). Both are the cost of background capture; the service can
 * be disarmed from the app at any time.
 */
class StealthTriggerService : Service() {

    private var mediaSession: MediaSessionCompat? = null
    private var silentPlayer: MediaPlayer? = null
    private var volumeObserver: ContentObserver? = null
    private var volumeBroadcastReceiver: BroadcastReceiver? = null
    private var lastPressAt = 0L
    private var lastEventAt = 0L
    private var pressCount = 0
    private var burstLength = 0
    private var totalPresses = 0

    /** Streams we watch for user volume changes. */
    private val watchedStreams = intArrayOf(
        AudioManager.STREAM_MUSIC,
        AudioManager.STREAM_RING,
        AudioManager.STREAM_NOTIFICATION,
        AudioManager.STREAM_ALARM
    )
    private val lastKnownVolumes = HashMap<Int, Int>()

    /** True while our own end-stop nudge is in flight, so it isn't miscounted. */
    @Volatile
    private var ignoreNextChange = false

    companion object {
        private const val TAG = "PardonMeStealth"
        const val CHANNEL_ID = "pardonme_stealth_armed_v1"
        const val NOTIFICATION_ID = 4243

        const val ACTION_ARM = "com.davidevans.pardonme.ARM"
        const val ACTION_DISARM = "com.davidevans.pardonme.DISARM"

        /**
         * Window in which a second press counts as a double-press. Generous
         * because real thumbs on a locked phone in a pocket are slower than a
         * deliberate tap-tap on a bench.
         */
        private const val DOUBLE_PRESS_WINDOW_MS = 1500L

        /**
         * Presses closer together than this came from one physical key press
         * seen by more than one detector, not from the user pressing twice.
         */
        /**
         * Any two volume events closer together than this are treated as one.
         * Covers both duplicate reports from the three detectors (milliseconds
         * apart) and key auto-repeat while a button is held (~50ms apart).
         * A deliberate double-press has a much larger gap, because the thumb
         * has to lift and come back.
         */
        private const val QUIET_WINDOW_MS = 200L

        /**
         * A run of this many rapid events means the key is being HELD, not
         * tapped. Auto-repeat rates differ between OEMs, so we detect the
         * pattern rather than assume a rate.
         */
        private const val BURST_EVENT_THRESHOLD = 3

        /**
         * After a hold, this much silence is required before a press is
         * trusted again — otherwise the last repeat of a hold reads as a tap.
         */
        private const val BURST_RESET_MS = 600L

        /** AudioManager's volume broadcast (not a public constant). */
        private const val VOLUME_CHANGED_ACTION = "android.media.VOLUME_CHANGED_ACTION"
        private const val EXTRA_VOLUME_STREAM_TYPE = "android.media.EXTRA_VOLUME_STREAM_TYPE"
        private const val EXTRA_VOLUME_STREAM_VALUE = "android.media.EXTRA_VOLUME_STREAM_VALUE"
        private const val EXTRA_PREV_VOLUME_STREAM_VALUE =
            "android.media.EXTRA_PREV_VOLUME_STREAM_VALUE"

        /**
         * Presses required to fire. Two is the documented UX; a third press
         * inside the window is ignored (guards against key repeat/bounce).
         */
        private const val PRESSES_TO_FIRE = 2

        @Volatile
        var isArmed = false
            private set

        /** Live instance, used only for the diagnostics readout. */
        @Volatile
        var instance: StealthTriggerService? = null
            private set

        fun arm(context: Context) {
            setArmedPreference(context, true)
            val intent = Intent(context, StealthTriggerService::class.java).apply {
                action = ACTION_ARM
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                // Android 12+ throws ForegroundServiceStartNotAllowedException
                // when a service is started from the background without an
                // exemption. Never let that take the app down — the user can
                // re-arm from the UI, and the other trigger paths still work.
                Log.e(TAG, "Could not start stealth service (background start blocked?)", e)
            }
        }

        fun disarm(context: Context) {
            setArmedPreference(context, false)
            val intent = Intent(context, StealthTriggerService::class.java).apply {
                action = ACTION_DISARM
            }
            try {
                context.startService(intent)
            } catch (e: Exception) {
                Log.w(TAG, "Could not deliver disarm intent; stopping directly", e)
                try {
                    context.stopService(Intent(context, StealthTriggerService::class.java))
                } catch (_: Exception) {}
            }
        }

        private const val PREFS = "pardonme_state"
        private const val KEY_ARMED = "stealth_armed"

        /** Remembers the user's intent across reboots and process death. */
        private fun setArmedPreference(context: Context, armed: Boolean) {
            try {
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putBoolean(KEY_ARMED, armed).apply()
            } catch (_: Exception) {}
        }

        /**
         * Armed is the DEFAULT state: an excuse app that is switched off when
         * you need it is useless, so the trigger is live from first launch and
         * stays live until the user deliberately disarms it. Only an explicit
         * disarm writes `false`.
         */
        fun wasArmedByUser(context: Context): Boolean = try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_ARMED, true)
        } catch (_: Exception) {
            true
        }

        /**
         * Start the trigger unless the user turned it off. Called on every app
         * launch and after boot so "armed" survives reboots, force-stops, and
         * the OS reclaiming the process.
         */
        fun armIfEnabled(context: Context) {
            if (!wasArmedByUser(context)) return
            if (isArmed) return
            try {
                arm(context)
            } catch (e: Exception) {
                Log.w(TAG, "Auto-arm failed", e)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DISARM -> {
                /*
                 * CRITICAL: if this service was launched via
                 * startForegroundService(), Android gives us ~5 seconds to call
                 * startForeground() or it kills the app with a
                 * ForegroundServiceDidNotStartInTimeException. A disarm intent
                 * can arrive on a service instance that has not yet promoted
                 * itself, so promote first and tear down immediately after.
                 * Cheap insurance against a hard crash.
                 */
                try {
                    startForeground(NOTIFICATION_ID, buildArmedNotification())
                } catch (_: Exception) {}
                teardown()
                stopSelf()
                return START_NOT_STICKY
            }
            else -> startArmed()
        }
        // START_STICKY: if the OS reclaims the process under memory pressure we
        // want to come back armed.
        return START_STICKY
    }

    private fun startArmed() {
        if (isArmed) {
            // Already running: still re-promote in case this call came from a
            // startForegroundService() that expects a startForeground().
            try {
                startForeground(NOTIFICATION_ID, buildArmedNotification())
            } catch (_: Exception) {}
            return
        }
        try {
            // Promote FIRST, before any of the detector setup. If a detector
            // throws, we have already satisfied the 5-second contract and can
            // shut down cleanly instead of being killed by the system.
            startForeground(NOTIFICATION_ID, buildArmedNotification())
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed — cannot arm", e)
            stopSelf()
            return
        }

        // Each detector is independent: one failing must not disable the
        // others, so they are armed separately rather than in one try block.
        var any = false
        try { setupMediaSession(); any = true } catch (e: Exception) {
            Log.e(TAG, "MediaSession detector failed", e)
        }
        try { startSilentLoop() } catch (e: Exception) {
            Log.e(TAG, "Keep-alive failed", e)
        }
        try { startVolumeObserver(); any = true } catch (e: Exception) {
            Log.e(TAG, "Settings observer failed", e)
        }
        try { startVolumeBroadcastReceiver(); any = true } catch (e: Exception) {
            Log.e(TAG, "Volume broadcast receiver failed", e)
        }

        if (!any) {
            Log.e(TAG, "No detector could start; disarming")
            teardown()
            stopSelf()
            return
        }

        isArmed = true
        instance = this
        Log.i(TAG, "Stealth trigger armed")
    }

    /**
     * The persistent notification. IMPORTANCE_MIN + PRIORITY_MIN keeps it as
     * quiet as Android allows: no sound, no heads-up, collapsed in the shade.
     */
    private fun buildArmedNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Stealth trigger",
                    NotificationManager.IMPORTANCE_MIN
                ).apply {
                    description = "Shown while volume-key triggering is armed"
                    setShowBadge(false)
                    setSound(null, null)
                    enableVibration(false)
                    lockscreenVisibility = Notification.VISIBILITY_SECRET
                }
                nm.createNotificationChannel(channel)
            }
        }

        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val disarmIntent = PendingIntent.getService(
            this, 1,
            Intent(this, StealthTriggerService::class.java).apply { action = ACTION_DISARM },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle("Ready")
            .setContentText("Double-press a volume key")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setOngoing(true)
            .setShowWhen(false)
            .setSilent(true)
            .setContentIntent(openApp)
            .addAction(0, "Disarm", disarmIntent)
            .build()
    }

    /**
     * The heart of it: a MediaSession whose volume control is REMOTE. With a
     * remote VolumeProvider the framework stops applying volume keys to the
     * audio stream and calls onAdjustVolume() on us instead.
     */
    private fun setupMediaSession() {
        val session = MediaSessionCompat(this, TAG).apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                    MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )

            // A PLAYING state is required for the system to treat this session as
            // the active volume target.
            setPlaybackState(
                PlaybackStateCompat.Builder()
                    .setState(
                        PlaybackStateCompat.STATE_PLAYING,
                        0L,
                        1.0f,
                        SystemClock.elapsedRealtime()
                    )
                    .setActions(
                        PlaybackStateCompat.ACTION_PLAY or
                            PlaybackStateCompat.ACTION_PAUSE or
                            PlaybackStateCompat.ACTION_PLAY_PAUSE
                    )
                    .build()
            )

            // Remote volume control: this is what redirects the hardware keys.
            // Mid-scale current volume so both Up and Down always produce an
            // adjustment callback (at an end stop the framework may suppress it).
            setPlaybackToRemote(object : VolumeProviderCompat(
                VOLUME_CONTROL_ABSOLUTE,
                /* maxVolume = */ 100,
                /* currentVolume = */ 50
            ) {
                override fun onAdjustVolume(direction: Int) {
                    // direction: -1 down, +1 up, 0 no-op/query.
                    if (direction != 0) {
                        onVolumeKeyPress()
                        // Re-centre so the next press is always reportable.
                        currentVolume = 50
                    }
                }

                override fun onSetVolumeTo(volume: Int) {
                    onVolumeKeyPress()
                    currentVolume = 50
                }
            })

            isActive = true
        }
        mediaSession = session
    }

    /**
     * Silent looping audio keep-alive.
     *
     * Without an actively playing track, Samsung (and several other OEMs) route
     * volume keys to the RING stream instead of the media session, and our
     * VolumeProvider never sees them.
     *
     * IMPORTANT ORDERING: MediaPlayer.create() returns an ALREADY PREPARED
     * player. Calling setAudioAttributes() on a prepared player throws
     * IllegalStateException, which previously killed this keep-alive silently.
     * Build the player manually so attributes are set before prepare().
     */
    private fun startSilentLoop() {
        try {
            val afd = resources.openRawResourceFd(R.raw.silence) ?: run {
                Log.e(TAG, "silence.wav missing from resources")
                return
            }
            val player = MediaPlayer()
            player.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            player.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            afd.close()
            player.isLooping = true
            player.setVolume(0f, 0f)
            player.setOnErrorListener { _, what, extra ->
                Log.e(TAG, "Silent player error what=$what extra=$extra")
                false
            }
            player.prepare()
            player.start()
            silentPlayer = player
            Log.i(TAG, "Silent keep-alive playing=${player.isPlaying}")
        } catch (e: Exception) {
            Log.e(TAG, "Silent keep-alive FAILED — volume routing may not hold", e)
        }
    }

    /**
     * SECOND, INDEPENDENT DETECTOR — system volume observer.
     *
     * The MediaSession route is the clean path, but Samsung One UI often keeps
     * hardware volume keys bound to the ring/media stream and never hands them
     * to a remote VolumeProvider. This observer watches the system volume
     * *settings* instead, so it sees the press whichever stream One UI picked.
     *
     * DESIGN NOTE (this is why the earlier version worked once and then died):
     * it deliberately does NOT restore the volume and does NOT use a
     * suppression window. Restoring generated our own settings write, which
     * either re-entered the detector or, while suppressed, desynced the cached
     * "previous" values — after which no further change was ever recognised.
     *
     * Instead we treat ANY observed change on a watched stream as a press and
     * simply re-read every stream's current level as the new baseline. There is
     * no state that can drift, so it keeps working indefinitely. The user's
     * volume moves a notch when they trigger a call, which is an acceptable and
     * far more robust trade than a detector that stops after one use.
     *
     * A ContentObserver inside a foreground service keeps firing with the
     * screen off and the app closed, which is the requirement.
     */
    private fun startVolumeObserver() {
        syncVolumeBaseline()

        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                var changedStream = -1
                var from = -1
                var to = -1

                for (stream in watchedStreams) {
                    val current = try {
                        audio.getStreamVolume(stream)
                    } catch (_: Exception) {
                        continue
                    }
                    val previous = lastKnownVolumes[stream]
                    if (previous != null && current != previous) {
                        changedStream = stream
                        from = previous
                        to = current
                        break
                    }
                }

                // Always re-baseline, whether or not we matched: this is what
                // keeps the detector alive across repeated presses.
                syncVolumeBaseline()

                // Our own nudge (below) must not be counted as a user press,
                // but the baseline above is refreshed either way, so no state
                // can drift out of sync.
                if (ignoreNextChange) {
                    ignoreNextChange = false
                    return
                }

                if (changedStream >= 0) {
                    Log.i(TAG, "Volume change stream=$changedStream $from -> $to")
                    onVolumeKeyPress()
                    keepOffTheRails(audio, changedStream, to)
                }
            }
        }

        contentResolver.registerContentObserver(
            Settings.System.CONTENT_URI, true, observer
        )
        volumeObserver = observer
        Log.i(TAG, "Volume observer registered on ${watchedStreams.size} streams")
    }

    /**
     * THIRD DETECTOR — the system volume broadcast.
     *
     * This is the most reliable of the three and the one that makes the
     * trigger work while another app is in the foreground.
     *
     * The ContentObserver only sees changes that reach Settings.System, and
     * the MediaSession only sees keys the framework chooses to route to us.
     * When another app (a video, a game, a music player) holds audio focus,
     * Android hands the volume key to THAT app's stream — often without a
     * settings write and always without touching our session — so both of the
     * other detectors go quiet. That is exactly the "phone open doing
     * something else" case.
     *
     * AudioManager broadcasts VOLUME_CHANGED_ACTION for every key press no
     * matter which app is in front, so a registered receiver catches all of
     * them. The extras also tell us the previous and new value, letting us
     * ignore no-op presses at the volume rails.
     */
    private fun startVolumeBroadcastReceiver() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != VOLUME_CHANGED_ACTION) return

                val stream = intent.getIntExtra(EXTRA_VOLUME_STREAM_TYPE, -1)
                if (stream !in watchedStreams) return

                val value = intent.getIntExtra(EXTRA_VOLUME_STREAM_VALUE, -1)
                val previous = intent.getIntExtra(EXTRA_PREV_VOLUME_STREAM_VALUE, -1)

                // Our own end-stop nudge, not a user press.
                if (ignoreNextChange) {
                    ignoreNextChange = false
                    syncVolumeBaseline()
                    return
                }

                // A press that did not move the volume (already at a rail)
                // still counts: the user pressed the key.
                Log.i(TAG, "Volume broadcast stream=$stream $previous -> $value")
                syncVolumeBaseline()
                onVolumeKeyPress()

                val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                keepOffTheRails(am, stream, value)
            }
        }

        val filter = IntentFilter(VOLUME_CHANGED_ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(receiver, filter)
        }
        volumeBroadcastReceiver = receiver
        Log.i(TAG, "Volume broadcast receiver registered")
    }

    /** Re-read every watched stream so the baseline can never drift. */
    private fun syncVolumeBaseline() {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        for (stream in watchedStreams) {
            try {
                lastKnownVolumes[stream] = am.getStreamVolume(stream)
            } catch (_: Exception) {}
        }
    }

    /**
     * Keep the stream off its end stops.
     *
     * At 0 a further Volume-Down produces no change, and at max a further
     * Volume-Up produces none either — the press becomes invisible and the
     * trigger appears to "stop working". One notch back from the rail keeps
     * both directions detectable forever.
     *
     * Unlike the earlier restore logic, this nudges only at the extremes and
     * never suppresses the baseline refresh, so it cannot desync the detector.
     */
    private fun keepOffTheRails(am: AudioManager, stream: Int, current: Int) {
        val max = try { am.getStreamMaxVolume(stream) } catch (_: Exception) { return }
        val target = when {
            current <= 0 -> 1
            current >= max -> max - 1
            else -> return
        }
        try {
            ignoreNextChange = true
            am.setStreamVolume(stream, target, AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE)
            lastKnownVolumes[stream] = target
            Log.i(TAG, "Nudged stream=$stream off rail to $target")
        } catch (e: Exception) {
            ignoreNextChange = false
            Log.w(TAG, "Could not nudge stream $stream", e)
        }
    }

    /** Snapshot for the in-app diagnostics panel. */
    fun diagnostics(): String {
        val playing = try { silentPlayer?.isPlaying == true } catch (_: Exception) { false }
        val sessionActive = mediaSession?.isActive == true
        val observerOn = volumeObserver != null
        val receiverOn = volumeBroadcastReceiver != null
        val sinceLast = if (lastPressAt == 0L) -1 else SystemClock.elapsedRealtime() - lastPressAt
        return "armed=$isArmed session=$sessionActive keepAlive=$playing " +
            "observer=$observerOn broadcast=$receiverOn " +
            "presses=$pressCount lastPressMsAgo=$sinceLast totalPresses=$totalPresses"
    }

    /**
     * Debounced double-press detector. Called on every volume adjustment routed
     * to our session.
     */
    private fun onVolumeKeyPress() {
        val now = SystemClock.elapsedRealtime()

        /*
         * Two different timestamps matter here:
         *
         *   lastEventAt — ANY volume event, including duplicates from the
         *                 other detectors and auto-repeat from a held key.
         *   lastPressAt — an event we accepted as a deliberate press.
         *
         * Keeping them separate is what makes a held key safe. Auto-repeat
         * arrives every ~50ms; because lastEventAt advances on every single
         * event, each repeat stays inside the quiet window and is swallowed
         * for as long as the button is held. Comparing against lastPressAt
         * instead let the gap accumulate until one repeat slipped through and
         * fired a call — i.e. holding volume down to turn the music up would
         * ring a fake call.
         */
        val sinceEvent = now - lastEventAt
        lastEventAt = now

        if (sinceEvent in 0 until QUIET_WINDOW_MS) {
            // Duplicate report of the same press, or key auto-repeat.
            burstLength++
            return
        }

        /*
         * BURST GUARD. Auto-repeat rates vary by OEM, and a slow repeat can
         * exceed the quiet window and look like a fresh press. But a hold has
         * a signature no double-tap has: a long unbroken run of events. Once
         * we have seen a run, require real silence before trusting a press
         * again, so the tail of a hold cannot ring a call.
         */
        if (burstLength >= BURST_EVENT_THRESHOLD && sinceEvent < BURST_RESET_MS) {
            burstLength++
            return
        }
        burstLength = 0

        totalPresses++

        val sincePress = now - lastPressAt
        if (sincePress > DOUBLE_PRESS_WINDOW_MS) {
            pressCount = 0
        }
        lastPressAt = now
        pressCount++
        Log.i(TAG, "Volume key press (count=$pressCount total=$totalPresses)")

        if (pressCount >= PRESSES_TO_FIRE) {
            pressCount = 0
            lastPressAt = 0L
            fireCall()
        }
    }

    private fun fireCall() {
        try {
            val caller = IncomingCallModule.lastCallerName ?: "Michael"
            IncomingCallModule.postCallNotification(applicationContext, caller)
            Log.i(TAG, "Stealth trigger fired call from: $caller")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fire call from stealth trigger", e)
        }
    }

    private fun teardown() {
        isArmed = false
        instance = null

        try {
            volumeObserver?.let { contentResolver.unregisterContentObserver(it) }
        } catch (_: Exception) {}
        volumeObserver = null

        try {
            volumeBroadcastReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {}
        volumeBroadcastReceiver = null
        try {
            silentPlayer?.stop()
            silentPlayer?.release()
        } catch (_: Exception) {}
        silentPlayer = null

        try {
            mediaSession?.isActive = false
            mediaSession?.release()
        } catch (_: Exception) {}
        mediaSession = null

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        teardown()
        super.onDestroy()
    }
}
