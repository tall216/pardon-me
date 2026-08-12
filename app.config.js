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
import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
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
  },
  android: {
    package: 'com.davidevans.pardonme',
    // Bump for EVERY Play upload. Play permanently reserves each versionCode,
    // so a number can never be reused — not even after a rollback.
    versionCode: 1,
    // Android 12+ requires the full-screen-intent permission to be declared.
    permissions: [
      'POST_NOTIFICATIONS',
      'USE_FULL_SCREEN_INTENT',
      'RECEIVE_BOOT_COMPLETED',
      'FOREGROUND_SERVICE',
      'VIBRATE',
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
  ],
  extra: {
    eas: {
      projectId: '721f63d4-e190-4fd9-93a2-6856d1fab6d4',
    },
  },
};

export default config;
