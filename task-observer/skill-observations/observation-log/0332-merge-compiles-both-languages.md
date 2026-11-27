---
id: 332
title: "A clean auto-merge broke Rust the controller never compiled before pushing"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "0224 (types checked on one tsconfig only): same family, checks chosen by what the conflicts touched rather than by the merge"
area: "merging main into a long branch"
date: 2026-11-25
session_context: "#200: main's #202 split room/src/perks.rs trim_of into trim_by; git auto-merged the branch's Forged lines into the new function, where they named variables no longer in scope. The controller resolved the three page conflicts, ran the page's types and tests, and pushed; the full check found the Rust failing at 'lints (Rust)'."
parked_until: "PR #239 merge"
resolved:
resolution:
reference:
commands_verified: "cargo xtask check on b1d8a51f failed at lints (Rust): E0425 character/drawn not found in perks.rs:228-229"
---

**Issue:** After merging main, the controller checked only the files the conflicts named. A file git merged cleanly can
still break: one side moved a function's code, the other edited its old body.

**Suggested improvement:** After any merge of main, before the push: `cargo check --workspace --all-targets` and
`npm run -s types`, whatever the conflicts touched.

**Principle:** A merge is checked as a whole change, not as its conflicts.

(Renumbered from #323 at the 2026-11-27 review: two observations held that id.)
