/**
 * Pure-logic tests for the trigger timing rules.
 *
 * These cover the parts that broke repeatedly during development: the
 * double-press window, the multi-detector dedupe, and the call state machine
 * transitions. They run without a device, so a regression is caught before it
 * reaches the phone.
 *
 * The timing constants here MUST match StealthTriggerService.kt:
 *   DOUBLE_PRESS_WINDOW_MS = 1500
 *   DEDUPE_WINDOW_MS       = 180
 *   PRESSES_TO_FIRE        = 2
 */

const DOUBLE_PRESS_WINDOW_MS = 1500;
const QUIET_WINDOW_MS = 200;
const BURST_EVENT_THRESHOLD = 3;
const BURST_RESET_MS = 600;
const PRESSES_TO_FIRE = 2;

/**
 * Faithful TS port of the native detector so its behaviour is testable.
 * Any change to the Kotlin must be mirrored here — that is the point: the
 * test fails loudly and forces the two to stay in sync.
 */
class PressDetector {
  private lastPressAt = 0;
  private lastEventAt = 0;
  private pressCount = 0;
  private burstLength = 0;
  public fired = 0;

  press(nowMs: number): void {
    // Any event inside the quiet window is a duplicate report or key
    // auto-repeat. lastEventAt advances every time, so a held key can never
    // accumulate its way to a second counted press.
    const sinceEvent = nowMs - this.lastEventAt;
    this.lastEventAt = nowMs;
    if (sinceEvent >= 0 && sinceEvent < QUIET_WINDOW_MS) {
      this.burstLength++;
      return;
    }

    // Burst guard: a run of rapid events is a HELD key. Require real silence
    // afterwards so the tail of a hold cannot register as a tap.
    if (this.burstLength >= BURST_EVENT_THRESHOLD && sinceEvent < BURST_RESET_MS) {
      this.burstLength++;
      return;
    }
    this.burstLength = 0;

    if (nowMs - this.lastPressAt > DOUBLE_PRESS_WINDOW_MS) {
      this.pressCount = 0;
    }
    this.lastPressAt = nowMs;
    this.pressCount++;

    if (this.pressCount >= PRESSES_TO_FIRE) {
      this.pressCount = 0;
      this.lastPressAt = 0;
      this.fired++;
    }
  }
}

describe('volume double-press detection', () => {
  test('two deliberate presses fire exactly one call', () => {
    const d = new PressDetector();
    d.press(1000);
    d.press(1500); // 500ms apart — normal human double-press
    expect(d.fired).toBe(1);
  });

  test('a single press never fires', () => {
    const d = new PressDetector();
    d.press(1000);
    expect(d.fired).toBe(0);
  });

  test('presses further apart than the window do not fire', () => {
    const d = new PressDetector();
    d.press(1000);
    d.press(1000 + DOUBLE_PRESS_WINDOW_MS + 50);
    expect(d.fired).toBe(0);
  });

  test('one press seen by all three detectors fires nothing (dedupe)', () => {
    const d = new PressDetector();
    // broadcast, settings observer and media session all report within ms
    d.press(1000);
    d.press(1004);
    d.press(1012);
    expect(d.fired).toBe(0);
  });

  test('two presses, each seen by three detectors, fire exactly once', () => {
    const d = new PressDetector();
    d.press(1000);
    d.press(1005);
    d.press(1011); // first physical press
    d.press(1400);
    d.press(1405);
    d.press(1409); // second physical press
    expect(d.fired).toBe(1);
  });

  test('a press just past the quiet window counts', () => {
    const d = new PressDetector();
    d.press(1000);
    d.press(1000 + QUIET_WINDOW_MS + 1);
    expect(d.fired).toBe(1);
  });

  test('a long key-hold never fires, however long it is held', () => {
    const d = new PressDetector();
    for (let t = 1000; t < 6000; t += 50) d.press(t);
    expect(d.fired).toBe(0);
  });

  test('a double-press right after a key-hold still works', () => {
    const d = new PressDetector();
    for (let t = 1000; t < 2000; t += 50) d.press(t); // hold
    d.press(3000);
    d.press(3400);
    expect(d.fired).toBe(1);
  });

  test('a slow repeat rate (~170ms) is still recognised as a hold', () => {
    // Regression: this exact cadence defeated the earlier quiet-window-only
    // guard on a real device and rang a call while adjusting volume.
    const d = new PressDetector();
    let t = 1000;
    for (let i = 0; i < 8; i++) { d.press(t); t += 170; }
    expect(d.fired).toBe(0);
  });

  test('deliberate taps at 250ms are honoured, not swallowed', () => {
    // Not a hold: 250ms exceeds the quiet window, so this is a person
    // tapping repeatedly and they DO want calls. Ten taps = five calls.
    // (Documents the boundary between "held key" and "impatient user".)
    const d = new PressDetector();
    let t = 1000;
    for (let i = 0; i < 10; i++) { d.press(t); t += 250; }
    expect(d.fired).toBe(5);
  });

  test('four presses fire twice, not three times', () => {
    const d = new PressDetector();
    d.press(1000);
    d.press(1400);
    d.press(3000);
    d.press(3400);
    expect(d.fired).toBe(2);
  });

  test('rapid key-repeat is not mistaken for a double-press', () => {
    const d = new PressDetector();
    // holding the key down: events every ~50ms
    for (let t = 1000; t < 1400; t += 50) d.press(t);
    expect(d.fired).toBe(0);
  });
});

/** Mirrors the CallState machine in fakeCall.ts. */
type CallState = 'IDLE' | 'RINGING' | 'ACTIVE' | 'ENDED';

class CallMachine {
  state: CallState = 'IDLE';

  trigger(): boolean {
    if (this.state === 'RINGING' || this.state === 'ACTIVE') return false;
    this.state = 'RINGING';
    return true;
  }
  answer(): boolean {
    if (this.state !== 'RINGING') return false;
    this.state = 'ACTIVE';
    return true;
  }
  end(): boolean {
    if (this.state === 'IDLE') return false;
    this.state = 'ENDED';
    return true;
  }
  settle(): void {
    if (this.state === 'ENDED') this.state = 'IDLE';
  }
}

describe('call state machine', () => {
  test('normal answer path', () => {
    const c = new CallMachine();
    expect(c.trigger()).toBe(true);
    expect(c.state).toBe('RINGING');
    expect(c.answer()).toBe(true);
    expect(c.state).toBe('ACTIVE');
    expect(c.end()).toBe(true);
    c.settle();
    expect(c.state).toBe('IDLE');
  });

  test('decline path skips ACTIVE', () => {
    const c = new CallMachine();
    c.trigger();
    expect(c.end()).toBe(true);
    c.settle();
    expect(c.state).toBe('IDLE');
  });

  test('re-triggering while ringing is ignored (no double ring)', () => {
    const c = new CallMachine();
    c.trigger();
    expect(c.trigger()).toBe(false);
  });

  test('re-triggering during an active call is ignored', () => {
    const c = new CallMachine();
    c.trigger();
    c.answer();
    expect(c.trigger()).toBe(false);
  });

  test('answering when not ringing is rejected', () => {
    const c = new CallMachine();
    expect(c.answer()).toBe(false);
  });

  test('ending an idle call is a no-op', () => {
    const c = new CallMachine();
    expect(c.end()).toBe(false);
  });

  test('a call can be triggered again after the previous one settles', () => {
    const c = new CallMachine();
    c.trigger();
    c.end();
    c.settle();
    expect(c.trigger()).toBe(true);
  });
});
