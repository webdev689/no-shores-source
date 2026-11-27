---
id: 327
title: "QA scripts keyed to internals go stale on a merge; the hub's city no longer draws in the QA page; weather cannot be pinned; npx vite preview leaves its child"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "unchecked: observation 201 (weather in plans) and 0312 (hour pin) overlap"
area: "browser pictures, parallel sessions"
date: 2026-11-27
session_context: "Worker fold-233 (folding #228 onto #233's lights) reported: fight-effects' QA hack wrote the old 3-number burning entry, NaN lamps after the merge; the hub's city did not draw in the QA page on origin/main either, so night-city's parapet plan no longer pictures the city; world weather (rain) at the run's date darkens every night picture; kill $! on npx vite preview leaves the vite child. Also: two sessions (#228 and #233) built the same ship-lantern and fight-light systems in parallel; the overlap was found only from a ships workflow run listing #233. The owner chose #233 first and a fold."
parked_until:
resolved:
resolution:
reference: "~/wt/reports/fold-233.md, branch fold-233 b690f557"
commands_verified: "none by me; worker's report"
---
