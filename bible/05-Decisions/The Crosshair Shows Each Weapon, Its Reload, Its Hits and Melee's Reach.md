---
type: decision
date: 2026-11-21
status: in force
---
# The Crosshair Shows Each Weapon, Its Reload, Its Hits and Melee's Reach

> "Can we integrate/detail the crosshair more? A reload indicator, maybe something for melee?"

Asked how a reload should show, the owner chose "Ring fills": the crosshair dims and a thin ring round it fills over
the reload, where a bow's draw rings it. Asked what melee should get, the owner chose "Reach reticle": a small centre
reticle while a melee weapon is drawn, closing into brackets in the foe's colour while the foe under it is within the
weapon's reach. Asked what more the ranged crosshair should show, the owner chose all three offered: "Red on a foe",
"Hit markers" (white for a hit, gold for a crit, red for a kill) and "Shape per weapon" (a bow a chevron, a crossbow
brackets, a pistolet a dot with four ticks, a thunderlock a circle).

## What it settles

- A reload rings the crosshair as it runs, the crosshair dimmed under it ([[Test Ground]], "The crosshair").
- With a melee weapon drawn, a small reticle marks the middle, closing into brackets in the foe's colour over a foe
  in reach.
- The ranged crosshair turns red on a foe, marks a shot that lands, and takes its weapon's own shape.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| The reload ring's colour | White, the bow's draw ring staying gold | Told apart from a draw at a glance |
| The marks | Only for the player's own shots, a quarter of a second each, fading; the strongest of a frame's (a kill, then a crit, then a hit) | The owner's "when your shot lands"; a melee blow has its own feel |
| A hit | One that harms, a shield's too; none for a blow blocked or one that harms nothing | A mark says the shot did something |
| The foe's colour | The display's own red, as a foe's alert and the arrows to it are drawn | One red for a foe across the display |
| On a foe | Where the plates' cone takes a foe under the crosshair, within the plates' 60 m | One answer to "which foe is under it" for the plate and the crosshair |
| Reach | The longest of the weapon's six strokes, centre to centre, as the rules measure a player's | The bracket says a swing can land |
| The melee reticle | In either view, bare fists too; never red out of reach, and no marks on it | The owner's "while melee is drawn" |
| Sizes | Every reticle in the crosshair's 22 px, lines 2 px, the ring where the draw's stands | The crosshair keeps its place and weight |

Links: [[Test Ground]], [[Interface]], [[Ranged Weapons Aim and Fire]], [[Combat]].
