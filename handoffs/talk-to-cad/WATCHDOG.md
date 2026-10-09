# Keep the PC reachable from the phone (hand this to the PC Claude session)

What happened 2026-10-09: a ~10 min internet outage at 09:03-09:13 UTC made both Remote
Control sessions exit (server mode quits after ~10 min offline, per the Remote Control docs)
and the Hermes Telegram gateway did not reconnect. The minion kept working (local only).
Result: nothing on the PC could be reached until someone touched it.

## Goal
Within 5 minutes of any outage ending, these are running again without anyone touching the PC:
1. the Hermes gateway (Amelia on Telegram / AgentLink)
2. a Claude Code Remote Control session in C:\Users\david\hermes-work

## Do (on the PC, as David's user, with the Hermes venv)
1. Install the standalone Claude Code CLI if `claude --version` fails:
   `irm https://claude.ai/install.ps1 | iex`, then log in once (`claude` in a terminal).
2. Write `C:\Users\david\hermes-work\tools\watchdog.ps1`:
   - if no process whose command line contains `remote-control` exists ->
     `Start-Process claude -ArgumentList "remote-control" -WorkingDirectory C:\Users\david\hermes-work -WindowStyle Hidden`
     and append a line to `hermes-work\watchdog.log`
   - if the Hermes gateway process is not running (use `tools\proc_find.ps1 hermes` to learn its name) ->
     start it the way `minion_setup.py` / the Hermes docs say, and log it
   - never start a second copy of either; never touch the trip counter
3. Register it with `tools\task_set_time.ps1` conventions: a scheduled task every 5 minutes,
   run whether the user is logged on or not, start also at logon. Name: `hermes-watchdog`.
4. Power settings: PC never sleeps; Desktop app and Ollama start with Windows.
5. Prefer an interactive Remote Control session (Desktop app with "Connect new sessions to
   Remote Control" on) over the terminal server: the docs say interactive keeps retrying
   through an outage, server mode exits.

## Verify
- `powershell tools\proc_find.ps1 claude` shows a remote-control process.
- Kill it; within 5 minutes `watchdog.log` shows a restart and the phone shows a green dot.
- Stop the Hermes gateway; within 5 minutes Amelia answers `ping` on Telegram.
- Add a LESSONS.md row: "Internet outage took down RC + gateway; watchdog restarts both".

## Also pending from the talk-to-cad review (PC session, 05:03 local)
- `python brain_mode.py small` before the trip counter runs.
- 3MF writer centres parts on a 300 mm bed; David's K2 is 260 mm.
- Freeform cube-with-hole: hole stops 5 mm short; vision check was advisory. Tighten tolerance.
