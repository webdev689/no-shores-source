---
id: 349
title: "Merging main in right before a merge looped three times on #254, and two of those pushes started publishing workflows from the branch"
status: open
type: slow-rule
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/git-hooks/pre-push"]
siblings_checked: "checked: #348 is a branch push starting a publishing workflow by its own paths; here it was main's paths (#224's sprite-forge, #256's tools/wreck) carried in by the merge, which the pre-push guard caught each time"
area: "merging"
date: 2026-11-28
session_context: "PR #254: main moved (#250/#264, then #256, then #263) while each CI run on the branch's merged head ran (~25-45 min each); the owner's rule asks for main merged in and green again each time. Two of the three pushes needed ALLOW_PUBLISH=1 with the owner's yes (modules.yml, wreck.yml), re-baking and re-publishing what main had already published."
parked_until:
resolved:
resolution:
reference: "PR #254 heads cbcc599a, a5bba727, db75d0a3; merge 6e1b5320"
commands_verified: "git merge-base --is-ancestor origin/main <head>; pre-push guard refusals"
---
Proposal for the owner: either accept a green head one merge behind main when the newer merge does not conflict
(main's own CI checks it before anything deploys), or have the pre-push publish guard tell a path main already
published (unchanged since main's run) from one the branch changed, so a catch-up merge needs no publish run.
