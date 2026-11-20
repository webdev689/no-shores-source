---
type: system
status: planned
code:
  - tools/lattice/render.py#foe_layers
  - tools/lattice/growth.py#grow
  - tools/lattice/growth.py#veins
  - tools/lattice/motion.py#summed
  - tools/lattice/husk.py
  - tools/lattice/husk_moves.py
  - tools/lattice/flicker.py
  - tools/lattice/flicker_moves.py
  - tools/lattice/idol.py
  - tools/lattice/idol_moves.py
  - tools/lattice/ravager.py
  - tools/lattice/ravager_moves.py
  - tools/lattice/bulwark.py
  - tools/lattice/bulwark_moves.py
  - tools/lattice/heart.py
  - tools/lattice/heart_moves.py
---
# Lattice

The Lattice's six foes drawn by the [[Sprite Forge]], each with its look and its own moves, as pictures the game will
compose as it composes any figure ([[The Lattice Are the Ruined Ports' People, Overtaken]],
[[The Lattice as Claude Shapes It]]). Drawn, not yet in the game.

## How it works

- **One entry point.** `render.py` runs the forge's own render (`layers.main`) for one foe, without changing anything
  in `tools/forge/`: it gives the foe a body of its own, made as the forge makes a child's from the man's with shape
  factors, registers the foe's moves before the forge loads its body, and swaps in a builder that returns the foe's
  layers. The forge's index and keys go to the output folder.
- **A foe's module** (`husk.py` and the rest) gives its make, its clothes from the forge's wardrobe, where its crystal
  grows, what of its body the crystal ate (`reshape`), its own parts and its moves (`<foe>_moves.py`).
- **The growth** (`growth.py`) is shared: shards in clusters on the skin, each dark at its root and bright toward its
  point; a torn wound round each; torn flesh, blood run down the skin and spattered; and veins creeping from every
  wound. Flesh, blood and veins are shells of the skin, so they bend with the body as the forge's own face paint does.
- **The layers.** Each foe draws its body; its clothes; `lattice_<foe>`, its crystal; `lattice_<foe>_gore`, its flesh
  and blood, drawn over any cloth so the cloth looks torn and soaked; `lattice_<foe>_veins`, under any cloth; and one
  layer for each of its own parts, for the game to show or take away: the Flicker's two blades, the Idol's emitter,
  the Ravager's hood, blades and the shards it throws, the Bulwark's head, shield and maul, the Heart's fused people,
  heart, anchor and the person it tears out of itself.
- **The moves** are poses a frame, as the forge's own cast is: rotations summed in layers over a base, keys eased
  through, a seeded tremor (the same each time it is drawn), and the forge's arm solver laying wrists and hands
  (`motion.py`). Feet stand flat on the ground: in a crouch both are laid down by the forge's leg solver and the hips
  sink where a leg cannot reach; a walk plants the foot bearing its weight. Every attack holds a frame or more before
  it lands, its tell, and starts and ends in the foe's idle stance. `<foe>_still` is a one-frame still of its first
  move, to judge its look by.
- **Sizes.** The Bulwark is drawn at 1.2 times a man and the Heart at 3 times, each on a larger work frame. Every
  move has rows under the ground for what it brings down before its feet (a maul's head, an anchor's crown).

```
python -I ../lattice/render.py --enemy husk --anims husk_walk,husk_lunge,husk_gore --out <folder>
```

Run from `tools/forge/` with Blender's module, as the forge runs ([[Sprite Forge]], "Running it").

## Limits

- Not yet in the game: the faction, the foes' numbers and blows, and their places in the world are not built, and the
  pictures are not on R2.
- The body's skin is coloured by the game as it composes a frame; the ashen skin each foe needs is not chosen yet.
- Left for the game to draw, since a picture's light cannot change from frame to frame: the Idol's beam and its
  lens's glow growing through the charge, the Bulwark's core flaring before it discharges, the shards the Ravager
  throws, a blink's dissolve. It also shows a part's layer only in the frames it belongs to: the Ravager's shards
  until each throw, the shield before the change and the maul after it, the person the Heart tears out from the grip
  to the fling.
- The wardrobe asks DFO's game code what may be worn under each garment, and that code is not in this repository:
  `render.py` answers it from the foe's fixed outfit.
- A render takes from minutes (the Husk) to most of an hour (the Heart), and does not survive the session going idle.
