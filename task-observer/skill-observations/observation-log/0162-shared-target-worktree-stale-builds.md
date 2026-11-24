---
id: 162
title: "A scratch worktree that shared the repo's target/ (symlinked, to avoid a wasm-copy mismatch) left builds with its own CARGO_MANIFEST_DIR baked in; later checks in the real tree failed one crate at a time with NotFound on content files"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "CLAUDE.local.md"]
siblings_checked: "checked: CLAUDE.local.md's Long Runs pattern covers waiting on the check, not worktrees; Toolkit.md has no note on scratch worktrees and target/. Instance-general: any merge-check done in a second checkout with a shared target dir."
area: "verifying a merge with main in a scratch worktree"
date: 2026-11-24
session_context: "PR #178: a scratch merge with main was checked in scratchpad/mergecheck with target/ symlinked to the repo's. After the worktree was deleted, the real tree's check failed in turn on dungeon's build script (debug, then release), land's dabs test, world's layout_file test and the wasm32 release builds, each reading content via env!(CARGO_MANIFEST_DIR) baked as the deleted worktree's path; cargo kept them as fresh. Each failure cost a full check run of several minutes, because cargo test stops at the first failing binary and the wasm step runs after the tests."
parked_until:
resolved:
resolution:
reference: "crates/land/tests/dabs.rs:9; crates/world/tests/layout_file.rs:9; crates/dungeon/build.rs:19"
commands_verified: "run: grep -rl scratchpad/mergecheck --include=*.d --include=output --include=*.json target -> listed every stale build in every profile; cargo clean -p <crate> (and --release), rm -rf target/wasm32-unknown-unknown/release -> 0 left"
---

**Issue:** Checking a merge in a second checkout that shares `target/` leaves builds whose baked
`CARGO_MANIFEST_DIR` points at the second checkout, in every profile (debug, release, wasm32). Once it is deleted,
the real tree's tests and build scripts that read files by that path fail with NotFound, one per full check run.

**Suggested improvement:** After a scratch checkout that shared `target/`, before the next check, run
`grep -rl <scratch path> --include=*.d --include=output --include=*.json target` and clean every crate and profile
it names. Better: give the scratch checkout its own `CARGO_TARGET_DIR` and point the wasm copy at that dir.

**Principle:** A shared build cache can outlive the checkout that filled it; search all of it, every profile, before
trusting a failure in the real tree.
