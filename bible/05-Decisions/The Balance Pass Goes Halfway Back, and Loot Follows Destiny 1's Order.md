---
type: decision
date: 2026-11-21
status: in force
---
# The Balance Pass Goes Halfway Back, and Loot Follows Destiny 1's Order

> "1. We recently adjusted balance and I want to tone it back because it was overtuned
>
> 2. Vestige drops are WAY too common. And the hierarchy needs to be strictly followed
>
> 3. Do a comprehensive balance and drop rate pass on everything including currencies"

> Asked how far back [[The Whole Game Gets a Balance Pass]]'s ×2 and ×0.5 should go: "Halfway, land only
> (Recommended)", the option that read: "Player blows ×1.5, foe blows ×0.75. [...] Sea stays as is."

> Asked which hierarchy drops must strictly follow (rarity, foe rank, content or difficulty): "How does destiny 1
> vanilla do it"

> Asked how rare Vestiges should be: "By rank, sure only from Boss (Recommended)", the option that read: "Minor 2%,
> Major 4%, Elite 10%, Miniboss 35%, Boss 100%. At sea, one roll per ship at its rank, and a boarded hold rolls one
> rank up. Colour tables run strictly downward: Normal most often, Atheric least."

> Asked what the pass should do for currencies: "Pay by rank, fix inversions (Recommended)", the option that read: "A
> kill's XP and Aurem are its role's amount × its rank's health factor (Minor 0.6, Major 1, Elite 2.2, Miniboss 4,
> Boss 7), so pay matches effort. The Captain role's flat 2,000 XP goes. Inversions get fixed [...]. Spend costs stay."

> Told that Destiny 1 at launch opened a Legendary engram to Legendary about one time in three, that its patch 1.0.2
> opened every engram at its own colour or better, and that the owner had decided a Vestige can open below its own
> colour: "Own colour mostly, can open below (Recommended)", the option that read: "Keeps your earlier decision. A
> Vestige opens to its own colour about 75% of the time, below it about 20%, and above it about 5%."

> Asked whether the pass should follow Destiny 1's whole hierarchy, rank (a higher rank drops more and better), rarity
> (each colour far rarer than the one below), content (Mission < Dungeon < World boss) and difficulty (Abyss > Elite >
> Normal, including deck fights): "Yes, all four (Recommended)", the option that read: "Every source follows all four
> orders, with your Vestige rates by rank (Minor 2% up to Boss 100%)."

## What it settles

- On land, a player's blow on a foe strikes ×1.5 and a foe's on a player ×0.75, halfway back from ×2 and ×0.5. Sea
  fights stay as they are.
- Loot follows Destiny 1's order in four ways: by rank, a higher rank dropping more often and better; by rarity, each
  colour rarer than the one below it; by content, Patrol, Mission, Dungeon and World boss in turn, and at sea a Minor
  ship up to a Miniboss; by difficulty, Normal, Elite and Abyss in turn everywhere, deck fights included.
- A kill leaves a Vestige by the foe's rank: Minor 2 in 100, Major 4, Elite 10, Miniboss 35, a Boss always. At sea a
  ship rolls once at its rank, and a boarded hold once a rank up.
- A Vestige opens to its own colour about three times in four, below it about one time in five, above it about one in
  twenty. It can still open below its colour ([[Gear and Power Follow Destiny 1 Vanilla]]).
- A kill's XP and Aurem go by its rank, and the Captain's flat 2,000 XP is gone. Where a rarer or higher source paid
  less than a lower one, it is fixed. What things cost stays.

## Destiny 1 vanilla, as found

- Any enemy could drop an engram, Majors and Ultras more often; players counted about one Rare in 200 kills of
  ordinary enemies and a Legendary in 1,000 to 2,500 (community tallies, not Bungie's numbers).
- At launch a Legendary engram opened Legendary about one time in three; patch 1.0.2 (30 September 2014) made every
  engram open at its own colour or better.
- The best loot came from strikes, raids and their bosses.

## Claude's calls

- **The colours by rank**, in 1,000, Normal, Magic, Rare, Legendary, Atheric: Minor 720, 230, 45, 5, 0; Major 640,
  280, 70, 10, 0; Elite 520, 320, 130, 28, 2; Miniboss 400, 330, 200, 60, 10; Boss 300, 280, 250, 135, 35. Each row
  falls from Normal to Atheric, and each better colour rises from Minor to Boss. A Boss's sure Vestige is a Normal
  three times in ten: "strictly followed" holds at every rank.
- **The level's gate** (Legendary from level 18, Atheric from 20) strikes the colours too good for a level out rather
  than folding them into the next colour down, which would have made Rare likelier than Magic from a low Boss.
- **What a Vestige opens to**, in 100: Normal 95 Normal, 5 Magic; Magic 20, 75, 5; Rare 20 Magic, 75, 5 Legendary;
  Legendary 20 Rare, 75, 5 Atheric; Atheric 20 Legendary, 80. From every rank, the items that come out keep each colour
  rarer than the one below (`vestige_tests.rs`).
- **The kinds' pay** narrowed so a higher rank always pays more whatever the kinds, as Major at level 5: Skirmisher
  80 XP and 7 Aurem, Archer 85 and 7, Swordsman 95 and 8, Brute 110 and 9, Captain 120 and 10. Read with the owner's
  option alone, an Elite Marksman would have paid less than a Major Enforcer. A Boss at level 5 now pays 840 XP, where
  Corvane and every Captain paid 2,000; an Elite Reeve 264.
- **A ship's drop.** The first piece laid for each player holds the ship's one kill's drop (its Vestige, Ammo box and,
  from a Miniboss or a Boss, Ammo crate); every piece holds its salvage. Before, each piece was a kill of its own: six
  sure Vestiges and six Ammo crates from a Miniboss ship.
- **Modules' colours** follow the same rows by the rank of their source: a piece its ship's, a chest the rank it is
  rolled at, a cove's wreckage a Major's, an isle's an Elite's, a Breach's a Boss's.
- **Essence.** A dismantled Atheric gives 3 Essence, where a Legendary gives 2 or 3, so the rarer never gives less.
- **The difficulty everywhere.** A boarded deck's room takes the sea's tier, and a sinking's XP is raised by it, as a
  kill on land is.
- **Measured and left.** A cove's wreckage seemed to beat a piece of any ship, but by the whole find it holds about a
  Minor ship's lot and an isle's about a Major's, below an Elite's, so it is left.
