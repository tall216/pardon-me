# Privacy Policy — Pardon Me

**Last updated:** 12 August 2026
**Developer:** David Evans / Fobtronics Logistics, Painesville, Ohio, USA
**Contact:** _(add your support email before publishing)_

## The short version

Pardon Me does not collect, transmit, or sell any of your data. There are no
analytics, no advertising, no trackers, and no accounts. The app has no server
component. Everything it stores stays on your device.

## What the app stores on your device

| Data | Why | Where |
|---|---|---|
| Caller name and preset list | So the fake call shows the name you chose | App-private storage |
| "Armed" on/off setting | So your choice survives a reboot | App-private storage |
| Pending-call marker | Lets the call screen appear if Android restarts the app mid-call. Auto-expires after 60 seconds | App-private storage |

This information never leaves the device. Uninstalling the app deletes all of
it.

## What the app does NOT do

- It does **not** place, receive, or interfere with real phone calls
- It does **not** read your contacts, call log, messages, accounts, or phone state
- It does **not** record audio or use the microphone
- It does **not** use the camera or location
- It does **not** read or write any files outside its own private storage
- It does **not** connect to the internet or transmit anything
- It contains no advertising or analytics SDKs

## Permissions, and exactly why each is needed

**POST_NOTIFICATIONS** — the fake incoming call is delivered as a
high-priority notification. Without this it cannot ring.

**USE_FULL_SCREEN_INTENT** — lets the call screen appear over the lock screen,
the way a real incoming call does.

**FOREGROUND_SERVICE / FOREGROUND_SERVICE_MEDIA_PLAYBACK** — keeps the
volume-button trigger listening while the app is closed. Android requires a
visible notification while this runs, which is why you see the quiet "Ready"
notice. The service registers a silent media session; this is what allows the
volume keys to reach the app while the screen is off. No audio is recorded and
nothing is played that you can hear.

**SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM** — makes a scheduled call arrive at
the time you asked for, even if the phone is idle.

**RECEIVE_BOOT_COMPLETED** — restores your armed/disarmed choice after a
restart, so the app behaves the way you left it.

**VIBRATE** — the call vibrates like a real one.

**WAKE_LOCK / TURN_SCREEN_ON / DISABLE_KEYGUARD** — wakes the screen when a
call arrives, as a real call does.

**SYSTEM_ALERT_WINDOW** — allows the call screen to appear reliably on top of
whatever is on screen when the call fires.

**MODIFY_AUDIO_SETTINGS** — raises the ringer for the duration of the fake
call and puts your original volume back afterwards.

## Children

Pardon Me is not directed at children under 13 and collects no data from
anyone, of any age.

## Changes

If this policy changes, the updated version will be published at this URL and
the date above will be revised.

## Contact

Questions about privacy: _(add your support email before publishing)_
