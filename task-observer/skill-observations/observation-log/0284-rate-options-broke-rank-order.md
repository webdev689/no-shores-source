---
id: 284
title: "Options put to the owner promised outcomes not checked against standing rules or the code path (drop-rate rank order; islands in a climate no contract dressed)"
parked_until: "PR #244 merge"
status: actioned
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

**Second instance (2026-11-26, Lantern Sea session):** the home-border question told the owner that past the border the Lantern Sea would get "procedural islands rolling there", before checking that the islands' kit contract dressed Overlook's climate. It did not (`temperate-coast` absent from `content/islands/kits.json` climates; `isle` held "the home climate makes no island" in a test), so the accepted option could not happen as worded. Found while writing the rule's tests; filled as a Claude's call (dressed as woodland's) and named in the decision note.

**Widened principle:** before an option's description promises a consequence, trace that consequence through the code path that would deliver it (here: roll → water holder → climate contract), not only through the numbers.
