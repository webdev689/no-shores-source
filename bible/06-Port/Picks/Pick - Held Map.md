---
type: pick
area: Presentation and Tooling
verdict: Cut
effort: L
status: ported
dfo_paths:
  - src/ui/heldMap.js
  - src/ui/ink/inkMap.js
dfo_commit: 1c0fd681 (main)
---
# Pick - Held Map

DFO's held map: the travel map as a parchment in the player's own hands, the world inked on the sheet, panned, zoomed
and picked from under the thumbs ([[The Sea Is Navigated From the Helm With the Held Map]]).

## What comes over

- **The stage.** The paper is fitted to the screen first and the painting follows it: the paper takes 0.9 of the
  width or 0.84 of the height, whichever fits, under a head of 0.1 of the height (78 px at least) and over a foot of
  0.06 (52 px at least). The painting has no letterbox; the world shows round it. The paper lies at x 0.226 to 0.775
  and y 0.196 to 0.704 of the painting.
- **Raise and lower.** The whole painting slides up from below its own height over 0.42 s and down over 0.36 s, eased
  by smoothstep; it never fades. A close mid-rise lowers from where the sheet is. The choice made on the sheet is
  acted on once, after the lower.
- **The thumbs over the ink.** Where the thumbs rest on the paper, the painting's own pixels are drawn again over the
  map, so it reads as lying under the hands.
- **The view.** The paper's top-left on the map and a scale; the scale between the whole map fitting the paper and 14
  paper pixels a map pixel; centred on an axis the map does not fill, else clamped to it. The wheel zooms toward the
  cursor (a factor of e to the minus 0.0012 a wheel pixel), a drag pans, and a press that moves more than 6 px is a
  pan, not a click.
- **Picking.** A click picks the nearest mark within 16 paper pixels; a bare click clears the choice.
- **The look.** The parchment's own colour for the land, an iron-gall ink (58, 40, 22) for the coast, drawn twice: a
  soft wash, then the line.
- **What its tests pinned** that is behaviour, not Daggerfall: the eased raise, the slide that never fades, the
  lower from mid-rise, the commit fired once, the view's clamp and zoom anchor, picking's reach.

## What stays behind

- Daggerfall's travel law: fares, days, disease, gold, letters of credit, teleport, the party's polling, Travel
  Options' ports and filters, the journal and search.
- Daggerfall's and Tamriel's world: its land and water pixels, climates, tree and snow lines, roads, regions, mark
  buckets and ranks, and the town, seat and event painters.
- The browser's 2D canvas and DOM drawing: No Shores draws with WebGPU only ([[WebGPU Only]]), so the sheet, the ink
  and the hands are drawn on the GPU; names and buttons stay page elements, as the game's marks are.

## Our version

[[Held Map]]: opened from the navigation panel at sea, at the helm in first person. The forge's sheet and its hands, one strip a
gauntlet metal of 17 frames 274 × 181 drawn six times over (a finger fidget, left hand then right), are the owner's own
art from their Blender pipeline. The nine continents are inked on the sheet under fog of war: only what the player has
discovered.
