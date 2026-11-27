---
id: 91
title: "A commit swept in files staged for another commit, and new-observation.sh misfired on an id"
status: declined
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "/root/.claude/skills/task-observer/scripts/new-observation.sh"]
siblings_checked: "none"
area: "committing; the observation script"
date: 2026-11-21
session_context: "The on-screen keys commit took decision notes staged earlier. Separately, new-observation.sh printed 'line 160: 10#0085-: syntax error' and skipped id 85."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: the id misparse's cause is fixed (toolkit-data.sh:26-27); \"check what is staged before commit\" is a one-off git habit"
reference:
commands_verified: "git reset --soft then regrouped into four commits; new-observation.sh created 0084 and 0086 with that error between them"
---

**Issue:** `git add <paths> && git commit` also commits anything staged before. A restored file that never existed at
the base came back empty. Separately, the observation script's id parse fails when a file name lacks its slug
after the dash.

**Suggested improvement:**
- Run `git diff --cached --stat` before each commit when other work may be staged.
- Fix new-observation.sh line 160: strip the trailing `-` before the `10#` arithmetic.

**Principle:** Check what is staged before you commit, not only what you added.
