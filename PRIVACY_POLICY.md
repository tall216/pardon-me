# Privacy Policy — Pardon Me

**Last updated:** August 12, 2026

Pardon Me ("the app") is built by David Evans (Fobtronics Logistics). This policy explains what the app does and does not collect.

---

## Data Collection: None

Pardon Me collects **zero** personal data. Specifically:

- **No analytics, no crash reporting, no telemetry** — the app does not phone home.
- **No accounts, no sign-in** — there is no backend server.
- **No advertising** — no ad SDKs are included.
- **No network requests** — the app works fully offline.

## What Stays on Your Device

- **Caller presets** (names like "Boss", "Wife", or custom names you type) are saved locally using Android's built-in AsyncStorage. They never leave your phone.
- **Scheduled call times** are stored in the Android alarm manager and are deleted once the call fires or is cancelled.

## Permissions — Why They're Needed

| Permission | Purpose |
|---|---|
| `POST_NOTIFICATIONS` | Shows the incoming call notification (Android 13+) |
| `USE_FULL_SCREEN_INTENT` | Displays the call screen over the lock screen |
| `FOREGROUND_SERVICE` | Keeps the volume-button trigger alive while armed |
| `VIBRATE` | Buzzes the phone to simulate a real call |
| `RECEIVE_BOOT_COMPLETED` | Re-arms scheduled calls after a reboot |

## Permissions Explicitly NOT Used

The following permissions are **blocked** and the app cannot access them:

- `RECORD_AUDIO` — the app does not listen to or record anything
- `READ_PHONE_STATE` — the app does not read your phone number, call log, or carrier info
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` — the app does not access your files

## Third-Party Services

None. The app uses no third-party analytics, advertising, or tracking services.

## Children

The app is not directed at children under 13 and does not knowingly collect any data from anyone.

## Changes

If this policy changes, the updated version will be posted here and the "Last updated" date will reflect the change.

## Contact

David Evans — Fobtronics Logistics  
Painesville, OH  
Email: fobtronicslogistics@gmail.com

---

*The canonical, hosted copy of this policy is at:
https://tall216.github.io/pardon-me/privacy — use that URL in the Play
Console's Data safety section.*
