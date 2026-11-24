---
id: 153
title: "Every PR adds its entry at the head of the hand-off's 'Waiting on the owner', so an open PR conflicts as soon as another merges, and GitHub then runs no CI on it"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.md", "bible/04-Procedures/Recording a Decision.md"]
siblings_checked: "checked: this session's merge of main into #168; the only conflict was bible/Hand-off.md's 'Waiting on the owner' head, the code and Naval Combat.md merged clean. Other notes each PR edits (a system note's middle) merged clean."
area: "parallel sessions' PRs and the shared hand-off note"
date: 2026-11-23
session_context: "Picked up session ccr-bc9c76c9-rau31m: its PR #168 (the ship aim) was opened at 18:29 while #163 and #167 merged into main around it. #168 showed mergeable_state dirty and no check runs at all: GitHub builds no merge ref for a conflicting PR, so its CI never ran. The conflict was one hunk: both sides had put their entry first under '## Waiting on the owner' (main also added an intro line there). Again 2026-11-24, bounty board #196: opened 18:35, dirty within the hour (main took 158 commits, #179 and #191 among them); conflicts in Hand-off.md, a moved test helper and factions.rs; no check run at all until main was merged in on the owner's next ask."
parked_until:
resolved:
resolution:
reference: "PR #168; merge commit a5868527 on ccr-bc9c76c9-rau31m"
commands_verified: "run: git merge --no-edit origin/main -> CONFLICT (content): Merge conflict in bible/Hand-off.md, only file; get_check_runs on #168 -> total_count 0"
---

**Issue:** The hand-off is one note every session rewrites, and each PR adds its own entry at the same spot: the
head of "Waiting on the owner". Two PRs open at once always conflict there, so whichever merges second goes dirty
the moment the first lands. A dirty PR gets no CI run at all (no merge ref), so the owner sees a PR with no checks and
no word on why, and it waits until a later session notices and merges main in.

**Suggested improvement:** One of these, for the owner to choose: (a) a PR's hand-off entry is written last, after
`git fetch origin main && git merge origin/main` just before the push, and a session that sees its PR go dirty
merges main in at once; or (b) a PR keeps its "waiting" text in its own description and the hand-off only lists the
PR's number and title, one line each, appended at the end of the list rather than the head, so two lines rarely
touch.

**Principle:** A shared file every parallel change must edit at the same line is a merge bottleneck; give each change
its own line, or have it edit the shared file last against the current tip.

**Again (2026-11-24, #196):** the hand-off entry conflicted once more, with two code conflicts beside it; found only because a later audit read the PR's check runs (zero) and then its `mergeable_state`. Checking `mergeable_state` right after opening a PR, and after each merge to main while it waits, would have caught it within the hour.
