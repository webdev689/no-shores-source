---
id: 148
title: "A worktree sharing the main checkout's target/ made `cargo xtask repo` check the other tree's files"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["crates/xtask/src/files.rs", "bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "run-worker.sh links node_modules only, never target/, so workers are not affected; only the controller's ad-hoc check worktree was"
area: "running the full check in a clean worktree to keep it from reading edits"
date: 2026-11-23
session_context: "Overlook Playlist session: after observation 140 the controller ran cargo xtask check in a detached worktree /root/wt/check with target/ symlinked to the main checkout's, to save 15 GB of disk. xtask finds the repository by env!(\"CARGO_MANIFEST_DIR\"), baked in at build time, and both trees build the same target/debug/xtask. In the main checkout `cargo xtask repo` then reported a layer problem in a line the main tree no longer had, and earlier 'no problems' readings had been of the check worktree."
parked_until: "PR #240 merge"
resolved:
resolution:
reference:
commands_verified: "run: touch crates/xtask/src/main.rs && cargo xtask repo -> 'repo checks: 3588 files, no problems' in the main checkout, where the shared binary had reported the check worktree's problem"
---

**Issue:** `repo_root()` is `env!("CARGO_MANIFEST_DIR")/../..`, fixed when xtask is compiled. Two worktrees sharing one
`target/` overwrite the same `target/debug/xtask`, and cargo, finding its own fingerprint fresh, runs the other tree's
binary: the checks read the wrong tree and say nothing about it.

**Suggested improvement:** Have xtask find the root at run time (`git rev-parse --show-toplevel` from the current
directory, falling back to the manifest dir), and print the root it checks beside the commit. Until then, never share
`target/` between worktrees; give a check worktree its own, or run the check in the main tree without editing.

**Principle:** A check must say which tree it read, and find it from where it runs, not where it was built.
