---
type: decision
date: 2026-11-25
status: in force
---
# The Desktop App Releases With Each Merge That Changes It

> "So the release should ship with every update"

> Told that every game update already reaches the app's players, as the app plays the game the site serves, and
> offered a release cut on a merge that changes the app's own code, once the merge passes CI, the yes to the merge
> covering it: "Yes"

## What it settles

- A merge into `main` releases the [[Desktop App]] once the same commit has passed the check, when what its installers
  are built from changed since the last release; a merge of the game alone releases nothing, as the app plays the game
  the site serves. Run by hand from `main`, it releases all the same.
- The owner's yes to the merge covers the release, as it covers the site, the rooms and the bot
  ([[Ask Before Deploying]]).

[[Desktop App]], [[The Desktop App as Claude Builds It]].
