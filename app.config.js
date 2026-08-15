// Expo configuration for "Pardon Me".
//
// IMPORTANT (read before publishing):
//   * Volume-button capture (double-press Volume Down) and playing a ringtone on
//     the ALARM audio stream (which bypasses silent mode) require a custom native
//     module + a development build (EAS dev client). They do NOT work in Expo Go.
//     This config is written so the app runs in Expo Go for UI testing, but the
//     hardware features listed below must be wired in a dev client to actually fire.
//   * USE_FULL_SCREEN_INTENT lets the incoming-call UI show over the lock screen.
//   * FOREGROUND_SERVICE + the notification channel keep Android from killing the
//     listener while the phone is idle.
//
// NOTE: this file's extension is .js, not .ts — it must stay plain JavaScript.
// `expo config` (and metro/babel-backed tooling) tolerate a TS type annotation
// here via their own loader, but EAS Build's config reader parses it as plain
// Node.js and throws "Missing initializer in const declaration" on `: ExpoConfig`.
// Use the JSDoc @type annotation below for editor type-checking instead.
//
/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'Pardon Me',
  slug: 'pardon-me',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  scheme: 'pardonme',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0b0b0f',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.davidevans.pardonme',
    // Matches Android's "everything the app needs, nothing it doesn't"
    // stance: no camera/mic/location usage strings because none of those
    // permissions are requested. Push (for VoIP) needs no Info.plist usage
    // string — only the entitlement the plugin below sets.
    infoPlist: {
      UIBackgroundModes: ['voip', 'audio', 'remote-notification'],
      NSUserNotificationsUsageDescription: 'Pardon Me uses notifications to trigger fake calls.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.davidevans.pardonme',
    // Bump for EVERY Play upload. Play permanently reserves each versionCode,
    // so a number can never be reused — not even after a rollback.
    versionCode: 3,
    // Play requires new apps to target a recent API level; 34 is below the
    // current bar and the upload is rejected outright.
    compileSdkVersion: 36,
    targetSdkVersion: 36,
    // Android 12+ requires the full-screen-intent permission to be declared.
    permissions: [
      'POST_NOTIFICATIONS',
      'USE_FULL_SCREEN_INTENT',
      'RECEIVE_BOOT_COMPLETED',
      'FOREGROUND_SERVICE',
      'VIBRATE',
    ],
    // Permissions pulled in by dependencies that this app never exercises.
    // Shipping an unused permission is both a privacy smell and a review
    // risk: RECORD_AUDIO in particular makes Play (and users) believe the app
    // can listen, and it would contradict the privacy policy.
    blockedPermissions: [
      'RECORD_AUDIO',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'READ_PHONE_STATE',
    ],
    // Foreground service type used to keep the volume listener alive.
    foregroundService: {
      'pardon-me': {
        label: 'Pardon Me is armed',
        foregroundServiceType: 'phoneCall',
      },
    },
  },
  plugins: [
    [
      'expo-notifications',
      {
        // Notification channel used for scheduled fake calls (alarm priority).
        color: '#E91E63',
        // High-priority, sound-enabled, alarm-style channel.
        // On a dev client this can be promoted to the alarm stream.
        importance: 'max',
      },
    ],
    // CallKit/PushKit wiring — Info.plist UIBackgroundModes merge,
    // aps-environment entitlement, ringtone.wav bundling. See
    // ios-module/IncomingCall/ and IOS_PORT_PLAN.md.
    './plugins/withIosCallKit.js',
  ],
  extra: {
    eas: {
      projectId: '721f63d4-e190-4fd9-93a2-6856d1fab6d4',
    },
  },
};

export default config;
