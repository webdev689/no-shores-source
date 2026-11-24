---
type: pick
area: Gameplay
verdict: Cut (it wears Daggerfall's pictures)
effort: S
status: ported
dfo_paths:
  - src/world/chestModel.js
  - src/assets/chest/chest.json
  - tools/bakeChest.mjs
dfo_commit: aee22261 (main)
---
# Pick - Chest

The chest DFO stood in every chest, the owner's own model: a base, a lid, a hinge and a latch, baked from the owner's
Blender export shut and open, and fitted inside the box of each chest it stood for. The owner asked for it ("the
chest should be ported from DFO") for every chest
([[Every Chest Is DFO's Chest, and Its Vestige Pours Out as project-final's Cache Pours]]).

## What comes over

- **The shape**: each part's points and triangles as the bake left them shut, in its frame (x along, y up, z out of
  the front, the latch's side), wound so (b - a) x (c - a) points out of it.
- **The opening**: the lid, the hinge and the latch turning together about one line at the lid's back, to 77.3
  degrees, the lid's widest. That line is found from the bake's two poses, which it turns the shut one into to its
  last place, and lets the lid stand at any angle between.
- **The fit**: scaled to stand within the box of the chest it takes the place of, on its floor and in its middle, as
  large as its width and depth allow, so where a chest stands and how near a body opens it are unchanged.

## What stays behind

- Daggerfall's pictures (TEXTURE.067's wood, TEXTURE.000's iron and brass) and the 40 texels a metre laid on them: it
  wears the game's own wood, iron and gold ([[Own Work]]).
- The Blender export, its bones and the mimic's hop it carries, and the bake's FBX reader: the shape comes as its 50
  points and their triangles, not as the bake's file.
- ARCH3D's three chests, the Aurum Coffer and DET's sea chest it stood over, and DFO's model door.

## Our version

`client/src/models/chest.ts` holds the shape and lays it in the game's frame, its lid at any angle. The public events'
and a patrol's chests are props built from it in code (`client/src/city/chestModules.ts`), a plain chest of timber with
an iron hinge and a gold latch and a larger heroic one all in gold, each lid a module of its own swung about its hinge.
A dungeon's cache and its chests to find are built from it in the dungeon's wood and iron
(`client/src/game/dungeonChest.ts`). See [[Modules]], [[Dungeons]] and [[Game]].
