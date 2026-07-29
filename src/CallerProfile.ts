// Minimal CallerProfile module.
//
// Per David's "no extra settings screen" rule this is intentionally tiny:
// a single holder for the caller name (defaults to "Michael") plus an optional
// photo URI, with a programmatic setter. There is no full settings UI.

export interface CallerProfile {
  name: string;
  /** Optional photo URI shown as the avatar. Falls back to initials. */
  photoUri?: string;
}

let current: CallerProfile = {
  name: 'Michael',
};

export function getCaller(): CallerProfile {
  return current;
}

export function setCaller(profile: Partial<CallerProfile>): CallerProfile {
  current = { ...current, ...profile };
  return current;
}

/** Convenience: just set the displayed name. */
export function setCallerName(name: string): void {
  current = { ...current, name };
}

/** Reset to the built-in default caller. */
export function resetCaller(): void {
  current = { name: 'Michael' };
}
