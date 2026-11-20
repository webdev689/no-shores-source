---
type: system
status: live
code:
  - content/gear/factions.json
  - crates/gear/src/factions.rs#Allegiance
  - crates/gear/src/factions.rs#FactionsDef
  - crates/gear/src/factions.rs#earn_reputation
  - crates/gear/src/factions.rs#collect_package
  - crates/gear/src/factions.rs#buy_faction_ware
  - crates/gear/src/factions.rs#wares
  - client/src/game/npc/factionRows.ts#gearRows
  - client/src/player/gearLooks.ts#gearOutfit
  - client/src/player/dressing.ts#layerRamps
  - crates/gear/src/art_levels.rs#rise_art
  - crates/gear/src/art_levels.rs#buy_fragment
  - crates/gear/src/art_levels.rs#art_shares
  - crates/room/src/statuses.rs#heal_linked
  - crates/gear/src/arts.rs#LevelsDef
  - crates/gear/src/arts.rs#WornArts
  - crates/room/src/spells.rs#spell_strikes
  - crates/room/src/asks.rs#counter_for
  - crates/protocol/src/standing_wire.rs#standing_of
---
# Factions

Three factions keep the three Arts, after Destiny 1's factions ([[Three Factions Keep the Arts, After Destiny 1]]):
the Stormcallers keep Storm, the Lamplighters Divine and the Veiled Shadow. A player pledges to one, earns its
reputation in the world while wearing its cape, and ranks up without end; each sells its cape, armour and weapons in a
colour of its own ([[Each Faction Sells Gear of Its Own, in Its Own Colour]]); the faction of each Art raises it from
level 1 to 5 and sells its Core fragments. Claude's numbers: [[Factions and Vendors as Claude Shapes Them]]. Each
keeps a counter in Overlook's plaza ([[Cities]]).

## How it works

- **The file.** `content/gear/factions.json` holds the factions (number, key, name, the Art each keeps, its cape, its
  emblem and its dye) and every price and threshold. The `gear` crate builds it in, and the page imports the same
  file, so both read one set of numbers.
- **The pledge.** A character keeps the faction pledged (none at first), and for each faction its reputation and the
  packages collected (`Allegiance`). Pledging is an ask served only at that faction's counter: the first is free, a
  switch costs 2,500 Aurem, the faction already pledged is refused. Reputation with every faction is kept across a
  switch. A saved character from before the factions reads pledged to none, and a broken one is made whole.
- **Reputation.** Each kill's XP, as the room pays it after the seas' share, goes as reputation to the faction pledged,
  but only while the player wears that faction's cape (`earn_reputation`). A rank is every 10,000 reputation, without
  end.
- **What a rank earns.** Rank 1 keeps the faction's emblem and rank 2 its dye, as a level keeps its emblem
  (`earn_due`). From rank 3, every rank leaves a package: collected at the counter, it gives a Vestige at the player's
  level for a slot of the dice's (Rare, or Legendary one time in four from level 18) and 1,000 Aurem, and is refused
  while ten Vestiges are carried.
- **The faction's wares.** Each faction sells seven named Legendary pieces (`content/gear/items.json`, with its
  faction's key; `wares` lists them in that file's order, the cape first): its cape, level 1, for 2,500 Aurem, only to a
  player pledged to it, one kept at a time; a full armour set from rank 2 for 6,000 Aurem a piece; and a Melee and a
  Ranged weapon from rank 3 for 9,000 (`terms`). Armour and weapons need the rank alone, pledged or not, and are made
  and sold at level 20, refused below it; a weapon rolls its element as it is bought, as every weapon made does. One
  ask buys any of them (`buy_faction_ware`, by its place among the faction's), refused for a slot that
  carries nine. No Vestige, package or Shape offers a faction's piece (`vestige_pool`), and one dismantled gives back as
  a Normal piece with the third of its Essence, so faction gear bought and broken makes no Essence.
- **Its own colour.** Each faction's armour and weapons are drawn in a colour no dye sells (`factions.json`'s
  `gear.look`, four colours laid as a 16-step ramp and snapped to the game's palette): the armour in its guild set
  (`gear.armour`), each layer and the padding under it named for its faction in the outfit's dyes (`gearOutfit`), which
  `layerRamps` lays over any dye worn, covering every texel of the piece by its light (`whole`); the weapons in its metal
  (`gear.metal`), their colour where the forge dyes a weapon (a bow, a staff, a shield, in hand or put away). The dress
  carries it, so other players see it; first person lays it on the gauntlets, boots, bow, staff and shield.
- **An Art's level.** Each Art keeps a level (1 to 5), XP toward the next and the fragments it owns, one bit each
  (`WornArts`). Every kill's XP fills the worn Art's bar (`content/arts/arts.json` `levels.xp`: 8,000, 16,000, 32,000
  and 64,000) and stops when it is full. At the Art's faction's counter a full bar rises a level for its price
  (`levels.rise`), and the ask names one fragment not owned, which becomes the player's; one who owns all six,
  bought before rising, rises taking none. The bar starts again.
- **Fragments.** A Core slot holds only a fragment owned; the room refuses another (answer 114). The faction sells
  fragments for 7,500 Aurem each from its first rank. A character kept before fragments were owned owns those its
  Cores held, and every Art starts at level 1.
- **Power by level.** The room weighs every spell by its caster's level in the Art that cast it (`art_shares`), even
  once another is worn: its harm and healing (the Sunwell's healing each second by its caster's Divine level) by
  `levels.power`, and by `levels.lasting` how long the Sunwell, the Duskraven and Dusk Daggers last, the buffs the
  spells give (Quicken's Haste, Momentum's and Resolve's Crit, Vanish's veil), Arc Lash's Charge, the Expose of Dusk
  Daggers, Searing, the Duskraven's bolts and Overload, the Sunwell's Linked linger and Dread's seconds; 0.6 at level 1
  up to 1.0 at level 5, the spells as written ([[Arts]]). The Sunwell's Linked damage share is a buff: its time is
  weighed, its 1.2 is not. A spell keeps its Art's level and Core from its cast.
- **At the counters.** The room serves a faction's asks (pledge, wares, package) and its Art's (rise, fragment) only
  within reach of that faction's counter, as it serves a vendor's ([[Gear]], "In the rooms"); the Test Ground's stall
  serves them all.
- **On the wire.** The gear message carries the pledge, each faction's reputation and packages waiting, and each Art's
  level, XP and owned fragments, and in a social space every faction's wares as the room makes them (`standing_of`,
  `faction_wares`); the asks are numbered 50 (pledge), 51 (a ware), 52 (package), 53 (rise) and 54 (fragment), the
  faction or Art in `column` and the ware or fragment in `node`. The refusals' words are the page's
  (`client/src/player/gear.ts`).

## Limits

- Reputation comes from kills alone: no bounties or activities give it yet, as there are none.
- A faction's weapons take its colour only where the forge dyes a weapon: a sword's or a dagger's blade keeps its
  metal, so Squallbreak and Hushguard show it on their shields.
- Destiny 1's rank 25 quest and its exotic class item have no like here.
