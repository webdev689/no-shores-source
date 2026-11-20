---
id: 44
title: "A wire change ran its own crate's tests and missed a dependent crate's: run every dependent's before the full check"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "crates/naval/src/wire.rs"]
siblings_checked: "family: the room's wire (naval::wire, protocol, room-wasm). Checked which crates call naval::wire::parted: only protocol."
area: "overlook-source, Rust wire formats"
date: "2026-11-20"
session_context: "PR #98 audit: each other captain on the naval wire gained her number in the fight."
commands_verified: "cargo test -q -p protocol -p naval (failed before the fix, passed after); cargo tree -i naval"
---

- Adding a number to each other captain's block in `naval::wire::view_numbers` was tested with `-p naval` and
  `-p room-wasm` only. `naval::wire::parted` still counted the old block size, which only `protocol`'s read-back test
  covers, so the slip showed in the full `cargo xtask check` some twenty minutes later.
- Proposed habit: after changing a crate's wire numbers, run `cargo test -p` on every crate `cargo tree -i <crate>`
  lists before the full check. A test in the crate itself that parts a view with others (`parted`) would catch it at
  the source.
