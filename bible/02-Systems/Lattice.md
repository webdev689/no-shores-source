---
type: system
status: live
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
  - tools/lattice/armoury.py
  - tools/lattice/wave.py
  - tools/lattice/props.py
  - tools/lattice/jobs.py
  - tools/forge_publish.py#lattice
  - client/src/combat/lattice.ts#latticeMove
  - client/src/combat/lattice.ts#blowPlayedOn
  - client/src/combat/lattice.ts#latticeHidden
  - client/src/combat/latticeLooks.ts#LatticeWaves
  - client/src/combat/latticeLooks.ts#layLatticeLooks
  - client/src/combat/latticeLooks.ts#sealWave
  - client/src/combat/latticeStrikes.ts#layLatticeStrike
  - client/src/combat/tracers.ts#LatticeOf
  - client/src/game/latticeShade.ts#latticeLit
  - client/src/combat/crownLife.ts#crownState
  - tools/modules/crown.py#crown
  - client/src/player/foeDress.ts#CLOTHES
---
# Lattice

The Lattice's six foes drawn by the [[Sprite Forge]], each with its look and its own moves, as pictures the game will
compose as it composes any figure ([[The Lattice Are the Ruined Ports' People, Overtaken]],
[[The Lattice as Claude Shapes It]]). The game draws them from their published pictures: the `lattice` workflow has
rendered and published the five foes the [[Public Events]] use and the death wave; the Heart waits
([[Public Events as Claude Builds Them]]).

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
- **Struck and killed.** Every foe flinches (`<foe>_hurt`, four frames) and staggers (`<foe>_stagger`, eight, a step
  back; the Heart down on one knee, set on it as the forge sets a body down, `poses.py` `grounded_body`). None dies on
  its own: a foe killed disperses in one wave of crystallized energy for all (`wave.py`), a burst of light where it
  stood, its figure gone to crystal and flung up and out, a ring of shards rushing out along the ground on a band of
  light, then gone. It is drawn once at a man's size from one side, as a brightness map, as the forge draws the Arts'
  birds; the game tints it in the foe's crystal and scales it to the foe as it fades the foe's figure.
  `python -I ../lattice/wave.py --out <folder>`.
- **The Lattice's armour** (`armoury.py`), in Daedric's place
  ([[The Lattice's Armour and Weapons Take Daedric's Place]]): a set registered beside the forge's own, every piece
  its own make, built from the forge's armour kit (its bands, plates, blades, cuffs and helm shells), so it is graded
  and shaded as every set is. Its crystal is drawn grey and graded red, purple in its shadows; every plate's edge is
  rolled in the seam's own light, purple. `python -I ../lattice/armoury.py --body male --anims idle --out <folder>`.
- **Its props** (`props.py`), for the places it corrupts and for world events
  ([[The Lattice Has Props of Its Own, Made in Blender]]): each built in Blender at the origin, in metres, in either
  crystal, from the same shards its foes are grown with, on its own patch of blackened ground crusted with crystal.
  Crystal growths (the blighted ground alone, a spire, a cluster, a vein); the ports' things overtaken (a crusted
  rock, a crate, a barrel, a cart, a wall, a lamppost, a boat); its own structures (a nest, a pylon, a shrine); and
  what an event leaves (a fissure, a crater). `python -I ../lattice/props.py --out <folder> [--props spire,crate]
  [--strain red]` draws a picture of each.
- **Its public event**, the Fissure ([[Public Events Run on a Clock, After Destiny 1]], [[Public Events]]): the
  Lattice pours out of a crack in each of Saltmere's wilds on the clock.
- **Sizes.** The Bulwark is drawn at 1.2 times a man and the Heart at 3 times, each on a larger work frame. Every
  move has rows under the ground for what it brings down before its feet (a maul's head, an anchor's crown).

```
python -I ../lattice/render.py --enemy husk --anims husk_walk,husk_lunge,husk_gore --out <folder>
```

Run from `tools/forge/` with Blender's module, as the forge runs ([[Sprite Forge]], "Running it"). The `lattice`
workflow renders every move of every foe and the wave this way, a job a move, and publishes them ([[Sprite Forge]]).

## In the game

- **Types and dress.** `foeDress.ts` dresses types 39 Husk, 40 Flicker, 41 Idol, 42 Ravager, 43 Bulwark and 44 the
  Heart, the numbers the public events give them for the rules' roster, each on its own body in the cloth it still wears, dyed, then its crystal, gore, veins and
  own parts. Their skin is published with their bodies, the man's in the ashen grey-green of the dead, whatever tone
  is asked. 45 the Tithe-Taker, a Grey Tithe officer, wears the forge's own pieces.
- **Moves.** `lattice.ts` `latticeMove` plays each foe's own moves in the man's place: the Husk lunges at a thrust
  and gores at any other blow; the Flicker slashes left and right in turn and brings both blades down; the Idol
  charges as it draws and fires its beam; the Ravager hurls its shards as it shoots and mauls up close; the Bulwark
  discharges its shield, and once changed (its second phase, or half its health; the change played once) sweeps and
  slams its maul; the Heart slams, sweeps, stomps and tears. A telegraphed blow holds in its tell (the first 0.35 of
  the move) while the rules hold it; once they end it, landed or missed, `blowPlayedOn` plays the move on from past
  its tell at 1/14 s a frame, a missed one then held on its last frame while the foe is open. A feint or an aimed
  shot plays nothing on. The Flicker and the Idol never walk: the rules' dodge is a blink, out through their landing backwards and in through it.
- **Its parts.** `latticeHidden` takes away the Ravager's shards from its first throw to its hurl's end, the
  Bulwark's maul until it changes and its shield from then, and the Heart's torn one but from its grip to its fling.
- **What the game draws over the pictures** (`latticeLooks.ts`): the Idol's lens glowing through its charge, its
  beam to the chest it aims at with a burst where it lands, and the beam's shadow lingering two frames after, thinning;
  the Bulwark's core flaring through its discharge's tell, then its burst; each shard the Ravager throws, from
  alternate hands, a thread of its crystal's shadow trailing back to the hand; and the blink's dissolve, in the
  purple.
- **Its blows** (`latticeStrikes.ts`), each in the foe's crystal and at its size, by the share of the move played:
  through the tell (its first 0.35) a star of crystal grows where the blow comes from; the strike (to 0.55) is a cut
  across it (the Flicker's slashes left and right and its overhead, the Ravager's maul, the Bulwark's sweep and slam,
  the Heart's slam and sweep; a diagonal one mirrored as the figure's card is) or a rush's streak behind it (the Husk's lunge and gore, the Heart's stomp); then (to
  0.8) a ring of shards on the ground where it lands, widening and breaking up, a flash at its heart.
