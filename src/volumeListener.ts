import { useEffect, useState, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, AppState } from 'react-native';
import { triggerFakeCall } from './fakeCall';
import { debugLog } from './debugLog';

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
 *
 * iOS: there is no equivalent background capture — Apple gives no API for it
 * (see ios-module/IncomingCall/VolumeButtonTrigger.swift for the full
 * explanation). What iOS gets instead is a FOREGROUND-ONLY volume-button
 * detector: native emits a PardonMeVolumePressed event per press while
 * armed, and this file applies the same double-press gate Android's
 * PressDetector uses natively, so a single volume adjustment never
 * accidentally triggers a call.
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
 * timing rule is unit-testable without hardware. Also used directly (not
 * just mirrored) by the iOS PardonMeVolumePressed listener below, since iOS
 * has no native double-press detector of its own — every press is reported
 * to JS and this function is the only gate.
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
  if (!IncomingCall) {
    console.log('[volumeListener] armStealthTrigger: IncomingCall native module is null');
    debugLog('arm: native module is NULL (not linked in this build)');
    return false;
  }
  try {
    console.log('[volumeListener] armStealthTrigger: calling native...');
    debugLog('arm: calling native armStealthTrigger()...');
    const result = await IncomingCall.armStealthTrigger();
    console.log('[volumeListener] armStealthTrigger: native resolved with', result);
    debugLog(`arm: native resolved -> ${result}`);
    return true;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.log('[volumeListener] armStealthTrigger: native THREW:', msg);
    debugLog(`arm: native THREW -> ${msg}`);
    return false;
  }
}

export async function disarmStealthTrigger(): Promise<boolean> {
  if (!IncomingCall) return false;
  try {
    debugLog('disarm: calling native...');
    await IncomingCall.disarmStealthTrigger();
    debugLog('disarm: done');
    return true;
  } catch (e: any) {
    debugLog(`disarm: THREW -> ${e?.message ?? e}`);
    return false;
  }
}

export async function isStealthArmed(): Promise<boolean> {
  if (!IncomingCall) return false;
  try {
    const armed = await IncomingCall.isStealthArmed();
    console.log('[volumeListener] isStealthArmed: native reports', armed);
    debugLog(`isStealthArmed: native reports -> ${armed}`);
    return armed;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.log('[volumeListener] isStealthArmed: native THREW:', msg);
    debugLog(`isStealthArmed: THREW -> ${msg}`);
    return false;
  }
}

/**
 * Keeps the caller name in sync and exposes armed state + a toggle.
 * Re-checks armed state whenever the app returns to the foreground, so the
 * UI reflects a disarm performed from the notification (Android) or a
 * background transition (iOS — see VolumeButtonTrigger.swift, which
 * auto-disarms on backgrounding since it cannot function there).
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

  // iOS-only: native has no double-press detector of its own (unlike
  // Android's StealthTriggerService), so every volume-key press is reported
  // here and this hook applies the same double-press gate. On Android this
  // event is never emitted, so the subscription is inert.
  //
  // Logging left in deliberately (not stripped for release yet): this is the
  // only visibility into the iOS native trigger available from this machine
  // — there's no Mac to watch the Xcode console, but Metro's JS console
  // streams to the terminal running `expo start`, so console.log here is the
  // only diagnostic signal for whether PardonMeVolumePressed is firing at
  // all versus firing-but-not-triggering.
  useEffect(() => {
    if (!IncomingCall) return;
    const emitter = new NativeEventEmitter(IncomingCall as any);
    const sub = emitter.addListener('PardonMeVolumePressed', () => {
      console.log('[volumeListener] PardonMeVolumePressed received');
      debugLog('PRESS: PardonMeVolumePressed received');
      const fired = isDoublePress();
      console.log('[volumeListener] isDoublePress ->', fired);
      debugLog(`PRESS: isDoublePress -> ${fired}`);
      if (fired) {
        console.log('[volumeListener] calling triggerFakeCall()');
        debugLog('PRESS: calling triggerFakeCall()');
        triggerFakeCall();
      }
    });
    return () => sub.remove();
  }, []);

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
