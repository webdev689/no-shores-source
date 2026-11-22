---
type: decision
date: 2026-11-21
status: in force
---
# Vestiges Are project-final's Crystals, and Physical Pictures Are Baked

> "Should we replace all code inventory art with blender models baked to sprites?"

Told that gear and weapons already come from the forge; that the things drawn in code are the gear screens' glyphs
(Aurem, fragments, Essence, the Fruit of Dagon, the island resources, the Vestige, the Ammo box and crate), the ship's
glyphs (materials, modules, officers' posts), status icons, element glyphs and node marks; and Claude's recommendation
to bake the physical things (the island resources, the Ammo box and crate, the Vestige and the ship's modules) and keep
the symbols (currencies, elements, statuses, nodes and the Arts' emblems) as code, the owner answered:

> "Lets do your recommendations plus bring over the sprites and drop system from project-final.
>
> In that project the vestiges could be the crystals that hover and rotate"

Asked what becomes of the line of light that rises over a drop at rest, the owner chose "Keep line + glow". Asked which
colours the crystals take, after project-final's white, green, blue, purple and red and Overlook's rarities: "white,
green, yellow, red, Cyan Blue". Asked whether the Ammo box and crate are Blender bakes or project-final's ammo bricks,
the owner chose "Blender bakes". Asked whether project-final's cache chest or its Bits shard comes too: "Neither".

Then, asked what changes now that a Magic crystal is green under Overlook's blue Magic, the owner chose "Recolour
rarities": Magic becomes green and Legendary red everywhere. Asked whether the ship's four materials (timber, canvas,
iron, heartwood) are baked too: "Bake them too". Asked whether bringing over project-final's sprites meant more than
its drop sprites (its enemies, projectiles and first-person gun): "Drop sprites only".

Asked where the Blender bakes live, rows of pixel letters in a source file as the ship's glyphs are or R2 as the rule
says, the owner chose the first: "#1, also should we stop using R2 or keep using it?"

## What it settles

- **A Vestige is project-final's loot crystal**, hovering and turning, on the ground and in the gear screens
  ([[Gear]], "Drops"; [[Pick - project-final Drops]]).
- **Drops move as project-final's loot does**: popped out of the body, bouncing until they settle, then rising to hover.
- **The rarity line stays**, rising over the crystal's glow.
- **The crystals' colours**, Normal to Atheric: white, green, yellow, red, cyan blue.
- **The rarities are recoloured to match**: Magic green and Legendary red everywhere, in frames, cards, pips and lines;
  Normal, Rare and Atheric keep theirs ([[Gear and Power Follow Destiny 1 Vanilla]], [[Interface]], "Rarity").
- **The island resources, the Ammo box and crate, and the ship's modules and materials become Blender models baked
  to sprites.** The officers' posts stay drawn in code ([[Item Pictures]]).
- **The bakes are written into the client as rows of pixel letters**, kept in git as the ship's glyphs are: an
  exception to [[Generated Files Stay Out of Git]].
- **Currencies, elements, statuses, nodes and the Arts' emblems stay drawn in code.**
- **Only project-final's drop sprites come over**: not its cache chest, its Bits shard, its enemies, its projectiles
  or its first-person gun.
