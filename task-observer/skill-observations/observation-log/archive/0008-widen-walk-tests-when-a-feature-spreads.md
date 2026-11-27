---
id: 8
title: "A walk test kept to the first zone missed a fault the feature carried into the others"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: [bible/04-Procedures]
siblings_checked: "modules_walked.rs's module, ledge and bridge walks"
area: "testing a feature carried from one zone to more"
date: 2026-11-20
session_context: "Heights carried from the Gullwing Vale to the Saltgrass Downs and the Driftwood Moors on overlook-source#63"
parked_until:
resolved: 2026-11-20
resolution: "Applied to bible/03-Code/Testing.md (a test covers every place the behaviour runs) on https://github.com/Lattymoy/overlook-source/pull/100 (weekly review)"
reference:
commands_verified: "run: cargo test --release -p room --test modules_walked (the ledge walk over all three zones failed on a Downs stair the Vale-only walk had passed)"
---

**Issue:** When heights spread from the Vale to the Downs and the Moors, the walk tests stayed on the Vale. Widening
the ledge walk to all three zones found a Downs stair a body could not climb (a stretched riser), then a Moors stair
whose landing sat under rising land. Neither showed on the Vale.

**Suggested improvement:** When a feature is switched on for more places, widen its walk and placement tests to every
place it now runs in, in the same change, before the full check.

**Principle:** A test covers what a feature does, not where it was first built.
