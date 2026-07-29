import { useEffect } from 'react';
import { NativeModules, NativeEventEmitter, AppState } from 'react-native';
import { triggerFakeCall } from './fakeCall';

/**
 * volumeListener.ts — double-press of Volume Down triggers the fake call.
 *
 * REAL HARDWARE CAVEAT:
 *   Capturing the volume keys requires a native module (e.g. react-native-keyevent
 *   or a small custom module overriding onKeyDown for KEYCODE_VOLUME_DOWN). Expo Go
 *   does NOT expose volume key events, so on Expo Go this listener is effectively a
 *   no-op. In a dev client, wire a native module that emits 'volumeDownPress'
 *   events and register it on `VolumeEventEmitter` below.
 *
 * We keep the double-press *detection logic* in pure JS so it is unit-testable
 * and so the same code path runs once the native events are connected.
 */

// Optional native module. Undefined under Expo Go / when not linked.
const VolumeNative = (NativeModules as any).VolumeKeyModule;
const VolumeEventEmitter = VolumeNative
  ? new NativeEventEmitter(VolumeNative)
  : null;

const DOUBLE_PRESS_MS = 300;

let lastPress = 0;

/** Returns true if this press counts as the second of a quick double-press. */
export function isDoublePress(now: number = Date.now()): boolean {
  const within = now - lastPress <= DOUBLE_PRESS_MS;
  lastPress = now;
  return within;
}

/**
 * Wire up volume-down listening. Under Expo Go nothing happens (no native
 * module). When the native module is present, two Volume-Down presses within
 * 300ms fire the fake call.
 */
export function startVolumeListener(): () => void {
  if (!VolumeEventEmitter || !VolumeNative) {
    // No-op on Expo Go. Documented integration point for the dev client.
    return () => {};
  }

  const onVolumeDown = () => {
    if (isDoublePress()) {
      triggerFakeCall();
    }
  };

  VolumeEventEmitter.addListener('volumeDownPress', onVolumeDown);

  // Reset the timer if the app is backgrounded (avoid cross-session doubles).
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background') lastPress = 0;
  });

  return () => {
    VolumeEventEmitter.removeAllListeners('volumeDownPress');
    sub.remove();
  };
}

/**
 * TEST HOOK — lets the home screen's "Test trigger" button and unit tests exercise
 * the same double-press logic without hardware. Fires the call if called twice
 * within the window.
 */
export function simulateVolumeDownPress(): void {
  if (isDoublePress()) {
    triggerFakeCall();
  }
}

/** Convenience React hook that starts the listener on mount. */
export function useVolumeTrigger(): void {
  useEffect(() => startVolumeListener(), []);
}
