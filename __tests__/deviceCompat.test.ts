/**
 * Device-compatibility tests.
 *
 * The app's core capabilities are each gated behind a different Android
 * version, and several OEMs add their own restrictions. These tests pin the
 * behaviour for every OS generation the app can be installed on (minSdk 24 =
 * Android 7 through Android 16), so a change that breaks older phones fails
 * here instead of in the wild.
 */

import { deriveIssues, isReady, DeviceReadiness } from '../src/deviceRules';

/** A phone where everything is permitted; individual tests override fields. */
function device(over: Partial<DeviceReadiness> = {}): DeviceReadiness {
  return {
    sdkInt: 33,
    release: '13',
    manufacturer: 'Google',
    model: 'Pixel 7',
    notifications: true,
    needsNotificationRequest: false,
    fullScreenIntent: true,
    exactAlarms: true,
    batteryOptimised: false,
    aggressiveOem: false,
    stealthArmed: true,
    ...over,
  };
}

describe('a fully-permitted phone', () => {
  test('reports no issues and is ready', () => {
    const issues = deriveIssues(device());
    expect(issues).toHaveLength(0);
    expect(isReady(issues)).toBe(true);
  });
});

describe('notifications (Android 13+ denies these by default)', () => {
  test('missing notifications is BLOCKING — the app would be silent', () => {
    const issues = deriveIssues(device({ sdkInt: 33, notifications: false }));
    const n = issues.find((i) => i.key === 'notifications');
    expect(n).toBeDefined();
    expect(n!.severity).toBe('blocking');
    expect(isReady(issues)).toBe(false);
  });

  test('Android 12 and below grant at install, so no issue is raised', () => {
    const issues = deriveIssues(device({ sdkInt: 31, notifications: true }));
    expect(issues.find((i) => i.key === 'notifications')).toBeUndefined();
  });
});

describe('full-screen intent (Android 14+ per-app gate)', () => {
  test('denied full-screen intent is BLOCKING — no lock-screen call', () => {
    const issues = deriveIssues(device({ sdkInt: 34, fullScreenIntent: false }));
    const f = issues.find((i) => i.key === 'fullScreenIntent');
    expect(f!.severity).toBe('blocking');
    expect(isReady(issues)).toBe(false);
  });

  test('Android 13 and below are ungated', () => {
    const issues = deriveIssues(device({ sdkInt: 33, fullScreenIntent: true }));
    expect(issues.find((i) => i.key === 'fullScreenIntent')).toBeUndefined();
  });
});

describe('exact alarms (Android 12+ gate)', () => {
  test('denied exact alarms is only RECOMMENDED — scheduling is secondary', () => {
    const issues = deriveIssues(device({ sdkInt: 33, exactAlarms: false }));
    const e = issues.find((i) => i.key === 'exactAlarms');
    expect(e!.severity).toBe('recommended');
    // The volume trigger still works, so the app is not blocked.
    expect(isReady(issues)).toBe(true);
  });
});

describe('battery optimisation', () => {
  test('aggressive OEM with optimisation on is flagged', () => {
    const issues = deriveIssues(
      device({ manufacturer: 'Xiaomi', aggressiveOem: true, batteryOptimised: true })
    );
    const b = issues.find((i) => i.key === 'battery');
    expect(b).toBeDefined();
    expect(b!.detail).toContain('Xiaomi');
  });

  test('stock Android is NOT nagged — it handles services correctly', () => {
    const issues = deriveIssues(
      device({ manufacturer: 'Google', aggressiveOem: false, batteryOptimised: true })
    );
    expect(issues.find((i) => i.key === 'battery')).toBeUndefined();
  });

  test('an exempted aggressive OEM is not nagged either', () => {
    const issues = deriveIssues(
      device({ manufacturer: 'OnePlus', aggressiveOem: true, batteryOptimised: false })
    );
    expect(issues.find((i) => i.key === 'battery')).toBeUndefined();
  });
});

describe('real-world device matrix', () => {
  const cases: Array<[string, Partial<DeviceReadiness>, number, boolean]> = [
    // [name, state, expected issue count, expected ready]
    ['Android 7 (minSdk) — nothing gated', { sdkInt: 24 }, 0, true],
    ['Android 10 — nothing gated', { sdkInt: 29 }, 0, true],
    ['Android 12 Pixel — all granted', { sdkInt: 31 }, 0, true],
    [
      'Android 13 fresh install — notifications denied',
      { sdkInt: 33, notifications: false },
      1,
      false,
    ],
    [
      'Android 14 fresh install — notifications + FSI denied',
      { sdkInt: 34, notifications: false, fullScreenIntent: false },
      2,
      false,
    ],
    [
      'Android 15 Xiaomi worst case — every gate closed',
      {
        sdkInt: 35,
        manufacturer: 'Xiaomi',
        notifications: false,
        fullScreenIntent: false,
        exactAlarms: false,
        batteryOptimised: true,
        aggressiveOem: true,
      },
      4,
      false,
    ],
    [
      'Samsung A42 (the tested device) — all granted',
      { sdkInt: 31, manufacturer: 'samsung', model: 'SM-A426U' },
      0,
      true,
    ],
  ];

  test.each(cases)('%s', (_name, state, expectedCount, expectedReady) => {
    const issues = deriveIssues(device(state));
    expect(issues).toHaveLength(expectedCount);
    expect(isReady(issues)).toBe(expectedReady);
  });
});

describe('issue ordering', () => {
  test('blocking issues are listed before recommended ones', () => {
    const issues = deriveIssues(
      device({
        sdkInt: 35,
        notifications: false,
        fullScreenIntent: false,
        exactAlarms: false,
        batteryOptimised: true,
        aggressiveOem: true,
      })
    );
    const firstRecommended = issues.findIndex((i) => i.severity === 'recommended');
    const lastBlocking = issues.map((i) => i.severity).lastIndexOf('blocking');
    expect(lastBlocking).toBeLessThan(firstRecommended);
  });

  test('every issue carries text the user can act on', () => {
    const issues = deriveIssues(
      device({ notifications: false, fullScreenIntent: false, exactAlarms: false })
    );
    for (const i of issues) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.detail.length).toBeGreaterThan(0);
      expect(i.action.length).toBeGreaterThan(0);
    }
  });
});
