//
//  IncomingCallModule.swift
//  Pardon Me — RN bridge module. Method-for-method mirror of
//  IncomingCallModule.kt's @ReactMethod surface, so fakeCall.ts and
//  deviceReadiness.ts work unmodified against `NativeModules.IncomingCall`
//  on either platform (methods not meaningful on iOS resolve harmlessly
//  rather than reject, matching the Android module's "never crash the UI
//  over a settings intent" philosophy).
//
import Foundation
import React
import UserNotifications
import UIKit

@objc(IncomingCall)
public class IncomingCallModule: RCTEventEmitter {

    private var hasListeners = false

    public override init() {
        super.init()
        PardonMeCallKitManager.shared.eventEmitter = self
        PardonMeCallKitManager.shared.registerForVoIPPushes()
        VolumeButtonTrigger.shared.eventEmitter = self
    }

    public override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    public override func supportedEvents() -> [String]! {
        // PardonMeIncomingCall kept identical to Android's event name so any
        // future shared JS listener code Just Works on both platforms.
        // The CallKit-only events, and PardonMeVolumePressed (see
        // VolumeButtonTrigger.swift for why this is foreground-only on iOS
        // where Android's equivalent works backgrounded/locked), are additive.
        return [
            "PardonMeIncomingCall",
            "PardonMeCallAnswered",
            "PardonMeCallEnded",
            "PardonMePushTokenUpdated",
            "PardonMeVolumePressed",
        ]
    }

    public override func startObserving() { hasListeners = true }
    public override func stopObserving() { hasListeners = false }

    private func send(_ name: String, _ body: Any?) {
        guard hasListeners else { return }
        sendEvent(withName: name, body: body)
    }

    // Called by PardonMeCallKitManager's CXProviderDelegate callbacks.
    func emitCallAnswered(_ callerName: String) {
        send("PardonMeCallAnswered", ["callerName": callerName])
    }
    func emitCallEnded(_ callerName: String) {
        send("PardonMeCallEnded", ["callerName": callerName])
    }
    func emitPushTokenUpdated(_ token: String) {
        send("PardonMePushTokenUpdated", ["token": token])
    }
    // Called by VolumeButtonTrigger when it detects a volume-key press
    // (foreground only — see VolumeButtonTrigger.swift).
    func emitVolumePressed() {
        send("PardonMeVolumePressed", nil)
    }

    // MARK: - Call lifecycle (parity with showIncomingCall / dismissCall)

    @objc(showIncomingCall:resolver:rejecter:)
    func showIncomingCall(_ callerName: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        PardonMeCallKitManager.shared.reportIncomingCall(name: callerName) { error in
            if let error = error {
                reject("E_SHOW_CALL", error.localizedDescription, error)
            } else {
                resolve(true)
            }
        }
    }

    @objc(dismissCall:rejecter:)
    func dismissCall(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Deliberately a no-op on iOS. This is called from BOTH
        // answerCall() and endCall() in fakeCall.ts (it mirrors Android's
        // dismissCall, which is just "cancel our own notification" and is
        // harmless either way there). On iOS, CallKit's own UI IS the
        // ringing screen; sending CXEndCallAction here would hang up a call
        // the user just answered. Real hang-up is endCallSession below,
        // wired from JS's endCall() only — see fakeCall.ts.
        resolve(true)
    }

    /// Explicit hang-up, called only from JS's endCall() — never from
    /// answerCall(). See the comment on dismissCall above and on
    /// PardonMeCallKitManager.endCallSession for the bug this fixes.
    @objc(endCallSession:rejecter:)
    func endCallSession(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        PardonMeCallKitManager.shared.endCallSession { error in
            if let error = error {
                reject("E_END_CALL", error.localizedDescription, error)
            } else {
                resolve(true)
            }
        }
    }

    // MARK: - Scheduling
    //
    // IMPORTANT: unlike Android's AlarmManager.setExactAndAllowWhileIdle,
    // this Timer does NOT fire once the app is suspended or killed. It only
    // covers "schedule while I keep the app open/backgrounded briefly" — see
    // IOS_PORT_PLAN.md for why a true background schedule needs a server
    // sending a VoIP push at the target time instead.
    private var scheduledTimer: Timer?

