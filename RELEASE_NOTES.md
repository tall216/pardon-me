# Pardon Me v1.0.0

Initial release.

**What it does:**
- Triggers a realistic incoming call screen to help you exit awkward situations
- Works from lock screen via full-screen intent notification
- Bypasses Do Not Disturb — rings even when silenced
- Volume button double-press trigger (armed mode)
- Schedule a call for later (e.g., "in 2 minutes")
- Identity presets: Boss, Spouse, Emergency, or custom name
- Industrial dark theme UI

**Requirements:**
- Android 12+ (API 31+)
- Grant "Display over other apps" and "Full-screen notifications" permissions
- Disable battery optimization for reliable background triggering

**Known limitations:**
- Volume trigger requires the app to remain armed (foreground service with silent notification)
- Some OEMs (Xiaomi, Oppo, OnePlus) aggressively kill background services — add to auto-start whitelist
- expo-av dependency flagged as unmaintained; audio handled natively, not affected
