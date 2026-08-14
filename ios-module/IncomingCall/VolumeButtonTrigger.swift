//
//  VolumeButtonTrigger.swift
//  Pardon Me — foreground-only volume-button detection.
//
//  READ THIS BEFORE TOUCHING: this is NOT the same feature as Android's
//  StealthTriggerService. Apple gives apps no public API to observe hardware
//  volume-button presses while backgrounded or while the phone is locked —
//  there is no iOS equivalent of Android's MediaSession remote VolumeProvider,
//  which is what lets Android capture the keys system-wide. That is a hard
//  platform wall, not a gap in this implementation.
//
//  What IS possible, and what this file does: while the app is in the
//  foreground and active, observe AVAudioSession's `outputVolume` via KVO —
//  the same trick used by camera apps for "volume button = shutter", and the
//  same technique the real, actively-maintained react-native-volume-manager
//  library (github.com/hirbod/react-native-volume-manager) uses in
//  production. This file's structure deliberately mirrors that library's
//  ios/VolumeManager.m as closely as Swift allows, after two earlier rounds
//  of self-inflicted bugs from deviating from it without a proven reason.
//
//  DESIGN CHANGE FROM EARLIER VERSIONS OF THIS FILE (both were wrong, in
//  different ways — documented here so nobody reintroduces them):
//
//   1. Earlier versions set `ignoreNextChange = true` on arm, meant to
//      discard a "synthetic KVO callback that fires immediately on
//      registration." That synthetic callback only happens if you register
//      with NSKeyValueObservingOptions.initial — this file (like the
//      reference) registers with only [.new], which never delivers one.
//      The flag had nothing real to consume, so it silently swallowed the
//      user's ACTUAL FIRST button press instead, requiring a second press
//      just to clear it before anything worked. This is believed to be the
//      actual root cause of "arm it, press it, nothing happens" reports —
//      not proven by a device log (no Mac available to this project), but
//      derived from precise KVO semantics and confirmed absent from a
//      production reference implementation.
//
//   2. Earlier versions reset the visible volume back to its pre-press value
//      after every detected press, to keep the phone's actual volume level
//      from audibly moving. That reset is ITSELF a change to outputVolume,
//      which re-triggers the same KVO observer — a real, previously-shipped
//      feedback-loop bug (one physical press produced two internal events,
//      read by the JS double-press gate as an immediate double-press,
//      firing a call fast enough to trip CallKit's abuse rate-limiter).
//      This version does not reset volume at all, matching the reference
//      implementation: the hidden MPVolumeView kept in the window the whole
//      time already suppresses the native volume HUD popup, so a press
//      quietly nudges the volume by one step with no visible UI — a
//      reasonable "stealth enough" tradeoff against a class of bug that has
//      now shipped twice.
//
import Foundation
import AVFoundation
import MediaPlayer
import UIKit

@objc(PardonMeVolumeButtonTrigger)
public class VolumeButtonTrigger: NSObject {

    @objc public static let shared = VolumeButtonTrigger()

    @objc public private(set) var isArmed = false

    private let audioSession = AVAudioSession.sharedInstance()
    private var hiddenVolumeView: MPVolumeView?
    private var lastFireAt: TimeInterval = 0

    /// Emits to JS. Set once by IncomingCallModule, same pattern as
    /// PardonMeCallKitManager.eventEmitter.
    @objc public weak var eventEmitter: IncomingCallModule?