    @objc(scheduleCall:seconds:resolver:rejecter:)
    func scheduleCall(_ callerName: String, seconds: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        scheduledTimer?.invalidate()
        let delay = seconds.doubleValue
        scheduledTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            PardonMeCallKitManager.shared.reportIncomingCall(name: callerName)
        }
        resolve(true)
    }

    @objc(cancelScheduledCall:rejecter:)
    func cancelScheduledCall(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        scheduledTimer?.invalidate()
        scheduledTimer = nil
        PardonMeCallKitManager.shared.cancelPendingCall()
        resolve(true)
    }

    // MARK: - Pending-call drain (raise UI on relaunch, mirrors consumePendingCall)

    @objc(consumePendingCall:rejecter:)
    func consumePendingCall(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let caller = PardonMeCallKitManager.pendingCallerName
        PardonMeCallKitManager.pendingCallerName = nil
        resolve(caller as Any?)
    }

    // MARK: - Push token (new surface — Android has no equivalent)

    @objc(getPushToken:rejecter:)
    func getPushToken(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(PardonMeCallKitManager.pushToken as Any?)
    }

    // MARK: - Volume-button trigger (foreground-only on iOS — see
    // VolumeButtonTrigger.swift for the platform constraint this works
    // around and cannot fully solve).

    @objc(armStealthTrigger:rejecter:)
    func armStealthTrigger(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        VolumeButtonTrigger.shared.arm { ok, message in
            if ok {
                resolve(true)
            } else {
                // Reject (not resolve-false) so the real reason reaches JS's
                // catch block and the on-screen debug log, instead of a bare
                // "resolved -> false" with no explanation anywhere.
                reject("E_ARM_STEALTH", message ?? "arm failed for an unknown reason", nil)
            }
        }
    }

    @objc(disarmStealthTrigger:rejecter:)
    func disarmStealthTrigger(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        VolumeButtonTrigger.shared.disarm()
        resolve(true)
    }

    @objc(isStealthArmed:rejecter:)
    func isStealthArmed(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(VolumeButtonTrigger.shared.isArmed)
    }

    @objc(setCallerName:resolver:rejecter:)
    func setCallerName(_ callerName: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        PardonMeCallKitManager.lastCallerName = callerName
        resolve(true)
    }

    @objc(leaveIfCallLaunched:rejecter:)
    func leaveIfCallLaunched(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // No Android-style "moveTaskToBack" equivalent / need: CallKit's own
        // UI is what was on screen, not our app, so there is nothing to hide.
        resolve(true)
    }

    @objc(restoreSystemBars:rejecter:)
    func restoreSystemBars(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(true)
    }

    @objc(canUseFullScreenIntent:rejecter:)
    func canUseFullScreenIntent(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // No such iOS gate — CallKit presentation is not permission-gated.
        resolve(true)
    }

    @objc(openFullScreenIntentSettings:rejecter:)
    func openFullScreenIntentSettings(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(true)
    }

    @objc(isDeviceLocked:rejecter:)
    func isDeviceLocked(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // No public API; harmless default per deviceReadiness.ts's "optimistic
        // defaults" convention — CallKit's own presentation does not depend
        // on this value.
        resolve(false)
    }

    // MARK: - Device readiness (iOS-shaped subset of the Android map)

    @objc(getDeviceReadiness:rejecter:)
    func getDeviceReadiness(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let authorized = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
            var map: [String: Any] = [
                "sdkInt": ProcessInfo.processInfo.operatingSystemVersion.majorVersion,
                "release": UIDevice.current.systemVersion,
                "manufacturer": "Apple",
                "model": UIDevice.current.model,
                "notifications": authorized,
                "needsNotificationRequest": settings.authorizationStatus == .notDetermined,
                "fullScreenIntent": true,
                "exactAlarms": true,
                "batteryOptimised": false,
                "aggressiveOem": false,
                "stealthArmed": false,
                "voipPushRegistered": PardonMeCallKitManager.pushToken != nil,
            ]
            DispatchQueue.main.async {
                resolve(map)
            }
        }
    }

    @objc(hasNotificationPermission:rejecter:)
    func hasNotificationPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let authorized = settings.authorizationStatus == .authorized
            DispatchQueue.main.async { resolve(authorized) }
        }
    }

    @objc(requestNotificationPermission:rejecter:)
    func requestNotificationPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async { resolve(granted) }
        }
    }

    @objc(openNotificationSettings:rejecter:)
    func openNotificationSettings(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                resolve(false)
                return
            }
            UIApplication.shared.open(url, options: [:]) { success in
                resolve(success)
            }
        }
    }

    @objc(isBatteryOptimised:rejecter:)
    func isBatteryOptimised(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(false)
    }

    @objc(openBatterySettings:rejecter:)
    func openBatterySettings(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(true)
    }

    @objc(openExactAlarmSettings:rejecter:)
    func openExactAlarmSettings(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(true)
    }
}
