---
type: decision
date: 2026-11-27
status: in force
---
# Pull Requests Merge Up to Date, and a Newer Merge Cancels an Older Check

The owner's words, on CI runs on `main` waiting hours in GitHub's queue:

> Offered: cancel an older run's check on `main` once a newer merge lands, since only the newest `main` deploys
> (changing the deploy workflow): "1"

> "Just tired of having to wait all morning for updates. Everything takes so long"

> Offered: #252 (that cancelling), and bringing each pull request up to date with `main` right before it merges, so
> `main` deploys without checking it again: "1 and 2"

## What it settles

- On `main`, a newer merge's check cancels the older run's check parts; a run whose parts were cancelled deploys
  nothing. A deploy already running is never cancelled ([[Checks]]).
- Just before a pull request merges, `main` is merged into its branch, and it merges once CI is green on that head
  with `main` unmoved, so `main` deploys the code its pull request's check passed without checking it again
  ([[Branches and Merging]]).
