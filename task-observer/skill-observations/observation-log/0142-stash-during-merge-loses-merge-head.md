---
id: 142
title: "git stash during a merge in progress drops MERGE_HEAD: a commit then would lose the merge's second parent"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "CLAUDE.local.md"]
siblings_checked: "none: one git habit"
area: "merging main into a long branch"
date: 2026-11-23
session_context: "Overlook #155: while a 30-file merge of main sat resolved but uncommitted in a worktree, a fingerprint trace ran `git stash && git stash apply` to restore files after a test. The stash reset the merge: MERGE_HEAD was gone and the resolved files came back as plain changes. Recovered by staging the tree, checking every one-sided file against its side (0 differences), and writing the merge with `git commit-tree <tree> -p HEAD -p origin/main`."
parked_until: "PR #239 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #239, merged 2026-11-27"
reference:
commands_verified: "run: ls $(git rev-parse --git-dir) showed AUTO_MERGE and no MERGE_HEAD after the stash; commit-tree's commit had two parents"
---

**Issue:** A trace that swaps files with git stash during an uncommitted merge silently turns the merge into ordinary
changes; committing them would have pushed main's work as a squash, and the pull request would still conflict.

**Suggested improvement:** Commit the merge (even with stale pins) before any trace, or trace in another worktree;
never stash mid-merge. To undo one file for a trace, copy it aside and back.

**Principle:** A merge's record lives in .git, not in the files: keep tools that rewrite the index away from it.
