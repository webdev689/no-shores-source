---
id: 76
title: "Three workers' full checks on one machine each ran past 10 minutes, and groundPaint's timing test failed under the load"
parked_until: "PR #242 merge"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "client/src/terrain/groundPaint.test.ts"]
siblings_checked: "family: timing tests in the client suite (groundPaint's 'took N ms'); other timing tests not checked."
area: "overlook-source, parallel workers (the perk pass)"
date: "2026-11-21"
session_context: "Workers looks, atheric and ships each ran `cargo xtask check` at the same time in their own worktrees."
commands_verified: "worker logs: one check over 20 minutes; groundPaint.test.ts 'took 219 ms' failed, passed alone and on the rerun (atheric and ships both saw it)"
---

- All three workers reported the same: a full check past the 10-minute foreground limit, so each had to background it,
  and a timing test failing only under load.
- Proposed rule: a brief for parallel workers says to run the full check in the background, and the workers' checks
  are staggered (or each runs the suites its item touches, the controller running the full check once on the merge).
  A timing test that fails under three parallel checks is flaky by design: give it a bound measured under load, or
  measure the work, not the wall clock.
- Also from the looks worker: the controller's resume brief wrote the ladder's climb as floor while the design note's
  words ("iron to level 10, steel past it") need round; a brief should point at the note's numbers, not restate them.
