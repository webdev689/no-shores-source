---
id: 326
title: "With three workers at once, graphify update took ~8 min, wait tasks hit their 2 h cap, and a 0.12 s flash light cannot be pictured"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/wait-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "unchecked: whether Toolkit.md says how many workers the 4-core machine takes"
area: "workers, machine load"
date: 2026-11-27
session_context: "Three workers (night-sight-all, stern-windows, fight-effects) ran at once on 4 cores: load ~20. fight-effects reported graphify update ~8 min, headless sea-fight pictures ~10 min a run, dt clamped to 0.1 s so a 0.12 s flash light lives one frame, and it used pkill -f once on vite preview against the rule. wait-worker.sh waits hit the background task's 2 h maximum; a Monitor loop on the log's last line replaced them. cargo test -p room passed only with a 1 h limit; two timing tests (ruinBudget, groundPaint) failed under the load and passed alone."
parked_until:
resolved:
resolution:
reference: "~/wt/reports/fight-effects.md, branch fight-effects 8c39cb11"
commands_verified: "uptime load 21; node --test ruinBudget/groundPaint pass on re-run"
---
