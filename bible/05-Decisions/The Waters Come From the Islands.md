---
type: decision
date: 2026-11-19
status: in force
---
# The Waters Come From the Islands

> Asked whether the owner draws the waters in the World Editor or they are generated from the islands: "Generated
> from islands"

> Offered the waters' proposal again: "Let's go through them again"

> Asked how the islands carve up the sea, each point of sea going to the island it is closest to, or each island's
> coastal waters with open sea between: "Nearest island"

> Asked how the other eight islands' waters get their owners: "Whatever is most logical and detailed"

> Offered owners by that logic: home safe; the second island's waters contested; the third's the Grey Tithe's; the
> fourth to sixth the pirates'; the seventh to ninth the Grey Tithe's, its seat at the ninth; a contested seam along
> the one border where the pirates' waters meet the Tithe's; higher ranks more common as a water's level rises: "Use
> this layout"

> Offered hulls by rank, Minor and Major the Sloop, Elite the Schooner, Miniboss the Brig, and Boss the Frigate as the
> Grey Tithe's flagship for its sea strike: "Agree"

> Offered each water keeping its own ships on their own courses, sighted kilometres out: "Rework. Friendly ships
> should dynamically travel. Visible on land and sea. Assigned to port factions (defered). Hostile ships needs to be
> dynamically adjusted to be more visible and detailed compared to the current system"

> Asked whether that means hostile ships sighted about 5 km out at the helm and farther with a voyage's pace, so each
> stays in sight at least 30 s, staying until out of sight, their number and ranks set by the water, each flying her
> faction's colours and flag on her rank's hull: "Yes, that's it"

> Asked whether friendly ships sail routes between ports all the time, seen from shore and sea, on the same hulls in
> friendly colours, as the merchantmen the escorts and events need, with port factions later: "Yes"

> Asked who names the nine waters on the held map: "Claude names them"

## What it settles

- The sea is split into nine waters, one for each island: a point of sea belongs to the island whose coast is
  nearest. A water's level band is its island's (`crates/gear/src/world.rs`).
- Each water has an owner:

| Island | Levels | Climate | Owner |
|---|---|---|---|
| 1 | 1–4 | Temperate coast | Overlook's home waters: no hostile ship |
| 2 | 4–7 | Highland | Contested: pirates and the Grey Tithe, fighting each other |
| 3 | 7–10 | Woodland | The Grey Tithe |
| 4 | 10–13 | Desert | The pirates |
| 5 | 13–16 | Savanna | The pirates |
| 6 | 16–19 | Rainforest | The pirates |
| 7 | 19–22 | Steppe | The Grey Tithe |
| 8 | 22–26 | Swamp | The Grey Tithe |
| 9 | 26–30 | Tundra | The Grey Tithe: its seat, and Thule's Frigate at its sea strike |

- The sea within about 100 km of the border between the fourth and eighth islands' waters is contested too.
- Minor and Major ships are most common in low waters, and Elite ships grow more common as a water's level rises.
  Miniboss ships sail only in waters whose band starts at 13 or above. The Boss Frigate sails only at the Grey Tithe's
  sea strike. Pirates keep near coves and wrecks; the Grey Tithe patrols the lanes.
- A ship's rank picks her hull: Minor and Major the Sloop, Elite the Schooner, Miniboss the Brig, Boss the Frigate
  ([[The Ships as Claude Shapes Them]], [[Hulls]]).
- Hostile ships still come to the player, now sighted about 5 km out at the helm. On a voyage that distance grows with
  its pace, so each ship stays in sight at least 30 s. She stays until she is out of sight. Her water sets how many come
  and of which ranks. She flies her faction's colours and flag on her rank's hull.
- Friendly ships sail routes between ports all the time, seen from land and sea, on the same hulls in friendly
  colours. They are the merchantmen that escorts and events need
  ([[The Sea Is a Patrol Zone, and the Ship Is Gear]]).
- The held map tints each water by its owner, with its name and level band, and hatches the contested seam
  ([[Held Map]]). Claude names the waters, and the owner can change any name.
- Which port faction each friendly ship belongs to waits until later ([[Open Questions]]).