    private override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleWillResignActive),
            name: UIApplication.willResignActiveNotification, object: nil
        )
    }

    @objc private func handleWillResignActive() {
        // Backgrounding silently disarms rather than leaving a UI that claims
        // "ARMED" while nothing can actually fire. JS re-syncs armed state on
        // every foreground resume (existing useStealthTrigger AppState
        // listener), so the toggle will correctly show OFF when the user
        // returns.
        if isArmed { disarm() }
    }

    /// Arms the foreground volume-button trigger. Touches UIApplication and
    /// adds a view to the key window, both of which are UIKit calls that
    /// must run on the main thread — the RN bridge does not guarantee that
    /// for @objc bridge methods (requiresMainQueueSetup is false), so this
    /// dispatches internally rather than assuming the caller's thread.
    ///
    /// Passes the real thrown error message through to the completion, not
    /// just a bare Bool — a real device test showed arm() resolving false
    /// with no visible reason anywhere (JS only ever saw "resolved -> false"),
    /// because AVAudioSession.setCategory/setActive's actual NSError was
    /// being caught and discarded. This is the fix for that blind spot.
    @objc public func arm(completion: @escaping (Bool, String?) -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                completion(false, "VolumeButtonTrigger deallocated")
                return
            }
            let (ok, message) = self.armOnMainThread()
            completion(ok, message)
        }
    }

    private func armOnMainThread() -> (Bool, String?) {
        guard !isArmed else { return (true, nil) }
        do {
            // REAL BUG FOUND AND FIXED HERE: .allowBluetooth is documented
            // by Apple as valid ONLY with categories that support audio
            // input (.playAndRecord, .record, .multiRoute+.dualRoute) — see
            // developer.apple.com's AllowBluetooth reference. .ambient does
            // not support input, so setCategory(.ambient, options:
            // [.mixWithOthers, .allowBluetooth]) is an invalid combination
            // and iOS correctly rejects it. A real device test surfaced the
            // exact failure for the first time: OSStatus error -50
            // ("invalid parameter"), NSOSStatusErrorDomain code -50 — which
            // is the generic code for exactly this class of mistake. Only
            // .mixWithOthers is valid with .ambient; that alone is also all
            // this feature actually needs (let other audio, e.g. music,
            // keep playing while armed).
            try audioSession.setCategory(.ambient, options: [.mixWithOthers])
            try audioSession.setActive(true, options: [])
        } catch {
            let nsError = error as NSError
            let message = "setCategory/setActive failed: \(nsError.localizedDescription) (domain=\(nsError.domain), code=\(nsError.code))"
            log("arm() failed: \(message)")
            return (false, message)
        }
        log("arm() starting audioSession.outputVolume=\(audioSession.outputVolume)")

        // A hidden MPVolumeView added to the window is what suppresses the
        // native system volume HUD from popping up on a press — kept in the
        // hierarchy for the whole armed duration, not just transiently.
        // 1x1 off-screen + near-zero (not exactly zero) alpha matches the
        // reference implementation's CGRectMake(-2000,-2000,1,1) + alpha
        // 0.01 exactly; JPSVolumeButtonHandler (a different, older reference
        // for this same technique) documents that alpha EXACTLY 0 breaks
        // it, which is why this is 0.01, not 0.
        let view = MPVolumeView(frame: CGRect(x: -2000, y: -2000, width: 1, height: 1))
        view.alpha = 0.01
        var windowWarning: String? = nil
        if let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) ?? ($0 as? UIWindowScene)?.windows.first })
            .first {
            window.addSubview(view)
        } else {
            windowWarning = "no window found to host MPVolumeView — native volume HUD may appear on press, but detection still works"
            log("arm() WARNING: \(windowWarning!)")
        }
        hiddenVolumeView = view

        // No .initial here (deliberately — see file header on why an
        // "ignore the first synthetic callback" guard was itself the bug in
        // an earlier version). Every real KVO callback from this point on
        // corresponds to an actual volume change.
        audioSession.addObserver(self, forKeyPath: "outputVolume", options: [.new, .old], context: nil)
        isArmed = true
        log("arm() complete, isArmed=true")
        return (true, windowWarning)
    }

    private func log(_ message: String) {
        #if DEBUG
        NSLog("[PardonMeVolumeTrigger] \(message)")
        #endif
    }

    @objc public func disarm() {
        DispatchQueue.main.async { [weak self] in
            self?.disarmOnMainThread()
        }
    }

    private func disarmOnMainThread() {
        guard isArmed else { return }
        audioSession.removeObserver(self, forKeyPath: "outputVolume")
        hiddenVolumeView?.removeFromSuperview()
        hiddenVolumeView = nil
        try? audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
        isArmed = false
        log("disarm() complete")
    }

    public override func observeValue(
        forKeyPath keyPath: String?,
        of object: Any?,
        change: [NSKeyValueChangeKey: Any]?,
        context: UnsafeMutableRawPointer?
    ) {
        guard keyPath == "outputVolume" else { return }
        let newValue = (change?[.newKey] as? NSNumber)?.floatValue ?? audioSession.outputVolume
        let oldValue = (change?[.oldKey] as? NSNumber)?.floatValue
        let oldDescription = oldValue.map { String(describing: $0) } ?? "?"
        log("observeValue fired, outputVolume=\(newValue) (was \(oldDescription))")

        // Debounce: guards against any duplicate KVO delivery iOS itself
        // might produce for a single physical press (documented behaviour
        // on some OS versions), not against a self-inflicted reset — there
        // is no reset in this version, so no self-triggered loop is
        // possible by construction.
        let now = Date().timeIntervalSince1970
        guard now - lastFireAt > 0.12 else {
            log("observeValue debounced (too soon after last fire)")
            return
        }
        lastFireAt = now

        log("emitting PardonMeVolumePressed")
        eventEmitter?.emitVolumePressed()
    }
}
