package com.davidevans.pardonme

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Receives the AlarmManager broadcast for a scheduled fake call and posts the
 * full-screen-intent notification. Runs even if the app process was killed,
 * which is the whole point of scheduling natively instead of with a JS timer.
 *
 * A BroadcastReceiver runs on the main thread with a ~10 second budget and no
 * surrounding app state, so everything here is defensive: any exception that
 * escapes onReceive() crashes the process, and it would do so with no UI on
 * screen, which reads to the user as a random crash.
 */
class CallAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // goAsync() would let us outlive onReceive, but posting a notification
        // is fast and synchronous; keeping it inline avoids leaking a pending
        // result if something throws.
        try {
            val caller = intent.getStringExtra(IncomingCallModule.EXTRA_CALLER)
                ?.takeIf { it.isNotBlank() }
                ?: IncomingCallModule.lastCallerName
                ?: "Michael"

            IncomingCallModule.postCallNotification(context.applicationContext, caller)
            Log.i(TAG, "Scheduled call fired for: $caller")
        } catch (e: Exception) {
            // Losing a scheduled call is a bad day; crashing the user's phone
            // is a worse one.
            Log.e(TAG, "Scheduled call failed to fire", e)
        }
    }

    private companion object {
        const val TAG = "PardonMeAlarm"
    }
}
