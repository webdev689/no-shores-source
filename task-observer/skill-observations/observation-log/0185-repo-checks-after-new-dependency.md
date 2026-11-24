---
id: 185
title: "Crate dependencies and zone briefs were changed without the fast checks that guard them, so the faults surfaced sessions of work later"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.local.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked 0170 (fast steps before the full check): same principle, a new instance in Rust and content; extended here rather than restated because the trigger differs (a Cargo.toml or a brief edit, not a .ts edit)"
area: "running the repo's own fast guards right after the edit they guard"
date: 2026-11-24
session_context: "Revive, respawn and relog session too (clippy on new tests); First Breach session (branch claude/first-breach-design-959rog). The room crate gained city, serde and serde_json as dependencies early on; `cargo xtask repo` (crates rule: room may not depend on them) was first run many commits later and forced the plan reading into a build script. Separately, adding the Breach area to Gullwing Vale's brief (content/world/briefs.json) removed the vale's ledge; only the one new walk test was run, and crates/room/tests/modules_walked.rs's ledge test failed unnoticed until the art pass ran the whole file."
parked_until:
resolved:
resolution:
reference: "commits b2654ad5 (build.rs tables) and 11a37e64 (brief reorder)"
commands_verified: "run: cargo xtask repo -> 3 crates problems before, none after; run: cargo test -p room --test modules_walked -> ledge test FAILED at the earlier commit, 9 passed after the reorder"
---

**Issue:** Two guards that run in seconds to a minute (`cargo xtask repo` for a Cargo.toml edit; the whole test file that reads a content file for a content edit) were skipped at the moment of the edit, and both faults cost rework once found later.

**Suggested improvement:** After any Cargo.toml dependency edit, run `cargo xtask repo` at once; after editing a content file, grep the tests that read it (`grep -rl <file name> crates/*/tests crates/*/src`) and run those files whole, not one test.

**Principle:** Run a change's own guard in the same turn as the change; extends 0170.

**Another instance (revive, respawn and relog session, 2026-11-24):** clippy was run on the touched crates after the first stage, but new test files written after it (`left_tests.rs`) were not linted again; the full `cargo xtask check` stopped at `clippy::min_ident_chars` on two `|c|` closures, costing a whole check's start. The same principle: a test file is code the lints read, so `cargo clippy --all-targets` on its crate belongs to the edit that adds it.
