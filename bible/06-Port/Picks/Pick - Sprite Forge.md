---
type: pick
area: Presentation and Tooling
verdict: Clean, Cut and Can't, brought over whole by the owner's choice
effort: L
status: ported
dfo_paths:
  - tools/sprite-forge/
  - tools/forgeViewer/
  - tools/forgeCanvas.mjs
  - tools/studioWebp.py
  - src/assets/horse/
  - public/art/studio/forge/
  - src/systems/studioArt/forgeLooks.json
  - src/systems/studioArt/forgePoints-male.json
  - src/systems/studioArt/forgePoints-female.json
  - src/systems/studioArt/forgeRaceSkins.json
  - src/systems/studioArt/forgeHairColours.json
  - src/systems/studioArt/forgeLayers.js
  - src/systems/studioArt/forgeRaces.js
  - src/systems/studioArt/forgeHair.js
dfo_commit: fc2a8e63d1 (ccr-aff93cb4-gw1nto-audit)
---
# Pick - Sprite Forge

DFO's sprite forge: Python in Blender that renders bodies, gear and moves as layered strips, and the game code that
composes a figure from them.

## What comes over

- The forge's code, fitted tables, keys and models, exactly, in `tools/forge/` in DFO's own layout.
- Its 120,435 strips and its five tables as they are, published to R2 ([[DFO's Sprite Forge Comes Over Exactly]]).
- The compositor (`forgeLayers.js` `composeFrame`, `layersOf`, `lookCell`), the race skins (`forgeRaces.js`) and the
  hair ramps (`forgeHair.js`), as TypeScript in `client/src/forge/`.

## What stays behind

- The forge viewer page and DFO's game code it runs on: the [[Test Ground]] takes its place.
- The palette snap and the dye tables, which need Daggerfall's palette: the Test Ground tints instead.
- The weapon-glow and depth stores the game kept for its own drawing, and the horse's coats.

## Our version

[[Sprite Forge]] and [[Test Ground]].
