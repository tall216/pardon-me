import { useEffect, useState, useCallback } from 'react';
import { NativeModules, AppState } from 'react-native';

/**
 * volumeListener.ts — control surface for background volume-key triggering.
 *
 * WHY THIS IS NATIVE
 * Android delivers KeyEvents only to the foreground activity, so a JS listener
 * (or an Activity key handler) cannot see volume presses once PardonMe is
 * closed — which is exactly when the app must work. The native
 * StealthTriggerService instead registers a MediaSession with a REMOTE
 * VolumeProvider: the framework then routes hardware volume keys to that
 * session instead of the audio stream, even with the screen off or another app
 * in front. A foreground service (plus a silent looping track) keeps the
 * session alive and owning that route.
 *
 * COST, STATED PLAINLY
 *  - While armed, volume keys adjust our session rather than media volume.
 *  - Android requires a persistent notification for the foreground service; it
 *    is created at IMPORTANCE_MIN / VISIBILITY_SECRET so it stays collapsed and
 *    silent, and carries a "Disarm" action.
 *
 * The previous react-native-volume-manager approach is gone: it reported volume
 * *changes*, which are silently suppressed at 0%/100% and, on Samsung, land on
 * a different stream than the one being watched.
 */

const { IncomingCall } = NativeModules as {
  IncomingCall?: {
    setCallerName(name: string): Promise<boolean>;
    armStealthTrigger(): Promise<boolean>;
    disarmStealthTrigger(): Promise<boolean>;
    isStealthArmed(): Promise<boolean>;
  };
};

const DOUBLE_PRESS_MS = 800;
let lastPress = 0;

/**
 * Pure double-press logic, mirrored by the native detector. Exported so the
 * timing rule is unit-testable without hardware.
 */
export function isDoublePress(now: number = Date.now()): boolean {
  const within = now - lastPress <= DOUBLE_PRESS_MS;
  lastPress = within ? 0 : now;
  return within;
}

/** Push the active caller name to native so volume-key calls use it. */
export function syncCallerToNative(name: string): void {
  IncomingCall?.setCallerName(name).catch(() => {});
}

export async function armStealthTrigger(): Promise<boolean> {
  if (!IncomingCall) return false;
  try {
    await IncomingCall.armStealthTrigger();
    return true;
  } catch {
    return false;
  }
}

export async function disarmStealthTrigger(): Promise<boolean> {
  if (!IncomingCall) return false;
  try {
    await IncomingCall.disarmStealthTrigger();
    return true;
  } catch {
    return false;
  }
}

export async function isStealthArmed(): Promise<boolean> {
  if (!IncomingCall) return false;
  try {
    return await IncomingCall.isStealthArmed();
  } catch {
    return false;
  }
}

/**
 * Keeps the caller name in sync and exposes armed state + a toggle.
 * Re-checks armed state whenever the app returns to the foreground, so the
 * UI reflects a disarm performed from the notification.
 */
export function useStealthTrigger(callerName?: string) {
  const [armed, setArmed] = useState(false);

  const refresh = useCallback(async () => {
    setArmed(await isStealthArmed());
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (callerName) syncCallerToNative(callerName);
  }, [callerName]);

  const toggle = useCallback(async () => {
    if (armed) {
      await disarmStealthTrigger();
    } else {
      await armStealthTrigger();
    }
    // Service state flips asynchronously; give it a beat before re-reading.
    setTimeout(refresh, 400);
  }, [armed, refresh]);

  return { armed, toggle, refresh };
}
