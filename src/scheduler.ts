import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { triggerFakeCall } from './fakeCall';

/**
 * scheduler.ts — schedule a fake call for a future time.
 *
 * We schedule a LOCAL NOTIFICATION on a MAX-importance channel with sound. When it
 * fires, the app (if foregrounded/active) triggers the fake call overlay.
 *
 * SILENT BYPASS CAVEAT:
 *   To make the scheduled ringtone audible while the phone is silenced, the
 *   notification must use the ALARM channel / STREAM_ALARM. expo-notifications
 *   uses the notification stream, which on most devices still respects silent.
 *   On a dev client, create an Android notification channel with
 *   `IMPORTANCE_MAX` + `setSound()` pointing at an alarm sound AND mark it as
 *   an alarm channel (AudioAttributes USAGE_ALARM) so Do Not Disturb / silent
 *   is bypassed. The channel below is the portable starting point.
 */

export const CALL_CHANNEL_ID = 'pardon-me-calls';

let channelReady = false;

/** Create the high-priority notification channel once. */
export async function ensureCallChannel(): Promise<void> {
  if (channelReady) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
      name: 'Pardon Me Calls',
      importance: Notifications.AndroidImportance.MAX,
      // On a dev client, point this at an alarm sound + USAGE_ALARM.
      sound: 'ringtone.wav',
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#E91E63',
      bypassDnd: true, // requires the alarm channel on a dev build
    });
  }
  channelReady = true;
}

/**
 * Schedule a fake call. `when` is an absolute Date in the future.
 * Returns the scheduled notification identifier.
 */
export async function scheduleCall(when: Date): Promise<string> {
  await ensureCallChannel();

  // Schedule on the MAX-importance call channel. A raw Date is not a valid
  // trigger type at compile time, so we pass a proper DateTriggerInput.
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Incoming call',
      body: 'Tap to answer',
      data: { pardonMeTrigger: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      // On Android, route through the call channel (alarm priority on dev build).
      ...(Platform.OS === 'android' ? { channelId: CALL_CHANNEL_ID } : {}),
    } as Notifications.NotificationTriggerInput,
  });

  return id;
}

/**
 * Wire a foreground notification receiver so a fired scheduled call triggers the
 * overlay even while the app is open. Call once at startup from App.tsx.
 */
export function startCallScheduler(): () => void {
  const onReceived = (notification: Notifications.Notification) => {
    const data = notification.request.content.data as { pardonMeTrigger?: boolean } | undefined;
    if (data?.pardonMeTrigger) {
      triggerFakeCall();
    }
  };

  const sub = Notifications.addNotificationReceivedListener(onReceived);

  // When the user taps a delivered notification, also trigger the call.
  const respSub = Notifications.addNotificationResponseReceivedListener(() => {
    triggerFakeCall();
  });

  return () => {
    sub.remove();
    respSub.remove();
  };
}

/** Cancel all scheduled fake calls. */
export async function cancelAllScheduledCalls(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
