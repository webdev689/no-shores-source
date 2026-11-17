---
type: decision
date: 2026-11-17
status: in force
---
# The Sloop Is Painted, Sails the Overworld and Meets Pirates

> "Next thing I want to do is UV mapping our ship model in the editor, texturing it properly, wiring it into the
> overworld and also integrating AI ships (use dfo to integrate the ship ai). When traversing and encountering an
> enemy ship, the overworld should pan to combat mode."

The owner's answers to the questions that followed:

> How the Sloop is textured once UV-mapped and split into her parts: in the game's own procedural textures, as the
> towns are; baked in Blender; or painted by the owner: "The game's painter (Recommended)"
>
> Which AI ships sail the Overworld, approving a port of DFO's sea traffic: pirates only, from DFO's director; pirates
> and merchantmen; or DFO's factions whole: "Pirates only (Recommended)"
>
> How the view goes to combat when an enemy ship comes for the player: at once; after a warning; or after a choice
> to fight or flee: "Pan at once (Recommended)"

Of the token that publishes her to R2: "brother it's in the repo"

And after: "We need to bring the animated sails over from dfo also"

## What it settles

- **Her model.** The Sloop's `.blend` is UV-mapped and her faces sorted into her parts (hull, deck, wood, canvas,
  iron), and her mesh carries both ([[Sailing]]).
- **Her look.** Each part wears the [[Procedural Textures]] the forged towns wear, in Daggerfall's palette.
- **Her sails** move as DFO's do: filled by the wind from the side it blows, flapping in its eye, the gaff trimmed
  to leeward, and furled or set as the sails come down or go up.
- **At sea.** She is the ship the player sails on the [[Overworld]].
- **AI ships.** Pirates only, from DFO's director, trimmed: they come over the horizon round a player at sea and go
  when far off; DFO's captain, already ported ([[Naval Combat]]), decides whom each fights
  ([[Pick - Sailing and Naval Combat]]).
- **The encounter.** Once a pirate that means to fight comes within sight, the Overworld pans down to the Sloop at
  true scale and the fight begins; when it ends, the view pans back up.
