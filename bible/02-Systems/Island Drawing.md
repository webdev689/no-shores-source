---
type: system
status: live
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
  - client/src/islands/isleView.ts#isleBox
  - client/src/islands/isleShader.ts#pipelinesOf
  - client/src/islands/isleShader.ts#partColours
  - client/src/editor/isleEditor.ts#startIsleEditor
  - client/src/heldmap/mapLetters.ts#paintIsle
---
# Island Drawing

How the page draws the sea's procedural islands: the `islands` layer (`client/src/islands/`), which draws what the
room module builds from an island's seed and climate. The island crate and its rules are [[Islands]]', and the
modules are made in Blender (`tools/islands`); this note is only the drawing.

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
  asked for again 30 s later. A pack comes from the R2 key `content/islands/modules.json` names, committed from the
  island-modules run's log (`isleManifest.ts` globs for it, so the page builds without it and draws the islands bare); a page's `?islePacks=<prefix>` reads `<prefix><kit>.modules`
  instead, for pictures before publishing (copy the build's packs into
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
  colour (the biome kit's own stone and growth, `partColours` in `isleShader.ts`, which holds the shaders). Within 1.5 km of its coast an island draws its fine
  ground and every module, and casts shadows; to 6 km its coarse ground with its trees, cliffs and stacks; to 20 km
  its coarse ground alone. An island out of view is not drawn at all: its box, made once (`isleBox`), holds its
  whole ground and every module placed on it at the contract's size, however turned. Its offset from the eye is
  written to the GPU once the eye moves, not once a pass. `groundAt(x, y)` is the nearest shown island's height
  there, null off every island.
- **The plants.** In the game an island's trees, shrubs and grass are not its modules but the land's own plants
  ([[Nature]]): `game/isleNature.ts` plants each where the island placed it, on its own foot, turned and scaled as
  placed, a tree as one of its climate's cast's trees and a shrub or grass as one of its low plants, each kind as often
  as its chance of growing says, drawn from its place. One view of the plants stands for each climate shown, its
  ground growing nothing of its own. The islands' view leaves those modules out (`GROWTH_ROLES`); the World Editor's
  Islands mode still draws them as modules.
- **The World Editor's Islands mode** builds one island at a time through `room.wasm`'s door and draws it with the
  sea round it ([[World Editor]]).
- **The held map** marks found islands, and every island standing in the ship's water: `HeldMap.setIsles(marks)`, a cove a small ring and an isle a ring with a
  tower, in the lighter ink under the words ([[Held Map]]).

## Cost

A ruin isle in rainforest (about 1300 modules) drawn close takes one draw for the ground and one a module the island
wears, some 40, however many it places.

## Limits

- The parts wear colours, not the textures layer's pictures.
- An island is culled whole or not at all: one whose box reaches the view draws all of its ground and modules.
