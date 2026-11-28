---
id: 289
title: "Seven worktrees' target folders (4 to 9 GB each) filled the disk; a room test build failed with no space left"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are project files, not skills"
area: "running item workers in parallel"
date: 2026-11-26
session_context: "Main checkout plus six worktrees under ~/wt, each building its own target (wasm, room tests): 54 GB; rustc failed writing its incremental cache and the running workers may have lost writes. Deleting the three merged worktrees' targets freed 25 GB."
parked_until: "PR #242 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #242, merged 2026-11-27"
reference:
commands_verified: "df: 0 MB free, then 34 GB after rm -rf of wreck, welcome, escort and hordes targets"
---

**Issue:** A merged worker's worktree keeps its multi-GB target until removed, and nothing frees it.

**Suggested improvement:** After merging a worker's branch, delete its worktree's target (keeping any pictures it holds); or point every worktree at one shared CARGO_TARGET_DIR per toolchain where builds do not race.

**Principle:** Free what a finished job holds as soon as it is merged.
