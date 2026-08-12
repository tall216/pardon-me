# Pre-submission review — Pardon Me

Adversarial pass over the actual release artifact, in the order Google's
automated checks and a human reviewer would hit it. Every line below was
verified against the built APK/AAB with `aapt2 dump badging`, `keytool`, and
on-device `dumpsys` — not read off the source.

**Reviewed:** 12 August 2026 · versionCode 1 · versionName 1.0.0

---

## Blockers found and fixed

### 1. targetSdkVersion 34 — automatic rejection
Play requires new apps to target a recent API level. The project inherited 34.
**Fixed:** now targets **35** (Android 15), verified in the built APK. The app
was re-tested on device after the bump: the foreground service, media session,
and volume trigger all still work under API 35's tighter service rules.

### 2. RECORD_AUDIO — would have contradicted the privacy policy
`expo-av` contributed a microphone permission the app never uses. Shipping it
means the store listing shows "Microphone", users see a listening app, and the
privacy policy's "does not record audio" becomes a false statement.
**Fixed:** stripped at manifest-merge time. Confirmed absent from the APK.

### 3. READ_PHONE_STATE — unused, and the worst one to over-request
No `TelephonyManager` call exists anywhere in the codebase. On a fake-call app,
requesting phone state invites exactly the scrutiny we don't want.
**Fixed:** stripped. Confirmed absent.
*(Note: the privacy policy previously described this permission. Corrected —
see "Docs corrected" below.)*

### 4. READ/WRITE_EXTERNAL_STORAGE — unused
Contributed by `expo-file-system`; the app bundles its assets and touches no
external files. The first removal attempt failed because the dependency
declares these with `maxSdkVersion`, so the remove directive had to match that
attribute exactly — and a stale plain declaration further down the manifest
collided with it.
**Fixed:** both stripped. Confirmed absent.

### 5. BootReceiver was exported
`android:exported="true"` let any app on the device broadcast to it. Only the
system sends `BOOT_COMPLETED`.
**Fixed:** `exported="false"`. Verified the receiver still registers for all
three boot actions afterwards.

### 6. Backup enabled with no rules
`allowBackup="true"` with no rules meant device-specific state (armed flag,
transient pending-call marker) would sync to Google's servers and restore onto
other devices — wrong behaviourally, and at odds with the policy's "nothing
leaves your phone".
**Fixed:** added `backup_rules.xml` and `data_extraction_rules.xml` excluding
the preferences file from both cloud backup and device transfer.

---

## Verified clean

| Check | Result |
|---|---|
| Signer | `CN=David Evans, Fobtronics Logistics` — **not** the debug key |
| Certificate validity | to 2053 (Play requires ≥ 2033) |
| AAB size | 31 MB (cap 200 MB) |
| `android:debuggable` | absent |
| Cleartext traffic | not enabled |
| ABIs | arm64-v8a, armeabi-v7a, x86, x86_64 |
| Densities | mdpi → xxxhdpi |
| Crash/ANR under stress | 0 FATAL, 0 ANR across force-stop, memory pressure, rotation, 5 arm/disarm cycles, 10 rapid triggers |
| Unit tests | 19/19 |
| Typecheck | clean |

---

## Final permission set — all 14 justified

| Permission | Used by | Note |
|---|---|---|
| POST_NOTIFICATIONS | the call notification | core |
| USE_FULL_SCREEN_INTENT | lock-screen call UI | core |
| FOREGROUND_SERVICE (+MEDIA_PLAYBACK) | background volume trigger | see risk below |
| SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM | scheduled calls | declared |
| RECEIVE_BOOT_COMPLETED | restores armed state | |
| SYSTEM_ALERT_WINDOW | call screen over other apps | |
| WAKE_LOCK / TURN_SCREEN_ON / DISABLE_KEYGUARD | wake for a call | |
| MODIFY_AUDIO_SETTINGS | raise ringer, then restore | |
| VIBRATE | call vibration | |
| INTERNET / ACCESS_NETWORK_STATE | React Native runtime requirement | **no network calls exist in app code** |

`READ_APP_BADGE` is contributed by a launcher-badge library and is harmless.

---

## Remaining risks (not fixable by code)

**1. `mediaPlayback` foreground-service type — most likely review question.**
The silent media session exists to receive volume keys in the background, not
to play media. Android provides no other supported mechanism for this. Nothing
audible is played and nothing is recorded. Wording is pre-written in
`PLAY_LISTING.md`; use it verbatim.

**2. Permission combination draws manual review.**
Display-over-other-apps + persistent foreground service + exact alarms +
system-wide volume capture is unusual for a small app. Each is individually
justified, but expect a human to look.

**3. Fake-call category scrutiny.**
Play has removed fake-call apps used for harassment. The listing is framed
around personal safety and social exit, and closes with "use it kindly".

**4. Single-device testing — the real gap.**
Verified only on Samsung Galaxy A42 5G (Android 11/12). Untested: Pixel/stock,
Android 13+ (runtime notification prompt), Android 14+ (user-granted
full-screen-intent), and aggressive OEM battery managers (Xiaomi, Huawei,
OnePlus) that may kill the foreground service.

---

## Docs corrected

`PRIVACY_POLICY.md` described READ_PHONE_STATE, which no longer ships. The
entry was removed rather than reworded — an inaccurate privacy policy is a
compliance problem, not a copy problem.

---

## Still required before upload

- [ ] Privacy policy hosted at a public URL
- [ ] Support email in the policy and the Console
- [ ] Feature graphic 1024×500
- [ ] 2–8 phone screenshots
- [ ] Data safety form (answers in `PLAY_LISTING.md`)
- [ ] Content rating questionnaire
- [ ] Sensitive-permission declarations
- [ ] **Real-world use on a physical phone across several days**
- [ ] **Back up the keystore and `keystore.properties` offline** — without them
      no future update can ever be published
