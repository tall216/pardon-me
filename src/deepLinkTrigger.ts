import { useEffect } from 'react';
import { Linking } from 'react-native';
import { triggerFakeCall } from './fakeCall';

/**
 * deepLinkTrigger.ts — trigger a fake call via a URL, so it can be fired
 * from an iOS Shortcut (Settings > Accessibility > Touch > Back Tap, or
 * Action Button on Pro models) without the app being open on screen.
 *
 * WHY THIS EXISTS
 * Volume-button capture (see VolumeButtonTrigger.swift) is real and works,
 * but is a hard, permanent iOS limitation to foreground-only — Apple gives
 * no API for background/locked volume-key capture, full stop. Back Tap is
 * a genuine system-level gesture routed through the Shortcuts app, so it
 * fires even when PardonMe is not open and the phone is locked — the
 * closest real iOS equivalent to what the volume trick does on Android.
 *
 * URL: pardonme://call  (scheme already registered in app.config.js)
 * Opening this URL — from a Shortcut, a Home Screen icon, Safari, anywhere —
 * launches/foregrounds PardonMe and immediately raises the same fake-call
 * flow "Execute Immediate Call" uses. iOS itself handles bringing the app
 * to the foreground; from there this is the identical, already-proven path.
 *
 * SETUP (do this once, by hand, in Settings — no code can automate it):
 *  1. Settings > Accessibility > Touch > Back Tap > Double Tap (or Triple Tap)
 *  2. Scroll to Shortcuts > pick/create a shortcut
 *  3. In the Shortcuts app, create a new shortcut with a single action:
 *     "Open URLs" > pardonme://call
 *  4. Assign that shortcut to the Back Tap gesture from step 2
 * Full instructions are also on-screen in the app (see App.tsx's
 * "Back Tap Trigger" card).
 */

export function useDeepLinkTrigger(): void {
  useEffect(() => {
    const handleUrl = (url: string) => {
      if (!url) return;
      // Accept pardonme://call and pardonme://call/ (trailing slash) — be
      // liberal in what's accepted since a mistyped Shortcut is a real,
      // very plausible failure mode and there's no error surface for it.
      const isCallTrigger = /^pardonme:\/\/call\/?$/i.test(url.trim());
      if (isCallTrigger) {
        triggerFakeCall();
      }
    };

    // Cold start: app was fully closed, opened directly via the URL.
    Linking.getInitialURL().then(url => {
      if (url) handleUrl(url);
    });

    // Warm start: app was backgrounded, brought forward via the URL.
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);
}
