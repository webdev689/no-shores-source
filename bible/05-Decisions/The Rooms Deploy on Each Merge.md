---
type: decision
date: 2026-11-17
status: replaced
replaced_by: "[[The Rooms Deploy When Their Code Changes]]"
---
# The Rooms Deploy on Each Merge

Replaced by [[The Rooms Deploy When Their Code Changes]].

> Told that a fix reaches the rooms only when they are next deployed, by hand: "We need to make it automatic"

## What it settles

- Each merge into `main` deploys the rooms ([[Server]]) once the same commit has passed the check, as it publishes the
  page ([[The World Editor Is on GitHub Pages]]): the owner's yes to a merge covers both ([[Ask Before Deploying]]).
