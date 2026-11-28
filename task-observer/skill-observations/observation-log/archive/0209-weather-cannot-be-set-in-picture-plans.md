---
id: 209
title: "A picture plan cannot set the weather: a shifted Date.now never reaches the sky, and the QA hooks lend no scene"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["client/src/game/qaViews.ts", "bible/03-Code/Toolkit.md"]
siblings_checked: "qaViews.ts (__qaGame is the game's Playing, no scene); skyDriver.ts (told sky is the only override); webgpu-shot.cjs (init reaches the game worker only)"
area: "picturing the weather"
date: 2026-11-24
session_context: "Picturing the island view in heavy rain for the owner's shrouded-overworld report. A plan's init shifting Date.now to a rainy world time (found with the sky crate) left the sky clear: two runs, before and after, came out identical. The offline room, in a worker the driver does not patch, keeps telling the page the real world time. A scratch build adding Object.assign(self, { __qaScene: scene }) and an eval setting scene.sky.told to a heavy rain pictured it (the old law solid grey, the new the island through rain). Also: a stop hook asks for a push on every turn while CLAUDE.md wants cargo xtask check first, and the check cannot run beside a picture run."
parked_until: "PR #243 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #243, merged 2026-11-27"
reference:
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs (four runs); NODE_ENV=development npx vite build"
---

**Issue:** No plan can picture a given weather: the shifted clock is overridden by the offline room's time, and no
dev hook reaches the sky's told sky.

**Suggested improvement:** Lend the scene's sky on a development page as `__qaGame` is lent (e.g. `__qaSky(weather)`
setting a told sky), and say in Toolkit.md's Browser QA that the clock cannot be shifted for the weather.

**Principle:** A picture of a state needs a hook that sets that state; checking the state took a run each time it
was missing.
