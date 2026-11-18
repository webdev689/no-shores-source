---
type: decision
date: 2026-11-14
status: in force
---
# Ask Before Deploying

> "Always ask me before deploying"

## What it settles

- Claude opens a pull request for each change and asks the owner before merging it into `main`.
- Claude asks the owner before any deploy or release, every time. An approval covers that one merge or deploy.
- The editor's site is published on each merge into `main`, so the yes to that merge covers it ([[The World Editor Is on
  GitHub Pages]]). So are the rooms, when their code changed ([[The Rooms Deploy When Their Code Changes]]).
