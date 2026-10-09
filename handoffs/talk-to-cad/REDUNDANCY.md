# Redundancy so the PC stays controllable from anywhere (hand to the PC Claude session)

Why: 2026-10-09 a 10-minute internet outage killed Remote Control and the Hermes gateway;
AgentLink was down too. For hours there was no way to run even `brain_mode.py small`.
Do these in order; each one works on its own. David decides each step; nothing here is
set up without his OK in the PC session.

## 1. Watchdog (see WATCHDOG.md): restarts gateway, AgentLink, Ollama, Remote Control every 5 min.

## 2. GitHub mailbox: a control channel with no dependency on Hermes, AgentLink or Claude Code
Private repo `tall216/pc-mailbox` (David creates it; never public). Two files:
- `commands.json`  written by David (GitHub app on the phone) or by a cloud Claude session
- `results.json`   written by the PC

`C:\Users\david\hermes-work\tools\mailbox.py`, run by a scheduled task every 2 minutes:
1. `git pull` the repo (clone it to `hermes-work\pc-mailbox` once).
2. For each entry in commands.json with an `id` not yet in results.json, run ONLY if `cmd` is in
   this allowlist (fixed command lines in the script, nothing taken from the file is executed):
   ```
   brain_small        -> python brain_mode.py small
   brain_big          -> python brain_mode.py big   (refused by brain_mode while the counter reads; report that)
   gateway_restart    -> the Hermes gateway restart command (from the Hermes docs / minion_setup.py)
   agentlink_restart  -> AgentLink's restart command
   ollama_restart     -> powershell restart_main_ollama.ps1
   rc_start           -> start a Claude Code Remote Control session in hermes-work
   handoff_status     -> python handoff.py status <project>   (project from "arg", letters/digits/dashes only)
   gpu_status         -> powershell tools\gpu_status.ps1
   ```
   Anything else is logged as "refused" and never run.
3. Append `{id, cmd, started, finished, exit_code, output (last 2000 chars)}` to results.json; commit; push.
4. Log every run to `hermes-work\mailbox.log`. Clear processed entries from commands.json after 24 h.

Verify: push `{"id":"t1","cmd":"gpu_status"}`; within 4 minutes results.json has the output.
Push `{"id":"t2","cmd":"format_c"}`; results.json says refused.

## 3. Boot and power
- Power plan: never sleep, never hibernate; BIOS "power on after power loss".
- Ollama, Desktop app (Remote Control on), Hermes gateway and AgentLink at startup.
- Scheduled tasks 1 and 2 run at startup and on a timer.

## 4. Human fallback
- Tailscale on PC + phone, Windows Remote Desktop enabled. Used only when 1-3 are all wrong.

## Rules
- Nothing in this file touches limotrips / pay data. The mailbox allowlist is the whole surface.
- Every item gets a LESSONS.md row when done, and a line in ORCHESTRATION.md "The machinery".
