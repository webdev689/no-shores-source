---
id: 324
title: "A QA picture's pinned night hour drifts back to real time; the worker sed-patched the built bundle to hold it"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "tools/claude-toolkit/webgpu-perf.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "unchecked: whether __qaSky or another QA hook pins the hour"
area: "browser pictures, world clock"
date: 2026-11-26
session_context: "Worker night-city reported: the offline room's worker nudges the world clock, so a pinned hour drifts to real time; it no-op'd WorldClock.heard and raised keepBuilding's budget by sed in its scratch build. webgpu-perf.cjs has no init option, so the hour was pinned via replace. Picture runs took ~15 min a page load with two workers. Real dusk at Overlook is ~18:48. A QA hook that holds the hour would save the patching."
parked_until:
resolved:
resolution:
reference: "~/wt/reports/night-city.md, branch night-city a7eb0e64"
commands_verified: "none by me; worker's report"
---
