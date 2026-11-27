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
  - client/src/islands/isleGround.ts#groundTilesOf
  - client/src/game/isleTiles.ts#isleTiles
  - client/src/groundGrain.ts#TILE_GRAIN_WGSL
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
  island-modules run's log (`isleManifest.ts` globs for it, so the page builds without it and draws the islands bare); a
  page's `?islePacks=<prefix>` reads `<prefix><kit>.modules` instead, for pictures before publishing (copy the build's
  packs into `client/public/isle-packs/`, which git ignores). A placement's module number is its name's place in the
  contract's names sorted by byte order, the isle crate's catalog order.
- **The ground.** `groundMesh` lays a vertex on each of the island's heights (2 m apart) at its cell's middle, exactly
  at its height, and two triangles a square whose corners all have one; the far mesh takes every fourth (8 m). Its
  colour is the shader's, as the land's is: the seabed under water, wet sand below the tide's reach, sand on the low
  gentle beach, the climate's ground inland (grass, earth, dry grass, sand or snow by climate, `GROUND_LOOKS`) turning
  to its high ground, rock where steep and snow above the tundra's line, lit by the sun and receiving the shadow map.
  Each wears the land's ground tiles painted for the island's climate ([[Procedural Textures]], `groundTiles`), as the
  land wears them (`TILE_GRAIN_WGSL`, groundwork both import): its colour times its tile's grain, one giving way to
  the next by their grains. The game hands the view its tiles (`isleTiles`, its `tilesOf`); a view given none (the
  World Editor's, the passages' pictures) draws the ground in its plain colours.
  The low ground wears the grass tile and the high ground the dirt; a passage's floor of one ground the tile its colour
  is nearest (grass, dirt, sand or stone), a paved one the paving (`groundTilesOf`); the beach the sand, the snow the
  winter grass, and the steep rock the climate's caverns' layered rock, cast from the three axes so a face is not
  stretched ([[Island Textures as Claude Builds Them]]). A place is warmed (`warm`) until its climate's tiles are
  painted, at most 5 s; until then the ground is drawn in its plain colours.
- **The view.** `IslesView.show(isles)` keeps an island shown before with the same plan; `drawInto` and `castInto`
  have the game scene's drawer's shape. Each island is drawn at its world place, its offset from the eye worked out
  in doubles. The modules are instanced: a kit's pack is one vertex buffer read as the pack holds it, an island's
  placements one instance buffer sorted by module, one draw a module the island wears, each part in the climate's
  colour (the biome kit's own stone and growth, `partColours` in `isleShader.ts`, which holds the shaders); the rock
  parts (cliffs, stacks, outcrops, boulders, shore rocks) wear the caverns' rock cast on their faces too. Within 1.5 km
  of its coast an island draws its fine ground and every module, and casts shadows; to 6 km its coarse ground with its
  trees, cliffs and stacks; to 20 km its coarse ground alone. An island out of view is not drawn at all: its box, made
  once (`isleBox`), holds its whole ground and every module placed on it at the contract's size, however turned. Its
  offset from the eye is written to the GPU once the eye moves, not once a pass. `groundAt(x, y)` is the nearest shown
  island's height there, null off every island.
- **The lights.** A module's `ember` glows by itself, moving with its own lamp ([[Sky]], "Lamps"). Each shown
  island's embers give light (`isleLights.ts`, [[Lights as Claude Builds Them]]), laid again as an island is shown or
  gone and as a pack comes: an ember 0.5 m wide or more is coals (a camp fire's), the game's fire burning on them and
  casting its light; a narrower one is a lantern's glass (a mine adit's, a passage's lamp and a dead lamp lit), no
  flame seen ([[An Enclosed Light Hides Its Flame]]), its lamp at the glass. An ember stood cold casts nothing, nor does
  an open mouth's way on.
- **The plants.** In the game an island's trees, shrubs and grass are not its modules but the land's own plants
  ([[Nature]]): `game/isleNature.ts` plants each where the island placed it, on its own foot, turned and scaled as
  placed, a tree as one of its climate's cast's trees and a shrub or grass as one of its low plants, each kind as often
  as its chance of growing says, drawn from its place. One view of the plants stands for each climate shown, its
  ground growing nothing of its own. The islands' view leaves those modules out (`GROWTH_ROLES`); the World Editor's
  Islands mode still draws them as modules.
- **The World Editor's Islands mode** builds one island at a time through `room.wasm`'s door and draws it with the
  sea round it ([[World Editor]]).
- **The held map** marks found islands, and every island standing in the ship's water: `HeldMap.setIsles(marks)`, a cove
  a small ring and an isle a ring with a tower, in the lighter ink under the words ([[Held Map]]).

## Cost

A ruin isle in rainforest (about 1300 modules) drawn close takes one draw for the ground and one a module the island
wears, some 40, however many it places. A ground pixel reads its tiles 20 times on a sea island (17 on a hollow's one
floor, 23 under a snow line), about as many as the land's terrain; a module's pixel 11, for the rock's picture. On the
software GPU the pictures are taken on, a frame of three islands from above takes some 2.2 s.

## Limits

- The parts but the rock wear colours, not the textures layer's pictures.
- The World Editor's Islands mode and the passages' pictures draw the ground in its plain colours: they are given no
  tiles.
- An island is culled whole or not at all: one whose box reaches the view draws all of its ground and modules.
