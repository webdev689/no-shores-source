---
type: decision
date: 2026-11-22
status: in force
---
# The Room for Playing Alone Runs in a Worker of Its Own

> Offered moving the room for playing alone (a node's, the sea's and an island's, which ran on the game's own thread:
> its opening, its navmesh baked and its sea laid, and every tick of its foes) into a worker of its own, talked to as
> the deployed rooms are, as the largest hitch left: "Offline room worker?", then "Yes"

## What it settles

- Playing alone, the room's work leaves the game's thread: it opens and ticks in a worker of its own, and the game
  hears its snapshots as it hears a server's ([[Game]], "Threads").
- It answers the owner's "consistant hitching and poor performance" ([[Areas Load in Chunks With Proper Caching]]).

## Claude's calls

- The wreck's room in the prologue, which the story asks things of and waits on, stays where it is for now (replaced
  by [[The Wreck's Room Runs in the Rooms' Worker Too]]); the [[Test Ground]]'s too, as it is a page of its own.
