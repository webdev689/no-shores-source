---
id: 77
title: "Serena replace_symbol_body dropped a Rust test's #[test] attribute"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: Serena whole-symbol edits on attributed Rust items (#[test], #[must_use], doc comments); only #[test] seen."
area: "overlook-source, worker ships (the perk pass)"
date: "2026-11-21"
session_context: "The ships worker rewrote a test in crates/gear with replace_symbol_body; the test silently stopped running until its review."
commands_verified: "reported in the worker's OBSERVATIONS line; the merged branch's tests run (cargo test -p gear: 151 passed)"
---

- A test whose attribute is lost still compiles and simply never runs, so the suite stays green.
- Proposed rule (Toolkit.md, Serena row): after replace_symbol_body on a Rust item with attributes, read the lines above
  the symbol, or count the crate's tests before and after.
