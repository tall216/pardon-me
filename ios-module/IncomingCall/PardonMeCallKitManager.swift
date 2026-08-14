//
//  PardonMeCallKitManager.swift
//  Pardon Me — CallKit + PushKit core.
//
//  WHY NATIVE (mirrors the reasoning at the top of the Android
//  IncomingCallModule.kt): JavaScript cannot present UI over the iOS lock
//  screen, and there is no non-CallKit API that does. CallKit is also the
//  only way a backgrounded/killed app gets woken reliably — via PushKit VoIP
//  push, which iOS guarantees immediate delivery for (unlike regular remote
//  notifications, which the OS may coalesce or delay).
//
//  See IOS_PORT_PLAN.md for the App Store review risk this carries and the
//  server piece still needed to actually deliver a VoIP push on a schedule.
//
import Foundation
import CallKit
import PushKit
import AVFoundation

@objc(PardonMeCallKitManager)
public class PardonMeCallKitManager: NSObject {

    @objc public static let shared = PardonMeCallKitManager()

    private let provider: CXProvider
    private let callController = CXCallController()
    private var pushRegistry: PKPushRegistry?

    /// The single fake call this app ever has in flight, mirroring the JS
    /// state machine's single `ActiveCall`. A real CallKit app might track a
    /// dictionary of UUIDs; this app never has more than one call.
    private(set) var currentCallUUID: UUID?
    private(set) var currentCallerName: String?

    /// Drained by `consumePendingCall()` — same "process may have been
    /// relaunched by the OS between the event and JS booting" problem the
    /// Android side solves with SharedPreferences. Static + in-memory is
    /// sufficient here because a VoIP push relaunches the process and
    /// `application(_:didReceiveIncomingPushWith:)` runs before JS, so by the
    /// time JS asks, the process that set this is the same one still running.
    @objc public static var pendingCallerName: String?

    /// Most recent VoIP push token, hex-encoded, surfaced to JS so it can be
    /// registered with a server. nil until PushKit calls back.
    @objc public private(set) static var pushToken: String?

    /// Most recent caller name pushed from JS, so a native-triggered call
    /// (the volume-button trigger, mirroring Android's design) uses the
    /// right identity without needing a JS round-trip.
    @objc public static var lastCallerName: String?

    /// Bridge module instance is set once by IncomingCallModule.init so this
    /// manager can emit RCTEventEmitter events (answered/declined/ended)
    /// without a hard dependency the other direction.
    @objc public weak var eventEmitter: IncomingCallModule?

