---
type: decision
date: 2026-11-23
status: in force
---
# The Balance and Economy Pass as Claude Shapes It

Claude's calls under [[The Balance and Economy Pass Is Claude's, After Destiny 1 Vanilla]]. Each follows Destiny 1 at
launch where its numbers are known; where Overlook has no such thing, or Destiny's number is not known, the reason
says so. The owner can change any of them. The owner's own decisions stand as they were: the land's ×1.5 and ×0.75
([[The Balance Pass Goes Halfway Back, and Loot Follows Destiny 1's Order]]), the Vestiges' odds and colours, the
items from Bosses and clears, the clears' pay, Shapes from the week's Abyss alone
([[Bosses and Dungeons Drop Items, Clears Pay, and Shapes Come From the Week's Abyss]]), and a foe archer's 18
([[Ranged Weapons Aim and Fire]]).

## How it was made

- **Every number read.** Three ledgers, by area: the gear loop and its pay, the sea and its ships and crew, and the
  fight on foot, each number with its file, its use and whose call it was. A fault a ledger named was read in the code
  before anything changed.
- **Measured.** `economy_tests.rs` in the gear crate pins the pace in tests and prints the ledger
  (`cargo test -p gear --release measure_the_economy -- --ignored --nocapture`); `balance_tests.rs` in the room crate
  prints each foe type at each rank it takes (`measure_ranks`), beside `measure_blows` and the sea's
  `measure_fights_by_rank`.
- **Destiny 1, as found.** Searched, not read: the session's proxy refused every page, so each number below is a
  search engine's summary of the page it names, unchecked against the page itself.

| Destiny 1 at launch | As found | Source |
|---|---|---|
| Light | Level 21 at 21 Light, then 11 more a level, 120 for 30; a rare piece 15 at most, a legendary 27, raid and exotic 30 | Destinypedia, destinygamewiki |
| Ascendant materials | The last three nodes of a legendary piece 6 each, an exotic's 8, raid armour's 7; a legendary armour piece dismantled 2 Shards, an exotic 3 | Neoseeker, forum tallies |
| Dismantling | A common item Glimmer only; an uncommon 1 material; a rare 2 or 3 | Destinypedia |
| Marks | 100 a week, 200 held; Vanguard armour 65 (helmets 120), weapons 120 to 150; armour from rank 2, weapons from rank 3 | Neoseeker, destinygamewiki |
| Reputation | Rank 1 at 1,500, rank 2 at 3,500, rank 3 at 6,000; a package each rank from 3, a legendary item or materials | TrueAchievements, Destinypedia |
| Bounties | Three tiers: 2,500 XP and 50 reputation, 3,750 and 75, 5,000 and 100 | GamerGuides |
| Xûr | Exotic armour 13 Strange Coins, a primary weapon 23, a special or heavy 17 | Gosunoob, PSU (dated 2014 lists) |
| Public events | Glimmer and XP; the day's first gold sent an Ascendant material by the Postmaster | Neoseeker, Destinypedia |
| Engrams | About one legendary engram in eleven; at launch a legendary engram opened legendary about one time in three | Community tally |
| XP to level 20 | 148,000 by a datamined table, whether it held at launch unchecked; 15 to 20 hours of play | Fandom's datamine, guides |

## The calls

### Upgrades and Prestige

| Call | Chosen | Why |
|---|---|---|
| An Atheric's last three upgrades | 8 Essence each, where a Legendary's ask 6 | Destiny 1's exotics asked 8 Ascendant materials a node; before, an Atheric cost less to finish than a Legendary |
| An Atheric's own node | 2,500 Aurem, 4 fragments, 10 of its resource and 1 Essence (was 1,000 and 1 Essence) | So an Atheric never costs less of anything to finish than a Legendary of its kind: its own node stands in for a column of two perks (`economy_tests.rs`) |
| A Breach's Legendary armour | Its last three upgrades 7 Essence each | Destiny 1's raid armour, between a legendary's 6 and an exotic's 8 |
| Prestige by upgrades | Every piece climbs by equal steps over its upgrades to its rarity's most: a Rare 13 to 15, a Legendary 18 to 27 (a Breach's to 30), an Atheric 21 to 30 | A ship's guns, on a weapon's grid of five upgrades, climbed to 33 and 36 Prestige, past every other module's 27 and 30 |

What finishing a piece takes now, every node and one node a column (Aurem, fragments, Essence, resource):

| Piece | Every node | One a column |
|---|---|---|
| A Legendary weapon | 13,700, 28, 18, 65 | 9,700, 18, 18, 40 |
| An Atheric weapon | 14,600, 28, 25, 65 | 11,400, 20, 25, 45 |
| A Legendary armour piece | 9,300, 12, 18, 30 | 6,900, 6, 18, 15 |
| An Atheric armour piece | 10,200, 12, 25, 30 | 8,600, 8, 25, 20 |

### Factions

| Call | Chosen | Why |
|---|---|---|
| Reputation a rank | 100,000 (was 10,000) | Destiny 1's ranks fell at 3,500 and 6,000 reputation with a bounty paying 50 for 2,500 XP: some 175,000 and 300,000 XP. A player now nears rank 2, the armour's, as they reach level 20 (190,000 XP), and rank 3, the weapons', some hours after. At 10,000 a player held rank 19 by level 20 and drew a package every few minutes, ten times the Legendaries the patrol's kills gave |
| A package | 2,500 Aurem and a Vestige, Legendary one time in two from level 18, else Rare (was 1,000 and one in four) | Destiny 1's rank packages held a legendary or materials; with a rank some four hours of play apart, each is worth the climb |
| The cape | 500 Aurem (was 2,500) | It is how reputation is earned, and a player pledges at about level 2 holding a few hundred Aurem. Destiny 1's pledge cost 2,500 Glimmer, as a switch here still does |
| A faction's weapon | 12,000 Aurem (was 9,000) | Destiny 1's weapons cost about twice an armour piece's Marks (120 to 150 against 65), as the faction note says, and armour stays 6,000 |
| Officers | As before, a faction's counter offers a Seasoned officer from rank 2 and a Veteran from rank 4, so now from about level 20 and some hours past it | A finer officer is a later reward, as Destiny 1's ranks opened finer wares |
| A weekly limit | None | Destiny 1 capped Marks at 100 a week; Overlook has no Marks. The rank, the Aurem and the 18 Essence each piece's upgrades ask gate the set: a full faction set bought (48,000 Aurem) and finished (some 65,000 more) is over 40 hours of a patrol's Aurem at level 20 |

### Shape and the week

| Call | Chosen | Why |
|---|---|---|
| Shape's prices | A Legendary 7 Shapes; an Atheric's armour 13 and its weapon 23 (was 15 for any Atheric) | Xûr's Strange Coins for an exotic's armour and weapon |
| The week's Abyss | 10 Shapes (was 15) | A Legendary a week, an Atheric's armour in about a week and a half, its weapon in about two and a half, near Destiny 1's weekly coins |
| A week's Essence | Unchanged: the Elite and Abyss Dungeons of the week 3 and 5 of each stock, the two playlists' weekly 2 and 3, and a heroic chest's 1 a day (below): about 20 of each a week | A Legendary piece's upgrades take 18, as Destiny 1's took about a week of Ascendant materials |

### The Arts' supers

| Call | Chosen | Why |
|---|---|---|
| Tempest | 48 an orb (was 18): 72 on a foe of the player's level, felling a Major skirmisher, swordsman or archer; its six orbs 432 | The owner's "The art itself is a super and should be powerful". Its six orbs struck 162 in all on a matched foe, under six seconds of a sword's 28.5 a second |
| Duskraven | 16 a bolt (was 7): 24 on a matched foe every 0.8 s, 360 over its 12 s, half of it healed | As Tempest; it struck 13 a second on a matched foe, under half a sword's; now 30 |
| Linked (the Sunwell) | Heals 8 a second (was 5) and deals 1.3 times (was 1.2) | As Tempest; its 12 s and 3 s after now heal 120, a whole player, a support super's worth |

### Public events

| Call | Chosen | Why |
|---|---|---|
| A chest's Essence | One of each stock from the first heroic chest a player opens each day, at any level; no other chest holds any (was 1 or 2 of each from every heroic chest) | Destiny 1's first gold event of the day sent an Ascendant material. Before, a level 20 player could farm Saltmere's level 1 to 4 events for more Essence an hour than a week of weeklies gave |
| Its day | Kept with the day's record (`Today.heroic_chest`), so a room whose clock runs a little behind never pays it twice | As every daily reward |

### Bounties and XP

| Call | Chosen | Why |
|---|---|---|
| Bounties' tiers | Each bounty a tier by how big a task it is: once, half again or twice a first tier's pay (`bounty_pay`). Honest Work, Broadside and Into the Dark first; Tithe Collector, A Cut Above, Bigger Fish and Deeper Still second; Big Game, Sea Wolf and Deep Delver third | Destiny 1's 2,500, 3,750 and 5,000 XP. Before, sinking six ships paid as sinking three |
| Where XP goes | Every XP a deed pays (a kill, a clear, a chest, a sinking, a bounty, the day's and the week's clears, a road's task) grows the worn Art and the faction pledged (its cape worn) as a kill's always did (`earn_play_xp`) | Destiny 1's strikes, bounties and Nightfall paid reputation beside their XP; before, a bounty or a day's clear paid the player alone |
| A road's task | A task that sends the player out (anything but words with a keeper and the pledge) pays a mission's clear at their level: 400 XP and 30 Aurem at level 5, raised as a kill is | Destiny 1 paid every mission done. Before, the houses' eleven tasks paid no XP |
| XP to level 20 | Unchanged, 190,000 | Destiny 1's own table is a datamine whose launch values are unchecked; at a patrol's pay level 20 takes some 12 hours of fighting alone, near Destiny 1's 15 to 20 hours with its story |

### The sea

| Call | Chosen | Why |
|---|---|---|
| A sinking's pay | Twelve land kills of its rank at its level, raised by the tier (`SINKING_KILLS`): in XP to the ship, its modules and its officers aboard, and in XP and Aurem to the player, their Art and their faction (was one kill's XP, to the ship alone); nothing to a player whose ship is four levels or more below it, as a kill on land shares nothing so far below | A sea fight runs 3.5 to 4.5 minutes from 700 m and a ship is sighted every 4 to 6, against some 25 s a kill on foot. Before, a ship took over a hundred hours of sea fights to reach level 20, and the sea paid a player no Aurem |
| Fire | A ball that does its target no harm (its ship four levels or more below) sets no fire | Before, a ship far below a captain still burned it with heated shot though its balls did nothing |
| A fire's bite | 1.4 hull a second times the shooter's level strength (a captain's raised guns, a player's 1) and what both ships' fittings made of the ball (`apply_burning`) | The owner's yes. A fire burned a flat 21 hull whatever the levels, so it was worth most at level 1 and nothing at 30 |
| Travel and the hostile roll | A travel to other waters waits the next roll at least its first half minute, never sooner than it would have come (`wait_first`) | The owner's yes. A travel set the wait back to half a minute, so a player who kept travelling met a ship every half minute against sailing's 60 to 140 s |
| A cove's wreck | One common material of 1 or 2, Heartwood 1.5 times in a hundred, a module 3 (was two of 1 to 3, 5 and 8); an isle's unchanged | The owner's yes, and their earlier "less than a Minor ship's whole lot": a cove's two or three wrecks held 4 to 18 materials against a Minor ship's 3 to 9. Now 2 to 6 |
| Level 30 | Waits on a Breach module, as a player's on Breach armour | The owner's "Yes. Same for player gear. Thats always been the goal"; already so, unchanged |

### The fight on foot

| Call | Chosen | Why |
|---|---|---|
| A player's bow | Two thirds of the bow's damage, quick or aimed: 12 a quick shot, 18 at a full draw (`PLAYER_BOW`) | Its quick shots came every 0.62 s at 18 each, 29 a second, beyond every melee weapon (a greatsword's 29 raw, a sword's 19) with no stamina spent; now 19.5 a second, beside a thunderlock's 20.5. A quiver strikes as hard as a gun's carried shots, quick (720) or aimed (1,080), and an aimed shot is still half again a quick one, as the owner chose. A foe archer's arrow keeps the owner's 18 |
| The greatsword | 21 damage and weight 1.2 × 1.15, reach 2.3 (was 24 and 1.3 × 1.15) | It outdid the great axe at everything; now the longest reach, the lightest blow and the least weight of the three heavy weapons, the warhammer the heaviest blow and weight |
| A captain's defence | Parry 0.2, block 0.22, dodge 0.13 as a Major (was 0.25, 0.3, 0.15) | Captains fight only as Elites, Minibosses and Bosses; at the old shares every one of those hit the 0.85 cap, so a Miniboss and a Boss defended no better than an Elite. Now each defends more than the one below, the Boss at 0.825 |
| Exploit | A swing on an Exposed foe strikes 25% harder (was a crit, half again) | With Exposing Strikes keeping a foe Exposed it made every swing a crit, 1.72 times with Exposed's own share, against Honed's 1.05; now a quarter, as Riposte Master's |
| A drawn shot | The room tells a player's shot loosed from the draw by its damage against a player's quick shot's (`power::aimed`) | Gullwing's leap is for aimed shots alone; told against the bow's whole 18, every quick shot at 12 would have leapt |
| Companions and boarding hands | Their blows on foes take the land's ×1.5 and foes' blows on them ×0.75 | They fight "as a player matched to their level", and the fight's heat already took the ease off what they dealt and took |
| The Bulwark | Blocks as a swordsman does, 35% as a Major, until its change (its second phase or half its health) drops the shield for its maul (`roster::standing`); any brute bearing a shield the same | The owner's yes ([[The Bulwark Blocks, Supers Are Powerful, the Sea's Gaps Close and Level 30 Takes Breach Gear]]). As a brute it carried a shield but never raised it |

Measured, a level 1 player with the starting sword swinging once a second and never guarding (`measure_blows`):

| Foe | Felled in | Fells the player in |
|---|---|---|
| Minor Collector | 3 blows, 2.3 s | 31.4 s |
| Major Hookman | 4 blows, 3.3 s | 16.7 s |
| Major Enforcer | 7 blows, 9.3 s | 13.9 s |
| Elite Reeve | 18 blows, 29.8 s (33.8 before) | 16.3 s |
| Miniboss Tithe-Mate | 31 blows, 56.8 s | 16.4 s |
| Boss (Thule) | 59 blows, 112.3 s | 18.4 s |

The Miniboss's and the Boss's times move by a few seconds from run to run as the dice fall; each is one fight. The
page's two scripted sword players still run out the heroic raid's clock (`server/public.test.ts`), though its last
waves' Reeves defend less; on the branch before `main`'s later events work came in they held it, so the pair stands
near the line. The owner keeps it so for now.

## Left as it was

- **The Vestiges, the colours, the items and the clears**: the owner's.
- **Kill pay by rank and kind, the tiers' ×1.5 and ×2, the 25,000 Aurem held**: the owner's or Destiny 1's already.
  At level 20 a Legendary or better comes from about one ordinary kill in 1,600 (Destiny 1's tallies: one in 1,000 to
  2,500).
- **Dismantling**: a Normal piece Aurem alone, a Magic one fragment, a Rare two or three, as Destiny 1's.
- **The smiths' prices, the Art's rises, the cosmetics, the ammunition**: in line with what a level earns; the
  Ammo crate's 250 is Destiny 1's synthesis.
- **Item XP, Fruit of Dagon, the vault and the carried counts**: Destiny 1's shape already.
