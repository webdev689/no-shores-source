---
id: 0223
title: "Both audio workers ended without naming their inbox headings, and one without its OBSERVATIONS line, though their reports covered them"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: audit.py flags both (INBOX NOT ACKED, MISSING OBSERVATIONS); the template states both lines"
area: "no-shores-source, headless workers"
date: 2026-11-24
session_context: "wk-breach-ambience and wk-breach-music wrote full reports to ~/wt/reports/*.md, including the inbox items done, but their final replies lacked the INBOX line naming each heading; the music worker's lacked OBSERVATIONS. Their resumes were told again."
parked_until:
resolved:
resolution:
reference:
commands_verified: "python3 tools/claude-toolkit/workers/audit.py ~/wt/wk-breach-ambience; ... ~/wt/wk-breach-music"
---
The final-reply lines could be checked by run-worker.sh itself at exit (as audit.py does) and the worker resumed once
with "end with the INBOX and OBSERVATIONS lines".
