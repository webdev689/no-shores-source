---
type: decision
date: 2026-11-23
status: in force
---
# Only the Garrison's Own Kills Share Its Clear, and a Failed Trip Goes Back to the Beach

> "Only garrison kills"

Said in answer to whether a kill of any foe in a mission's, a dungeon's or a world boss's node, a quest's wave or
ambush among them, counts as fighting its garrison, for a share of its clear.

> "Back to the beach"

Said in answer to whether a trip that fails from an island's beach, played alone, goes back to the beach as [[Game]]
says, or to Overlook.

> "Whatever is best"

Said in answer to two more: whether [[Branches and Merging]] should say what is done (`main` merged into a branch, a
merge commit for each pull request) or what is done should follow it (a rebase, a squash), and whether the three notes
whose status is `built` take `live` or [[Writing Notes]] takes a fourth status.

## What it settles

- A player shares a garrison's clear only by sharing a kill of a foe of the garrison's own groups ([[Gear]], "A
  clear").
- A trip that fails takes a player who stood on an island's beach back to it, online and alone alike ([[Game]]).
- The other two are Claude's calls, below, for the owner to change.

## Claude's calls

| Asked | Chosen | Why |
|---|---|---|
| Rebase and squash, or merge | What is done stands: `main` is merged into a branch to catch up, and a pull request is merged with a merge commit | A pushed branch is read by its pull request and by other sessions, and a rebase would need a force push over it; a merge commit still makes each change one merge on `main` |
| `built` | The three notes take `live`, and the statuses stay planned, live and retired | Each of the three systems is merged and deployed, which `live` says; a fourth word would say the same |
