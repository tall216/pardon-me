# Releasing Pardon Me

## Build commands

```bash
npm run verify                  # typecheck + unit tests — run before every build
cd android

# Play Store upload (AAB — what Google requires)
cmd /c "set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr&& \
        set ANDROID_HOME=C:\Users\david\AppData\Local\Android\Sdk&& \
        gradlew.bat bundleRelease -x lint"
# -> android/app/build/outputs/bundle/release/app-release.aab

# Sideload / direct install testing
cmd /c "... gradlew.bat assembleRelease -x lint"
# -> android/app/build/outputs/apk/release/app-release.apk
```

## Signing

Release builds are signed with the **upload key**:

- Keystore: `android/app/pardonme-upload.keystore` (PKCS12, RSA 4096, valid to 2053)
- Credentials: `android/keystore.properties`
- Alias: `pardonme-upload`
- Certificate SHA-256:
  `E1:21:53:B5:07:53:86:BD:C5:40:E7:B3:BC:2F:6C:A0:8F:E4:F9:3F:FC:0F:AA:08:83:31:7E:13:77:15:57:DC`

> ### BACK THESE UP NOW
> Both files are gitignored and exist **only on this machine**. Lose them and
> you cannot publish an update — recovering requires a key reset request to
> Google. Copy both to offline storage (and note the passwords somewhere safe)
> before the first upload.

If `keystore.properties` is missing, the release build silently falls back to
debug signing so a fresh clone still compiles. Such a build **cannot** be
uploaded to Play. Verify what you are about to upload:

```bash
keytool -printcert -jarfile app-release.aab | grep Owner
# Expect: CN=David Evans, OU=Fobtronics Logistics, ...
# NOT:    CN=Android Debug
```

## Every release

1. `npm run verify` — must be green
2. Bump `versionCode` in `app.config.js` **and** `android/app/build.gradle`
   (Play permanently reserves each number; it can never be reused)
3. Bump `versionName` if it is a user-visible release
4. `gradlew bundleRelease`
5. Confirm the signer (above)
6. Upload to the Play Console

## Installing a release build on a test device

The release build is signed with the upload key, which does **not** match the
debug key used by earlier builds. `adb install -r` therefore fails with:

```
INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match previously
installed version; ignoring!
```

Uninstall first:

```bash
adb uninstall com.davidevans.pardonme
adb install android/app/build/outputs/apk/release/app-release.apk
```

> This failure is easy to miss if install output is piped to /dev/null: the
> old build keeps running and every subsequent test silently measures stale
> code. Always confirm the installed binary matches what you built:
>
> ```bash
> adb shell md5sum $(adb shell pm path com.davidevans.pardonme | sed 's/package://')
> md5sum android/app/build/outputs/apk/release/app-release.apk
> ```
>
> Play Store updates are unaffected — Play re-signs with the app signing key,
> so end users upgrade normally.

## Still required before the first submission

- [ ] Publish the privacy policy at a public URL (`store/PRIVACY_POLICY.md`)
- [ ] Add a support email to the policy and the Console
- [ ] Feature graphic, 1024×500
- [ ] 2–8 phone screenshots
- [ ] Complete the Data safety form (answers in `store/PLAY_LISTING.md`)
- [ ] Complete the content rating questionnaire
- [ ] Answer the sensitive-permission declarations (wording in the listing doc)
- [ ] **Real-world testing on a physical phone across several days**

## Known review risks

The permission set — display-over-other-apps, a persistent foreground service,
exact alarms, and system-wide volume-key capture — is unusual for a small app
and is likely to draw manual review. Every one is justified in
`store/PLAY_LISTING.md`; use that wording verbatim in the Console.

The `mediaPlayback` foreground-service type is the most likely question: the
silent media session exists to receive volume keys, not to play media. If Play
pushes back, the honest answer is that Android offers no other supported way to
receive volume-key input from the background, and the app plays nothing audible.

## Device coverage

Tested on: **Samsung Galaxy A42 5G (SM-A426U), Android 11/12**

Untested and worth checking before a wide release: Pixel (stock Android),
Android 13+ (runtime notification permission prompt), Android 14+ (full-screen
intent permission is user-granted), and any device with aggressive OEM battery
management (Xiaomi, Huawei, OnePlus), which may kill the foreground service.
