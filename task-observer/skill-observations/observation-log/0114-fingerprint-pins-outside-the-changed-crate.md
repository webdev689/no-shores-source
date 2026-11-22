---
id: 114
title: "A change to the naval rules moved a fingerprint pinned in room-wasm and server/roomDoor.test.ts, which the crate's own tests never ran"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: Toolkit's testing rows; land-wasm and fightRules.test.ts pins were updated with the change, the room's were not"
area: "pinned determinism fingerprints"
date: 2026-11-22
session_context: "Overlook bugs and polish: captains' gunnery misjudgement in crates/naval changed fight outcomes."
parked_until:
resolved:
resolution:
reference:
commands_verified: "grep -rn <old hash> crates server client; cargo test -q -p room-wasm; node --import ./tools/testStyles.mjs --test server/roomDoor.test.ts"
---

**Issue:** The gunnery change repinned the land-wasm and client fingerprints, but the sea clash fingerprint
(`SEA_CLASH_HASH` in crates/room-wasm/src/door_tests.rs and server/roomDoor.test.ts) only failed in the full npm test,
late in the session.

**Suggested improvement:** A line in the Toolkit: after any change to a rules crate's outcomes, run `cargo test` for
every crate that depends on it (`cargo test --workspace`) and `npm test`, and grep the old hash across crates, client and
server before repinning one side.

**Principle:** A pinned hash lives wherever its consumers are; search for every copy before calling a repin done.
