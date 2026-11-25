---
id: 264
title: "A worktree moved to a second worker keeps the first one's build (fixtures and build scripts point at the old path), the disk runs low, and the template's graphify-out step errors where it is untracked"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "family: worker worktrees and briefs. checked: 0222 covers fixtures a fresh worktree lacks; this is a reused worktree's stale ones and a template step that assumes graphify-out is tracked."
area: "no-shores-source, passages client part-two worker"
date: 2026-11-25
session_context: "To save disk the controller moved finished worktrees (git worktree move) and gave them to new workers on new branches. The client part-two worker found its target/ tied to the earlier worker's build, so cargo test -p protocol built against content lacking a new file and five fixture tests stayed red. graphify-out is in .gitignore here, so the template's git checkout -- graphify-out step errored. uiShot.mjs cannot run builders that need async setup, so the worker reused a scratch script."
parked_until:
resolved:
resolution:
reference:
commands_verified: "git worktree move /root/wt/client /root/wt/client2; node --test client/src/game/*.test.ts (5 fixture failures)"
---
Proposed: run-worker.sh rebuilds the generated fixtures when a worktree's branch changes (not only when they are
missing); the template's graphify-out step is conditional on it being tracked.

The band worker hit the same root: its target/ came from the rules worktree, so the dungeon crate's build script
still pointed at /root/wt/rules and it had to `cargo clean -p dungeon` in both profiles; with four workers building,
the disk fell to 2.5 GB free mid-run. Separately, a Serena `replace_symbol_body` dropped a `#[test]` attribute that
only a never-used warning revealed.

**Instance (2026-11-25, passages worker fixrules):** `git checkout -- graphify-out` errored in the worktree because
graphify-out is not tracked there; the first full `graphify update .` in it ran over 120 s.
