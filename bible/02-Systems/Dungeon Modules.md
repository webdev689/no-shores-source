---
type: system
status: built
code:
  - content/dungeon/kits.json
  - content/dungeon/landmarks.json
  - content/dungeon/modules.json
  - tools/dungeon/build.py#build_style
  - tools/dungeon/catalog.py#required
  - tools/dungeon/envelope.py#kit_budget
  - tools/dungeon/envelope.py#walk_zone
  - tools/dungeon/envelope.py#edge_steps
  - tools/dungeon/envelope.py#dome_drop
  - tools/dungeon/envelope.py#water_edges
  - tools/dungeon/export.py#pack
  - tools/dungeon/kit/core.py#bevel
  - tools/dungeon/preview.py#sheet
  - tools/dungeon/previewPictures.ts
  - tools/dungeon/publish.py#read_build
  - .github/workflows/dungeon-modules.yml
  - client/src/game/dungeonModules.ts#readModulePack
  - client/src/game/dungeonModules.ts#layModule
  - client/src/game/dungeonModules.ts#uvPerZ
  - client/src/game/dungeonModules.ts#partPicture
---
# Dungeon Modules

The pieces each dungeon style is dressed and marked by, built by script in Blender
([[Each Dungeon Style Has Its Own Pieces, Built in Blender]]). Each style has a **kit**, eighteen pieces that dress
the rooms the rules lay, and three **landmarks**, set pieces a dungeon is remembered by. The rules place the
landmarks and the page places the kits ([[Dungeons]]). The calls are Claude's ([[Dungeons as Claude Builds Them]]).

## The contracts

Two files in `content/dungeon/` say what every style builds, and the rules, the page and the build all read them:

- **`kits.json`** names the nineteen parts a piece may wear, the eighteen kit pieces, and how each style places them:
  how often a wall set stands, where, what its ceilings and floors carry, how many features a room takes, and its
  least ceiling.
- **`landmarks.json`** gives each landmark its footprint in cells, whether it stands against a wall, its solids
  (each a box with its top) and its glows (each a light and its kind), in its own frame from the footprint's
  north-west corner.

## The pieces

| Piece | What it dresses | Its room |
|---|---|---|
| `door.a`, `door.b` | each doorway, round the code's jambs | 0.12 m proud each side; clear below 2.3 m within 0.8 m of the middle |
| `pillar.base`, `.shaft`, `.capital` | a great room's pillars | within 0.35 m of the middle from 0.25 m to 2.4 m |
| `wall.base`, `.shaft`, `.cap` | a wall set, as `kits.json` spaces them | 0.3 m off the wall below 2.4 m |
| `feature.a`, `feature.b` | a room's set pieces on its walls | 0.3 m off the wall, 3 m high at most |
| `ceiling.a`, `.b`, `.c` | bosses, beams or stalactites | hanging no lower than 2.4 m; under domes and vaults, within 0.8 m of the middle and under the smallest dome |
| `floor.a`, `floor.b` | slabs, runners, drains, circles, scree, rails | 0.05 m high at most |
| `sconce` | each torch's bracket, holding the code's flame | within 0.2 m of its torch along the wall |
| `portal`, `exit` | the arches round the return portal and the exit door | within 1.3 m of the middle along the wall; clear of the door's face |

A shaft is a unit high and is stretched between its base and its cap, so its detail runs only up it. Each kind of
piece keeps a triangle budget, the most repeated the least: a wall shaft or a sconce 150, a floor piece 300, a
ceiling piece 600, a door 1,500, a portal 2,500. A landmark keeps 12,000.

## The styles

- **Crypt**: round arches of chunky voussoirs with carved skulls, squat drum pillars on cushion capitals, ossuaries
  behind bars, rosette, skull and knot bosses, tomb slabs. The Charnel Pit, the Founder's Tomb, the Broken Vault.
- **Halls**: studded round arches and a timber lintel on carved corbels, fluted columns under acanthus, heraldry and
  torn banners, an iron chandelier ring, a runner rug. The High Seat, the Fallen Chandelier, the Great Hearth.
- **Cells**: iron-banded frames with a portcullis slot, iron-clad piers, manacles, a barred window, beams with hooks,
  drains and trapdoors. The Oubliette, the Gibbets, the Rack.
- **Sanctum**: pointed and trefoil arches on dark clustered colonnettes, rune bands, the brass crescent of the faith,
  ribbed bosses, a rune circle. The Altar of the Deep, the Ritual Circle, the Reflecting Pool.
