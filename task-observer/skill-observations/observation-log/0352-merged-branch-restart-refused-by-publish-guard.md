---
id: 352
title: "A session branch restarted from main after its PR merged cannot be pushed when main changed a publishing path since the branch's old head"
status: open
type: tool-clash
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/git-hooks/pre-push", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: #348 (branch pushes starting publishing workflows) is the guard's reason; this is its cost on a branch whose PR merged"
area: "pushing"
date: 2026-11-28
session_context: "PR #263 merged as 1b1c5d8d. The session may push only to claude/rubber-banding-desync-fix-esqorf; restarted from main for a one-line hand-off change, the push's range from the old head ff3b18ee holds #259's tools/wreck changes, so wreck.yml would publish from the branch. Earlier the same guard refused merging main (#256 #259) into the open PR, so #263 merged at a head behind main, main's ci re-checking it. A force push was also refused by the auto-mode classifier."
parked_until:
resolved:
resolution:
reference: "PR #263; main 1b1c5d8d; local commit 096aa44c"
commands_verified: "git merge-base --is-ancestor origin/<branch> HEAD (fast-forward), then git push: pre-push names wreck.yml"
---
A session pinned to one branch name loses the hand-off rewrite after its PR merges whenever main touched a publishing
path in between. Proposal for the owner: the hand-off rewrite rides in the PR before its merge (as #256 did), or a
merged branch may be deleted on origin and pushed anew, so the push's range starts at main.
