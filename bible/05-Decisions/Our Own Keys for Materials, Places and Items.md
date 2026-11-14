---
type: decision
date: 2026-11-14
status: in force
---
# Our Own Keys for Materials, Places and Items

> On the renderer filing every material under Daggerfall's texture key, with replacing that key the first job of the
> WebGPU material layer: "Approved #1"

> On giving Overlook its own item table, stat and skill model, bestiary, calendar and map grid: "Overlook gets all of
> this."

> On Overlook needing its own place IDs and item table from the start: "Approved"

## What it settles

- **Materials** are keyed by our own asset IDs, not Daggerfall's archive and record numbers, and nothing is snapped to
  a Daggerfall palette. This is the first job of the WebGPU renderer ([[WebGPU Only]]).
- **Places** have stable IDs of our own, used alike by the client, the wire, the server and the database. No
  Daggerfall map ID, building key or map pixel.
- **The game's tables are ours**: items, stats and skills, creatures, the calendar and the map grid. They replace the
  shared Daggerfall and Daggerfall Unity modules that most of the [[Pick List]]'s "Cut" rows depend on.