- **Caverns**: natural rock arches, some crystal-studded, flowstone columns, curtains whose folds are pale
  calcite (the caverns' floor picture) banded by the rock in their grooves, glowing fungus and crystals, stalactite
  clusters, scree and puddles. The Still Lake, the Crystal Heart, the Stone Teeth.
- **Mines**: timber door sets and adits, posts with knee braces, cap beams with lagging, tool racks, rails. The Lift
  Shaft, the Ore Cart, the Collapse.

## How they are built

- **Blender by script.** `tools/dungeon/build.py` runs each style's `build(kit)` in `tools/dungeon/styles/<style>/`
  through Blender's Python module. The kit (`tools/dungeon/kit/`, `shapes.py`, `details.py`) makes shapes in the
  dungeon's own frame, x east, y south and z up, with every randomness seeded by a name.
- **Parts and UVs.** Each face wears one part, its material's name. Every face is unwrapped in metres: flat faces by
  their own plane, round things round them, sweeps along them. Smooth surfaces keep smooth normals.
- **The envelopes.** `envelope.py` refuses a piece that breaks its room or its budget. A landmark is refused if it
  leaves its footprint, rises within 0.1 m of its style's least ceiling, leaves its floor open, or has anything
  between 0.05 m and 2.2 m that lies over no solid. A solid stops a body whatever its height, so nothing seen
  there can be walked through. A landmark's still water lies over nothing, so just past its edge a bank must stand
  at or over it, or the side under the edge shows; the build gives the envelope each module's water to check.
- **Where pieces meet the room.** The page lays no floor under a landmark, so along its footprint's edge, away from
  its solids, its floor meets the room's at z 0 within 2 mm, or a skirt closes its side down to 0.05 m below it.
  Where a style's ceilings are domes and vaults, a ceiling piece hangs at a dome's top or on a vault's ridge. It
  keeps within 0.8 m of its middle, and at or under the curve of the smallest dome, over a room two cells square
  (its radius 3.2 m, its rise 1.92 m), so no dome or vault cuts it. The kit's `under_dome` bends a piece down
  along that curve.
- **The same bytes every build.** Blender's bevel works its UVs out in an order that changes between runs, so the
  kit takes a bevelled corner's UV again from its face's own map. The workflow builds every pack twice and fails if
  any byte differs.

## The pack

One file a style: the header's length, the header in JSON (its format, style, parts, and each module's vertices,
corners and bounds), then 28 bytes a vertex (position, normal, UV in metres, part) and each module's corners counted
from its own first vertex. It lives on R2 under its hash ([[Generated Files on Cloudflare R2]]), with the build's
`.blend` beside it. `content/dungeon/modules.json` names them.

## Publishing

The `dungeon-modules` workflow runs on every push that changes the tools or the contracts. It checks the envelopes
without Blender, builds every style with its contact sheets (kept as the run's artifact), and checks the packs. It
builds them again to the same bytes, and publishes them with the repository's `CLOUDFLARE_TOKEN`. Its log ends with the manifest
on one line, which a commit takes into `content/dungeon/modules.json`.

## In the Game

The page reads a pack (`readModulePack`) and lays its pieces into the dungeon's one mesh (`layModule`), turned by
quarter turns and stretched where it says. A door taller than its doorway's frame is fitted: what stands over 2.4 m
is squeezed toward it so its top meets the frame, and what stands under it is laid as built. Each corner keeps its
own normal and its UV, in pictures of 3.2 m. Bone, carving, cloth and brass take a picture every 1.6 m and rope
every 0.4 m, so a skull or a strand is its own size. A stretched or fitted corner's UV moves along the mean gradient
(`uvPerZ`) of the triangles that share it, so a post's grain or a shaft's stones keep their scale and a corner keeps
one UV. Its normal turns as the stretch or the fit turns the surface. Each part wears the cell's look's pictures,
the climate's timber, the iron, the dressing set or a glow (`partPicture`, [[Procedural Textures]]), and still water
its look's floor as its bed, wet rock's included. Where and when they are laid is in [[Dungeons]] ("In the Game").

## Contact sheets

`build.py --preview` renders a labelled sheet of each style's pieces in the game's own pictures by torchlight
(`previewPictures.ts` paints them), or `--preview flat` in a colour a part. [[Toolkit]] says how to run it.

## Limits

- The bone picture is a heap with dark gaps, so a single modelled bone or skull wears it blotchily.
- The trim and ceiling pictures have a darker border at their tile edges. Each style moves its centred faces off it,
  but a run of trim longer than 3.2 m always crosses one.
- The sheets frame each piece alone from one side, so a door is seen from its corridor and a piece missing its
  hidden faces looks hollow there.
