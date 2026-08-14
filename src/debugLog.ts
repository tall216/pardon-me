import { useState, useEffect } from 'react';

/**
 * debugLog.ts — tiny in-memory ring buffer of diagnostic lines, rendered
 * directly on-screen (see App.tsx's Stealth Trigger card).
 *
 * WHY THIS EXISTS: this project has no Mac available, so there is no Xcode
 * console and no reliable way to pull native NSLog output from a real iOS
 * device on Windows (idevicesyslog / libimobiledevice's usbmuxd bridge does
 * not detect the device on this machine, across two different USB cables —
 * a known rough spot on Windows, not something worth blocking on). Metro's
 * JS console requires the developer to be watching a terminal live while the
 * phone is being tested, which is slow and error-prone secondhand ("what did
 * it say" round-trips). This puts the same diagnostic lines directly on the
 * screen being tested, so what happened is visible immediately, in person,
 * without any of that.
 */

const MAX_LINES = 30;
let lines: string[] = [];
const listeners = new Set<(lines: string[]) => void>();

export function debugLog(message: string): void {
  const ts = new Date().toTimeString().slice(0, 8);
  lines = [...lines, `${ts}  ${message}`].slice(-MAX_LINES);
  for (const l of listeners) l(lines);
}

export function clearDebugLog(): void {
  lines = [];
  for (const l of listeners) l(lines);
}

export function useDebugLog(): { lines: string[]; clear: () => void } {
  const [state, setState] = useState<string[]>(lines);

  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);

  return { lines: state, clear: clearDebugLog };
}
