---
type: decision
date: 2026-11-16
status: in force
---
# Gameplay Starts With the Shared Rules

> "Do we continue focusing on polishing world visuals, biomes, flora, etc or do we move into gameplay?"

> Offered an order of work (1: a rules crate and a thin server, starting with the Test Ground's movement in Rust,
> predicted in the browser, and two browsers seeing each other; 2: sailing, from Overlook to another continent's
> landing; 3: the mission loop of landing, the bird's-eye view, a mission, a fight and loot):
>
> "#1: Start here
>
> #2: This is where we import the sailing and combat system from DFO.
>
> #3: We will discuss this once we reach it"

## What it settles

- The work moves into gameplay, starting with the foundation: the game's rules in Rust, run by the server and
  predicted in the browser ([[Server-Authoritative Multiplayer]], [[Clients Predict With the Shared Rules]]). The
  first rules to move are the Test Ground's movement ([[Movement]]), then a thin server that two browsers share.
- Second comes sailing, where DFO's sailing and combat systems come over
  ([[Naval, Living World, Professions and Synth Come Over Leaner]]).

## Still open

- The mission loop, discussed once the work reaches it.
