---
id: 309
title: "A worker changed the passages' rules (lamp facing, ring placement) and never ran room-wasm's fingerprint test, so PASSAGE_HASH went stale"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: CLAUDE.local.md (headroom) names PASSAGE_HASH; the worker brief template asks only for the changed crate's own tests"
area: "worker briefs, Rust tests"
date: 2026-11-26
session_context: "Worker polish changed crates/passage (lamp turned pi/5, the ring kept off doors); it ran cargo test -p passage but not room-wasm, so passage_room_door_tests' PASSAGE_HASH/PASSAGE_DONE failed (d188558f/6578 -> f711b19e/6183). The lead found it two merges later and bisected it to the polish merge with two runs."
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo test -p room-wasm passage_zones_room_fights at 5028c7e9a^1 (ok) and 5028c7e9a (fails): run by the lead"
---

**Issue:** "run the tests of what you changed" reads as the changed crate's own tests; the passages' fingerprint lives in another crate (room-wasm) and a server test, so a rules change ships it stale and the failure surfaces only later, far from its cause.

**Suggested improvement:** in the worker brief's hard rules (gen.py / brief template), name the cross-crate pins: a change under crates/passage, crates/room or crates/gear runs cargo test -p room-wasm passage and node --test server/passageAgreement.test.ts.

**Principle:** a pin that lives away from the code it pins must be named wherever that code is changed.
