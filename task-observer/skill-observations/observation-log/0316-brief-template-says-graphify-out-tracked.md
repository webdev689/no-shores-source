---
id: 316
title: "The worker brief template says graphify-out is tracked and to check it out before commits; in this repo it is ignored, so the step errors"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "none: the target is a project file, not a skill"
area: "worker brief template, graphify step"
date: 2026-11-26
session_context: "Deeper dungeons session: the storey-engine worker reported 'graphify-out is not tracked in this worktree, so git checkout -- graphify-out errors'. The Toolkit note says graphify-out/ is ignored by git; the template says it is tracked. The same worker also hit a stale incremental build after a stopped background cargo test (undefined hidden symbol at link; cargo clean -p room -p room-wasm fixed it), and builds over 2 minutes needing run_in_background."
parked_until: "PR #242 merge"
resolved:
resolution:
reference:
commands_verified: "git ls-files graphify-out: run, printed nothing (untracked)"
---

**Issue:** The brief template tells every worker that graphify-out/ is tracked and to run `git checkout -- graphify-out` before commits, rebases and pulls. In this repository graphify-out/ is ignored (Toolkit: "Its graphify-out/ is ignored by git"), so the step errors and each worker spends a turn working that out.

**Suggested improvement:** Make the template's graphify line conditional on `git ls-files graphify-out`, or state the repository's actual setting; add a line that a stopped cargo build can leave a stale incremental cache and `cargo clean -p <crate>` clears it.

**Principle:** A shared template's facts about the repository must be checked against the repository, or every worker re-discovers the mismatch.
