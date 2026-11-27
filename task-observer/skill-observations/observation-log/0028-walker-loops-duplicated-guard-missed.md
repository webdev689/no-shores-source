---
id: 28
title: "A guard added to one test walker never reached a second, inline walker loop; its test passed for a round by climbing"
status: open
type: internal
skill: []
proposes_skill: []
target_file: [bible/03-Code/Testing.md]
siblings_checked: "checked — applies to any test helper duplicated inline across test files, not to walkers alone"
area: "test helpers duplicated across files"
date: 2026-11-20
session_context: "Merging main into overlook-source#63: crates/room/tests/layouts_laid.rs's Saltgrass Downs gate walk against runs_walked.rs's walked()"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: with a mode trace in the gate walk, the body went Ground -> Climb -> Mantle onto a palisade stake (top 6.71 m) on the pre-fix route; after the fix the walk asserts no Hang, Climb or Mantle at any tick and passes"
---

**Issue:** The fifth round's audit taught `runs_walked.rs`'s `walked()` to stop at any climb, hang or mantle. The
Downs gate walk in `layouts_laid.rs` has its own copy of the walker loop, and it never got that guard. Since the
gate was set in its cleft, its palisade has run on to the rock, so the walk's "round the palisade's end" route did
not exist. The test passed for a whole round because the body climbed the stakes between two waypoints. It checked
height only on reaching a waypoint. The merge's new climb timing exposed it.

**Suggested improvement:** When a check is added to a test helper, grep the tests for other loops doing the same
job (here, `step_body` inside a waypoint loop) and give each the same check, or fold them into the one helper.
Check a walk's claim at every tick, not only at its waypoints.

**Principle:** A fix reaches only the copy it was made in; find the copies before calling it fixed.

**Related:** #0008 widened a walk to every zone a feature reached; this is the same gap across copies of the walker.
