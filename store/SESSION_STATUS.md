# Play Store Submission Status — Pardon Me

Last updated: 12 August 2026, session paused (user stepped away)

## Done

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
- [x] Production AAB already built via EAS: build `78d50f5a`, v1.0.0,
      versionCode 1 — https://expo.dev/artifacts/eas/ajfW_rfnz_upnKem2a7Wgj6ENagMml_N4ToAuXM1RXQ.aab
      Also present locally at:
      `android/app/build/outputs/bundle/release/app-release.aab`
- [x] `npm run verify` green (37/37 tests, tsc clean) — confirmed twice
- [x] Google Play Developer account confirmed to exist — ID 7164895214038250249
- [x] All work committed and pushed to `origin/master` (HEAD `5c4dcac`)

## NOT done — blocked on things only David can do

1. **Service-account JSON key for automated `eas submit`**
   Needed so I can push the AAB straight to Play Console from here.
   Steps (Play Console → Setup → API access):
   - Link/create a Google Cloud project
   - Create a service account, download its JSON key
   - Grant it Release manager access in Play Console
   - Give me the downloaded file's path and I'll wire it into `eas.json`
     and run the submit.

   **Alternative if you'd rather skip this:** upload the AAB manually
   through the Play Console UI instead — no key needed, just slower.
   File to upload: `android/app/build/outputs/bundle/release/app-release.aab`

2. **Closed testing track setup (20 testers / 14 days)**
   Per your own notes this is required by Play for new developer accounts
   before production release unlocks. Has to be set up in Console —
   I have no visibility into your Console UI to do this myself.

3. **Console-side manual paste-in work** (all content is ready in
   `store/PLAY_LISTING.md`, just needs pasting):
   - App title / short & full description / category / tags
   - Feature graphic + 4 screenshots upload
   - Privacy policy URL
   - Support email
   - Data safety form answers
   - Content rating questionnaire answers

4. **CRITICAL — keystore backup still unresolved.**
   `android/app/pardonme-upload.keystore` and `android/keystore.properties`
   exist in exactly ONE place: this machine, this folder. They are
   correctly gitignored (never touched GitHub) but that also means there
   is currently ZERO backup. If this file is lost, no future update to
   this app can ever be published — Google's key-reset process is the
   only recovery path and it is slow/manual.
   **Action needed:** tell me where to copy these two files (USB drive,
   password manager vault, encrypted cloud folder you control) and I will
   do it as soon as you're back. I did not move them anywhere without
   your say-so.

## Quick resume checklist for next session

- [ ] Decide: automated `eas submit` (needs service-account key) vs.
      manual Console upload
- [ ] Back up the upload keystore
- [ ] Set up closed testing track in Play Console
- [ ] Paste listing content from `store/PLAY_LISTING.md` into Console
- [ ] Submit for review
