---
id: 44
title: "A change ran its own crates' tests and missed a dependent crate's (a wire change; a passage change whose fingerprint lives in room-wasm): run every dependent's before the full check"
parked_until: "PR #244 merge"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "crates/naval/src/wire.rs"]
siblings_checked: "family: the room's wire (naval::wire, protocol, room-wasm). Checked which crates call naval::wire::parted: only protocol."
area: "overlook-source, Rust wire formats"
date: "2026-11-20"
session_context: "2026-11-27, session 01AQ3N4rcsyHKfuU32sdJH24: the arrival worker changed crates/passage and crates/room and ran their tests; room-wasm's pinned passage fingerprint (a dependent) broke, found only by the controller's npm test after merge. Earlier: PR #98 audit: each other captain on the naval wire gained her number in the fight."
commands_verified: "cargo test -q -p protocol -p naval (failed before the fix, passed after); cargo tree -i naval"
---

- Adding a number to each other captain's block in `naval::wire::view_numbers` was tested with `-p naval` and
  `-p room-wasm` only. `naval::wire::parted` still counted the old block size, which only `protocol`'s read-back test
  covers, so the slip showed in the full `cargo xtask check` some twenty minutes later.
- Proposed habit: after changing a crate's wire numbers, run `cargo test -p` on every crate `cargo tree -i <crate>`
  lists before the full check. A test in the crate itself that parts a view with others (`parted`) would catch it at
  the source.

Instance 2026-11-27: a brief saying "run the tests of every crate you change" let a worker skip crates/room-wasm, which depends on both crates it changed and pins a passage fight's fingerprint. The barrier stands: name the dependents (`cargo tree -i <crate>`) in the brief, or have the worker's finish steps run them.