- **Its shots** (`tracers.ts`): the Idol's shots, an archer's in the rules, fly as its crystal, not as steel arrows: a
  trail twice an arrow's in its crystal's body and white-hot, its head a glint (`FightEffects` asks each shooter's
  type).
- **The death wave.** A Lattice foe killed bursts at once in its wave, tinted in its crystal (red graded purple, or
  the purple) and scaled to its size, as its figure fades; `sealWave` bursts the same wave four times a man's size
  for the Fissure to call where it is sealed.
- **Shaded darker** ([[The Lattice Is Shaded Darker, With Detailed Attacks and Projectile Tracers]]): a Lattice
  figure takes 0.78 of the light a man's picture takes, day and night, its skin, cloth, gore and mantle sitting in the
  light round them; only its crystal's bright points (a texel brighter than 0.72 and more than 0.4 between its
  strongest and weakest channel: the shards' tips and the veins) glow of themselves, never lit below 0.7
  (`game/latticeShade.ts`, drawn by `game/figureView.ts`).
- **The ruined cities** are overtaken by its crystal, drawn by code in the city's crystal material: the landmark
  crowned, the buildings, heaps, rubble and wrecks grown through ([[Cities]], "Overtaken by the Lattice").
- **Its coming** ([[Some Foes Stand Already, Others Arrive by the Tithe's Airships and the Lattice's Crystal]],
  [[Enemies]], "Arrivals"): its foes form under a crown of its crystal, the `lattice-crown` module ([[Modules]]), built
  from the same shards its foes are grown with. The crown grows out of its heart 6.4 m over the ground, its crystal
  drawn in out of the air; each foe forms under it from the head down, its cells landing in its crystal, a thread of
  the crown's light down to it and a ring round its feet; the crown holds a moment, cracks and breaks in its wave,
  twice a man's size, its shards falling and sinking into the ground (`arrivalsView.ts`, `crownLife.ts`). One of its
  own a great foe calls forms where it stands, in its crystal.
- **Before the pictures are published** a Lattice foe is drawn as a plain man in grey and brown at its size, and dies
  in its fade alone.

## Limits

- The Heart's pictures are not published: the first run rendered only the five foes the events use. A push to a
  branch other than `main` that names it in `tools/lattice/render-request.txt` renders it.
- Where its foes appear (the Fissure) and their numbers are the rules' ([[Public Events as Claude Builds Them]]).
- The Lattice's armour is on hold, drawn standing still on the man's and the woman's bodies only; its every move,
  first person and its weapons and shields are not yet drawn, and the game still names Daedric.
- The props are pictures only, not placed in the world, except what the public events draw ([[Modules]]): the
  Fissure, its scar, the growth and the shard are meshes built from the props' own shards, clusters, crusts and
  boulders.
- The Tithe-Taker holds no ledger: the forge has no ledger to give him.
- The figures' shading and glow at night and the seal's wave are drawn, but no picture of them at night in the game
  has been looked at, only the published pictures lit by the same sums ([[Public Events]], "Limits").
- The Idol's beam and the Ravager's shards are drawn along the foe's facing when it aims at no fighter the page
  knows; the Heart's moves are drawn but it is in no event.
- The wardrobe asks DFO's game code what may be worn under each garment, and that code is not in this repository:
  `render.py` answers it from the foe's fixed outfit.
- A move is the finest the forge's render splits: `--views` draws views only beside a move's strips already drawn. On
  four cores at 32 samples the Husk's four-frame flinch takes about two minutes and the wave six seconds; a move of
  the Heart's takes far longer.
