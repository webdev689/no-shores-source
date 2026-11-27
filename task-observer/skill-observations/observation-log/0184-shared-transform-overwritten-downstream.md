---
id: 184
title: "A damage cut put in the shared function every foe shot passes through (by_foe) was silently undone for aimed shots: the room set the aimed shot's damage afresh after it; found only by reading the caller while checking a number for the notes"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.local.md", "bible/04-Procedures/Porting from DFO.md"]
siblings_checked: "checked: CLAUDE.local.md's tuning pattern greps tests that pin a constant, not writers of the field the constant scales. Instance-general: any multiplier applied in a shared transform whose callers may assign the field afterwards."
area: "tuning a number through a shared transform"
date: 2026-11-24
session_context: "PR #178, the owner's yes to foe guns at two thirds: FOE_GUN was applied in combat::shots::by_foe, which both a foe's plain and aimed shots call. The combat, foes and room tests and the event fingerprints all passed. Checking the 1.4 aimed multiplier for the calls note found crates/room/src/foes.rs aimed_shot doing `shot.damage = shot_numbers(ranged).1 * AIMED_DAMAGE * foe.might` after by_foe, discarding the cut. The room's fair_tests pinned the old aimed damage yet passed, since the bypass kept it."
parked_until: "PR #244 merge"
resolved:
resolution:
reference: "crates/room/src/foes.rs aimed_shot; crates/combat/src/shots.rs by_foe; crates/room/src/fair_tests.rs an_aimed_shot_leaves_from_the_foes_own_weapon"
commands_verified: "run: grep -rn \"aimed_shot(\" crates -> the room's caller; cargo test -p room after `shot.damage *= AIMED_DAMAGE * foe.might` -> pass with the test pinning FOE_GUN"
---

**Issue:** A multiplier added inside a shared transform was assumed to reach every path through it. One caller
reassigned the field the transform had scaled, so the change missed that path, and every test stayed green because
the test on that path pinned the old number, which the bypass preserved.

**Suggested improvement:** After scaling a field in a shared function, grep every caller of it and every assignment to
that field afterwards (`<field> =` near the call), and add or update one test per path that pins the new value.

**Principle:** Green tests after a tuning change can mean the change never reached a path; check each path's value
moved, not only that nothing broke.
