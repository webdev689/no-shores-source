---
type: system
status: live
code:
  - content/gear/factions.json
  - crates/gear/src/factions.rs#Allegiance
  - crates/gear/src/factions.rs#FactionsDef
  - crates/gear/src/factions.rs#earn_reputation
  - crates/gear/src/factions.rs#collect_package
  - crates/gear/src/art_levels.rs#rise_art
  - crates/gear/src/art_levels.rs#buy_fragment
  - crates/gear/src/art_levels.rs#spell_shares
  - crates/gear/src/arts.rs#LevelsDef
  - crates/gear/src/arts.rs#WornArts
  - crates/room/src/spells.rs#spell_strikes
  - crates/room/src/asks.rs#counter_for
  - crates/protocol/src/standing_wire.rs#standing_of
---
# Factions

Three factions keep the three Arts, after Destiny 1's factions ([[Three Factions Keep the Arts, After Destiny 1]]):
the Stormcallers keep Storm, the Lamplighters Divine and the Veiled Shadow. A player pledges to one, earns its
reputation in the world while wearing its cape, and ranks up without end; the faction of each Art raises it from
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
- **The cape.** Each faction's cape is a named Legendary cloak (`content/gear/items.json`, with its faction's key),
  level 1, sold for 2,500 Aurem only to a player pledged to it, one kept at a time. No Vestige and no Shape offers one.
- **An Art's level.** Each Art keeps a level (1 to 5), XP toward the next and the fragments it owns, one bit each
  (`WornArts`). Every kill's XP fills the worn Art's bar (`content/arts/arts.json` `levels.xp`: 8,000, 16,000, 32,000
  and 64,000) and stops when it is full. At the Art's faction's counter a full bar rises a level for its price
  (`levels.rise`), and the ask names one fragment not owned, which becomes the player's. The bar starts again.
- **Fragments.** A Core slot holds only a fragment owned; the room refuses another (answer 114). The faction sells
  fragments for 7,500 Aurem each from its first rank. A character kept before fragments were owned owns those its
  Cores held, and every Art starts at level 1.
- **Power by level.** The room weighs every spell by its caster's level for the worn Art (`spell_shares`): its harm
  and healing by `levels.power`, and how long the Sunwell, the Duskraven and Dusk Daggers last and the buffs the
  spells give (Quicken's Haste, Momentum's and Resolve's Crit, Vanish's veil) by `levels.lasting`; 0.6 at level 1 up
  to 1.0 at level 5, the spells as written ([[Arts]]).
- **At the counters.** The room serves a faction's asks (pledge, cape, package) and its Art's (rise, fragment) only
  within reach of that faction's counter, as it serves a vendor's ([[Gear]], "In the rooms"); the Test Ground's stall
  serves them all.
- **On the wire.** The gear message carries the pledge, each faction's reputation and packages waiting, and each Art's
  level, XP and owned fragments (`standing_of`); the asks are numbered 50 (pledge), 51 (cape), 52 (package), 53 (rise)
  and 54 (fragment), the faction or Art in `column` and the fragment in `node`. The refusals' words are the page's
  (`client/src/player/gear.ts`).

## Limits

- Reputation comes from kills alone: no bounties or activities give it yet, as there are none.
- A package's Vestige is the only gear a faction gives; Destiny's faction armour and weapons have no like here yet.
- Destiny 1's rank 25 quest and its exotic class item have no like here.
