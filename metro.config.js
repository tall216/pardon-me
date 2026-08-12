// Expo default Metro config — REQUIRED in this bare workflow so the Expo
// asset pipeline (expo-asset) bundles require()'d assets like ringtone.wav
// into the release APK. Without this file the Gradle JS-bundle step ran
// plain Metro and audio assets were silently dropped.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
