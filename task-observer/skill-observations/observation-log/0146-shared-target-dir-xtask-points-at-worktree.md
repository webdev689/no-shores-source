---
id: 146
title: "Workers sharing the main checkout's CARGO_TARGET_DIR left cargo xtask checking a worker's worktree"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is a project note, not a skill"
area: "running parallel workers in git worktrees"
date: 2026-11-22
session_context: "No Shores prologue work. Three Agent workers in worktrees were told to use CARGO_TARGET_DIR=/home/user/overlook-source/target to spare the CPU. Afterwards `cargo xtask check` run in the main checkout printed 'checked 13d65a5e' (a worker's commit) and failed for that worktree's missing node_modules: the xtask binary last built in the worker's tree kept its root."
parked_until:
resolved:
resolution:
reference:
commands_verified: "cargo xtask check (run: checked the worker's 13d65a5e, failed on 'npm ci first'; after touching crates/xtask/src/main.rs and rebuilding, it checked the main tree)"
---

**Issue:** Sharing one Cargo target folder between the main checkout and workers' worktrees saves dependency builds,
but the `xtask` binary is shared too, and it works on the tree it was last built from. A full check run in the main
checkout then checked a worker's worktree and reported its commit, which is easy to misread as a pass of the head.

**Suggested improvement:** In the Toolkit note's Workers section, say: give each worker its own target folder (or
none), or, if one is shared, rebuild xtask in the main checkout (`touch crates/xtask/src/main.rs`) before a full
check, and always read the commit `cargo xtask check` prints last against `git rev-parse HEAD`.

**Principle:** A shared build cache must not hold a tool that knows its own source tree; and a check is only evidence
for the commit it names.
