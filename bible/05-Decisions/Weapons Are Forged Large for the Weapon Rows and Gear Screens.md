---
type: decision
date: 2026-11-21
status: in force
---
# Weapons Are Forged Large for the Weapon Rows and Gear Screens

> "Also for the ui elements that show your melee/ranged. The sprites for them need a detailed pass"

Asked how, the owner chose "Forge renders large": the forge renders each weapon again in Blender at three to four
times the pixels, only for the HUD's weapon rows and the gear screens, each item keeping its own look in fine detail.
Asked how a loadout of two things (a sword and shield, a pair of daggers or maces, two Pistolets) should look, the
owner chose "Both, overlapped": the main weapon large and level, the shield or second weapon drawn behind it at its
left, a little smaller, as one picture. Asked about the greatsword, which has no model of its own, the owner chose
"Sword's picture for now". Asked whether to snap the pictures to Daggerfall's 256 colours as the figures are, the
owner chose "Daggerfall palette": a weapon in the row matches the one in hand, with far more pixels.

Shown the large pictures, the owner wrote:

> "Fucking gorgeous. Also if the weapon had an element, include the glyph in its frame"

## What it settles

- The [[Sprite Forge]] renders every weapon and shield a loadout's hands take, alone, larger than the figure's layer
  in hand, and publishes them with the forge workflow.
- The weapon rows and the gear screens ([[Interface]]) draw a loadout from those pictures: the right hand's level,
  the left hand's shield or second weapon behind it at its left, a little smaller.
- A greatsword shows its metal's sword.
- Each picture is coloured as the figure's layer is and snapped to Daggerfall's palette.
- A weapon with an element bears its glyph in its frame in the weapon rows, as a gear tile does.

## Claude's calls

| Choice | Chosen | Why |
|---|---|---|
| Size | Four times the man's pixels a metre (about 250) | The top of the owner's three to four; a sword is about 300 pixels long |
| Which pictures | Every metal of each look a loadout's hand takes: the sword, dagger, mace, flail, warhammer, battleaxe, staff, long bow and buckler in all ten metals, the plain buckler, the six crossbows, and the gilded Pistolet and Thunderlock: 99. A left hand's twin is its right hand's picture | Every look the gear reaches today, and each metal it may reach, in under a minute of rendering |
| How each is seen | Square from the front, level, its point, head or muzzle to the right; a sword and an axe at the man's proportions; an axe's broad bit and a hammer's face below; a flail's chain hanging straight down; a bow braced and strung, its string below its arc; a crossbow tipped 35 degrees toward the eye, so its prod shows; a gun's lock side, its grip below; a shield face on | Each reads at a glance in a long low row |
| Colours | The figure's own grades and dye greys, worked as its layer in hand is; the page lays the same metal, dye and faction ramps on them and snaps the result to the palette | So a picture matches the weapon in hand |
| The second in a pair | Three quarters of its size, averaged down, its middle on the main weapon's top edge a fifth of the way along it, behind it | Both pieces show, the shield behind the hilt and a pair's second standing out to the left |
| Fitting a picture larger than its place | Shrunk by an area average: each screen pixel is the mean of the picture's pixels it covers, by how much of each; a large picture is then cut at half cover and snapped to the palette again, so what shows keeps to it, and drawn as that leaves it. One long and thin on a tile's diagonal is shrunk first, then turned once | A smooth resize blurs a detail across pixels it does not touch; this keeps each where it is |
| Before they are published | The figure's cut-out, as before, unless every piece in hand has its large picture | Nothing breaks before the workflow publishes, and no loadout is half of each |
| The workflow | Renders them beside the Arts' birds; SciPy joins its pinned packages | The figure's dye greys are laid by a step that needs it |
