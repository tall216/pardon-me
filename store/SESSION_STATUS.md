# Play Store Submission Status — Pardon Me

Last updated: 12 August 2026, session paused (user stepped away)

## Done

- [x] **App submitted to Google Play Console — internal testing track — CONFIRMED FINISHED**
      versionCode 2, submission ID `4155570b-8ebe-4221-a4bb-9753aa0f2f20`
      Status verified directly via `eas submit:list`: `finished` / `completed`
      Signed with EAS-managed keystore (SHA1 `B2:EA:9B:CF...`) — the key
      Play Console already had on record for this app.
      Automated `eas submit` pipeline is now fully wired and working via
      the `pardon-me-tuning` service account.
- [x] GitHub repo live: **https://github.com/tall216/pardon-me** (public)
- [x] Privacy policy written, published, live:
      **https://tall216.github.io/pardon-me/privacy**
      Contact: fobtronicslogistics@gmail.com
      (200 OK confirmed via curl)
- [x] Play Store listing copy — title/description/tags/content-rating answers/
      data-safety answers/permission justifications — all pre-written in
      `store/PLAY_LISTING.md`, ready to copy-paste
- [x] Feature graphic (1024×500) generated from the real app icon + app's
      own dark theme palette — `store/feature_graphic.png`
- [x] 4 real screenshots captured live from the actual release APK running
      on a booted Android 34 emulator (not mockups) — `store/screenshots/`
      01_home, 02_incoming_call, 03_in_call, 04_identity_presets
- [x] `npm run verify` green (37/37 tests, tsc clean) — confirmed twice
- [x] Google Play Developer account confirmed to exist — ID 7164895214038250249
- [x] Google Cloud service account created and granted Play Console access:
      `parond-me-project@pardon-me-tuning.iam.gserviceaccount.com`
      Key stored at `android/credentials/play-service-account.json`
      (gitignored, never touched GitHub)
- [x] All work committed and pushed to `origin/master`

## IMPORTANT — two keystores exist for this app, know the difference

1. **EAS-managed keystore** (SHA1 `B2:EA:9B:CF:0A:72:6F:A0:40:F6:72:9C:EF:75:BF:1B:F8:09:38:96`)
   — this is what Google Play already has on record and REQUIRES.
   Lives on EAS's servers. `eas build` (cloud build, not local gradle)
   uses this automatically.
2. **Local `pardonme-upload.keystore`** (SHA1 `A7:9A:A8:9E:4D:F8:FA:36...`)
   — used by local `gradlew bundleRelease`. This does NOT match what
   Play expects and submissions signed with it will be REJECTED with
   "signed with the wrong key" errors.

**Going forward: always build via `EAS_NO_VCS=1 npx eas build --platform
android --profile production --non-interactive --no-wait` (cloud build),
not local gradle, when the output needs to go to Play.** The `EAS_NO_VCS=1`
flag is required on this Windows/MSYS setup — without it, `eas build`
fails trying to `git clone file:///C:/...` due to an MSYS git path quirk.

## NOT done — remaining before production release

1. **Closed testing track (20 testers / 14 days)**
   The app is now on the INTERNAL track (unlimited testers, no minimum
   duration — good for validating the pipeline, which we just did).
   Moving to production still requires setting up a CLOSED testing track
   with 20 opted-in testers running for 14 days, per Play's new-developer
   requirements. Has to be configured in Play Console UI — I have no
   visibility into that.

2. **Console-side manual paste-in work** (all content ready in
   `store/PLAY_LISTING.md`, just needs pasting):
   - App title / short & full description / category / tags
   - Feature graphic + 4 screenshots upload
   - Privacy policy URL
   - Support email
   - Data safety form answers
   - Content rating questionnaire answers

3. **CRITICAL — keystore backup still unresolved.**
   `android/app/pardonme-upload.keystore` and `android/keystore.properties`
   are LOCAL-ONLY and gitignored — this is now confirmed to be the WRONG
   key for Play submissions anyway (see above), but it's still needed for
   local dev builds and should not be lost. More urgently: the EAS-managed
   keystore is the one that actually matters for Play, and that lives on
   Expo's servers under the `runnercode` account — back up that account's
   access (password/2FA) rather than a local file.
   **Action needed:** confirm EAS account (`runnercode`) recovery access
   is solid, and still worth backing up the local upload keystore for dev
   builds. Tell me where and I'll copy it.

## Quick resume checklist for next session

- [ ] Set up closed testing track in Play Console (20 testers / 14 days)
- [ ] Paste listing content from `store/PLAY_LISTING.md` into Console
- [ ] Confirm EAS/Expo account recovery access is solid
- [ ] Once closed testing period completes, submit to production track
      using: `EAS_NO_VCS=1 npx eas build --platform android --profile
      production --non-interactive --no-wait` then `eas submit` with
      `track: production` in eas.json (currently set to `internal`)
