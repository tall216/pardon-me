import { useEffect, useState, useCallback } from 'react';
import { NativeModules, AppState } from 'react-native';
import {
  DeviceReadiness,
  SetupIssue,
  UNKNOWN_READINESS,
  deriveIssues,
  isReady,
} from './deviceRules';

export type { DeviceReadiness, SetupIssue };
export { deriveIssues, isReady };

const { IncomingCall } = NativeModules as {
  IncomingCall?: {
    getDeviceReadiness(): Promise<DeviceReadiness>;
    requestNotificationPermission(): Promise<boolean>;
    openNotificationSettings(): Promise<boolean>;
    openFullScreenIntentSettings(): Promise<boolean>;
    openExactAlarmSettings(): Promise<boolean>;
    openBatterySettings(): Promise<boolean>;
  };
};

/**
 * Live device-readiness state.
 *
 * Android fragmented every capability this app depends on behind a different
 * version gate, and several OEMs add restrictions on top. Rather than guess,
 * the native side reports the truth for the phone in hand.
 *
 * Re-checks whenever the app returns to the foreground, because the user fixes
 * these in Settings and then comes back.
 */
export function useDeviceReadiness() {
  const [readiness, setReadiness] = useState<DeviceReadiness>(UNKNOWN_READINESS);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    if (!IncomingCall?.getDeviceReadiness) {
      setChecked(true);
      return;
    }
    try {
      const r = await IncomingCall.getDeviceReadiness();
      setReadiness({ ...UNKNOWN_READINESS, ...r });
    } catch {
      // Keep the optimistic defaults on failure.
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const fix = useCallback(async (key: SetupIssue['key']) => {
    if (!IncomingCall) return;
    try {
      switch (key) {
        case 'notifications':
          // Try the system dialog first; it only appears once per install.
          await IncomingCall.requestNotificationPermission();
          // If it was permanently denied the dialog never shows, so send the
          // user somewhere they can actually change it.
          setTimeout(async () => {
            try {
              const r = await IncomingCall.getDeviceReadiness();
              if (!r.notifications) await IncomingCall.openNotificationSettings();
            } catch {}
          }, 600);
          break;
        case 'fullScreenIntent':
          await IncomingCall.openFullScreenIntentSettings();
          break;
        case 'exactAlarms':
          await IncomingCall.openExactAlarmSettings();
          break;
        case 'battery':
          await IncomingCall.openBatterySettings();
          break;
      }
    } catch {
      // Never crash the UI over a settings intent.
    }
  }, []);

  const issues = deriveIssues(readiness);
  return { readiness, issues, ready: isReady(issues), checked, refresh, fix };
}
