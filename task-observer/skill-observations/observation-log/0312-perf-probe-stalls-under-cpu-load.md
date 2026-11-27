---
id: 312
title: "The performance probe's first wait for the game timed out while two workers built Rust: R2 mesh fetches failed and the page never reached foot"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/webgpu-perf.cjs"]
siblings_checked: "checked: Toolkit's Browser QA row already says run webgpu-shot.cjs on an idle machine; the Performance probe row says nothing of load"
area: "headless profiling"
date: 2026-11-26
session_context: "Held map performance: the same plan on the same old build ran in 90 s on an idle machine and failed its 600 s 'until foot' wait with dozens of 'Failed to fetch' mesh errors while fix-rooms and fix-server workers compiled."
parked_until:
resolved:
resolution:
reference: "scratchpad perf-before.log"
commands_verified: "node tools/claude-toolkit/webgpu-perf.cjs <dist-before> <plan> <out>: run twice, once idle (passed), once beside two cargo builds (until not met)"
---
