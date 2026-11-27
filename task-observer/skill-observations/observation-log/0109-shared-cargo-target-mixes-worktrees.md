---
id: 109
title: "A shared CARGO_TARGET_DIR mixes worktrees' builds of the same crates"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the brief was the controller's own"
area: "parallel fixers and Rust builds"
date: 2026-11-21
session_context: "Six fixers in six worktrees; the controller's brief told them to share CARGO_TARGET_DIR=/root/wt/target for cargo test to save disk. A fixer got other worktrees' builds of gear and dungeon (false errors: no gear::mail, no ELITE_BLOCKS)."
parked_until: "PR #240 merge"
resolved:
resolution:
reference:
commands_verified: "touch crates/*/src/lib.rs before cargo test forced a rebuild from the fixer's worktree (fixer's report)"
---

**Issue:** Cargo keys a workspace crate's build by its package id and fingerprints by mtime, so worktrees sharing one
target dir can take each other's builds of the same crate: a test can fail falsely or, worse, pass against another
branch's code. Disk was the reason to share (four CPUs, 22 GB free, about 7 GB a worktree target).

**Suggested improvement:** Never share a target dir across worktrees. Where disk is short, run Rust work serially in
one worktree per stack (check out each layer in turn), and delete a worktree's target once its branch is pushed. Say so
in Toolkit.md's Workers section.

**Principle:** A cache shared across checkouts must key on the checkout, or it is not a cache but a source of wrong
answers.
