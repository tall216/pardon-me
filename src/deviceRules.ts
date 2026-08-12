/**
 * Device-capability rules — pure logic, no React Native imports.
 *
 * Kept free of RN so it can be unit tested against every Android version
 * without a device or a native runtime. The hook in deviceReadiness.ts
 * supplies the live data; everything here is a pure function of it.
 */

/** What the phone will actually let this app do. */
export interface DeviceReadiness {
  sdkInt: number;
  release: string;
  manufacturer: string;
  model: string;
  /** Notifications allowed. Android 13+ denies these by default. */
  notifications: boolean;
  needsNotificationRequest: boolean;
  /** Android 14+ gates the lock-screen call UI per app. */
  fullScreenIntent: boolean;
  /** Android 12+ gates exact alarms (scheduled calls) per app. */
  exactAlarms: boolean;
  /** Doze/app-standby will throttle or kill the background trigger. */
  batteryOptimised: boolean;
  /** Manufacturer known to kill foreground services aggressively. */
  aggressiveOem: boolean;
  stealthArmed: boolean;
}

/** A problem the user can fix, in the order it matters. */
export interface SetupIssue {
  key: 'notifications' | 'fullScreenIntent' | 'exactAlarms' | 'battery';
  /** Blocking issues stop the app working at all. */
  severity: 'blocking' | 'recommended';
  title: string;
  detail: string;
  action: string;
}

/** Optimistic defaults: a failed probe must never make the app look broken. */
export const UNKNOWN_READINESS: DeviceReadiness = {
  sdkInt: 0,
  release: '',
  manufacturer: '',
  model: '',
  notifications: true,
  needsNotificationRequest: false,
  fullScreenIntent: true,
  exactAlarms: true,
  batteryOptimised: false,
  aggressiveOem: false,
  stealthArmed: false,
};

/**
 * Turn a readiness snapshot into the list of things to fix, blocking first.
 */
export function deriveIssues(r: DeviceReadiness): SetupIssue[] {
  const issues: SetupIssue[] = [];

  // Android 13+: without this the app is completely silent.
  if (!r.notifications) {
    issues.push({
      key: 'notifications',
      severity: 'blocking',
      title: 'Allow notifications',
      detail:
        'Android needs this to let Pardon Me ring. Without it no call can appear.',
      action: 'Allow',
    });
  }

  // Android 14+: without this the call cannot cover the lock screen.
  if (!r.fullScreenIntent) {
    issues.push({
      key: 'fullScreenIntent',
      severity: 'blocking',
      title: 'Allow full-screen calls',
      detail:
        'Lets the call appear over your lock screen the way a real call does.',
      action: 'Open settings',
    });
  }

  // Android 12+: only affects the scheduled-call feature, so not blocking —
  // the volume trigger still works without it.
  if (!r.exactAlarms) {
    issues.push({
      key: 'exactAlarms',
      severity: 'recommended',
      title: 'Allow exact alarms',
      detail: 'Needed for scheduled calls to arrive at the exact time you set.',
      action: 'Open settings',
    });
  }

  // Only nag where it genuinely matters: aggressive OEMs kill the service
  // within minutes, while stock Android handles it correctly.
  if (r.batteryOptimised && r.aggressiveOem) {
    issues.push({
      key: 'battery',
      severity: 'recommended',
      title: 'Turn off battery optimisation',
      detail:
        `${r.manufacturer || 'This phone'} may stop Pardon Me listening in the ` +
        'background. Excluding it keeps the volume trigger working.',
      action: 'Open settings',
    });
  }

  return issues;
}

/** True when nothing is blocking the core experience. */
export function isReady(issues: SetupIssue[]): boolean {
  return !issues.some((i) => i.severity === 'blocking');
}
