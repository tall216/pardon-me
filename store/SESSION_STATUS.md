# Play Store Submission Status — Pardon Me

Last updated: 12 August 2026, session paused (user stepped away)

## Done

- [x] **Android 15 boot-crash bug FIXED and submitted — versionCode 3**
      Play Console pre-launch report flagged `StealthTriggerService.onStartCommand`
      / `.startArmed` as a guaranteed crash on Android 15+ (API 35): the app
      started a `mediaPlayback` foreground service directly from a
      `BOOT_COMPLETED` receiver, which the platform forbids with no exemption.
      Fixed in `BootReceiver.kt`: now posts a plain notification instead;
      tapping it opens `MainActivity`, whose `onCreate()` already calls
      `armIfEnabled()` from a foreground Activity context (unrestricted on
      every API level). Verified with a real `gradlew compileReleaseKotlin`
      → `BUILD SUCCESSFUL` before shipping.
      Submission ID `11ae90b3-3d8f-4799-8ed9-198ef5ecd746` — confirmed
      `finished`/`completed` via `eas submit:list`, not just CLI text output.
- [x] **App submitted to Google Play Console — internal testing track — CONFIRMED FINISHED**
      versionCode 2 (superseded by 3 above), submission ID `4155570b-8ebe-4221-a4bb-9753aa0f2f20`
      Signed with EAS-managed keystore (SHA1 `B2:EA:9B:CF...`) — the key
      Play Console already had on record for this app.
      Automated `eas submit` pipeline is now fully wired and working via
      the `pardon-me-tuning` service account.
- [x] **Full store listing pushed via the Android Publisher API directly —
      no browser upload needed.** Browser-based image upload was silently
      failing; root-caused to two real bugs in the screenshot files:
      (1) RGBA alpha channel — Play silently rejects images with any alpha
      channel, even fully opaque; (2) aspect ratio 2.222:1 exceeded Play's
      hard max of 2.0:1. Both fixed (flattened to RGB, padded width from
      1080px to 1200px using the app's own #0d0d0d background — zero
      content cropped). Wrote `store/push_listing_via_api.py`, which
      uploads title/descriptions/icon/feature graphic/4 screenshots
      directly via `androidpublisher.googleapis.com`, using the same
      service account as `eas submit`. Independently verified by reading
      the listing back from Google's servers after commit — title,
      both descriptions, and all 5 images confirmed present.
- [x] Release notes for "What's new" pushed to the alpha (closed testing)
      track via the same API.
- [x] GitHub repo live: **https://github.com/tall216/pardon-me** (public)
- [x] Privacy policy written, published, live:
      **https://tall216.github.io/pardon-me/privacy**
      Contact: fobtronicslogistics@gmail.com
      (200 OK confirmed via curl)
- [x] `npm run typecheck` and `npm run test` green (37/37 tests, tsc clean)
      — confirmed fresh multiple times across the session
- [x] Google Play Developer account confirmed to exist — ID 7164895214038250249
- [x] Google Cloud service account created and granted Play Console access:
      `parond-me-project@pardon-me-tuning.iam.gserviceaccount.com`
      Key stored at `android/credentials/play-service-account.json`
      (gitignored, never touched GitHub)
- [x] All work committed and pushed to `origin/master`

## Known remaining pre-launch warnings (non-blocking, User Experience category)

Two deprecation warnings from Play's pre-launch report, lower severity than
the boot-crash issue (that one was "Technical quality" / guaranteed crash;
these are "User experience" / deprecated-but-still-working APIs):

1. **Edge-to-edge not handled for Android 15 (targeting SDK 35 default)**
   — app doesn't yet call `enableEdgeToEdge()` / handle insets explicitly.
2. **Deprecated window APIs**: `setStatusBarColor`, `setNavigationBarColor`,
   `getStatusBarColor`, `getNavigationBarColor`, `getNavigationBarDividerColor`,
   `setNavigationBarDividerColor`, `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`,
   `LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT` — flagged in
   `IncomingCallModule.hideSystemBars`, `MainActivity.goImmersive`, and
   several React Native / Expo internals (not our code, but still surfaced).

Not fixed yet — deferred since they don't crash the app, only degrade the
edge-to-edge visual experience over time as Android continues deprecating
these APIs. Worth a follow-up pass.

**Note on visibility: Play's pre-launch report (Test and release page) has
NO public API — confirmed by Google's own docs and third-party API coverage
trackers. I cannot read that page myself; paste the warnings text here and
I'll act on it, there's no way around that step.**

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