    private override init() {
        // localizedName is the label CallKit's system UI shows for this
        // provider — required at init, not optional, across every iOS
        // version this app targets (13+).
        let config = CXProviderConfiguration(localizedName: "Pardon Me")
        config.supportsVideo = false
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        // CallKit accepts wav directly for a bundled ringtone sound; must be
        // present at the top level of the app bundle (handled by the Expo
        // config plugin, which copies assets/ringtone.wav into the iOS
        // bundle resources).
        config.ringtoneSound = "ringtone.wav"
        // No custom template icon shipped this pass — CallKit falls back to
        // a generic phone glyph, which is harmless. (Swift forbids calling
        // any instance method — even one that ignores self — before
        // super.init() completes, so this can't be resolved via a
        // pre-super.init() helper call; it has to be a static/free function
        // if ever added.)

        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    // MARK: - PushKit registration

    @objc public func registerForVoIPPushes() {
        guard pushRegistry == nil else { return }
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        pushRegistry = registry
    }

    // MARK: - Reporting an incoming call (local trigger or VoIP push)

    /// Mirrors Android's `postCallNotification`: report to CallKit, which
    /// presents the system's native full-screen incoming-call UI. Unlike
    /// Android, there is no separate "show our own overlay" step needed —
    /// CallKit's own UI IS the ringing screen. The JS `FakeCallOverlay` is
    /// used for the ACTIVE (in-call) state after the user answers, once
    /// CallKit hands control back to the app.
    @objc(reportIncomingCallWithName:completion:)
    public func reportIncomingCall(name: String, completion: ((Error?) -> Void)? = nil) {
        let uuid = UUID()
        currentCallUUID = uuid
        currentCallerName = name
        PardonMeCallKitManager.pendingCallerName = name

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: name)
        update.localizedCallerName = name
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false

        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                // A real reason this can fail: too many recent reports (iOS
                // rate-limits abuse of reportNewIncomingCall), or the user
                // disabled the app under Settings > Phone > Call Blocking &
                // Identification. Surface it; do not pretend it rang.
                #if DEBUG
                NSLog("[PardonMeCallKit] reportNewIncomingCall FAILED: \(error) (domain=\((error as NSError).domain), code=\((error as NSError).code))")
                #endif
                PardonMeCallKitManager.pendingCallerName = nil
            } else {
                #if DEBUG
                NSLog("[PardonMeCallKit] reportNewIncomingCall succeeded for uuid=\(uuid)")
                #endif
            }
            completion?(error)
        }
    }

    /// Explicit hang-up — end the call from our side. This is the ONLY path
    /// that should ever send CXEndCallAction; it must never be reachable
    /// from the answer flow. (A real bug shipped in the first build: JS's
    /// answerCall() and endCall() both called the single native dismissCall,
    /// which on iOS was wired straight to this — so tapping Answer on the
    /// CallKit screen silently told CallKit to hang up immediately. Fixed by
    /// splitting into dismissCall (no-op on iOS, see below) and this
    /// dedicated endCallSession, called only from the JS side's decline/hang
    /// up paths, never from answer.)
    @objc(endCallSessionWithCompletion:)
    public func endCallSession(completion: ((Error?) -> Void)? = nil) {
        guard let uuid = currentCallUUID else {
            completion?(nil)
            return
        }
        let endAction = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: endAction)
        callController.request(transaction) { error in
            completion?(error)
        }
    }

    /// Cancels the CallKit report the way you cancel a scheduled Android
    /// alarm — used when a scheduled call is cancelled before it fires.
    @objc public func cancelPendingCall() {
        guard let uuid = currentCallUUID else { return }
        provider.reportCall(with: uuid, endedAt: nil, reason: .unanswered)
        currentCallUUID = nil
        currentCallerName = nil
        PardonMeCallKitManager.pendingCallerName = nil
    }
}

// MARK: - CXProviderDelegate

extension PardonMeCallKitManager: CXProviderDelegate {

    public func providerDidReset(_ provider: CXProvider) {
        currentCallUUID = nil
        currentCallerName = nil
    }

    /// User tapped Accept on the CallKit UI. Mirrors JS's `answerCall()`
    /// transition RINGING -> ACTIVE.
    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        action.fulfill()
        eventEmitter?.emitCallAnswered(currentCallerName ?? "")
    }

    /// User tapped Decline, or the in-app "hang up" button drove a
    /// CXEndCallAction (see endCall() above). Mirrors JS's `endCall()`.
    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        action.fulfill()
        let name = currentCallerName ?? ""
        currentCallUUID = nil
        currentCallerName = nil
        PardonMeCallKitManager.pendingCallerName = nil
        eventEmitter?.emitCallEnded(name)
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // No real audio to route — the "call" has no actual audio content,
        // same as Android, which never plays audio through expo-av for this
        // reason (see fakeCall.ts's file header comment).
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}

// MARK: - PKPushRegistryDelegate

extension PardonMeCallKitManager: PKPushRegistryDelegate {

    public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        PardonMeCallKitManager.pushToken = token
        eventEmitter?.emitPushTokenUpdated(token)
    }

    public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        PardonMeCallKitManager.pushToken = nil
    }

    /// The critical iOS 13+ path: a VoIP push MUST result in a synchronous
    /// call to reportNewIncomingCall before this function returns, or the OS
    /// terminates the app and may revoke VoIP push entitlements for
    /// repeated violations. There is deliberately no async work, no network
    /// call, no JS round-trip before reportIncomingCall runs.
    public func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }
        let callerName = (payload.dictionaryPayload["callerName"] as? String) ?? "Michael"
        reportIncomingCall(name: callerName) { _ in
            completion()
        }
    }
}
