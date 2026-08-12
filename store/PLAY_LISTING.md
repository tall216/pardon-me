# Play Store listing — Pardon Me

Copy-paste source for the Play Console. Character limits noted; all text below
is within them.

---

## App name (30 max)

```
Pardon Me — Fake Call Escape
```
(28 characters)

## Short description (80 max)

```
Double-press volume for a realistic fake call. Your polite exit, any time.
```
(73 characters)

## Full description (4000 max)

```
Some conversations don't have an exit. Pardon Me gives you one.

Double-press either volume button and your phone rings — a real-looking
incoming call, on the lock screen, with a proper ringtone. Answer it, say
"sorry, I have to take this," and walk away.

WORKS WHEN YOU NEED IT
• Double-press either volume key — up or down
• Works with the app closed, the screen off, or the phone locked
• Works while you're using another app
• Nothing on screen gives you away

LOOKS REAL
• Full-screen incoming call, exactly like the real thing
• Classic telephone ringtone, loud enough to be heard
• Rings and vibrates over the lock screen
• Answer to see a live call timer
• When you hang up, the app disappears — no interface pops up afterwards

CHOOSE WHO'S CALLING
• Quick presets: Boss, Wife, Emergency
• Or type any name you like
• The name shows on the call screen

SCHEDULE AHEAD
Know a meeting will run long? Schedule a call before you go in. It arrives on
time even if the app is closed and the phone is locked.

ALWAYS READY
Pardon Me arms itself automatically and stays armed after a restart. One tap
turns it off when you don't want it.

PRIVATE BY DESIGN
• No account, no sign-up
• No internet connection used
• No ads, no analytics, no tracking
• Nothing leaves your phone
• Does not read contacts, messages, or your call history
• Does not touch your real calls

WHY THE NOTIFICATION?
Android requires a visible notification while an app listens for volume
buttons in the background. That's the quiet "Ready" notice — it's how the
trigger keeps working when the app is closed. Disarm any time to remove it.

Pardon Me is an escape hatch, not a lie detector. Use it kindly.
```

## Category

Tools _(alternative: Lifestyle)_

## Tags

fake call, escape, safety, prank call, excuse

## Content rating questionnaire — answers

- Violence: **No**
- Sexual content: **No**
- Profanity: **No**
- Controlled substances: **No**
- Gambling / simulated gambling: **No**
- User-generated content or sharing: **No**
- Location sharing: **No**
- Personal information collected: **No**
- Expected rating: **Everyone**

## Data safety form — answers

- Does your app collect or share user data? **No**
- Is all user data encrypted in transit? **N/A — no data is transmitted**
- Do you provide a way to request deletion? **N/A — uninstalling removes all local data**

## Sensitive permission declarations

Play will ask you to justify these in the Console. Suggested wording:

**Full-screen intent (USE_FULL_SCREEN_INTENT)**
> The app's core function is displaying a simulated incoming phone call. Like a
> real call, the screen must appear over the lock screen so the user can answer
> or decline immediately.

**Exact alarm (SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM)**
> Users schedule a simulated call for a specific time (for example, ten minutes
> into a meeting). The alarm must fire at that time to be useful; an inexact
> alarm may be deferred well past the moment the user planned for.

**Foreground service (mediaPlayback)**
> The service registers a media session so hardware volume keys can reach the
> app while it is in the background. This is the mechanism Android provides for
> receiving volume-key input outside the foreground, and it is what allows the
> app's primary trigger to work with the screen off. No media is recorded or
> audibly played.

**Display over other apps (SYSTEM_ALERT_WINDOW)**
> Ensures the simulated call screen appears reliably over the current app,
> matching the behaviour of a genuine incoming call.

## Required assets checklist

- [x] App icon 512×512 PNG — `assets/play-icon-512.png`
- [ ] Feature graphic 1024×500 PNG — **still to create**
- [ ] Phone screenshots, 2–8, min 320px, 16:9 or 9:16 — **still to capture**
- [ ] Privacy policy URL — publish `store/PRIVACY_POLICY.md` and paste the link
- [ ] Support email address

## Suggested screenshots

1. The incoming-call screen (the hero shot)
2. In-call screen with the running timer
3. Home screen showing the identity presets
4. Home screen with the trigger armed
