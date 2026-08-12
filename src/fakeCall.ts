import { useEffect, useState } from 'react';
import { NativeModules, NativeEventEmitter, Vibration, AppState } from 'react-native';
import { getCaller } from './CallerProfile';

/**
 * fakeCall.ts — call state machine.
 *
 * RINGING is driven by the NATIVE module (IncomingCall):
 *   - it posts a full-screen-intent notification on a high-importance channel
 *     whose sound is the bundled ringtone on the RINGTONE audio stream, so it
 *     is audible with the screen off / phone silenced (channel bypasses DND)
 *   - that notification is what wakes and shows over the lock screen
 *
 * JS only owns the on-screen UI and the state transitions. We deliberately do
 * NOT play the ringtone with expo-av: media-stream playback is inaudible on a
 * locked/silenced phone and was the original "no audio" bug.
 */

const { IncomingCall } = NativeModules as {
  IncomingCall?: {
    showIncomingCall(caller: string): Promise<boolean>;
    dismissCall(): Promise<boolean>;
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

/** Last native error, surfaced in the UI so failures are never silent. */
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

/**
 * Start ringing. Native posts the full-screen-intent notification (sound +
 * vibration + lock-screen UI). The JS overlay follows via RINGING state.
 */
export async function triggerFakeCall(): Promise<void> {
  if (state.state === 'RINGING' || state.state === 'ACTIVE') return;

  const caller = getCaller();
  state = { state: 'RINGING', callerName: caller.name, photoUri: caller.photoUri };
  emit();

  if (IncomingCall) {
    try {
      await IncomingCall.showIncomingCall(caller.name);
      lastCallError = null;
    } catch (e: any) {
      lastCallError = `native: ${e?.message ?? e}`;
      // Native failed — at least buzz so the app is not silently dead.
      try { Vibration.vibrate(RING_PATTERN, true); } catch {}
    }
  } else {
    lastCallError = 'native module missing (rebuild required)';
    try { Vibration.vibrate(RING_PATTERN, true); } catch {}
  }
}

/** Answer: stop the ringer, keep the in-call UI up. */
export async function answerCall(): Promise<void> {
  if (state.state !== 'RINGING') return;
  state = { ...state, state: 'ACTIVE' };
  emit();
  await stopRinger();
}

/** Decline / hang up: brief "Call ended", then back to IDLE. */
export async function endCall(): Promise<void> {
  if (state.state === 'IDLE') return;
  state = { ...state, state: 'ENDED' };
  emit();
  await stopRinger();
  setTimeout(() => {
    if (state.state === 'ENDED') {
      state = { state: 'IDLE', callerName: getCaller().name };
      emit();
      restoreBars();
      // If the call is what opened the app, disappear instead of revealing
      // the PardonMe UI. No-op when the user opened it from the icon.
      if (IncomingCall) {
        IncomingCall.leaveIfCallLaunched().catch(() => {});
      }
    }
  }, 1200);
}

async function stopRinger() {
  try { Vibration.cancel(); } catch {}
  if (IncomingCall) {
    try { await IncomingCall.dismissCall(); } catch {}
  }
}

/** Bring the system bars back once the call UI is gone. */
async function restoreBars() {
  if (!IncomingCall) return;
  try { await IncomingCall.restoreSystemBars(); } catch {}
}

/** Schedule a call N seconds out. Uses exact alarms so it fires when closed. */
export async function scheduleNativeCall(seconds: number): Promise<boolean> {
  if (!IncomingCall) return false;
  try {
    await IncomingCall.scheduleCall(getCaller().name, seconds);
    return true;
  } catch (e: any) {
    lastCallError = `schedule: ${e?.message ?? e}`;
    return false;
  }
}

export async function cancelScheduledCall(): Promise<void> {
  if (!IncomingCall) return;
  try { await IncomingCall.cancelScheduledCall(); } catch {}
}

/** Android 14+ requires the user to allow full-screen intents. */
export async function checkFullScreenPermission(): Promise<boolean> {
  if (!IncomingCall) return false;
  try { return await IncomingCall.canUseFullScreenIntent(); } catch { return false; }
}

export async function openFullScreenSettings(): Promise<void> {
  if (!IncomingCall) return;
  try { await IncomingCall.openFullScreenIntentSettings(); } catch {}
}

/**
 * Raise the call UI if the app was opened by a call notification (locked-phone
 * path), and listen for calls fired natively while JS is already running.
 * Mount once from App.
 */
export function useNativeCallBridge(): void {
  useEffect(() => {
    let mounted = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const raiseIfPending = async () => {
      if (!IncomingCall) return;
      try {
        const caller = await IncomingCall.consumePendingCall();
        if (mounted && caller && state.state === 'IDLE') {
          state = { state: 'RINGING', callerName: caller };
          emit();
        }
      } catch {}
    };

    /**
     * The activity can be launched by the full-screen intent BEFORE the JS
     * bundle has finished booting, so a single check on mount loses the race
     * and the call screen never appears — that was the "doesn't show
     * consistently" bug. Poll briefly after every resume instead of checking
     * once.
     */
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
    if (IncomingCall) {
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
