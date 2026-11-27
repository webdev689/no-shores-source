---
id: 312
title: "A CARGO_TARGET_DIR shared by worktrees runs another worktree's build of a crate: path crates hash alike and freshness is by mtime"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["CLAUDE.local.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: CLAUDE.local.md tells worktrees to share /home/user/no-shores-source/target"
area: "parallel Rust builds in worktrees"
date: 2026-11-27
session_context: "Nine builders in worktrees shared one target dir. The repo builder's shots test ran without its fix three times (once right after 'Compiling combat'); the lore builder's wasm compiled protocol against another worktree's gear. A test binary vanished mid-run."
parked_until:
resolved:
resolution:
reference: "PR #234, builders repo and lore"
commands_verified: "reported by two builders; fixed by private target dirs under a flock"
---
CLAUDE.local.md's worktree advice (share the main target) gives wrong test results when several worktrees build at
once. Proposed: each parallel builder gets a private CARGO_TARGET_DIR and every cargo run holds one machine-wide flock;
the shared target is only for a single worktree working alone.
