---
id: 285
title: "Toolkit says __qaSea() puts the player aboard; on a fresh offline page it left the player on foot for 10 minutes"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: instance-specific to the sea capture hook; the land view hooks (__qaView, __qaEye) were not tried"
area: "Browser QA: picturing the sea headless"
date: 2026-11-26
session_context: "PR #221 (hostile marks on the sea map). Development build, vite preview on 5173, /?at=overlook-social&spawn=, an eval awaiting self.__qaSea() then polling __qaGame.flow.mode: still 'foot' after 600 s; the capture was stopped and the change reported not pictured."
parked_until:
resolved:
resolution:
reference: "plan: the session's scratchpad sea-map.json (not kept); __qaSea is game.ts travel({ kind: 'return-to-ship' }, goSea)"
commands_verified: "node tools/claude-toolkit/webgpu-shot.cjs sea-map.json: run, eval returned \"foot\" after 615.7 s"
---

**Issue:** The Toolkit's Browser QA row says a development page offline with `&spawn=` has `__qaSea()`, "which puts the player aboard as returning to the ship does". On a fresh offline page it did not: the flow stayed on foot for ten minutes, costing that time before the capture was abandoned. Cause unchecked; likely the fresh offline character keeps no ship yet, so the return to the ship is refused (`shutOut`: one who keeps none goes to Overlook).

**Suggested improvement:** Make `__qaSea()` give an offline character the first ship when it has none (as the Harbourmaster does), or make it answer false with the reason; and say in the Toolkit row which character it works for.

**Principle:** A test hook that can silently do nothing should answer whether it did, so a driver fails fast instead of waiting out its timeout.
