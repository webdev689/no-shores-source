---
type: decision
date: 2026-11-24
status: in force
---
# The Lattice Is Shaded Darker, With Detailed Attacks and Projectile Tracers

After a playtest, the owner:

> "6. I tested the public event and all the elements were invisible. The lattice faction needs a proper shading pass
> because they are too bright and they better attack details and projectile tracers."

## What it settles

- The owner saw none of the public event's elements in the playtest ([[Public Events]]); what hid them is not found.
- The Lattice gets a proper shading pass: they read too bright ([[Lattice]]).
- The Lattice's attacks get more detail, and their projectiles tracers ([[Lattice]], [[Combat]]).
- Replaces in part [[Public Events as Claude Builds Them]] ("The Lattice at night"): a Lattice figure's bright,
  strongly hued texels are no longer lit at no less than 0.8; the figure is shaded as below.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| Where the shading is fixed | In the game's drawing of the pictures (`game/latticeShade.ts`), not by rendering the forge's pictures again | The renders are published; the game's light is where the Lattice stood out, and a change there needs no new render |
| What read too bright | The glow test lit any bright, strongly hued texel at no less than 0.8: about two fifths of the skin, four fifths of the Ravager's mantle and three quarters of the Idol's emitter, day and night | Measured on the published idle pictures |
| How dark | The whole figure at 0.78 of a man's light | Darker than the Grey Tithe beside it, still read at night |
| What still glows | A texel brighter than 0.72 with more than 0.4 between its strongest and weakest channel, never below 0.7 | Only the shards' tips and veins pass; the skin and the mantle do not |
| What a blow shows | A star of crystal growing where it comes from through the tell (the first 0.35 of the move, where the rules hold it), a cut or a rush's streak to 0.55, then a ring of shards breaking up on the ground to 0.8 | Wind-up, strike and landing, each readable, drawn from the move's frames alone |
| Each foe's cut | The Flicker's slashes on the diagonals and its overhead upright; the Ravager's maul on a diagonal; the Bulwark's sweep flat and its slam upright; the Heart's slam upright and sweep flat; the Husk's lunge and gore and the Heart's stomp a streak; a diagonal mirrored as the figure's card is | Each as its move swings in Lattice.md, seen from either side |
| A telegraphed blow's strike | Once the rules end its tell, landed or missed, the move plays on from past its tell at 1/14 s a frame (the Lattice's walk's), a missed one then held on its last frame; a feint or an aimed shot plays nothing on | The rules set the foe at rest or overreached the tick its tell ends; its strike and landing are the move's later frames |
| The Idol's beam | A burst where it lands, and its shadow lingering two frames after, thinning | A tracer that reads after the beam is gone |
| The Ravager's shards | A thread of the crystal's shadow from the hand to each shard in flight | A tracer that shows where it came from |
| The Idol's shots | Its shots (an archer's in the rules) trail 0.6 s, twice an arrow's, in its crystal's body and white-hot, a glint at the head and no steel arrow | A crystal foe's shot reads as its crystal |
