---
type: system
status: live
code:
  - tools/forge/tools/sprite-forge/layers.py
  - tools/forge/tools/sprite-forge/weaponart.py
  - tools/forge/tools/sprite-forge/fanout.py
  - tools/forge/tools/forgeViewer/pack.py
  - tools/forge_publish.py#publish
  - tools/forge_publish.py#add
  - tools/forge_dyes.mjs
  - content/forge/renders.json
---
# Sprite Forge

DFO Online's forge, brought over exactly ([[DFO's Sprite Forge Comes Over Exactly]]). It builds a body, its gear and
its moves in Blender and renders each as strips of pictures. The game composes a figure from the strips at run time.
The [[Test Ground]] shows them.

## What it renders

- **Bodies**: a man and a woman, with a boy and a girl for the townsfolk. Khajiit and Argonians wear bodies of their
  own; every other race is the bare body with its skin coloured as a frame is composed.
- **Layers**: 660 on the man and 666 on the woman. Clothes, armour sets, helms, hair, worn and held weapons, bows,
  staffs, shields, instruments, tools and the horse a rider sits on.
- **Moves**: 125 on each adult body. They include walking, running, fighting with each weapon, the owner's blows (an
  overhead, a side cut and a thrust in each of five holds: one hand, a haft, a long hilt, a pair, and a staff in both
  hands a forearm apart), the bow's own hold, walk and sprint, casting, dying, climbing, riding, driving a wagon's
  bench and playing each instrument. Some moves turn the body by CC0 motion: Quaternius's libraries and KayKit's clips.
- **The blows**: each captured whole from Quaternius's sword clips, the body stepping, turning and crouching into it:
  the overhead raised behind the shoulder and brought down across the body, the side cut a low lunge sweeping across
  the front, the thrust a crouched charge with the arm driven straight ahead. Both hands stay on a two-handed weapon;
  a pair's left blade holds at guard while the right strikes.
- **Actions on the move**: each blow, the bow's shot, a gun's and the braced pistols' shots, the reloads and the cast
  drawn again with the walk's hips and legs under the action's chest, which keeps the action's turn and half its lean
  (`onthemove.py`, named `over1hwalk`, `bowshotwalk`, `castwalk` and so on). The sprint's fists close thumb up, the
  wrist straight.
