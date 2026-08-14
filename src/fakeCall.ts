import { useEffect, useState } from 'react';
import { NativeModules, NativeEventEmitter, Vibration, AppState, Platform } from 'react-native';
import { getCaller } from './CallerProfile';

/**
 * CallBridge — cross-platform abstraction over the native calling UI.
 * Both platforms are exposed as a SINGLE native module named `IncomingCall`
 * (see android/.../IncomingCallModule.kt and
 * ios-module/IncomingCall/IncomingCallModule.swift, which is @objc(IncomingCall)
 * — not a separate "iOSCallKit" name). A prior edit to this file referenced
 * `iOSCallKit`, a module that is never registered anywhere in the native
 * code on either platform, which silently broke every iOS call trigger by
 * always falling through to `return false`. Fixed by pointing both branches
 * at the one real module.
 */
const { IncomingCall } = NativeModules as {
  IncomingCall?: {
    showIncomingCall(caller: string): Promise<boolean>;
    dismissCall(): Promise<boolean>;
    /** iOS only: real CallKit hang-up, called ONLY from decline/hangup —
     * never from answer. Resolves harmlessly on Android where it doesn't
     * exist (guarded by optional chaining below). */
    endCallSession?(): Promise<boolean>;
    restoreSystemBars(): Promise<boolean>;
    leaveIfCallLaunched(): Promise<boolean>;
    scheduleCall(caller: string, seconds: number): Promise<boolean>;
    cancelScheduledCall(): Promise<boolean>;
    consumePendingCall(): Promise<string | null>;
    canUseFullScreenIntent(): Promise<boolean>;
    openFullScreenIntentSettings(): Promise<boolean>;
    isDeviceLocked(): Promise<boolean>;
  };
};

export const hasNativeCall = !!IncomingCall;

const BRIDGE = {
  async trigger(caller: string) {
    if (!IncomingCall) return false;
    return await IncomingCall.showIncomingCall(caller);
  },
  /** Decline / hang up ONLY. Must never be called from answerCall() — see
   * dismissCall/endCallSession's own docs in the native module for the bug
   * this split fixes (accepting a call on iOS was silently ending it). */
  async hangup() {
    if (!IncomingCall) return;
    await IncomingCall.dismissCall();
    try { await IncomingCall.endCallSession?.(); } catch {}
  },
  /** Stop the ringer/vibration only — used by BOTH answer and decline, never
   * sends any end-call signal to native. */
  async stopRingerOnly() {
    if (!IncomingCall) return;
    try { await IncomingCall.dismissCall(); } catch {}
  },
  async restore() {
    if (!IncomingCall) return;
    await IncomingCall.restoreSystemBars();
  },
  async leave() {
    if (!IncomingCall) return;
    await IncomingCall.leaveIfCallLaunched();
  }
};

/** Fallback vibration cadence used only when the native module is absent. */
const RING_PATTERN = [0, 800, 600, 800, 600];

export type CallState = 'IDLE' | 'RINGING' | 'ACTIVE' | 'ENDED';

export interface ActiveCall {
  state: CallState;
  callerName: string;
  photoUri?: string;
}

type Listener = (call: ActiveCall) => void;

const listeners = new Set<Listener>();
let state: ActiveCall = { state: 'IDLE', callerName: 'Michael' };

export let lastCallError: string | null = null;

function emit() {
  for (const l of listeners) l(state);
}

export function subscribeCall(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function isCallActive(): boolean {
  return state.state !== 'IDLE';
}

export function getCallState(): ActiveCall {
  return state;
}

export async function triggerFakeCall(): Promise<void> {
  if (state.state === 'RINGING' || state.state === 'ACTIVE') return;

  const caller = getCaller();
  state = { state: 'RINGING', callerName: caller.name, photoUri: caller.photoUri };
  emit();

  try {
    const success = await BRIDGE.trigger(caller.name);
    if (!success) {
      lastCallError = 'Native module failed to trigger call UI';
      try { Vibration.vibrate(RING_PATTERN, true); } catch {}
    } else {
      lastCallError = null;
    }
  } catch (e: any) {
    lastCallError = `native error: ${e?.message ?? e}`;
    try { Vibration.vibrate(RING_PATTERN, true); } catch {}
  }
}

export async function answerCall(): Promise<void> {
  if (state.state !== 'RINGING') return;
  state = { ...state, state: 'ACTIVE' };
  emit();
  try { Vibration.cancel(); } catch {}
  await BRIDGE.stopRingerOnly();
}

export async function endCall(): Promise<void> {
  if (state.state === 'IDLE') return;
  state = { ...state, state: 'ENDED' };
  emit();
  try { Vibration.cancel(); } catch {}
  await BRIDGE.hangup();
  setTimeout(() => {
    if (state.state === 'ENDED') {
      state = { state: 'IDLE', callerName: getCaller().name };
      emit();
      BRIDGE.restore();
      BRIDGE.leave();
    }
  }, 1200);
}

export async function scheduleNativeCall(seconds: number): Promise<boolean> {
  if (Platform.OS === 'android' && IncomingCall) {
    try {
      await IncomingCall.scheduleCall(getCaller().name, seconds);
      return true;
    } catch (e: any) {
      lastCallError = `schedule: ${e?.message ?? e}`;
      return false;
    }
  }
  // iOS scheduling is handled via server-side VoIP push notifications
  return false;
}

export async function cancelScheduledCall(): Promise<void> {
  if (Platform.OS === 'android' && IncomingCall) {
    try { await IncomingCall.cancelScheduledCall(); } catch {}
  }
}

export async function checkFullScreenPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') return true; // CallKit doesn't use full-screen-intent permission
  if (Platform.OS === 'android' && IncomingCall) {
    try { return await IncomingCall.canUseFullScreenIntent(); } catch { return false; }
  }
  return false;
}

export async function openFullScreenSettings(): Promise<void> {
  if (Platform.OS === 'ios') return;
  if (Platform.OS === 'android' && IncomingCall) {
    try { await IncomingCall.openFullScreenIntentSettings(); } catch {}
  }
}

export function useNativeCallBridge(): void {
  useEffect(() => {
    let mounted = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const raiseIfPending = async () => {
      if (Platform.OS !== 'android' || !IncomingCall) return;
      try {
        const caller = await IncomingCall.consumePendingCall();
        if (mounted && caller && state.state === 'IDLE') {
          state = { state: 'RINGING', callerName: caller };
          emit();
        }
      } catch {}
    };

    const raiseWithRetries = () => {
      raiseIfPending();
      let attempts = 0;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        attempts++;
        if (!mounted || attempts > 12) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          return;
        }
        raiseIfPending();
      }, 250);
    };

    raiseWithRetries();

    const appSub = AppState.addEventListener('change', s => {
      if (s === 'active') raiseWithRetries();
    });

    let eventSub: { remove(): void } | null = null;
    if (Platform.OS === 'android' && IncomingCall) {
      const emitter = new NativeEventEmitter(IncomingCall as any);
      eventSub = emitter.addListener('PardonMeIncomingCall', (caller: string) => {
        if (state.state === 'IDLE') {
          state = { state: 'RINGING', callerName: caller || getCaller().name };
          emit();
        }
      });
    }

    return () => {
      mounted = false;
      if (pollTimer) clearInterval(pollTimer);
      appSub.remove();
      eventSub?.remove();
    };
  }, []);
}

export function useFakeCall(): ActiveCall {
  const [call, setCall] = useState<ActiveCall>(state);
  useEffect(() => subscribeCall(setCall), []);
  return call;
}
