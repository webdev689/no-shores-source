---
id: 282
title: "Offered the owner drop-rate options without checking them against the owner's standing rank order; the chosen one put Elite above Miniboss and needed a second question"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: options put to the owner that break an earlier owner rule. The other three options (×2, ×3, commons only) kept Elite under the Miniboss; only ×4 crossed it, and vestige_tests.rs:273 enforces the order."
area: "options put to the owner"
date: "2026-11-26"
session_context: "PR #220. Asked how much to raise kill drops; the options held Miniboss 35% and Boss fixed while scaling Minor/Major/Elite. ×4 gave Elite 40% > Miniboss 35%, against 'every rank more often than the one below'. Caught before coding by reading the test, then asked again (owner: Miniboss 50%, clears kept at 35%)."
commands_verified: "cargo test -p gear (422 passed) after the change; the inversion found by reading worth(...).vestige ordering in crates/gear/src/vestige_tests.rs"
---
Before offering numeric options, check each against the owner's standing rules (here, the rank order) and the tests that hold them.
