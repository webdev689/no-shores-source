---
type: decision
date: 2026-11-18
status: in force
---
# The Rooms Deploy When Their Code Changes

> Told that each deploy of the rooms drops everyone in them, that pages now join again by themselves but a fight and
> its foes are lost, and that the rooms could deploy on a merge only when their code changed, the page still
> publishing on every merge; asked whether to add that: "Yes, add the filter (Recommended)"

## What it settles

- A merge into `main` deploys the rooms ([[Server]]) once the same commit has passed the check, only when what they
  are built from changed since they were last deployed: a merge of notes alone deploys nothing. Run by hand, they
  deploy all the same.
- The page still publishes on every merge ([[The World Editor Is on GitHub Pages]]); the owner's yes to a merge
  covers both ([[Ask Before Deploying]]).
- It replaces [[The Rooms Deploy on Each Merge]].

Replaced in part by [[The Page Publishes Only After the Rooms Deploy]]: the page publishes on a merge once the rooms
have deployed or had nothing to.

Narrowed by [[The Audit's Leftovers Are Fixed as Claude Suggested]]: by hand they deploy only a commit whose CI
check passed.
