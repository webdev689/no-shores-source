---
id: 61
title: "Workers whose picture rounds outrun the two-hour background limit are killed mid-edit"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "none: the target is the controller's worker practice and run-worker.sh, not a skill"
area: "fanning out: sizing a worker's round"
date: 2026-11-20
session_context: "The water worker and the held map worker were each stopped at the 2 h Bash background limit during picture rounds."
parked_until:
resolved: 2026-11-20
resolution: "brief template: pictures budgeted (one size a round, staged clock forward), commit every half hour; run-worker.sh logs START/EXIT with minutes and reports a run that ended with no EXIT line (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "run: the mapread task notification read 'stopped after reaching its background time limit'; git status in /root/wt/mapread showed mapKey.ts and mapLayout.ts modified, uncommitted"
---

**Issue:** A worker that takes headless WebGPU pictures spends minutes a picture, and three rounds of before-and-after
pictures at three screen sizes outran the 2 h limit twice (water, mapread). The run was killed mid-edit, so the
controller had to write a resume brief and the worker re-read its context.

**Suggested improvement:** In the Workers section of Toolkit.md: a brief that asks for pictures caps them (one size per
round, the other sizes in the last round only) and asks for a commit every half hour. In run-worker.sh: record the start
time, and when a resumed run starts, say in the log how long the stopped run took, so the controller sizes the next
round.

**Principle:** A worker's round must fit its hard time limit with margin; slow evidence (pictures) is budgeted, not open.

**Recurrence:** the deck worker was stopped the same way, its third picture run (v5) cut off; it had committed. Setting
the staged clock forward (combat feel round three) cut a picture to about 5 minutes: a brief should ask for that.
