---
id: 60
title: "Merged worktrees left in place filled the disk with their build folders"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the target is the controller's worker practice, not a skill"
area: "fanning out: cleaning up after merges"
date: 2026-11-20
session_context: "Controller ran a dozen worker worktrees over a day; the combat rules worker hit a full disk."
parked_until:
resolved: 2026-11-20
resolution: "run-worker.sh refuses to start at 90% disk; Toolkit.md: remove each merged worktree after checking its head is an ancestor of the base (PR #93 (claude/toolkit-review, d68f49a))"
reference:
commands_verified: "run: df -h showed 94% used (4.2 GB free); twelve worktrees held 3-4 GB of target/ each; removing nine merged ones freed 37 GB"
---

**Issue:** Each worker's worktree kept its own Rust `target/` (3-4 GB) and `node_modules` after its branch was merged.
With a dozen of them the disk reached 100% under a running worker, which had to clear its own incremental build and run
with CARGO_INCREMENTAL=0 to finish.

**Suggested improvement:** In Toolkit.md's Workers section: once a worker's branch is merged and no further round is
planned, remove its worktree (`git worktree remove --force`), after checking the branch is an ancestor of the base; and
check `df -h` before starting each new worker.

**Principle:** Parallel workers multiply every per-worktree cost; reclaim each worktree as soon as its branch is merged.
