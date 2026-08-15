# PardonMe iOS — App Store Submission Record

**Status as of 2026-08-15: SUBMITTED FOR REVIEW (WAITING_FOR_REVIEW)**

## App Store Connect
- App: "Pardon Me" | Bundle: com.davidevans.pardonme | ASC App ID: 6793767985
- Version: 1.0 | State: WAITING_FOR_REVIEW (submitted 2026-08-15 16:35 UTC)
- Review submission id: cb74e782-43c5-41eb-bc44-ff518725c5a9
- Release: AFTER_APPROVAL (goes live automatically once approved)
- Reviewer contact: David Evans, +18255836424, fobtronicslogistics@gmail.com, no demo login needed

## Build shipped
- Build id: f770d638-7cd5-4307-945b-a0431634cc01 (v1.0.0 build 1)
- Built with Xcode 26 image: macos-sequoia-15.6-xcode-26.2 (eas.json production.ios.image)
- Also on TestFlight (IN_BETA_TESTING for internal; external = READY_FOR_BETA_SUBMISSION)

## What was wrong with the ORIGINAL build (1fc9a4c8) — PERMANENTLY rejected
NOT an Apple login/2FA issue (that was a wrong earlier theory). Real causes, found by
decompressing EAS's brotli worker log:
1. Built with iOS 18.2 SDK; Apple now requires iOS 26 SDK -> fixed via Xcode 26 image.
2. Invalid UIBackgroundModes value 'remote-notifications' -> corrected to
   'remote-notification' (singular) in app.config.js.

## ASC API key (how all metadata was pushed, no browser needed)
- Individual key CJ66MD2PJ6, issuer = Developer ID 79329414-a921-49f4-9709-d23b5df6e680
  (individual keys use the Developer ID as issuer, NOT a Team issuer id)
- .p8: C:\Users\david\Downloads\AuthKey_CJ66MD2PJ6.p8 (also ios/credentials/, git-ignored)
- Wired into eas.json submit.ios + git-ignored credentials.json

## Metadata pushed via API (store/*.py scripts, re-runnable)
- Description, keywords, subtitle, promo text, copyright (2026 David Evans)
- Support+marketing URL https://tall216.github.io/pardon-me/ (support page = docs/index.md)
- Privacy policy https://tall216.github.io/pardon-me/privacy (docs/privacy.md)
- 4 screenshots resized to Apple 6.7" 1290x2796 (store/screenshots_ios/)
- Free pricing (USD price schedule), age rating 4+, category Utilities, content rights declared
- App Privacy "Data Not Collected" — DONE MANUALLY in ASC web UI (no API for this)

## Windows / EAS gotchas hit this session
- eas-cli 22.0.0 broke submit (Expo incident) -> pin eas-cli@21.8.0
- Local git-clone upload fails code 128 on MSYS paths -> use EAS_NO_VCS=1
- Rebuild/resubmit cmd:
  EAS_NO_VCS=1 npx eas-cli@21.8.0 build -p ios --profile production --auto-submit --non-interactive
- appStoreVersionSubmissions is deprecated (DELETE only); use reviewSubmissions +
  reviewSubmissionItems + PATCH submitted:true instead.

## If Apple REJECTS
Paste feedback; fix in app.config.js/code, rebuild with the EAS_NO_VCS command above,
then re-add to a new reviewSubmission. No new API key needed.

## Accounts
- EAS: tdizzle216@gmail.com / runnercode (Starter plan)
- Apple: david.evans4342@icloud.com / Apostle216, Team N2C7B97A76
