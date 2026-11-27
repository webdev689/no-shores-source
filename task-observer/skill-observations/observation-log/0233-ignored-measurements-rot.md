---
id: 233
title: "Ignored measurement tests rot unseen: the rooms' load measurements had stopped running since ports and the prologue gate, and the helper meant for them lives in another crate's cfg(test)"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["crates/room-wasm/src/load_tests.rs", "bible/03-Code/Testing.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "keeping by-hand measurements runnable"
date: 2026-11-24
session_context: "The owner's extreme performance pass. `cargo test -p room-wasm --release load -- --ignored --nocapture` failed in all five cases: new ships put in at a port's roadstead (so the courses set far at sea were refused), Overlook's home waters meet no hostile (so no fight began), the roads' character had not played the prologue a patrol's gate asks for, and the roads' cases need `npm run bake`'s node files. `Sea::course_anywhere`, documented as for 'the tests' and the measurements' ships', is pub(crate) in room's cfg(test) module, unreachable from room-wasm. Repaired by putting players to sea as players do and waiting until every fight is met (commit 2ea933a5)."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "cargo test -p room-wasm --release load -- --ignored --nocapture (5 failed before; 5 passed after the repair and npm run bake)"
---

**Issue:** Measurements kept as `#[ignore]` tests are never run by CI, so a rule change elsewhere (ports, home waters, a gate) breaks them silently; the next person to need the numbers finds every case failing and must repair the harness before measuring anything. A measurement that never asserts its scenario happened (a fight met) can also print numbers for the wrong thing.

**Suggested improvement:** Have `cargo xtask check` compile and run each ignored measurement once in a tiny form (one player, a few ticks), or keep one cheap non-ignored test per measurement that builds its scenario and asserts it (every player met, the group stood), so the harness breaks loudly in CI when the rules move. Testing.md names the measurements and what each needs (`npm run bake` for the roads' cases).

**Principle:** A measurement harness must assert the situation it measures exists, and something routinely exercised must build that situation, or it rots unnoticed between the rare runs that need it.
