package com.davidevans.pardonme

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Prompts the user to reopen the app after a reboot so the stealth trigger
 * can be re-armed.
 *
 * Android 15+ (API 35) forbids starting a mediaPlayback-type foreground
 * service directly from a BOOT_COMPLETED receiver — Play Console's
 * pre-launch report flags this as a guaranteed crash on those devices, and
 * the platform gives no exemption for this service type. There is no way
 * to auto-re-arm invisibly on Android 15+ any more.
 *
 * Instead we post a plain notification (posting a notification is not a
 * restricted BOOT_COMPLETED action). Tapping it opens MainActivity, whose
 * onCreate() already calls StealthTriggerService.armIfEnabled() — starting
 * the foreground service from a foreground Activity context is unrestricted
 * on every API level, including 15+.
 */
class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val CHANNEL_ID = "pardonme_reopen_prompt_v1"
        private const val NOTIFICATION_ID = 4244
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON" &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }

        if (!StealthTriggerService.wasArmedByUser(context)) return

        try {
            postReopenPrompt(context)
            Log.i("PardonMeBoot", "Posted re-arm prompt after $action")
        } catch (e: Exception) {
            Log.e("PardonMeBoot", "Failed to post re-arm prompt after boot", e)
        }
    }

    private fun postReopenPrompt(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Re-arm after restart",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Reminds you to reopen Pardon Me after a restart"
                }
                nm.createNotificationChannel(channel)
            }
        }

        val openApp = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle("Pardon Me needs a moment")
            .setContentText("Tap to re-arm the fake-call trigger after restarting your phone.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(openApp)
            .build()

        nm.notify(NOTIFICATION_ID, notification)
    }
}
