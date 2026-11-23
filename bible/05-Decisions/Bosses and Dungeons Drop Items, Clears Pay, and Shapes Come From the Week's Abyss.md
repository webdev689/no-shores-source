---
type: decision
date: 2026-11-22
status: in force
---
# Bosses and Dungeons Drop Items, Clears Pay, and Shapes Come From the Week's Abyss

> "Do an audit on this. Ensure its perfect"

The audit was of [[The Balance Pass Goes Halfway Back, and Loot Follows Destiny 1's Order]]. Its findings were put to
the owner.

> Told that at the top ranks the colours were only just in order (a Boss's Normal 300, Magic 280, Rare 250 in 1,000),
> and asked whether each colour should be far rarer than the one below: "Each half or less (Recommended)", the option
> that read: "Minor 750/188/47/12/3 … Boss 516/258/129/65/32 per 1,000. A Boss gives Legendary-or-better about 10% of
> the time (17% as built). The order holds after opening at every rank."

> Told that each deck crew kill rolled its own Vestige beside the ship's and the hold's, and asked whether the crew
> should drop Vestiges: "Hold only (Recommended)", the option that read: "Crew kills still pay XP and Aurem; the ship's
> roll and the hold's roll are the boarding's loot."

> Asked how long before a Boss or a Miniboss stands again: "10 minutes (Recommended)", the option that read: "Lesser
> groups keep 120 s."

> Told that a world boss's clear paid less XP and Aurem than a mission's or a dungeon's, and asked how the content's
> order should be kept: "Clear bonus by node?"; then, shown the bonus (a mission +1,000 XP and 75 Aurem at level 20, a
> dungeon +2,000 and 150, a world boss +4,000 and 300): "Dungeon completions, boss kills, certain things should drop
> actual weapons/armor. It doesnt all have to be a vestige"

> Asked which should drop actual weapons or armour rather than a sealed Vestige: "Dungeon completion, World boss kill,
> Every Boss kill, Miniboss kill, Vestiges still also have a chance". Asked whether such a drop is an item instead of
> the Vestige or both: "Chance of both". Asked how often: "Boss sure, Miniboss 35% (Recommended)", the option that read:
> "Boss kill: an item always, and its Vestige always. Miniboss kill: an item 35%, a Vestige 35% (both about 1 time in
> 8). Dungeon completion: an item always, coloured as its Miniboss's, and a Vestige 35%. Abyss and Elite raise each
> chance as they raise a kill's."

> Asked whether clears should also pay bonus XP and Aurem so a world boss's clear pays more than a dungeon's or a
> mission's: "Yes, bonus XP and Aurem (Recommended)"

> Told that one cove's wreck held about what a whole Minor ship spills, and asked to fix it: "Below a Minor ship
> (Recommended)", the option that read: "A cove wreck holds 2 common materials of 1–3, Heartwood 5%, a module 8%,
> coloured as a Minor's."

> Told that Shapes fell from any kill at Elite and Abyss and bought about 10 Legendaries an hour in an Abyss dungeon:
> "Shapes should only come from abyss weekly content"; told there was none yet: "There is weekly content"

> Asked whether fights on foot on a boarded deck take the land's blows or the last pass's: "Land's ×1.5 / ×0.75
> (Recommended)"

## What it settles

- At every rank each colour of a Vestige is half or less of the one below it.
- A deck's crew drop no Vestige; the ship's drop and its hold's are the boarding's loot. Their kills still pay XP and
  Aurem.
- A Boss or a Miniboss stands again 10 minutes after its group falls; lesser groups after 120 s.
- A Boss's kill leaves an item, not sealed, and a Vestige, each always. A Miniboss's leaves an item 35% of the time and
  a Vestige 35%, each by its own roll. A dungeon's completion leaves an item, coloured as its Miniboss's, and a
  Vestige 35% of the time. Elite and Abyss raise each chance as they raise a kill's.
- A cleared mission, dungeon or world boss pays bonus XP and Aurem, a world boss's the most.
- A cove's wreck holds less than a Minor ship's whole lot.
- Shapes come only from the weekly Abyss content ([[Dailies and Weeklies Follow Destiny 1, With One Abyss Dungeon a
  Week]]); no kill gives any.
- A fight on foot on a boarded deck takes the land's ×1.5 and ×0.75.

## Claude's calls

- **The colours**, in 1,000, Normal to Atheric: Minor 750, 188, 47, 12, 3; Major 716, 204, 58, 17, 5; Elite 670, 223,
  74, 25, 8; Miniboss 606, 242, 97, 39, 16; Boss 517, 258, 129, 64, 32. The Boss row is the option's with one Legendary
  moved to Normal, so every colour is half or less of the one below, as the owner chose.
- **An item, not sealed,** is made as an opened Vestige's would be: coloured by its source's row, opened by the same
  odds, for any slot, at its source's level. It goes into the slot's nine, else the vault; with both full it is laid
  as a Vestige of its colour, so nothing found is lost. Items and Vestiges roll on dice apart.
- **A chance past one** gives one drop sure and another by what is over, so Elite and Abyss raise a Boss's sure drops
  too: one and a half at Elite, two at Abyss.
- **What else the tier raises**: a ship's salvage (its Heartwood and module chances) and an officer joining from a won
  deck, as the owner's "Abyss > Elite > Normal" asked everywhere. Ammunition does not change by the tier.
- **The clear** pays once every group of the garrison is down at once, no wave standing, each player who shared a kill
  of it since its last clear and is still in the room, at the garrison's highest level. It pays once until a group
  stands again. At level 5: a mission 400 XP and 30 Aurem, a dungeon 800 and 60, a world boss 1,600 and 120, times
  (5 + level) ÷ 10 and the tier, as a kill.
- **Shapes from the week's Abyss**: its Abyss Dungeon's first clear each week pays 15, enough for one of Shape's
  Atheric pieces or two Legendary a week (`clears::ABYSS_SHAPES`). The activities had paid Shapes from kills at the
  Elite and Abyss seas instead; those are gone.

  Replaced in part by [[The Balance and Economy Pass as Claude Shapes It]]: 10 Shapes, a Legendary a week and an
  Atheric's armour or weapon in one and a half or two and a half weeks.
- **A dungeon's cache** pays the dungeon's completion: its clear's XP and Aurem, an item and a Vestige one time in
  three, where the activities' cache gave a sure Vestige in its Reeve's colours. A dungeon's garrison on an island's
  node, which has no cache, pays the same clear as its groups all fall.
- **The dungeon of the day** pays a Boss Captain's kill at the run's level, where it paid the Captain's flat 2,000 XP
  and 120 Aurem, and its sure Vestige takes a Boss's colours, which may be Normal: the order holds there too.
- **The fight with every rank, measured** (`measure_blows`, an ignored test in `gear_tests.rs`): a Miniboss Captain
  falls in 27 blows (44.8 s) and fells a player who never guards in 15.4 s; Thule in 47 blows (91.8 s) and 12.5 s.
