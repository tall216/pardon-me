package com.davidevans.pardonme

import android.Manifest
import android.app.AlarmManager
import android.app.AppOpsManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * IncomingCallModule — makes PardonMe behave like a real incoming call.
 *
 * WHY NATIVE: JavaScript cannot wake a locked phone. Android only shows UI over
 * the keyguard for a notification that carries a *full-screen intent* on a
 * high-importance channel. That notification also plays the ringtone on the
 * RING audio stream (not media), which is what makes it audible with the screen
 * off and, when the channel bypasses DND, while the phone is silenced.
 *
 * Scheduled calls use AlarmManager (setExactAndAllowWhileIdle) so they fire even
 * if the app has been backgrounded and the device is dozing — a JS timer cannot.
 */
class IncomingCallModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "IncomingCall"

    companion object {
        private const val TAG = "PardonMeCall"
        /** Request code for the Android 13+ notification permission dialog. */
        private const val REQ_POST_NOTIFICATIONS = 7301
        // Bumped when channel settings change: channels are immutable once created.
        // v4: new telephone-bell ringtone.
        const val CHANNEL_ID = "pardonme_incoming_call_v4"
        const val NOTIFICATION_ID = 4242
        const val EXTRA_CALLER = "pardonme_caller"
        const val EXTRA_INCOMING = "pardonme_incoming"

        /**
         * Set by the alarm receiver / notification launch; drained by JS on
         * resume. Mirrored to SharedPreferences because the process can be
         * killed between posting the notification and JS booting — an
         * in-memory field is lost in that window, which is the main reason the
         * call screen used to appear only sometimes.
         */
        @Volatile
        var pendingCaller: String? = null
            private set

        private const val PREFS = "pardonme_state"
        private const val KEY_PENDING = "pending_caller"
        private const val KEY_PENDING_AT = "pending_caller_at"

        /** A pending call older than this is stale and ignored. */
        private const val PENDING_TTL_MS = 60_000L

        fun setPendingCaller(context: Context, caller: String?) {
            pendingCaller = caller
            try {
                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                if (caller == null) {
                    prefs.edit().remove(KEY_PENDING).remove(KEY_PENDING_AT).apply()
                } else {
                    prefs.edit()
                        .putString(KEY_PENDING, caller)
                        .putLong(KEY_PENDING_AT, System.currentTimeMillis())
                        .apply()
                }
            } catch (_: Exception) {}
        }

        /** Reads the pending caller from memory or disk, honouring the TTL. */
        fun readPendingCaller(context: Context): String? {
            pendingCaller?.let { return it }
            return try {
                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val caller = prefs.getString(KEY_PENDING, null) ?: return null
                val at = prefs.getLong(KEY_PENDING_AT, 0L)
                if (System.currentTimeMillis() - at > PENDING_TTL_MS) {
                    prefs.edit().remove(KEY_PENDING).remove(KEY_PENDING_AT).apply()
                    null
                } else {
                    caller
                }
            } catch (_: Exception) {
                null
            }
        }

        /** Most recent caller name from JS, so native triggers use the right identity. */
        @Volatile
        var lastCallerName: String? = null

        /** Ring level before we boosted it, restored when the call ends. */
        @Volatile
        private var savedRingVolume: Int? = null

        fun ringtoneUri(context: Context): Uri =
            Uri.parse("android.resource://${context.packageName}/raw/ringtone")

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return

            val attrs = AudioAttributes.Builder()
                // USAGE_NOTIFICATION_RINGTONE routes to the RING stream — the one
                // that stays audible when media is muted.
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            val channel = NotificationChannel(
                CHANNEL_ID,
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Fake incoming call alerts"
                setSound(ringtoneUri(context), attrs)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 800, 600, 800, 600, 800)
                setBypassDnd(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableLights(true)
            }
            nm.createNotificationChannel(channel)
        }

        /** Posts the call notification. Shows over the lock screen via full-screen intent. */
        fun postCallNotification(context: Context, callerName: String) {
            ensureChannel(context)
            setPendingCaller(context, callerName)
            maximiseRingVolume(context)

            val fullScreenIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                putExtra(EXTRA_INCOMING, true)
                putExtra(EXTRA_CALLER, callerName)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getActivity(context, 1001, fullScreenIntent, flags)

            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle(callerName)
                .setContentText("Incoming call")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(true)
                .setSound(ringtoneUri(context))
                .setVibrate(longArrayOf(0, 800, 600, 800, 600, 800))
                .setContentIntent(pi)
                // `true` = launch immediately (heads-up over the keyguard) rather
                // than only showing a heads-up banner.
                .setFullScreenIntent(pi, true)
                .build()

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIFICATION_ID, notification)

            // Belt and braces: some OEMs (Samsung among them) are unreliable
            // about honouring a full-screen intent from a background service.
            // We hold SYSTEM_ALERT_WINDOW and run a foreground service, both of
            // which grant background-activity-start privileges, so also ask for
            // the activity directly. If the intent already launched it, the
            // singleTask launch mode makes this a no-op via onNewIntent.
            try {
                context.startActivity(fullScreenIntent)
            } catch (e: Exception) {
                Log.w(TAG, "Direct activity start refused; relying on full-screen intent", e)
            }
        }

        fun cancelCallNotification(context: Context) {
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(NOTIFICATION_ID)
            } catch (e: Exception) {
                Log.w(TAG, "Could not cancel call notification", e)
            }
            setPendingCaller(context, null)
            restoreRingVolume(context)
        }

        /**
         * A fake call is useless if it whispers. Push the ring stream to full
         * for the duration of the call, remembering the old level so it can be
         * put back when the call ends.
         *
         * On a phone in Do Not Disturb, setStreamVolume throws SecurityException
         * unless the app holds notification-policy access — which we do not ask
         * for. Swallowing that is deliberate: the channel already bypasses DND,
         * so the call still rings, just at the user's own level.
         */
        private fun maximiseRingVolume(context: Context) {
            try {
                val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                if (savedRingVolume == null) {
                    savedRingVolume = am.getStreamVolume(AudioManager.STREAM_RING)
                }
                am.setStreamVolume(
                    AudioManager.STREAM_RING,
                    am.getStreamMaxVolume(AudioManager.STREAM_RING),
                    0
                )
            } catch (e: SecurityException) {
                Log.i(TAG, "Ring volume locked by DND policy; using current level")
            } catch (e: Exception) {
                Log.w(TAG, "Could not raise ring volume", e)
            }
        }

        private fun restoreRingVolume(context: Context) {
            val previous = savedRingVolume ?: return
            savedRingVolume = null
            try {
                val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                am.setStreamVolume(AudioManager.STREAM_RING, previous, 0)
            } catch (_: Exception) {}
        }
    }

    /** Arm background volume-key capture (MediaSession + foreground service). */
    @ReactMethod
    fun armStealthTrigger(promise: Promise) {
        try {
            StealthTriggerService.arm(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_ARM", e)
        }
    }

    /** Stop background volume-key capture and remove the persistent notice. */
    @ReactMethod
    fun disarmStealthTrigger(promise: Promise) {
        try {
            StealthTriggerService.disarm(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_DISARM", e)
        }
    }

    @ReactMethod
    fun isStealthArmed(promise: Promise) {
        promise.resolve(StealthTriggerService.isArmed)
    }

    /** Live diagnostics string for the in-app troubleshooting panel. */
    @ReactMethod
    fun stealthDiagnostics(promise: Promise) {
        promise.resolve(
            StealthTriggerService.instance?.diagnostics() ?: "service not running"
        )
    }

    /** Keeps native triggers (volume keys) in sync with the chosen identity. */
    @ReactMethod
    fun setCallerName(callerName: String, promise: Promise) {
        lastCallerName = callerName
        promise.resolve(true)
    }

    /** Fire an incoming call right now (rings + shows over lock screen). */
    @ReactMethod
    fun showIncomingCall(callerName: String, promise: Promise) {
        try {
            lastCallerName = callerName
            postCallNotification(reactContext, callerName)
            hideSystemBars()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SHOW_CALL", e)
        }
    }

    /**
     * Hide status + navigation bars on the current activity.
     *
     * Needed for calls triggered while the app is already open: those never go
     * through the full-screen-intent path in MainActivity, so without this the
     * white navigation bar stays drawn under the fake call screen.
     */
    private fun hideSystemBars() {
        val activity = reactContext.currentActivity ?: return
        activity.runOnUiThread {
            try {
                val window = activity.window
                WindowCompat.setDecorFitsSystemWindows(window, false)
                window.statusBarColor = Color.TRANSPARENT
                window.navigationBarColor = Color.TRANSPARENT
                WindowInsetsControllerCompat(window, window.decorView).apply {
                    hide(WindowInsetsCompat.Type.systemBars())
                    systemBarsBehavior =
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            } catch (_: Exception) {}
        }
    }

    /**
     * Called when the fake call ends. If the app was opened by the call, it
     * disappears back to whatever the user was doing instead of revealing the
     * PardonMe UI. Launcher-opened sessions are left alone.
     */
    @ReactMethod
    fun leaveIfCallLaunched(promise: Promise) {
        try {
            MainActivity.activeInstance?.leaveIfCallLaunched()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_LEAVE", e)
        }
    }

    /** Restore the system bars when the call UI goes away. */
    @ReactMethod
    fun restoreSystemBars(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        activity.runOnUiThread {
            try {
                val window = activity.window
                WindowInsetsControllerCompat(window, window.decorView)
                    .show(WindowInsetsCompat.Type.systemBars())
                WindowCompat.setDecorFitsSystemWindows(window, true)
            } catch (_: Exception) {}
        }
        promise.resolve(true)
    }

    /** Stop ringing and clear the notification (answer / decline / end). */
    @ReactMethod
    fun dismissCall(promise: Promise) {
        try {
            cancelCallNotification(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_DISMISS_CALL", e)
        }
    }

    /** Schedule a call `seconds` from now; survives backgrounding and doze. */
    @ReactMethod
    fun scheduleCall(callerName: String, seconds: Double, promise: Promise) {
        try {
            ensureChannel(reactContext)
            val am = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(reactContext, CallAlarmReceiver::class.java).apply {
                putExtra(EXTRA_CALLER, callerName)
            }
            val pi = PendingIntent.getBroadcast(
                reactContext, 2002, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerAt = System.currentTimeMillis() + (seconds * 1000).toLong()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                // No exact-alarm permission: fall back to an inexact alarm rather
                // than crashing. May fire slightly late.
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SCHEDULE", e)
        }
    }

    @ReactMethod
    fun cancelScheduledCall(promise: Promise) {
        try {
            val am = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(reactContext, CallAlarmReceiver::class.java)
            val pi = PendingIntent.getBroadcast(
                reactContext, 2002, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            am.cancel(pi)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_CANCEL", e)
        }
    }

    /**
     * Returns the caller name if the app was opened by a call notification,
     * then clears it. JS calls this on mount/resume to raise the call UI.
     */
    @ReactMethod
    fun consumePendingCall(promise: Promise) {
        val caller = readPendingCaller(reactContext)
        setPendingCaller(reactContext, null)
        promise.resolve(caller)
    }

    /**
     * Android 13+ (TIRAMISU) made notifications a runtime permission that is
     * DENIED by default. Without it the app is completely silent — no ring, no
     * call screen — which is the single biggest compatibility risk across the
     * install base. Older versions grant it at install time.
     */
    @ReactMethod
    fun hasNotificationPermission(promise: Promise) {
        promise.resolve(notificationsAllowed())
    }

    /**
     * Whether notifications will actually be seen and heard.
     *
     * Three independent things can silence this app, and no single API covers
     * all of them:
     *
     *  1. The app-level notification switch. Normally reported by
     *     `areNotificationsEnabled()` — but on some Samsung builds that returns
     *     true even with the toggle off. The underlying OP_POST_NOTIFICATION
     *     appop is accurate there, so it is checked directly via reflection
     *     (the constant is hidden API, hence the string lookup and the
     *     conservative fallback).
     *  2. The ring channel being blocked or set to IMPORTANCE_NONE.
     *  3. Android 13+ denying POST_NOTIFICATIONS at install.
     *
     * A false negative here is far worse than a false positive: it would tell
     * the user everything is fine while the app cannot ring at all.
     */
    private fun notificationsAllowed(): Boolean = try {
        val enabled = NotificationManagerCompat.from(reactContext).areNotificationsEnabled()
        when {
            !enabled -> false
            !appOpNotificationsAllowed() -> false
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
                ensureChannel(reactContext)
                val nm = reactContext
                    .getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val channel = nm.getNotificationChannel(CHANNEL_ID)
                channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE
            }
            else -> true
        }
    } catch (_: Exception) {
        true
    }

    /**
     * Reads OP_POST_NOTIFICATION, which reflects the OEM's own per-app
     * notification switch even when the public API does not. Returns true when
     * the op cannot be read, so an unknown state never blocks the app.
     */
    private fun appOpNotificationsAllowed(): Boolean = try {
        val appOps = reactContext
            .getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val opField = AppOpsManager::class.java.getDeclaredField("OP_POST_NOTIFICATION")
        opField.isAccessible = true
        val op = opField.getInt(null)
        val method = AppOpsManager::class.java.getMethod(
            "checkOpNoThrow",
            Int::class.javaPrimitiveType,
            Int::class.javaPrimitiveType,
            String::class.java
        )
        val mode = method.invoke(
            appOps, op, android.os.Process.myUid(), reactContext.packageName
        ) as Int
        mode == AppOpsManager.MODE_ALLOWED
    } catch (_: Throwable) {
        true
    }

    /**
     * Ask for the notification permission. Must run against an Activity;
     * falls back to opening app settings when the OS will no longer show the
     * dialog (permanently denied) or when there is no activity to host it.
     */
    @ReactMethod
    fun requestNotificationPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            promise.resolve(notificationsAllowed())
            return
        }
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            if (notificationsAllowed()) {
                promise.resolve(true)
                return
            }
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                REQ_POST_NOTIFICATIONS
            )
            // The dialog is async; JS re-checks on resume rather than waiting.
            promise.resolve(false)
        } catch (e: Exception) {
            Log.w(TAG, "Notification permission request failed", e)
            promise.resolve(false)
        }
    }

    /** Opens this app's notification settings (permanently-denied fallback). */
    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                }
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.w(TAG, "Could not open notification settings", e)
            promise.resolve(false)
        }
    }

    /**
     * Battery optimisation is the main reason the trigger dies on Xiaomi,
     * Huawei, OnePlus, Oppo and Vivo: their aggressive task killers stop the
     * foreground service within minutes unless the app is exempted.
     */
    @ReactMethod
    fun isBatteryOptimised(promise: Promise) {
        promise.resolve(batteryOptimised())
    }

    private fun batteryOptimised(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
        return try {
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            // Assigned to a val rather than negated inline: a line starting
            // with `!` directly after `as PowerManager` is parsed by Kotlin as
            // a type modifier, not a negation, and fails to compile.
            val exempt = pm.isIgnoringBatteryOptimizations(reactContext.packageName)
            exempt.not()
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Send the user to the battery-optimisation screen. Deliberately uses the
     * settings LIST rather than REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: Play
     * restricts that permission to apps whose core function genuinely requires
     * it, and requesting it is a common rejection reason. Opening settings
     * needs no permission at all.
     */
    @ReactMethod
    fun openBatterySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            // Not every OEM ships that screen; fall back to app details.
            try {
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(fallback)
                promise.resolve(true)
            } catch (e2: Exception) {
                Log.w(TAG, "Could not open battery settings", e2)
                promise.resolve(false)
            }
        }
    }

    /**
     * Single source of truth for "will this app actually work on this phone".
     *
     * Every capability here is gated by a different OS version or OEM policy,
     * so rather than have the UI guess, the native side reports the real state
     * and JS renders whatever needs fixing.
     */
    @ReactMethod
    fun getDeviceReadiness(promise: Promise) {
        val map = Arguments.createMap()
        try {
            map.putInt("sdkInt", Build.VERSION.SDK_INT)
            map.putString("release", Build.VERSION.RELEASE ?: "")
            map.putString("manufacturer", Build.MANUFACTURER ?: "")
            map.putString("model", Build.MODEL ?: "")

            map.putBoolean("notifications", notificationsAllowed())
            map.putBoolean(
                "needsNotificationRequest",
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsAllowed()
            )

            // Android 14+ per-app full-screen-intent gate.
            val fsi = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                try {
                    val nm = reactContext
                        .getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    nm.canUseFullScreenIntent()
                } catch (_: Exception) {
                    true
                }
            } else true
            map.putBoolean("fullScreenIntent", fsi)

            // Android 12+ exact-alarm gate.
            val exact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    val am = reactContext
                        .getSystemService(Context.ALARM_SERVICE) as AlarmManager
                    am.canScheduleExactAlarms()
                } catch (_: Exception) {
                    false
                }
            } else true
            map.putBoolean("exactAlarms", exact)

            map.putBoolean("batteryOptimised", batteryOptimised())
            map.putBoolean("aggressiveOem", isAggressiveOem())
            map.putBoolean("stealthArmed", StealthTriggerService.isArmed)
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "Readiness check failed", e)
            promise.resolve(map)
        }
    }

    /**
     * OEMs known to kill foreground services regardless of Android's own
     * rules. These users need the extra battery-exemption prompt; everyone
     * else should not be nagged. Matches the list maintained at
     * dontkillmyapp.com.
     */
    private fun isAggressiveOem(): Boolean {
        val m = (Build.MANUFACTURER ?: "").lowercase()
        return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco") ||
            m.contains("huawei") || m.contains("honor") ||
            m.contains("oppo") || m.contains("realme") ||
            m.contains("vivo") || m.contains("iqoo") ||
            m.contains("oneplus") || m.contains("meizu") ||
            m.contains("asus") || m.contains("tecno") || m.contains("infinix")
    }

    /**
     * Android 12+ requires the user to grant exact alarms in Settings.
     * We open the screen rather than requesting the permission, because Play
     * restricts USE_EXACT_ALARM to alarm/calendar-class apps.
     */
    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            // Some OEMs do not ship that screen; app details is always present.
            try {
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(fallback)
                promise.resolve(true)
            } catch (e2: Exception) {
                Log.w(TAG, "Could not open exact-alarm settings", e2)
                promise.resolve(false)
            }
        }
    }

    /** Android 14+ gates full-screen intents behind a per-app setting. */
    @ReactMethod
    fun canUseFullScreenIntent(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            promise.resolve(true)
            return
        }
        val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        promise.resolve(nm.canUseFullScreenIntent())
    }

    @ReactMethod
    fun openFullScreenIntentSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SETTINGS", e)
        }
    }

    /** True when the device is locked — JS uses this to decide UI vs notification. */
    @ReactMethod
    fun isDeviceLocked(promise: Promise) {
        val km = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        promise.resolve(km.isKeyguardLocked)
    }

    // Required for NativeEventEmitter on the JS side.
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    /** Emits an event so a running JS instance raises the call UI immediately. */
    fun emitIncomingCall(callerName: String) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PardonMeIncomingCall", callerName)
    }
}
