package com.davidevans.pardonme

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Re-arms the stealth trigger after a reboot.
 *
 * Without this, "armed" silently becomes false the first time the phone
 * restarts — the user believes the app is watching the volume keys when it is
 * not. We only re-arm if the user had armed it before shutdown.
 */
class BootReceiver : BroadcastReceiver() {
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
            StealthTriggerService.arm(context)
            Log.i("PardonMeBoot", "Re-armed stealth trigger after $action")
        } catch (e: Exception) {
            Log.e("PardonMeBoot", "Failed to re-arm after boot", e)
        }
    }
}
