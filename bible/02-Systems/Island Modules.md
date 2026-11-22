---
type: system
status: live
code:
  - tools/islands/build.py#build_kit
  - tools/islands/catalog.py#required
  - tools/islands/envelope.py#problems
  - tools/islands/envelope.py#contract_problems
  - tools/islands/export.py#pack
  - tools/islands/publish.py#read_build
  - tools/islands/preview.py#sheet
  - tools/islands/kits/rocks.py#pieces
  - tools/islands/kits/trees.py#broadleaf
  - tools/islands/kits/wreck.py#hull
  - content/islands/kits.json
  - .github/workflows/island-modules.yml
---
# Island Modules

The pieces the game dresses its procedural sea islands with: every module `content/islands/kits.json` names, made in
Blender by code, checked, packed and published as the dungeon's modules are.

## The contract

`kits.json` holds the parts every piece wears, the kits (four biome kits, temperate, arid, tropical and frozen, which
hold the same pieces, and the common kit every climate shares) and each module's role, size and solids.
`catalog.py` reads it once for every other file.

A module stands in its own frame: x east, y south, z up, metres; its origin the middle of its base, its front facing
north (-y). Its mesh lies within its size, x within half its width either way, y within half its depth, and z from a
skirt of up to 0.8 m below 0 (so it never floats where the game sets it on a slope) to its height. Its solids, discs
a body cannot walk through as tall as the module, stand where the mesh is solid.

## How a kit is made

`build.py --out DIR [--kit K] [--preview]` runs `kits/<kit>.py`'s `build(kit)` for each kit, with the kit's helpers
(`kit/`: boxes, turned and swept shapes, rocks, masonry, planks, ropes, cloth, and `nature.py`'s limbs, fronds and
blades, each part a material named by its part and UVs in metres). The biome kits share `kits/rocks.py` (granite with
weed lines, sandstone in bands, basalt columns with coral, slate under snow), `kits/trees.py` and `kits/growth.py`
(shrubs, grasses and each biome's drift); the common kit's are in `kits/wreck.py`, `ruins.py`, `doors.py` and
`landmarks.py`.

The build refuses a missing or extra module and checks each against `envelope.py`: within its envelope (2 cm
tolerance), its mesh spanning at least 70% of its size across x and along y and 80% of its height, every part one of
the contract's, mesh under each solid, and its role's triangle budget (a tree 1800, a landmark 9000). It writes
`DIR/<kit>.modules` in the dungeon's pack format (format 1, the header's `style` naming the kit), `DIR/modules.blend`,
and with `--preview` a contact sheet of each kit in flat part colours on a light ground (`DIR/previews/<kit>.png`);
the island's own pictures are the game's. A second build on the same machine writes the same bytes (CI builds twice and
compares); that another machine's Blender writes them too is not checked.

## Checks and publishing

`test_envelope.py` checks the contract and the envelopes without Blender, and with `ISLAND_MODULES=DIR` every pack a
build wrote. A build stamps its folder (`built.json`) with the hash of each pack and the `.blend` it wrote, and
`publish.py DIR` takes only a folder one build wrote every kit of: it puts each pack and the `.blend` on R2 under
`islands/` through `tools/r2.py`, checks each comes back, writes `content/islands/modules.json` (`base`, `parts`,
`kits`, `source`) and ends its log with it on one line; `--dry-run` shows the manifest without sending. The
`island-modules` workflow runs all of it whenever `tools/islands/` or the contract changes, keeps the sheets (even
when a module is refused) and the packs as artifacts, and publishes with the repository's `R2_TOKEN` when it
is set, from any branch ([[Model Packs Upload From Any Branch]]). Its machine is thrown away with the manifest it wrote, so a commit takes the manifest from its log, and the
run warns while the committed one is behind; until then the page draws the packs the committed manifest names.
