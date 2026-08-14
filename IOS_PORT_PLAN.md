# iOS Port Plan — Pardon Me

> **Status note:** this file did not exist in the repo before this pass — there
> was no prior iOS plan to read. What follows is a plan authored from scratch
> against the Android implementation (`android/app/src/main/java/com/davidevans/pardonme/`)
> and the JS contract in `src/fakeCall.ts`, `src/deviceReadiness.ts`,
> `src/volumeListener.ts`. Flagging that up front rather than silently
> pretending a spec existed.

## Read this first: two things do not port

**1. CallKit + PushKit for a non-genuine calling app is an App Store risk.**
Apple's guideline 4.3 (spam/duplicate) and PushKit's VoIP entitlement terms
assume the app performs *real* VoIP telephony. Apps that use CallKit purely
to simulate a fake incoming call have been rejected in the past for
misrepresenting functionality. CallKit is also the *only* mechanism iOS
grants for full-screen lock-screen presentation — there is no non-CallKit way
to replicate Android's full-screen-intent notification. So the choice is:

- Ship it via CallKit/PushKit anyway (best UX, matches the Android app
  exactly) and accept App Store review risk — realistic mitigations: TestFlight
  internal distribution only, or submit and see, or word the listing carefully.
- Or drop CallKit and settle for a plain local/push notification (banner +
  lock-screen list entry, sound, tap-to-open) with **no true full-screen
  takeover** — materially worse than the Android experience.

Given the ask was explicitly "implement the CallKit bridge," this plan
proceeds with option 1, but you should decide the distribution channel
(TestFlight vs. public App Store) before submitting.

**2. The "stealth trigger" (double-press volume key while backgrounded) has
no iOS equivalent.** Apple gives no public API for capturing hardware
volume-button events in the background or while locked outside an audio
session the foreground app already owns — there's no MediaSession-style
remote volume provider like Android's. `armStealthTrigger()` is implemented
as a stub that resolves `false` on iOS; the UI should hide or disable that
card on iOS rather than show a fake "ARMED" state. This is a genuine platform
gap, not an oversight.

## What was built this pass

```
ios-module/IncomingCall/
  IncomingCall.podspec              — local pod, autolinked via react-native.config.js
  IncomingCallModule.swift          — RCTEventEmitter bridge, matches NativeModules.IncomingCall
  PardonMeCallKitManager.swift      — CXProvider + PKPushRegistry (CallKit/PushKit core)
  IncomingCallModule.m              — Obj-C RCT_EXTERN_MODULE export (required for Swift RN modules)
react-native.config.js              — points RN autolinking at ios-module/IncomingCall
plugins/withIosCallKit.js           — Expo config plugin: Info.plist UIBackgroundModes,
                                       entitlements (aps-environment), bundles ringtone.wav
app.config.js                       — registers the plugin, adds ios.entitlements
src/fakeCall.ts                     — two new native-event listeners wired into
                                       useNativeCallBridge(): PardonMeCallAnswered /
                                       PardonMeCallEnded, so answering/declining via the
                                       system CallKit UI drives the same RINGING→ACTIVE→IDLE
                                       state machine the Android JS overlay uses
```

### Native surface (`NativeModules.IncomingCall`) parity with Android

| JS method | Android | iOS this pass |
|---|---|---|
| `showIncomingCall(name)` | full-screen-intent notification | `CXProvider.reportNewIncomingCall` |
| `dismissCall()` | cancel notification | `CXEndCallAction` via `CXCallController` |
| `scheduleCall(name, seconds)` | `AlarmManager.setExactAndAllowWhileIdle` — fires even if app killed | `Timer` — **only fires while the process is alive** (foreground or the ~30s background-execution window). No iOS API grants an arbitrary background wake to a suspended/killed app. A call scheduled to fire in 5 minutes with the app closed **will not fire** unless a server sends a real VoIP push at that moment. See "VoIP push" below. |
| `consumePendingCall()` | drains SharedPreferences-backed pending caller | drains an in-memory static, set by the CallKit report callback |
| `canUseFullScreenIntent()` | Android 14+ per-app gate | always `true` — no such gate; CallKit is inherently full-screen |
| `isDeviceLocked()` | `KeyguardManager` | no public API; stub returns `false` (harmless — CallKit shows over the lock screen regardless of what this reports) |
| `armStealthTrigger()` / `isStealthArmed()` | `MediaSession` remote volume provider | **unsupported**, resolves `false` — see above |
| `getDeviceReadiness()` | Android version/OEM capability map | iOS-shaped equivalent: notification auth status, `voipPushRegistered` |

