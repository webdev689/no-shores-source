---
id: 59
title: "Wiring hubs at the 600-line cap, edited by several workers at once, tip over the cap at merge"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is the controller's fan-out practice, not a skill"
area: "fanning out work across parallel workers"
date: 2026-11-20
session_context: "Controller merging five workers' branches; game.ts reached 606 lines after two clean merges."
parked_until:
resolved: 2026-11-20
resolution: "Toolkit.md Workers: split any shared file within 30 lines of the cap on the base before a fan-out; brief template: new wiring goes in a new module (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "run: cargo xtask check after merging two branches failed only on `game.ts [size] 606 lines`; each branch alone passed"
---

**Issue:** `client/src/game/game.ts` (597 lines) and `sea.ts` (599) are the page's wiring hubs. Each worker added a few
lines and passed the size check alone; two merged together went to 606 and the main branch went red. Workers also
spent turns moving blocks out to make room for themselves.

**Suggested improvement:** Before fanning out work that touches a hub, the controller checks the hubs' sizes and splits
any within about 30 lines of the cap first, on the base branch, so every worker starts with room; briefs name the hubs
and say to put new wiring in a new module the hub calls.

**Principle:** Parallel work sums its growth at merge time; give each shared file headroom before the fan-out, not
after the first red merge.
