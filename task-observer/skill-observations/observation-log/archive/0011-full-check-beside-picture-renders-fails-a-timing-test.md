---
id: 11
title: "A full check run beside headless picture renders failed a wall-clock test on unchanged code"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: [bible/03-Code/Toolkit.md]
siblings_checked: "checked — instance-specific to running the check and the picture driver at once; any wall-clock test under load is the same"
area: "running cargo xtask check while other heavy work runs"
date: 2026-11-20
session_context: "Pushing a hand-off note on overlook-source#63 while webgpu-shot rendered Saltmere's three zones"
parked_until:
resolved: 2026-11-20
resolution: "Applied to bible/03-Code/Testing.md's Measuring section (check on an idle machine) on https://github.com/Lattymoy/overlook-source/pull/100 (weekly review)"
reference:
commands_verified: "run: cargo xtask check failed only on client/src/game/groundPaint.test.ts ('took 269 ms' against its 150 ms bound) with twelve Chromium processes rendering; the same code had passed the full check an hour earlier"
---

**Issue:** To clear a stop hook's push reminder, the full check was started while the headless picture driver was
rendering (twelve Chromium processes on four cores). A wall-clock test in the TypeScript suite (a chalk zone painted
in under 150 ms) took 269 ms and failed the check on a commit that changed only six lines of markdown.

**Suggested improvement:** Run `cargo xtask check` on an idle machine: finish or stop the picture driver (and any
callgrind or bake) first, or run the pictures after the push. A failure in a timing test while other work runs is
rerun idle before it is read as a regression.

**Principle:** A test that measures time measures the machine too; check on a quiet one.
