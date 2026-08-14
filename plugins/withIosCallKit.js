// Expo config plugin: iOS Info.plist + entitlements needed for the CallKit /
// PushKit bridge in ios-module/IncomingCall. Applied at prebuild time
// (macOS/Linux/EAS only — see IOS_PORT_PLAN.md for why this cannot run on
// this Windows machine).
const { withInfoPlist, withEntitlementsPlist, withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

function withIosCallKit(config) {
  // UIBackgroundModes: "voip" is required for PushKit VoIP registration and
  // for the app to be relaunched by an incoming VoIP push while
  // suspended/killed. "audio" mirrors the Android module's ringtone-on-a-
  // real-audio-stream approach: without it, iOS can suspend the process
  // before CallKit finishes presenting.
  config = withInfoPlist(config, (cfg) => {
    const modes = new Set(cfg.modResults.UIBackgroundModes || []);
    modes.add('voip');
    modes.add('audio');
    cfg.modResults.UIBackgroundModes = Array.from(modes);
    return cfg;
  });

  // aps-environment entitlement is required for any push capability,
  // including VoIP pushes. EAS Build / `eas submit` set the production value
  // automatically for release builds; development builds get "development".
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['aps-environment'] = process.env.EAS_BUILD_PROFILE === 'production'
      ? 'production'
      : 'development';
    return cfg;
  });

  // Bundle assets/ringtone.wav into the iOS app bundle's top level (not a
  // subfolder — CXProviderConfiguration.ringtoneSound looks it up by
  // filename relative to the main bundle root, same constraint as
  // Android's raw/ringtone.wav needing to be a specific resource name).
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const srcPath = path.join(cfg.modRequest.projectRoot, 'assets', 'ringtone.wav');
    if (!fs.existsSync(srcPath)) {
      throw new Error('withIosCallKit: assets/ringtone.wav not found — CallKit ringtoneSound requires it.');
    }
    const destRelative = 'ringtone.wav';
    const groupName = cfg.modRequest.projectName || 'PardonMe';
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: destRelative,
      groupName,
      project,
      isBuildFile: true,
      verbose: true,
    });
    // Copy the actual bytes to where the Xcode project reference above
    // actually resolves: platformProjectRoot (ios/) directly, NOT
    // ios/<groupName>/ — addResourceFileToGroup's filepath is relative to
    // the .xcodeproj's own source root (ios/), regardless of which named
    // group it's filed under in the project navigator. Confirmed against a
    // real EAS Build failure: "CpResource .../ringtone.wav
    // /Users/expo/workingdir/build/ios/ringtone.wav" — i.e. ios/ringtone.wav,
    // not ios/<groupName>/ringtone.wav.
    try {
      fs.copyFileSync(srcPath, path.join(cfg.modRequest.platformProjectRoot, destRelative));
    } catch (e) {
      console.warn(`withIosCallKit: could not copy ringtone.wav into ${cfg.modRequest.platformProjectRoot}: ${e.message}`);
    }
    return cfg;
  });

  return config;
}

module.exports = withIosCallKit;
