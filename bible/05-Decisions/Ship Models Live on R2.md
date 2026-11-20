---
type: decision
date: 2026-11-16
status: in force
---
# Ship Models Live on R2

> Asked where the Sloop's `.blend` should live (on R2 beside its mesh, as git bans `.blend` files and it is over the
> 1 MB limit, though the rule keeps sources in git): "Your choice"

> Asked whether to name its cannons "Cannon" in its `.blend`, so the export can find them for naval combat: "Your
> choice"

## What it settles

The owner left both to Claude, who chose:

- A ship's hand-made model, its `.blend`, lives on R2 beside its mesh, under its hash, named in
  `content/ships/ships.json`. This is an exception to [[Generated Files Stay Out of Git]]'s "git holds the sources".
- A ship's cannons are the objects named `Cannon` in its model: `Cannon.Port.1` to `.3` and `Cannon.Starboard.1` to
  `.3`, fore to aft. The Sloop's are named so in the source now published; the owner's upload stays on R2 as it was.
