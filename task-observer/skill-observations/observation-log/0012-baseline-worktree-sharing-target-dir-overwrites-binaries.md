---
id: 0012
title: "A baseline worktree sharing the cargo target dir overwrote the current tree's test binary"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: [bible/03-Code/Toolkit.md]
siblings_checked: "checked — instance-specific to timing or profiling an older commit beside the current one"
area: "measuring a baseline commit against the current one"
date: 2026-11-20
session_context: "Timing continent 1's settle at 985005d against the current head on overlook-source#63"
parked_until:
resolved: 2026-11-20
resolution: "Applied to bible/03-Code/Testing.md's Measuring section (each binary named on its own) on https://github.com/Lattymoy/overlook-source/pull/100 (weekly review)"
reference:
commands_verified: "run: both builds printed target/release/deps/zz_time-c54a255de2f913d3; the second overwrote the first, and copying each binary out (cp to scratchpad) after its own build gave two that differ (cmp)"
---

**Issue:** To time the pre-round commit, a git worktree of it was built with `CARGO_TARGET_DIR` set to the main tree's
target, so dependencies were reused. Both trees' test binaries landed at the same path with the same hash, so the
second build silently replaced the first; the first comparison would have profiled one binary twice.

**Suggested improvement:** When building a baseline beside the current tree, copy each binary out under its own name
right after its build (or give the baseline its own target dir and accept the dependency rebuild), and check with
`cmp` that the two differ before measuring.

**Principle:** Two builds that share an output path share one output; name each before you compare them.

**Related:** #0004 links `target/` into a worker's worktree so its tests run; that holds for running tests, and is exactly what makes two trees' builds share one output when their speeds are compared.
