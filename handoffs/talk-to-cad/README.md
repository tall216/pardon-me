# talk-to-cad handoff (copy this folder to hermes-work\handoffs\talk-to-cad)

From a PowerShell in C:\Users\david\hermes-work with the Hermes venv active:

```powershell
# 1. get the handoff folder in place (adjust the source path to wherever you pulled the branch)
python handoff.py new talk-to-cad            # scaffolds the folder; then overwrite with these files
Copy-Item -Recurse -Force <repo>\handoffs\talk-to-cad\* .\handoffs\talk-to-cad\

# 2. the project folder must exist BEFORE check (J01 fills it)
New-Item -ItemType Directory -Force .\talk-to-cad

# 3. environment for the run
$env:TALK_TO_CAD_BED_MM   = "260"            # 300 for K2 Pro, 350 for K2 Plus
$env:TALK_TO_CAD_LLM_URL  = "http://127.0.0.1:11434/v1/chat/completions"
$env:TALK_TO_CAD_LLM_MODEL = "<ollama tag of the model the finished tool should use>"

# 4. check, then launch (J08 and J09 need big gear: 5090 free)
python handoff.py check talk-to-cad          # must print READY
python handoff.py run talk-to-cad --hours 5

# 5. afterwards
python handoff.py report talk-to-cad         # REPORT.md, one page
python -m talk_to_cad "a 40 by 40 mm plate 3 mm thick with 5 mm rounded corners"   # from the workdir
```

Files: PLAN.md (goal, architecture, conventions, context for workers), jobs.json (10 jobs),
checks/ (verifiers the runner executes), tests/ (pytest contract the minion must satisfy).
The minion must never edit checks/ or tests/; checks/verify_untouched.py enforces that.
