---
id: 111
title: "A catch-up brief that names main's merges but not their architecture leaves the merger to find a rewrite"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: the controller's own brief"
area: "catching a stacked PR up with main"
date: 2026-11-22
session_context: "Merging the five-PR stack after about 15 of main's merges. The brief listed the merges; it did not say main's #127 bans HTML in the interface, so #97's merger found its HTML screens refused and rebuilt the Journal, the board and an entrance card in the drawn interface (half the layer), and #123's the Postmaster's. Main also moved under every layer while it merged."
parked_until:
resolved:
resolution:
reference:
commands_verified: "git merge-tree --write-tree --name-only origin/main HEAD (the conflicts before merging)"
---

**Issue:** The brief named main's new merges by number and topic, not the rules they set (no HTML, the game in a
worker, numbered landings), so each merger met them as conflicts. Main moved during every layer's merge, and each
merger had to take the fetched head.

**Suggested improvement:** Before a catch-up, list main's new decisions and repo checks since the branch's base
(`git diff <base> origin/main -- bible/05-Decisions xtask`) and put each in the brief as a constraint. Tell the merger
to merge the head it fetches and say which. Picture any screen a merge rebuilds before calling it done.

**Principle:** A merge carries the other side's rules, not only its lines: brief the rules.
