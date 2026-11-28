---
id: 318
title: "Server tests failed on a stale room WebAssembly after a Rust change"
status: superseded
type: methodology
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "header added by the 2026-11-27 review; written without one"
area: "testing"
date: 2026-11-27
session_context: ""
parked_until:
resolved: 2026-11-27
resolution: "by #13 (the same finding for the server's tests; its body is copied there)"
reference: ""
commands_verified: ""
---


Server tests (roomDoor, island rooms) load client/public/*.wasm. After a merge that changes room/room-wasm, 5 server
tests failed ("entry is not a function") until `npm run -s wasm` rebuilt it; then all 691 passed. Proposal: Toolkit.md
says run `npm run -s wasm` before server tests whenever crates/room* changed.