### VoIP push (the actual "trigger" mechanism)

`PardonMeCallKitManager` registers a `PKPushRegistry` for `.voIP` pushes on
module init. The device token surfaces to JS via a new event,
`PardonMePushTokenUpdated`, and via `getPushToken()`. **There is no server in
this repo that sends VoIP pushes.** To actually trigger a call while the app
is backgrounded/killed (the whole point of a fake-call app) you need:

1. An Apple Push Notification service **VoIP-type auth key or certificate**
   (Apple Developer portal, tied to `com.davidevans.pardonme`).
2. A small server (even a single serverless function) that: receives the
   device's VoIP token from the app, then on trigger (scheduled time, or a
   remote command) sends an APNs push with `apns-push-type: voip` and a
   payload like `{"callerName": "The Boss"}`.
3. `didReceiveIncomingPushWith` in `PardonMeCallKitManager` is already wired
   to call `reportIncomingCall` synchronously (a hard iOS 13+ requirement —
   the process is killed if a VoIP push arrives without an immediate
   `CXProvider.reportNewIncomingCall` call, which is why that path never
   touches the JS thread first).

Local, no-server triggering (the "Execute Immediate Call" button, and short
in-app "schedule 60s" while the app stays foregrounded/backgrounded briefly)
works today with what's implemented — no server needed for that. It's only
*true background/killed-app scheduled calls* that need the push server.

## What could not be done from this machine

This is Windows. `npx expo prebuild --platform ios` refuses outright:
`Skipping generating the iOS native project files. Run npx expo prebuild
again from macOS or Linux.` So:

- The `ios/` Xcode project has never been generated here — cannot be, on
  Windows.
- None of the Swift above has been compiled or run. It is written to the same
  correctness bar as the Android module (matching method signatures, promise
  resolve/reject patterns, RN old-arch bridge conventions) but has not been
  built by a compiler.
- Bundling `assets/ringtone.wav` into the CallKit ringtone resource is wired
  in the config plugin, but only a real `pod install` + Xcode build on a Mac
  (or CI, e.g. EAS Build with `eas build -p ios`) will prove it links.

**Next real step:** run `eas build -p ios --profile development` (EAS Build
runs on Apple-hosted macOS workers, so no local Mac is required) or get access
to a Mac. Either will run `expo prebuild`, pod install the local module via
`react-native.config.js`, and produce a build you can actually install and
test CallKit against. I'd recommend EAS Build since `eas.json` already has a
`development` profile configured for Android and the same profile works for
iOS with no changes needed.

## Remaining work (not done this pass)

- [ ] Build via EAS (or a Mac) and fix whatever the compiler finds — untested
      Swift should be assumed to have at least minor issues until it compiles.
- [ ] Provision an Apple Developer account entry for the VoIP push
      certificate/key (needed either way — even local testing of
      `didReceiveIncomingPushWith` needs a real push sent to a real device;
      the iOS Simulator does not support VoIP push delivery at all, so this
      needs a physical device + Apple Developer Program membership, $99/yr).
- [ ] Build (or stub) the server piece that sends the VoIP push on schedule.
- [ ] Hide/disable the "Stealth Trigger" card in `App.tsx` on iOS
      (`Platform.OS === 'ios'`), since it cannot function there — currently
      `App.tsx` shows it unconditionally.
- [ ] Decide TestFlight-only vs. public App Store distribution given the
      CallKit-misuse review risk noted above.
