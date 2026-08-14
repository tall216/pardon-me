// Points React Native autolinking at the local CallKit/PushKit module so it
// gets picked up as a pod dependency once `ios/` exists (via `expo prebuild`
// on macOS/Linux, or an EAS Build worker — this cannot run on Windows).
//
// No android entry needed: the Android native module already lives directly
// under android/app/src/main/java and is wired through IncomingCallPackage,
// not through autolinking.
module.exports = {
  dependencies: {
    'pardonme-incoming-call': {
      root: __dirname + '/ios-module/IncomingCall',
      platforms: {
        ios: {
          podspecPath: __dirname + '/ios-module/IncomingCall/IncomingCall.podspec',
        },
        android: null,
      },
    },
  },
};
