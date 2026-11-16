---
type: index
---
# Open Questions

Decisions waiting on the owner. None is in force until the owner decides it and it moves to [[Decisions]].

## What of the branch's models and textures comes over?

[[Every Island Is Seen Whole and Reached by Nodes]] brings the models and procedural textures of DFO's branch
`ccr-cab30c1a-oddrwb` (read at `b37cc444`), and World 2.0 and RMB for laying out towns. What the branch holds:

- **DFO's own code:** the Building Forge's builder (wings to walls, hipped or gabled roofs, eaves, chimneys,
  parapets, windows a storey apart, doors), the Prop Forge's 65 families made in code from a box, the Room Kit's
  builder, and the procedural texture engine with its recipes' rules.
- **Measured from Daggerfall:** the plans the forges build on. `buildingTable.js` is generated from ARENA2's models
  (387 buildings), and `propTable.js` (434 pieces) and `kitTable.js` (751 pieces, each face where Daggerfall's
  stands) are measured the same way. Each piece keeps its Daggerfall model id.
- **Keyed to Daggerfall:** the textures are painted in code, but filed under Daggerfall's 194 texture archives and
  their records' sizes (`procCatalog.js`), in Daggerfall's 256 colours (`procPalette.js`).
  [[Our Own Keys for Materials, Places and Items]] keys materials by our own ids and snaps nothing to that palette.
- **RMB** is Daggerfall's block format, whose readers do not come ([[Readers of Our Own Formats Only]]). World 2.0's
  own settlement design lays out towns by rules or by hand without it.

Under [[Own Work]] as it stands, the builders and the texture engine come, and Overlook gives them its own plans,
material keys and palette; a town laid out on a grid of blocks, as RMB does, is laid out with our own blocks. The
other way is an exception like the sprite forge's, which changes the rule. Which way?

## What happens when the player does not go back?

A section's edge warns the player to go back. If they keep going: are they held at the edge, or returned to where
they landed after a count?

## How big in metres, and on which islands?

- DFO's Imperial City is 20.48 km across its plan, with its wall 6.9 km from its middle (about 13.8 km across). Half
  its width is about 7 km within the walls, or 10 km across the plan.
- The social space is the size of Destiny 1's Tower, to be measured.
- One port city on each island: the nine continents, or the static isles too? An isle may be smaller than the city.
