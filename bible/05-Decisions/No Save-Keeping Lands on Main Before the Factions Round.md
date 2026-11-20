---
type: decision
date: 2026-11-20
status: in force
---
# No Save-Keeping Lands on Main Before the Factions Round

> Asked "After #92 merges, rolling back to today's main would wipe every player's pledge, reputation, cosmetics,
> Shapes and Art levels, because main's room drops fields it doesn't know. Should I first send main a small pull
> request that only keeps those unknown fields, so a rollback of #92 loses nothing?": "No, just say it"

## What it settles

- **No separate pull request keeps a save's unknown fields on `main` first.** A rollback of the rooms to before the
  factions round loses what the round keeps (pledges, reputation, cosmetics, Shapes, the Arts' levels), so a fault
  after it is fixed forward ([[Server]]).
- The pull request says so, for the owner's yes to its merge.
