---
id: 354
title: "Merging main into a feature branch carries main's publishing-path changes, so its push is refused (twice: a hand-off branch, then a dirty PR)"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/held-branches.sh", "bible/Hand-off.md"]
siblings_checked: "checked: #348 is the same publishing guard from another cause (review branches' own edits); this one is main's forge changes carried by a merge into an older branch. Instance of the hand-off's branch advice, not of the guard."
area: "hand-off / pushing"
date: 2026-11-27
session_context: "Dungeon overhaul resumed from a hand-off naming claude/dungeon-system-overhaul-n04i0s (remote head 4b998f31). Main had moved 42 commits, including tools/forge/tools/sprite-forge/**; after merging main, the pre-push hook refused: modules.yml would run from the branch. Pushed instead to the session's own branch ccr-d58ab3d1-cxb4di, which sat at main's head."
parked_until:
resolved:
resolution:
reference:
commands_verified: "git push to the old branch: refused by pre-push naming modules.yml; git push to ccr-d58ab3d1-cxb4di: passed"
---

**Issue:** A hand-off tells the next session to continue on a branch. If main has moved past that branch's base and touched a publishing workflow's push paths, merging main into the branch makes every later push start the workflow from a branch (R2 writes), so the push guard refuses it. The session has to move the work to another branch whose remote head is already on main.

**Suggested improvement:** The hand-off's "continue on branch X" line says to push to a branch whose remote head is main's (the session's own), or held-branches.sh / pr-state.sh flags a branch whose merge with main would carry publishing paths, before a session merges main into it.

**Principle:** Advice to resume on a named branch goes stale when the base branch moves; check what a merge of the base would carry through the push triggers before acting on it.

**Second instance (2026-11-28):** PR #266 went dirty once main merged #256; merging main into the PR's branch carried main's wreck changes, so the push guard refused (`wreck.yml`). Worked round by not merging main: the branch's overlapping lines were made to match main's text word for word (main's `lays_great_rooms` added identically, the branch's own insertions moved off main's), after which `git merge-tree` showed a clean merge and the push carried only the branch's own changes. A `pr-state.sh` hint ("make the overlapping hunks match; merging main will be refused") would save the round trip.
