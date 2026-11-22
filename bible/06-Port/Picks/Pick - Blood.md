---
type: pick
area: Gameplay
verdict: Cut
effort: M
status: ported
dfo_paths:
  - src/combat/blood/bloodArt.js
  - src/combat/blood/bloodDecals.js
  - src/combat/blood/bloodMarks.js
  - src/combat/blood/bloodBleed.js
  - src/combat/blood/bloodGibs.js
  - src/combat/blood/bloodSwitch.js
  - src/render/renderer.js
dfo_commit: 1c0fd681
---
# Pick - Blood

DFO's blood marks: the sprays a blow leaves on floors and walls, the drops flying to them, wounded bodies' trails,
corpses' pools, bloody prints, an explosive death's chunks, and every mark drying. The owner chose "Exactly as DFO
has it": its numbers, orderings and colours come over unchanged, though they were read off DaggerBlood and its red is
taken from Daggerfall's blood texture ([[Struck Figures Flash, and DFO's Blood Comes Over]]).

## What comes over

- The whole system in strict TypeScript: the ring of marks, the rate ladder, the spray's lobes, the overkill burst,
  the flight, the bleeding, the pools, the prints, the chunks, the generated art and the drying.
- The classic decal pass's film, from `renderer.js`, drawn in WebGPU and WGSL in the [[Test Ground]]'s scene.
- The switch, as `?blood=off`, and the gore dial at DFO's default.

## What stays behind

- `src/scenes/hitEffects.js` and its one-shot splash from TEXTURE.380 (a Daggerfall Unity translation), and every
  picture of Daggerfall's: a chunk wears the generated splat art instead.
- Daggerfall Unity's `bloodIndex`: every No Shores body bleeds.
- The prefs shelf, the overkill and screen-blood switches, blood on the lens, and the enhanced lighting lane's wet
  sheen: No Shores has one lighting, and DFO's classic pass is what comes over.
- The streaming world's origin shifts and moving surfaces: the Test Ground has neither.

## Our version

[[Blood]].
