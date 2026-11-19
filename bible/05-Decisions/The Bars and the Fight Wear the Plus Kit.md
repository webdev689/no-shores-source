---
type: decision
date: 2026-11-18
status: in force
---
# The Bars and the Fight Wear the Plus Kit

> "Overhaul the player vitals and enemy bars using enhanced ui plus."

> Asked whether to add three allowed imports to the client's layer check, the fight display (`combat`) and ships'
> bars (`ships`) using the Plus kit (`plus`), and the Game page (`game`) using the fight code (`combat`): "Yes, add all
> three (Recommended)"

> Asked whether the fight layer (`combat`) may also import the player layer (`player`) and the editor's camera
> (`editor`), so the Test Ground and the Game page share one copy of the fight code: "Yes, add both (Recommended)"

## What it settles

- The player's vitals and the enemies' bars wear the [[Interface]]'s Enhanced Plus kit ([[Enemies]]).
- The client's layers allow `combat` and `ships` to import `plus`, `game` to import `combat`, and `combat` to import
  `player` and `editor` ([[Code Map]]). The Test Ground and the [[Game]] share one copy of the fight code.
