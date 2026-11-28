---
id: 110
title: "Waiting for a PR's CI after each catch-up loses the race to a main other sessions keep merging into"
status: declined
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: a controller practice, no skill holds it"
area: "merging with the owner's yes"
date: 2026-11-22
session_context: "Merging #134 after #130 and #133: main moved three times (#136, #137 and #138, #131) while #134's PR CI ran on each new head, the last bringing real conflicts (the quests' rings beside the marks). Each round cost a local full check plus about 20 minutes of CI."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: conflicts with CLAUDE.md:12-13 (a merge waits for CI green on the PR's head)."
reference:
commands_verified: "git merge-tree --write-tree origin/main HEAD (tree equal to the PR's head: no new check needed, as for #133)"
---

**Issue:** The controller merged main into the PR, ran the full check, pushed, then waited about 20 minutes for the
PR's CI before merging; other sessions merged into main inside that window three times running.

**Suggested improvement:** Once the owner has said yes, merge as soon as the local full check passes on a head that
holds current main (the same check CI runs; main's own CI gates every deploy). Where `git merge-tree` shows the merge
into main yields the PR's own tree, no new check is needed at all.

**Principle:** A gate that runs longer than the interval between other people's merges never closes; check the exact
tree that lands, then land it at once.
