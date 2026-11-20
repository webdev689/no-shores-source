---
type: system
status: building
code:
  - client/src/islands/islePlan.ts#readIslePlan
  - client/src/islands/islePlan.ts#gridOf
  - client/src/islands/isleModules.ts#readKitPack
  - client/src/islands/isleModules.ts#loadKitPack
  - client/src/islands/isleModules.ts#MODULE_NAMES
  - client/src/islands/isleManifest.ts#ISLE_MANIFEST
  - client/src/islands/isleGround.ts#groundMesh
  - client/src/islands/isleGround.ts#groundHeight
  - client/src/islands/isleView.ts#IslesView
  - client/src/islands/isleView.ts#placedPoint
  - client/src/editor/isleEditor.ts#startIsleEditor
  - client/src/heldmap/mapLetters.ts#paintIsle
---
# Island Drawing

How the page draws the sea's procedural islands: the `islands` layer (`client/src/islands/`), which draws what the
room module builds from an island's seed and climate. The island crate and its rules are [[Overworld]]'s and the
modules [[Island Modules]]'s; this note is only the drawing.

## The drawing

- **The plan.** The room module hands an island's plan as JSON (`islePlan` on the room's door,
  `crates/room-wasm/src/isle_door.rs`), and `readIslePlan` reads and checks it whole: its kind and dungeon, radius
  and reach, landing, anchorage, spawns and facing, door, landmark, guards, camp, wrecks, ring, every placement as
  [module, x, y, z, turn, scale, lift], and the blocks the room stands their solids as (empty from a room that does
  not send them). A plan that is not whole throws. `IsleShown` is an island as the page shows it: its id, its middle in
  the world, its climate, its plan and its ground as `isleHeights` gives it. Everything is in the island's own frame,
  metres from its middle, x east, y south, z up.
- **The modules.** Each kit's pack (the dungeon modules' pack format, format 1, its header's `style` the kit) is read
  by `readKitPack`, which refuses a pack it cannot trust whole, and kept once fetched; a failure is warned once and
  tried again on the next `show`. A pack comes from `content/islands/modules.json` once CI publishes it (`isleManifest.ts`
  globs for it, so the page builds without it and draws the islands bare); on the dev page `?islePacks=<prefix>` reads
  `<prefix><kit>.modules` instead, for pictures before publishing (copy the build's packs into
  `client/public/isle-packs/`, which git ignores). A placement's module number is its name's place in the contract's
  names sorted by byte order, the isle crate's catalog order.
- **The ground.** `groundMesh` lays a vertex on each of the island's heights (2 m apart) at its cell's middle, exactly
  at its height, and two triangles a square whose corners all have one; the far mesh takes every fourth (8 m). Its
  colour is the shader's, as the land's is: the seabed under water, wet sand below the tide's reach, sand on the low
  gentle beach, the climate's ground inland (grass, earth, dry grass, sand or snow by climate, `GROUND_LOOKS`) turning
  to its high ground, rock where steep and snow above the tundra's line, lit by the sun and receiving the shadow map.
- **The view.** `IslesView.show(isles)` keeps an island shown before with the same plan; `drawInto` and `castInto`
  have the game scene's drawer's shape. Each island is drawn at its world place, its offset from the eye worked out
  in doubles. The modules are instanced: a kit's pack is one vertex buffer read as the pack holds it, an island's
  placements one instance buffer sorted by module, one draw a module the island wears, each part in the climate's
  colour (the biome kit's own stone and growth, `partColours`). Within 1.5 km of its coast an island draws its fine
  ground and every module, and casts shadows; to 6 km its coarse ground with its trees, cliffs and stacks; to 20 km
  its coarse ground alone. `groundAt(x, y)` is the nearest shown island's height there, null off every island.
- **The World Editor's Islands mode** builds one island at a time through `room.wasm`'s door and draws it with the
  sea round it ([[World Editor]]).
- **The held map** marks found islands: `HeldMap.setIsles(marks)`, a cove a small ring and an isle a ring with a
  tower, in the lighter ink under the words ([[Held Map]]).

## Cost

A ruin isle in rainforest (about 1300 modules) drawn close: see the pull request for the measured triangles and draw
calls; the draws are one for the ground and one a module the island wears, some 40, however many it places.

## Limits

- The parts wear colours, not the textures layer's pictures.
- The game does not show islands yet: the controller wires `IslesView` into the sea's scene.
