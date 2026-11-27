---
id: 327
title: "A worker's target/ linked to the main checkout's left build scripts holding the worker's worktree path: the main check failed once the worktree was removed"
status: superseded
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "checked: Toolkit's Workers section says a read-only reviewer links target/ from the main checkout; nothing says a builder must not, nor that build scripts bake CARGO_MANIFEST_DIR"
area: "parallel Rust builds in worktrees"
date: 2026-11-27
session_context: "Audit session: fix-server's worktree had target -> main's target to save disk (observation 310); its build of room and dungeon wrote build-script binaries that read content by /root/wt/fix-server/... paths; after the worktree was removed, cargo xtask check in main failed in 'tests (Rust)' with NotFound in crates/room/build.rs:53 until cargo clean -p room -p dungeon."
parked_until:
resolved: 2026-11-27
resolution: "by #175 (the same finding, a second occurrence; this instance is copied there)"
reference: "scratchpad check.log on ab29d2be"
commands_verified: "cargo clean -p room -p dungeon: run; cargo xtask check rerun"
---
