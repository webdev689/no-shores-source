---
id: 190
title: "A failing-first test passed without its fix because the fixture's value equalled the bug's output; only reverting the fix alone showed it"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — no skill owns test-first practice here; the principle holds for any test of a fallback value"
area: "failing-first tests of a fallback or default value"
date: 2026-11-24
session_context: "Revives, respawns and relogs branch (ccr-f5e78349-6zl21z), the audit fix for a mission's last-stand checkpoint facing: crates/room/src/checkpoints_tests.rs, the mission checkpoint test."
parked_until: "PR #244 merge"
resolved:
resolution:
reference: "crates/room/src/checkpoints_tests.rs (a_mission_lays_a_checkpoint_at_each_post...), crates/room/src/checkpoints.rs (lay_post_checkpoints)"
commands_verified: "cargo test -q -p room --lib a_mission_lays"
---

**Issue:** The fix makes a post at the last stand face the room's way instead of `bearing(at, at)`. The new assertion passed with the fix reverted: the fixture's room faced π, and `atan2(0, -0)` is also π, so the bug's output equalled the expected value. A first attempt reverted the whole file with `git stash`, and a different test failed. That looked like a failing-first pass, but the failure came from unrelated uncommitted work in the same file. Only reverting just the fix's lines showed that the new assertion did not fail.

**Suggested improvement:** In the Toolkit's test-first guidance, say that the revert must cover only the fix's lines, not the whole file, and that the failure checked must be the new assertion's own message. For a fallback value, set the fixture so the fallback differs from every value the bug could produce (here `room.facing = 1.0`).

**Principle:** A failing-first check proves something only if the failure you see is the new assertion's own, against a fixture where the buggy value and the expected value differ.
