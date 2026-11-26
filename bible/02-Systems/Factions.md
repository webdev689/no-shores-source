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
keeps a counter in Overlook's plaza ([[Cities]]), and a lore book its road gives, telling where its Art came from
([[Each House's Lore Book Tells Its Art's Origin]], [[Lore]]).

## How it works

- **The file.** `content/gear/factions.json` holds the factions (number, key, name, the Art each keeps, its cape, its
  emblem and its dye) and every price and threshold. The `gear` crate builds it in, and the page imports the same
  file, so both read one set of numbers.
- **The pledge.** A character keeps the faction pledged (none at first), and for each faction its reputation and the
  packages collected (`Allegiance`). Pledging is an ask served only at that faction's counter: the first is free, a
  switch costs 2,500 Aurem, the faction already pledged is refused. The house pledged to gives its own torso piece
  as the pledge is taken, the first time the character pledges to it (`give_house_piece`): the house's torso entry's
  look and name (the Stormcaller Hauberk, the Lamplighter Hauberk, the Veiled Hauberk) made at Magic, the game's
  Uncommon, at the player's level and rolled as any Magic torso is (`vestige::house_piece`, as the house's pieces
  that drop in the world are: [[Gear]], "The house's pieces in the world's loot"). It is kept given by the entry's name beside the
  keepers' gifts ([[Gear]], "The keepers' gifts"), so a switch to another house gives that house's piece once and a
  switch back gives none; carried, else laid in the vault, else posted as itself. The catalogue's entry stays the
  Legendary the house sells: the gift is no ware and changes nothing a house sells. Its leader says a line of their
  own as it is given (`giftStorm`, `giftLamp`, `giftVeil` in `content/story/houses.json`), unless the house's road
  begins in the same moment, when its begin is said as it stands and the notice alone tells of the piece; the page
  shows it as the
  leader's gift notice (`houseGiftNotice`). A pledge begins that house's road ([[Quests]]), on which its Art, its two Tenets and three
  of its fragments are earned, the Art first shown off unbounded against a horde. Reputation with every faction is kept across a switch. A saved character from before
  the factions reads pledged to none, and a broken one is made whole.
- **The houses introduced.** Before the pledge the opening quest has the player hear all three, each keeper
  introducing their house when spoken to at its counter (`content/story/houses.json`): Arlo Kestrel the Stormcallers,
  Elder Maren Hale the Lamplighters, Sable the Veiled. How the keepers speak: [[Every Line Reads as Spoken, and the Lore Is Detailed, Mysterious and Gripping]].
- **Reputation.** Every deed's XP, as the room pays it after the seas' share (a kill, a clear, a chest, a sinking, a
  bounty, the day's and the week's clears and a road's task; [[Gear]], "XP"), goes as reputation to the faction
  pledged, but only while the player wears that faction's cape (`earn_reputation`), and a kill's a quarter more while
  they hold the Abyss boon ([[Activities]]). A faction's own bounties, taken at the bounty board by those pledged to
  it, pay its reputation besides: 2,500 at the first tier, 3,750 at the second and 5,000 at the third
  (`bountyReputation`; [[Activities]], "Bounties";
  [[Standard and Faction Bounties Each Wear One Design, on a Board After the Bounty Tracker]],
  [[The Bounty Board as Claude Shapes It]]). A rank is every 100,000 reputation, without end, so a player nears
  rank 2 as they reach level 20 (190,000 XP), as Destiny 1's ranks fell
  ([[The Balance and Economy Pass as Claude Shapes It]]).
- **What a rank earns.** Rank 1 keeps the faction's emblem and rank 2 its dye and its ship's canvas and flag
  ([[Shipyard]]), as a level keeps its emblem
  (`earn_due`). From rank 3, every rank leaves a package: collected at the counter, it gives a Vestige at the player's
  level for a slot of the dice's (Rare, or Legendary one time in two from level 18) and 2,500 Aurem, and is refused
  while ten Vestiges are carried.
- **The faction's wares.** Each faction sells seven named Legendary pieces (`content/gear/items.json`, with its
  faction's key; `wares` lists them in that file's order, the cape first): its cape, level 1, for 500 Aurem, only to a
  player pledged to it, one kept at a time; a full armour set from rank 2 for 6,000 Aurem a piece; and a Melee and a
  Ranged weapon from rank 3 for 12,000 (`terms`). Armour and weapons need the rank alone, pledged or not, and are made
  and sold at level 20, refused below it; a weapon rolls its element as it is bought, as every weapon made does. Each
  armour piece and weapon rolls its traits as it is bought, one always among its faction's own perks
  ([[Every Perk Stands, the Factions' Nine With Them]]; [[Gear]], "The factions' perks"). One
  ask buys any of them (`buy_faction_ware`, by its place among the faction's), refused for a slot that
  carries nine. No Vestige, package or Shape offers a faction's piece (`vestige_pool`), and one dismantled gives back as
  a Normal piece with the third of its Essence, so faction gear bought and broken makes no Essence.
- **Its own colour.** Each faction's armour and weapons are drawn in a colour no dye sells (`factions.json`'s
  `gear.look`, four colours laid as a 16-step ramp and snapped to the game's palette): the armour in its guild set
  (`gear.armour`), each layer and the padding under it named for its faction in the outfit's dyes (`gearOutfit`), which
  `layerRamps` lays over any dye worn, covering every texel of the piece by its light (`whole`); the weapons in its metal
  (`gear.metal`), their colour covering a bow, a staff and a shield whole by their light, in hand or put away, while a
  blade (a sword, a dagger, or any melee weapon) keeps its metal and wears the colour on its hilt, guard and trim, the
  texels the forge marks (`layerRamps` `trimmed`; [[Faction Blades Wear Their Faction's Colour on Hilt and Trim]]).
  The Stormcallers' Squall, the Lamplighters' Lampglass, and the Veiled's Nightveil, black into a faint cold violet
  ([[Faction Weapons Wear Their Colour and Roll Their Faction's Perks]]). A faction's cape wears its faction's dye. The
  dress carries it, so other players see it; first person lays it on the gauntlets, boots, bow, staff, shield and a
  blade's trim.
- **An Art's level.** Each Art keeps a level (1 to 5), XP toward the next and the fragments it owns, one bit each
  (`WornArts`). Every deed's XP fills the worn Art's bar ([[Gear]], "XP"; `content/arts/arts.json` `levels.xp`: 8,000, 16,000, 32,000
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

- A blade's trim shows its faction's colour only once the forge's marked strips are published (forge.yml): until
  then a faction's blade draws as any other of its metal. The first person's sword and dagger frames are drawn by
  `fplayers.py`, which no workflow runs. The Lamplighters sell no blade.
- Destiny 1's rank 25 quest and its exotic class item have no like here.
