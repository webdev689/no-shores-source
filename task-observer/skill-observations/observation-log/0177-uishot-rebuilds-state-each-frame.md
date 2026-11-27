---
id: 177
title: "uiShot calls a shot's build every frame, so a shot that makes its own display inside build restarts it each frame"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "journalShots.ts keeps its layer per interface in a WeakMap: the pattern to copy"
area: "headless interface pictures"
date: 2026-11-24
session_context: "hudShots.ts first built a new Hud inside each build: the veil's fade restarted every frame and the strip's placement (which reads the frame before) never settled. Kept per shot in a Map, as journalShots keeps its layer."
parked_until: "PR #243 merge"
resolved:
resolution:
reference: "client/src/game/hudShots.ts"
commands_verified: "node tools/uiShot.mjs <shots.json> with frames 60"
---

**Issue:** Anything in a shot that eases, or lays itself from the last frame's boxes, never settles when the build
makes it afresh.

**Proposal:** Toolkit's Browser QA line on uiShot could say: keep a shot's state across its frames, as journalShots'
menuShot does.
