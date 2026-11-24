---
id: 223
title: "Tests that restated the stats' own formulas let a one-tick fire-rate error through; stepping a real fighter caught it at once"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/00-Rules/Tests Check Behaviour.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: 0219 is a different failure (an index over JSON); no open entry covers tests that restate the code they test. Instance-general."
area: "testing derived numbers that a simulation also computes"
date: 2026-11-24
session_context: "Inspect panel PR #202: room::stats derived a ranged weapon's shots a second from reload ticks; its tests asserted rate == 1/(reload*TICK), the same formula. A read-only audit traced combat's step and found the tick a reload ends begins nothing, so every shot comes a tick later (combat's own loadouts.rs already pinned it). A new test steps a fighter holding the trigger and compares the gap: it failed on the old code (bow 1.58/s stepped, 1.62/s shown) and passes on the fix."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: cargo test -p room --lib stats -> 'Bow []: combat steps 1.5789/s, the page shows 1.6216/s' before the fix; ok after"
---

**Issue:** Numbers derived to describe a simulation (a weapon's rate, a reload's length) were tested by restating the
derivation, so the test and the code shared the same mistake and passed together.

**Suggested improvement:** For any number that summarises what a simulation does, the test runs the simulation (step
the real fighter, room or rules) and compares; a restated formula is at most a second, weaker check.

**Principle:** Test a summary against the thing it summarises, not against its own arithmetic.
