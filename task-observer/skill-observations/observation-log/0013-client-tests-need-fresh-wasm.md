---
id: 13
title: "Client tests read the room's wasm from client/public, so a Rust rules change fails unrelated client tests until npm run wasm"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "none: the target is a project note, not a skill"
area: "testing order after a change to the shared Rust rules"
date: 2026-11-20
session_context: "Overlook factions round: after changing crates/gear and crates/room, npm test failed 15 files (castRoom, duel, wreckRoom...) until npm run wasm rebuilt client/public/*.wasm; 2026-11-26: the server tests too (#318, folded in)"
parked_until: "PR #240 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #240, merged 2026-11-27"
reference:
commands_verified: "npm test (15 failures) then npm run -s wasm and npm test (1751 pass, 1 real failure): run"
---

**Issue:** After a change to the Rust rules (gear, room), `npm test` failed fifteen client test files that had
nothing to do with the change. They load `client/public/room.wasm`, a build output that is only refreshed by
`npm run wasm` (or `npm run dev`/`build`'s pre-step). The failures looked like real regressions until the wasm was
rebuilt; the one real failure was hidden among them.

**Suggested improvement:** `bible/03-Code/Testing.md` (or the worker brief template's "before committing" list) says:
after any change under `crates/`, run `npm run -s wasm` before `npm test`. Better still, a `pretest` script that
rebuilds the wasm when a crate is newer than `client/public/room.wasm`.

**Principle:** A test suite that reads a build output must either rebuild it itself or say so where the test command
is documented; otherwise stale artefacts masquerade as regressions and bury the real one.

**Another instance (#318, folded in at the 2026-11-27 review):** Server tests (roomDoor, island rooms) load client/public/*.wasm. After a merge that changes room/room-wasm, 5 server
tests failed ("entry is not a function") until `npm run -s wasm` rebuilt it; then all 691 passed. Proposal: Toolkit.md
says run `npm run -s wasm` before server tests whenever crates/room* changed.
