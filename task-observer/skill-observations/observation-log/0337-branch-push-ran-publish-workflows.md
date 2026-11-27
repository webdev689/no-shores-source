---
id: 337
title: "Pushing two review branches ran three publishing workflows from branches: dungeon-modules, island-modules and modules (bake and publish to R2)"
status: open
type: user-correction
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/git-hooks/pre-push"]
siblings_checked: "checked: #130 is this same slip (a branch push starting a publishing workflow); #239's pre-push hook refuses it, but it was not yet installed, and the controller pushed the helpers' branches without checking their paths"
area: "pushing"
date: 2026-11-27
session_context: "claude/review-check-and-ci (#240) edited dungeon-modules.yml and island-modules.yml and test_envelope.py; claude/review-test-hooks (#243) edited tools/modules/bake.py and render.py and tools/freesound/*. Runs 45930578803, 45930578895 and 45935626942 published to R2 from the branches; freesound's publish was skipped."
parked_until:
resolved:
resolution:
reference: "PRs #240, #243; #239's pre-push publish guard"
commands_verified: "a paths check (scratchpad pubcheck.py) of each branch's diff against origin/main named the four workflows"
---
A RECUR of #130, by the controller. Until #239 is merged and installed, check each push's diff against every
publishing workflow's push paths before pushing.
