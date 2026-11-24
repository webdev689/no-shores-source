---
id: 179
title: "A Blender worker building 38 modules hit the background task's two-hour limit before its whole bake, leaving its work uncommitted and unreported"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the other workers this session (sites, room, page) had no bake step; a module or island worker with a whole bake is the shape at risk"
area: "headless workers: sizing an item to the two-hour limit"
date: 2026-11-23
session_context: "Guild outposts session: the outpost-modules worker wrote seven scripts and rendered every family's contact sheets, then was killed at the background task's 7,200,000 ms limit before running bake.py (the whole bake of 136 modules took some 45 minutes on four shared cores) and before committing or reporting. The controller ran the bake, test_kit.py and the commit itself."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/outpost-modules-bake.log; commit a6a06bff on wt/outpost-modules"
commands_verified: "run: ~/bpy-venv/bin/python -I tools/modules/bake.py /root/wt/bake-out -> exit 0, 136 modules, the 98 before unchanged; test_kit.py -> OK"
---

**Issue:** The background task that runs a worker stops at two hours with no warning to the worker. A Blender item
spends most of that on building and looking (render sheets per family), and the whole bake, the last step before the
commit, takes three quarters of an hour more on shared cores. The worker was killed with every script written and
looked at, but nothing committed, no manifest and no report; its OBSERVATIONS line was lost.

**Suggested improvement:** In the common brief, tell a worker to commit as it goes (a commit per finished family or
part) and to write its report's draft early, so a kill loses only the last step; and in `Toolkit.md`'s worker row,
size a Blender item to at most twenty modules a worker, or have the controller run the whole bake after the worker
commits its scripts. Workers could also be told the wall clock they started at, so they can see the limit coming.
