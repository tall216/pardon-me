import { useEffect, useState } from 'react';
import { Audio } from 'expo-av';
import { getCaller } from './CallerProfile';

/**
 * fakeCall.ts — global fake-call state + ringtone playback.
 *
 * SILENT-MODE BYPASS CAVEAT:
 *   On a real device, playing on the ALARM / notification stream so the ringtone
 *   is audible while the phone is silenced requires a native audio API
 *   (AudioManager.STREAM_ALARM on Android). expo-av plays on the MUSIC stream,
 *   which IS muted by silent mode. To truly bypass silent you must, in a dev
 *   client, use a native module that requests STREAM_ALARM. This module is written
 *   to use expo-av as the portable fallback and documents the integration point.
 *
 * The ringtone sound file is expected at assets/ringtone.mp3 (not committed);
 * if it is missing, playback simply no-ops and the overlay still shows.
 */

export interface ActiveCall {
  active: boolean;
  callerName: string;
  photoUri?: string;
}

type Listener = (call: ActiveCall) => void;

const listeners = new Set<Listener>();
let sound: Audio.Sound | null = null;
let state: ActiveCall = { active: false, callerName: 'Michael' };

function emit() {
  for (const l of listeners) l(state);
}

export function subscribeCall(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function isCallActive(): boolean {
  return state.active;
}

/**
 * Start the fake incoming call: read the caller profile (default "Michael"),
 * play the ringtone at full volume (alarm-priority in a dev build), and publish
 * the active-call state so the overlay mounts.
 */
export async function triggerFakeCall(): Promise<void> {
  if (state.active) return;
  try {
    const caller = getCaller();
    state = { active: true, callerName: caller.name, photoUri: caller.photoUri };
    emit();
    await playRingtone();
  } catch (e) {
    // If audio fails (permissions, missing asset), still show the overlay
    state = { active: true, callerName: getCaller().name, photoUri: getCaller().photoUri };
    emit();
  }
}

/** End the call: stop the ringtone and clear state. */
export async function endCall(): Promise<void> {
  if (!state.active) return;
  state = { active: false, callerName: state.callerName, photoUri: state.photoUri };
  emit();
  await stopRingtone();
}

async function playRingtone(): Promise<void> {
  try {
    // NOTE: alarm-priority playback on a dev client should call a native
    // module that sets the stream type to STREAM_ALARM before play().
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true, // audible in silent mode on iOS
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    const { sound: s } = await Audio.Sound.createAsync(
      require('../assets/ringtone.wav'),
      { shouldPlay: true, isLooping: true, volume: 1.0 },
    );
    sound = s;
  } catch {
    // No ringtone asset bundled (or file missing) — overlay still shows.
    sound = null;
  }
}

async function stopRingtone(): Promise<void> {
  if (sound) {
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      /* ignore */
    }
    sound = null;
  }
}

/**
 * React hook convenience for components that want to render based on call state.
 */
export function useFakeCall(): ActiveCall {
  const [call, setCall] = useState<ActiveCall>(state);
  useEffect(() => subscribeCall(setCall), []);
  return call;
}
