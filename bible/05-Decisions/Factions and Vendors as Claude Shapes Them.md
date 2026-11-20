---
type: decision
date: 2026-11-20
status: in force
---
# Factions and Vendors as Claude Shapes Them

The owner handed this round over: "Please take this on with autonomy, be as detailed as possible, and come back when
this is 100% finished". What the owner decided is in [[Three Factions Keep the Arts, After Destiny 1]],
[[Overlook's Keepers Are the Mage, the Smiths, the Tailor, the Tack and Shape]],
[[Elder Maren Hale Welcomes the Player to Overlook]], [[Only Overlook's Social Space Opens for Now]],
[[The Character Page Opens Appearance From an Icon Button]] and [[Each Faction Sells Gear of Its Own, in Its Own Colour]].
Everything below is Claude's, made under that word and the owner's later "Do a comprehensive audit and detailed pass",
and the owner may change any of it. The numbers live in `content/gear/factions.json`, `content/arts/arts.json` (`levels`)
and `content/gear/cosmetics.json`, which the rules and the page both read.

## Destiny 1's factions, and what came over

Destiny 1 had three factions in the Tower (Dead Orbit, Future War Cult, New Monarchy), each with a vendor. A Guardian
pledged to one at a time for 2,500 Glimmer, at most once a week; while pledged and wearing the faction's class item
(a cloak, mark or bond), the reputation they earned in activities went to the faction. Each rank of reputation unlocked
more of the vendor's wares (class items first, then legendary armour at rank 2 and weapons at rank 3), and from rank 3
each rank reached left a package of legendary gear and materials; rank 25 opened a quest for an exotic class item. In
The Taken King every rank took the same reputation and ranks went on without end, each leaving a package collected
from the vendor. Sources: Destinypedia's Faction, Reputation and Dead Orbit pages; Fextralife's faction pages.

| Destiny 1 | Overlook |
|---|---|
| Three factions, one vendor each in the Tower | Three factions, one for each Art, each a counter in Overlook's plaza |
| Pledge for 2,500 Glimmer, once a week | The first pledge free; a switch 2,500 Aurem, at any time (the owner's "at any time") |
| The class item worn sends reputation to the faction | The cape worn, while pledged to its faction, earns it reputation from every kill: as much as the kill's XP |
| Ranks of even reputation, without end (The Taken King) | A rank every 10,000 reputation, without end (the owner's "isnt capped") |
| Ranks unlock wares; packages from rank 3 | Rank 1 keeps the faction's emblem, rank 2 its dye, and from rank 3 each rank leaves a package at the counter |
| Packages hold legendary gear and materials | A package: a Vestige at the player's level for a random slot, Rare or one in four Legendary from level 18, and 1,000 Aurem; refused while ten Vestiges are carried |
| Faction gear for Marks | The faction's cape for 2,500 Aurem, pledged only, one kept at a time; Legendary, level 1, so any level wears it |

Reputation is kept for every faction across a switch, as Destiny's was. A cape of a faction not pledged earns nothing.

## Faction gear

Destiny 1's faction vendors sold legendary armour from rank 2 and weapons from rank 3, for Glimmer and Legendary Marks
(Destinypedia's faction gear list; the Destiny wiki's Dead Orbit page), and the armour was drawn in the faction's
look. The owner said yes to gear of each faction's own, "with its own unique color".

| Call | Choice |
|---|---|
| What | Each faction sells its cape, a full armour set (head, torso, arms and legs) and two weapons, a Melee and a Ranged: seven named Legendary pieces each (`content/gear/items.json`, `faction`) |
| The pieces | Stormcallers: Stormcaller Helm, Hauberk, Gauntlets and Greaves, Squallbreak (sword and shield) and Thunderstring (bow). Lamplighters: Lamplighter Hood, Vestments, Gloves and Boots, Wickstaff (staff) and Dawnflight (bow). The Veiled: Veiled Cowl, Coat, Grips and Treads, Hushguard (dagger and shield) and Nightpin (bow) |
| Ranks | Armour from rank 2, weapons from rank 3, as Destiny's; the cape to the pledged alone |
| Pledge | Armour and weapons need the rank, not the pledge: a switch keeps the reputation earned, so it keeps what that reputation buys |
| Prices | Armour 6,000 Aurem a piece and weapons 9,000 (Destiny's weapons cost twice an armour piece's Marks); no limit on how many, as Destiny's had none |
| Level | Named items are made at level 20, so a faction's armour and weapons are sold from level 20 (the room refuses them below it, the screen says "From level 20"); the cape stays level 1 and is sold at any level |
| Element | A faction's weapon rolls an element as it is bought, one time in two as any Legendary does |
| Perks | Each piece's layout is drawn from the traits its kind already takes, as the named Legendaries' are; its resource is its Art's island's in spirit: Windthistle for Storm, Sunstone for Divine, Mistbloom for Shadow |
| Never dropped | No Vestige, no package and no Shape offers a faction's piece; one dismantled gives back as a Normal piece, with the third of any Essence spent on it, so faction gear bought and broken makes no Essence |
| Its own colour | A colour no dye sells and no other faction's gear wears, each chosen on the game's palette, which has no violet or indigo: the owner's three ([[Each Faction Sells Gear of Its Own, in Its Own Colour]]), named Squall (storm grey and silver, a storm blue in its upper tones for the accents) for the Stormcallers, Lampglass (gold in the shadows into white) for the Lamplighters, Nightveil (charcoal into silver) for the Veiled. Each is four colours laid as a 16-step ramp and snapped to the palette, as a dye is (`content/gear/factions.json`, `gear.look`), and covers the whole piece by its light, so a guild's set drawn in its own colours takes it all; it takes the padding under the faction's torso and legs pieces too |
| Over a dye | A faction's piece keeps its own colour whatever dye is worn; the dye takes every other armour piece. The owner's "its own unique color" is the gear's, so no dye covers it |
| Its look | The armour is drawn in a guild's set no other gear wears: the Stormcallers' in the fighters', the Lamplighters' in the mages', the Veiled's in the brotherhood's. The weapons are drawn in the faction's metal (elven, silver, ebony), and their colour lies where the forge dyes a weapon: the bows, the staff and the shields; a sword's or a dagger's blade keeps its metal |
| First person | The gauntlets, the boots, the bow, the staff and the shield take the faction's colour in first person too |
| The screen | The faction's counter shows rows ARMOUR and WEAPONS to everyone, the pieces not yet earned dim with "From rank 2" or "From rank 3"; each card says the colour it is drawn in |

## The Arts' levels

| Call | Choice |
|---|---|
| XP | Every kill's XP goes to the worn Art too (before Scholar's share, which is the gear's), until its bar is full |
| Bars | Level 1 to 2: 8,000; 2 to 3: 16,000; 3 to 4: 32,000; 4 to 5: 64,000 (120,000 in all, as much as a player's own XP to level 16) |
| Rising | At the Art's faction's counter, its bar full; no pledge needed. Level 2: 1,000 Aurem; 3: 2,500; 4: 5,000 and 10 Weapon and 10 Armor Fragments; 5: 10,000 and 2 Weapon and 2 Armor Essence |
| A core each level | Each rise owns one of the Art's six fragments of the player's choice; four by level 5 |
| Fragments owned | A Core slot holds only a fragment owned. The faction sells the others for 7,500 Aurem each, from its first rank (Destiny's rank-gated faction wares) |
| Power and duration | Level 1 to 5: 0.6, 0.7, 0.8, 0.9 and 1.0 of every spell's harm and healing, and of how long the Sunwell, the Duskraven and Dusk Daggers last, the buffs they give (Quicken's Haste, Momentum's and Resolve's Crit, Vanish's veil), Arc Lash's Charge, every Expose a spell or Overload gives, the Sunwell's Linked linger and Dread's seconds. Recharges, reaches and counts are as written. Level 5 is the Arts as they were |
| Old characters | The owner's: every Art at level 1, owning the fragments their Cores held ([[Characters Made Before the Arts' Levels Start Every Art at Level 1]]) |

## The keepers and their wares

| Keeper | Where | What |
|---|---|---|
| The Mage | The alcove by the portico | Identifies Vestiges, free, as Destiny's Cryptarch decrypted engrams |
| The Armorsmith | Next but one | Six pieces of armour a day, three Rare and three Magic, at the buyer's level |
| The Weaponsmith | Next | Six weapons a day, two Melee to each Ranged, and the Ammo crate |
| The Tailor | Next | Six emblems a day, and four dyes a day of the twelve sold |
| The Tack | The last alcove on that side | Four horse pieces a day of the ten coats and bardings sold |
| The three factions | The other side, past the vault: the Stormcallers, the Lamplighters (Elder Maren Hale) between, the Veiled | Pledge, cape, packages, the Art's rise and fragments |
| Shape | One of eight places on the plaza, by the week | Four Legendary and two Atheric pieces a week, named items at level 20, 7 Shapes for a Legendary and 15 for an Atheric |

The Harbourmaster keeps her alcove, and a chandler's stall stands last on the factions' side, for life; no other stall
stands in the arcades.

## Shape and Shapes

| Call | Choice |
|---|---|
| When | Friday 09:00 UTC (Xûr's Friday arrival) to Sunday 21:00 UTC (Sunday evening), the same for every player |
| Where | Eight places on Overlook's plaza (`city::courtyard::visitor_spots`): by each of the four braziers, landward of the two outer benches, and before the portico's two ends, 32 m landward of the plaza's middle, off the townsfolk's lane. One a week, by the week's dice |
| Wares | Drawn evenly from every named piece of each rarity that a Vestige may open to, none twice in a week |
| Weeks | Counted from Monday 00:00 UTC |
| Shapes | At most 200 held. A kill at Elite (Rough) seas gives one 3 times in 100, at Abyss (Storm) 6 in 100; a Boss or Miniboss 2 and 4. None at Normal (Calm) |

## Cosmetics

| Call | Choice |
|---|---|
| One catalogue | Dyes, coats and bardings in `content/gear/cosmetics.json`, kept and worn as emblems are, one of each kind worn |
| Starts | Dye "Own Colours" (each piece in its own metal and cloth), coat "Bay" (the horse as the forge draws it), barding "Bare" |
| Dyes | Twelve sold (five Magic at 1,000, five Rare at 2,500 from level 5 or 10, two Legendary at 5,000 from level 20) and three faction dyes at rank 2. A dye is four colours laid as a 16-step ramp, as the forge's metals and cloth are, and snapped once to the game's palette, so each view draws the same sixteen; each keeps ten steps at least and stands apart from every other. The palette has no violet, so the Veiled's dye is a dusky mauve and the second Legendary dye Heather, a dusky pink |
| Coats | Six sold: Chestnut, Dun and Grey at 1,500; Black and White at 3,000 from level 5; Palomino at 3,000 from level 10 |
| Bardings | The four the forge already draws over its horse (DFO's shop looks): Ember Plate, Wraith Mist, Dawnfire and Clockwork, 9,000 each from level 15 or 20 |

## The plaza's people

| Keeper | Dress |
|---|---|
| The Mage | An anole woman in a hooded purple robe |
| The vault keeper | A grey-haired human man in a white shirt, a grey tunic, breeches and tall boots |
| The Armorsmith | A human woman in chain and iron |
| The Weaponsmith | A felid man in leather |
| The Tailor | A human man in a white shirt and a red waistcoat |
| The Tack | A felid woman in a vest and riding boots, leather gauntlets |
| Stormcaller | An anole man in a blue tunic and cloak, steel gauntlets |
| Elder Maren Hale | An old human woman, white-haired, in yellow robes and a white formal cloak |
| The Veiled | A grey-haired felid woman in a hooded grey robe |
| Shape | An anole in a hooded grey robe, spoken of as he |

## Locked social spaces

Only Overlook's social space opens: the bake marks every other city's social node closed and the room opens none on
it (`content/world/social.json`, which the page reads too). Shape visits Overlook alone (its `shapeVisits`).

## The keepers' screen

| Call | Choice |
|---|---|
| One screen | Every keeper who deals with a player opens the same screen, after the owner's three references; the vault's two sides stand in its right column, under the vault keeper |
| The keeper | Drawn from the forge in their own dress, idle, facing the viewer, grown by whole pixels, breathing between the idle's two frames |
| Prompt | A counter's prompt is its keeper's title alone ("The Mage", "Shape") |
| Lines | One-line scenes, said in turn: three greetings, two thanks and one for being short of the price a keeper (the Mage and the vault keeper none short; he thanks for each thing moved) |
| Voice | Through the world's sound, as the dialogue box's |
| Currencies | A faction's top shows Aurem and the four materials an Art's rise takes; the Mage's shows none |
| Countdown | "Stock refresh" for the smiths, the Tailor and the Tack (to midnight, UTC); "Leaves in" for Shape; none for the Mage and the factions |
| A short ware | Stays held to buy, red with "Not enough"; the room refuses it and the keeper answers |
| Shape away | "Shape is away. He comes on Fridays." |

## Elder Maren Hale's welcome

| Call | Choice |
|---|---|
| When | After the stranger has gone, on the first arrival after the story; leaving before she has gone forgoes it. Due until its last scene is said: a reload or a leaving takes it up from the scenes said on the next arrival (`overlook.welcome.said`), without the greeting |
| How | A walk, not a cutscene: she starts at the lane crossing nearest the player and comes to them, then leads them to the counters, the nearest stop first each time, speaking at each once they are within 6 m, then walks home. She keeps to the townsfolk's lanes and the counters' fronts, round her counter's end clear of the arcade's columns |
| Ending it | Opening the Lamplighters' counter while she walks ends the welcome there. A player more than 40 m from her for a minute ends the walk: she goes home, and it stays due |
| Pace | 1.5 m/s, brisker than the townsfolk's 1.25, for a plaza 260 m across; she stops 1.8 m before the player |
| Marks | The keepers she names show an alert over their heads; the HUD says "Follow" over her name past 6 m and clears it inside 5 m |
| Lines | In the dialogue box, as the epilogue's; the factions are "houses" in her mouth, and her last line invites a pledge without naming it |

## Appearance and the Art's screen

| Call | Choice |
|---|---|
| The button | A wardrobe mark (a coat on a brass hanger) with the worn emblem's sign in its corner, labelled "Appearance" |
| The display | The figure turning a view every 1.2 s, the horse still from the side under it, without its rider |
| Rows | Emblems five a row, dyes, coats and bardings eight a row, so all four show at 1280 by 720 |
| Worn | Set in brass with a brass corner; a dim piece's card says how it is had |
| A dye | Takes the armour's padding with the armour |
| A coat | Takes only the hide (the forge publishes no mane mask), so the mane stays grey |
| A barding | Over the horse's own texels where it lies no more than 0.15 m behind them, so its far side and its inside stay hidden; depth decides between it and the rider |
| The Art's level | Five pips by its name; the bar under the three diamonds; brass when full or at the highest |
| Before the room's word | Every Art shows level 1 with every fragment owned, so the screen locks nothing the room would allow |

## Refusals and cosmetics others see

| Call | Choice |
|---|---|
| Words | "You do not have that." and "You already have that." for a piece not kept or kept already, whatever it is; a fragment out of range is its own refusal, "There is no such fragment." |
| Others' view | The room is the word on the cosmetics others see: it relays each dress with the dye, coat and barding the character wears, none for a start piece; a change reaches others on the dress's own turn |