- **The dodge roll**: drawn by DFO for Overlook, outside its own studio, on both adult bodies and what they wear, but
  no weapon, held or worn: a weapon is not seen through a roll
  ([[DFO's Next Forge Work Comes Over, With Its Dodge Roll]]).
- **Views**: five, from the front round to the back. The other three are drawn mirrored.

The first-person frames are pictures of their own: each weapon's idle and its six strokes, the bow's draw and loose,
fists and kicks, held things, and the hands that cast, climb, run, ride and work. DFO kept them outside the studio
folder as its site's art; they are published with the rest. So are the instruments' first-person frames, and the
pictures of things the forge renders from models of its own: items, props and the light set's pieces
([[The Audit Branch's Forge Renders Come Over]]), and the material nodes a patrol gathers
(`items/nodes.py`, `items/nodeplants.py`, `specs/pictures/nodes.json`), one for each island's resource and drawn as
it: brineglass as salt cubes in a tide pool, cairn iron as rust-dark seams in a stone cairn, heartwood resin as amber
beads on an old stump, sunstone as glowing stones on sand, goldgrass seed as a clump of tall grass in seed, mistbloom as
pale flowers over low green, windthistle as purple thistles going to down, bog pearl as mussels and pearls in black
water, and rimecrystal as frost crystals on rock. Each is laid from the forge's own models of stone, ore, crystal,
amber and leaves where one fits, and each also as it looks spent, the same spot picked over and drawn at the same scale
([[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]).

Each strip is a layer in one move: a row for each view, a cell for each frame, at 62 pixels a metre. A strip may be
2304 texels wide (nine cells of 256, as a standing thrust's reach needs) and 2048 tall. Its twin, `_z`,
holds the depth of each pixel in red and green, and the part of the body (torso, arm, head, foot, weapon, drape,
horse, hair) in blue. The forge's index (`forgeLooks.json`) gives each move's cell and the root, where the feet stand.
It also holds each layer's moves, and the order, cover and under values that decide which layer shows where two meet.

The forge also draws the [[Arts]]' birds (`artbirds.py`): Dawnflare's bird of fire and Duskraven's raven, each in
four wing beats and the five views a figure is drawn in, a little from above, rendered at four times their size with
Cycles and averaged down, each texel's light weighted by its cover, as light alone for the page to colour in the
caster's element. They are published as `@art/arts/birds/<bird>-<view>-<beat>.png`.

It draws the weapons large for the weapon rows and gear screens (`weaponart.py`,
[[Weapons Are Forged Large for the Weapon Rows and Gear Screens]]): each look a loadout's hand takes, in every metal
the forge makes it in, each bow long and short, each shield buckler, round, kite and tower, plain or in a metal,
the orcish short sword and each gun plain and gilded, 145 in all, its model alone at four times the man's pixels a metre (about 250), level with its
business end to the right. Each is made, lit, graded (a bow's grip on the armour's leather, as the weapon run's) and
laid grey for its dye as the man's layer in hand is, so the page colours it as it colours that layer. They are published as `@art/weapons/<layer>.png`; a left hand's twin
(`dagger_iron_l`) is its right hand's picture.

## Where it lives

`tools/forge/` holds the forge as DFO laid it out, so its paths work unchanged: the code in `tools/sprite-forge/`, the
packer in `tools/forgeViewer/`, and the horse's sources in `src/assets/horse/`. The size, comment and assets checks
skip the folder. What it makes stays out of git ([[Generated Files Stay Out of Git]]): strips go in `public/art/studio/`,
tables in `src/systems/studioArt/`, packs in `packs/`.

`tools/forge_publish.py` publishes them to the `overlook-forge` bucket on R2 ([[Generated Files on Cloudflare R2]]):

- `publish` packs every picture as lossless WebP with DFO's `pack.py`, uploads the packs, the pack index and the
  tables, and writes `content/forge/renders.json`, which names each by its hash. WebP keeps no PNG chunks, so it first
  reads each first-person frame's place on the 320 by 200 screen (`oFFs`, `boXs`) into the `frames` table.
- `add` publishes the pictures on disk beside those already published, in packs of their own, adding them to the
  published index and frames table, so the rest need not be pulled first.
- `pull` fetches the tables back for the forge to render more. `pull --strips` also unpacks every strip as PNG.
- `roll <folder>` lays the dodge roll DFO drew outside its studio in beside the studio's strips, and its moves into
  the looks table, for `add` to publish.

The bucket is public at `pub-d12f498b9e8d40e7a180531f21e17c18.r2.dev` and lets the site and local servers read it.
Cloudflare limits how often an `r2.dev` address answers; the renders will move to a name under `daggerfalljs.dev`
([[The Forge's Renders Will Use daggerfalljs.dev]]).

## Colours

The forge renders dyeable cloth and metal in greys. They take Daggerfall's exact colours
([[The Player Plays as in DFO]]). `tools/forge_dyes.mjs` reads Daggerfall's palette once from `ART_PAL.COL` into the
`dyes` table. The table holds the palette's 256 colours, a 16-colour ramp for each of the ten clothing dyes, and one
for each of the ten metals.

A garment's grey takes its dye's ramp. Armour, its padding, shields, bows, staffs and their sheaths take their metal's.
Leather and chain take steel's; the guild sets keep their own colours, unless a dye or a faction's colour is worn,
which covers every set's armour whole by its light ([[Gear]], "Cosmetics"). A composed frame is then snapped to the
palette, nearest in OKLab with hue weighed four times light, as DFO's game does.

## Running it

Blender runs as a Python module: `pip install bpy==5.2.3` on Python 3.13, with `scipy`, `cma` and `pillow`. Run
`python3 -I tools/forge_publish.py pull --strips` first, then run the forge from `tools/forge/`, as in DFO:

```
python -I tools/sprite-forge/layers.py --body male --anims walk,idle --layers helm_iron --out public/art/studio/forge/layers
python -I tools/sprite-forge/forgepoints.py --body male
```

A layer takes its set's or metal's own grades by its name (`layers.set_of`), a pair's left twin (`_l`) and a short
sword (`_short`) their metal's as the right hand's. A strip whose inputs did not change is kept; `fanout.py` splits a large render into shards. Then
`python3 -I tools/forge_publish.py publish` uploads what changed and rewrites the manifest for a pull request.
The `forge` workflow renders the Arts' birds, the weapons drawn large and the material nodes, and adds them to what is
published with the repository's `R2_TOKEN` whenever `artbirds.py`, `weaponart.py`, the item forge's models
(`items/`, which the nodes are laid from), `itempics.py`, the nodes' rows or their pinned packages change on main, or
when a run is asked for on a branch; its log ends with the manifest, which a commit takes into `content/forge/renders.json`.
A run asked for may also draw figure strips first, for both bodies (`figures`: runs split by `;`, each `anims|layers`,
either empty for all), with a limit of 300 minutes: a cloud session holds no Cloudflare key, so this is how a figure
strip reaches R2 from one. A fresh checkout holds no strips, so every strip of each layer named is drawn.
It installs only the exact wheels `artbirds-requirements.txt` names by their hashes, and its checkout keeps no git
credential. The weapons take under a minute on four cores; `weaponart.py --check` checks their layout without
rendering.

The tools that fit the forge to Daggerfall's sprites (`fit.py`, `colour.py`, the `*Reference.mjs` readers) and the
doll and class-look tools need Daggerfall's files and DFO's game code, so they do not run here.
