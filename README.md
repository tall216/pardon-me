# Pardon Me

A fake incoming-call trigger app for Android (React Native / Expo). When you
need an excuse to leave an awkward or unwanted situation, **Pardon Me** drops a
stock-OEM-style incoming call on your screen — complete with the caller's name,
avatar, and green answer / red decline buttons.

> The ringing screen is designed to mimic a **stock Android incoming call**,
> full-screen, with a faux status bar, avatar, caller name (default **Michael**),
> and the familiar answer/decline controls.

## Features

- **Double-press Volume Down → instant fake call.** (Needs a dev client; see below.)
- **Customizable caller.** Default caller is **Michael**; type a new name on the
  home screen (no full settings screen — kept intentionally simple).
- **Scheduled calls.** Tap "Schedule call in 1 min" to fire a fake call later via
  a high-priority local notification.
- **Silent-mode bypass (dev client).** Ringtone plays on the alarm/notification
  channel so it is audible even when the phone is silenced.
- **Minimal foreground indicator** so Android is less likely to kill the listener.
- **Old-telephone app icon** (candlestick SVG) used on the home screen.

## Run it

```bash
cd PardonMe
npm install
npx expo start
```

Then either:

- **Expo Go (UI testing only):** scan the QR code. You can trigger a call with the
  on-screen "Trigger fake call" button. *Volume-key capture and silent-bypass
  will NOT work here.*
- **Dev client (full features):** build a development client with EAS so the
  native volume-key module and alarm audio channel are available:

  ```bash
  npx eas build --profile development --platform android
  ```

  Install the dev client on your phone, open it, and scan the QR from
  `npx expo start --dev-client`.

## Known caveats / integration points

| Feature | Status on Expo Go | What's needed for real behavior |
| --- | --- | --- |
| Fake call overlay + ringtone | ✅ Works (ringtone muted on silent) | — |
| Double-press Volume Down | ❌ No-op | Native `VolumeKeyModule` emitting `volumeDownPress` + dev client. See `src/volumeListener.ts`. |
| Silent-mode ringtone bypass | ❌ Muted | Native module using `AudioManager.STREAM_ALARM` + dev client. See `src/fakeCall.ts`. |
| Scheduled call while silenced | ⚠️ Depends on channel | Alarm-priority notification channel. See `src/scheduler.ts`. |

The double-press *detection logic* is pure JS (`isDoublePress` in
`src/volumeListener.ts`) and is already unit-testable.

## Project layout

```
PardonMe/
├── App.tsx                  # Clean home screen + mounts the overlay
├── app.config.js            # Expo config, permissions, notification channel
├── babel.config.js
├── tsconfig.json
├── package.json
├── assets/                  # ringtone.wav (bundled) + optional splash.png
└── src/
    ├── CallerProfile.ts     # caller name (default "Michael") + setter
    ├── OldPhoneIcon.tsx     # candlestick SVG icon
    ├── FakeCallOverlay.tsx  # OEM-style incoming-call UI
    ├── fakeCall.ts          # global call state + ringtone playback
    ├── volumeListener.ts    # volume double-press detection
    └── scheduler.ts         # scheduled fake calls (expo-notifications)
```

## Type checking

```bash
npm run typecheck   # tsc --noEmit
```
