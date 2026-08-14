// No JS surface — this package exists only so React Native autolinking (which
// requires every linked dependency to be a real npm package with a
// package.json + main entry) can discover IncomingCall.podspec via
// react-native.config.js. All real code is the native Swift/Obj-C in this
// same directory.
module.exports = {};
