---
id: 349
title: "Resolving a conflicted file with git checkout --ours dropped the other branch's non-conflicting hunks in it"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked — instance-specific to merge resolution; no skill in the kit owns merging (Toolkit.md's Audits and Workers sections touch merges only by merge-tree checks)"
area: "merging a long-lived branch onto main"
date: 2026-11-27
session_context: "Saltgrass fold-in session: merging ccr-0567dd6d-1v0ppa-saltgrass onto main; agree_node.rs and nodeWindow.test.ts conflicted only on the pinned hash line, and checkout --ours took main's whole file, losing the branch's new whaleback start and Saltgrass bounds; agree_node then failed and looked like a pre-existing defect."
parked_until:
resolved:
resolution:
reference: "commit 73837ba9 on claude/saltgrass-layout-fixes-ejim9h restores the hunks"
commands_verified: "run: git merge-file -p --ours <ours> <base> <theirs> rebuilt both files with only the conflict hunk taken from main; cargo test -p room --test agree_node then passed"
---

**Issue:** Two test files conflicted on one line each (a pinned hash main had moved to a shared fingerprints file). I resolved them with `git checkout --ours <file>`, which replaces the whole file with main's copy, so the branch's other, non-conflicting edits in the same files (a new start point and new bounds) were silently lost. The test then failed after the merge and read as a defect the branch already had, costing a worktree build to rule out.

**Suggested improvement:** In Toolkit.md's merge guidance: resolve a conflict hunk by hunk; to take one side only for the conflicting hunks, use `git merge-file -p --ours <ours> <base> <theirs>` (or `git checkout --conflict=merge` and edit), never `git checkout --ours/--theirs <file>` on a file the other side also changed elsewhere. After resolving, `git diff <other-side-base> HEAD -- <file>` should still show the other side's edits.

**Principle:** Taking one side of a conflicted file is not the same as taking one side of its conflicts; whole-file side selection discards every clean hunk from the other side without a marker.
