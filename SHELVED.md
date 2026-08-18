# PardonMe — SHELVED 2026-08-17

## State at shelving
- Repo: C:\Users\david\PardonMe (the REAL app — App Store history, CallKit native module).
  C:\Users\david\PardonMe-Unified is an older simplified fork: do NOT serve it to the phone.
- SDK 57 upgrade DONE and committed (expo 57.0.14, RN 0.86.2, react 19.2.3).
  37/37 jest tests pass, tsc clean.
- iPhone has dev build 15445232-8014-4cb5-88c4-32d7be18c515 (SDK 57, build number 1) installed
  and WORKING: app loads, Execute button rings with real CallKit ringer.
- Volume trigger: works; auto-rearm fix committed (was one-shot per arm because native
  disarms on backgrounding incl. our own call UI). Re-arm fix hot-reload-verified? NOT
  confirmed on device — user shelved before retest.
- Back Tap: NOT set up. Deep link pardonme://call is implemented; Safari test not yet run.
  iOS 26.3 renamed/removed the old "Open URLs" Shortcuts action — instructions need
  rediscovery on-device when resumed.

## To resume
1. cd C:\Users\david\PardonMe && npx expo start --port 8081
2. Phone: open Pardon Me, connect http://192.168.1.133:8081
3. First tests: (a) arm once -> trigger -> hang up -> double-press again (re-arm fix),
   (b) Safari -> pardonme://call (deep link).

## Costs
- EAS account runnercode is past included credits (pay-as-you-go, ~$6 so far this period).

## Gotchas learned this session
- Dev builds die when their Metro server goes away; only one project can own port 8081.
- EAS upload from this repo needs EAS_NO_VCS=1 (git file:// clone fails on this machine).
- SDK 57 upgrade recipe: pin react 19.2.3, @types/react ~19.2.0, typescript ~6.0.3,
  add babel-preset-expo devDep, drop expo-av (use expo-audio), fix NavigationBar
  setBehaviorAsync/setBackgroundColorAsync (removed), StyleSheet.absoluteFillObject (removed).
