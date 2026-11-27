---
id: 313
title: "Nine builders compiling at once on a 15 GB, 4-core container ran it out of memory and restarted it"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: free -g shows 15 GB, nproc 4"
area: "parallel sub-agents"
date: 2026-11-27
session_context: "Nine background builders (some with private target dirs) ran cargo and node suites together; the lead's cargo xtask repo died with 137 and the container restarted, stopping every agent and background task."
parked_until:
resolved:
resolution:
reference: "PR #234"
commands_verified: "free -g; nproc"
---
Proposed: at most four Rust builders at once on this container, every cargo run under one flock with
CARGO_BUILD_JOBS=3, node tests per file with --test-concurrency=2, and commits after each item so a restart loses
nothing.
