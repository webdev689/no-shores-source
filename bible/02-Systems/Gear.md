---
type: system
status: live
code:
  - crates/gear/src/emblems.rs#emblems
  - crates/gear/src/emblems.rs#sold_on
  - crates/gear/src/shown.rs#Shown
  - crates/room/src/asks.rs#counter_for
  - crates/gear/src/item.rs#Item
  - crates/gear/src/grid.rs#columns
  - crates/gear/src/grid.rs#cost
  - crates/gear/src/power.rs#level
  - crates/gear/src/power.rs#by_player
  - crates/gear/src/power.rs#on_player
  - crates/gear/src/character.rs#Character
  - crates/gear/src/old_hands.rs#read
  - crates/gear/src/kinds.rs#Kind
  - crates/room/src/power.rs#loadout_arms
  - crates/room/src/power.rs#arms_allowed
  - crates/gear/src/catalogue.rs#trait_fits
  - crates/room/src/perks.rs#sharpened
  - crates/room/src/perks.rs#verbs_after
  - crates/room/src/perks.rs#PerkCounts
  - crates/gear/src/asks.rs#Ask
  - crates/gear/src/vestige.rs#dropped
  - crates/gear/src/vestige.rs#opens_to
  - crates/gear/src/vestige.rs#make
  - crates/gear/src/rewards.rs#worth
  - crates/gear/src/catalogue.rs#catalogue
  - crates/gear/src/world.rs#island_levels
  - crates/gear/src/vendor.rs#wares
  - crates/gear/src/element.rs#rolled
  - crates/gear/src/element.rs#Shield
  - crates/room/src/judging.rs#settle
  - crates/gear/src/world.rs#Difficulty
  - crates/room/src/patrol.rs#keep_patrol
  - crates/room/src/power.rs#empower
  - crates/room/src/power.rs#pay_kill
  - crates/room/src/drops.rs#drop_spoils
  - crates/gear/src/ammo.rs#capacity
  - crates/gear/src/ammo.rs#box_chance
  - crates/room/src/asks.rs#answer
  - crates/protocol/src/gear_wire.rs#gear_bytes
  - client/src/player/gear.ts#gearHands
  - client/src/player/gearLooks.ts#gearOutfit
  - client/src/testground/gearPanel.ts#startGearPanel
---
# Gear

What a player wears and how it makes them stronger, after Destiny 1 at launch
([[Gear and Power Follow Destiny 1 Vanilla]]): items of five rarities whose nodes are unlocked by XP and bought with
materials, armour whose Prestige carries the player past level 20, and sealed Vestiges opened in a social space. Every
number is one of [[Gear as Claude Shapes It]].

## How it works

- **One crate for every machine.** The `gear` crate holds the rules, with no clock or platform, so the server and any
  browser agree. Its content is authored in `content/gear/` and built into it: the traits, the named items, the
  islands' resources and rolled items' names. The catalogue is checked whole by a test: every trait a named item
  offers exists, sits in the right kind of column and fits the item; no item offers a trait twice; each signature
  belongs to one Atheric; every kind of loadout has a Legendary; every slot has a Legendary and an Atheric a Vestige
  can open to; every rolled pool holds enough traits.
- **An item** is a kind (a Melee or a Ranged loadout, four armour pieces, the cloak), a rarity, a level (1 to 20; a
  Legendary or Atheric is 20), its XP and the nodes bought and chosen. A named item copies its traits from the
  catalogue when it is made, so it stays what it was.
- **Where it is worn.** Each kind in its one slot: a Melee loadout for Melee, a Ranged one for Ranged, each armour
  piece and the cloak its own ("Loadouts", below). A player wears an item only at its level or above, and one Atheric
  in the loadouts and one in the armour at a time.
- **Nodes.** An item's columns run left to right, by its rarity and whether it is a weapon: upgrades, handling (how
  a weapon is gripped or fired), finish (how any weapon is balanced), perks and an Atheric's own. Each column
  unlocks when the item's XP reaches it; one node of each trait column is chosen among those bought, the first bought
  chosen at once. Upgrades raise Attack, or Defense and Prestige, by equal steps to the item's most. A node costs
  Aurem, and more as the rarity rises: a Magic's upgrades a fragment, a Rare's nodes one and its upgrades three; a
  Legendary's or Atheric's handling, finish and perks 2 fragments and 5 of its island's resource, a weapon's upgrades
  before its last three 5 fragments and 10 of the resource, and its last three upgrades (every upgrade of an armour
  piece) 6 Essence each; an Atheric's own, 1 Essence ([[Gear as Claude Shapes It]]).
- **XP.** A kill's XP goes to every player who struck the foe in its last 10 s, a tenth more with Scholar worn; for
  each, to the loadout whose blow last landed and to every armour piece worn. An item stops earning at its
  last column. Past level 20, each 20,000 XP grows a Fruit of Dagon, which gives an item 5,000 XP when fed to it.
- **Level and Prestige.** XP alone reaches level 20. Past it, the Prestige of the four armour pieces worn sets the
  level, to 30. A Rare at level 20 carries 13 to 15, a Legendary 18 to 27 (a Breach's to 30), an Atheric 21 to 30.
- **Attack and Defense.** A weapon's blow is times 1.07 for each of the foe's levels up to its Attack ÷ 15, and
  falls to 0.67, 0.56, 0.47 and none as the player is one to four levels below the foe. A foe's health is its kind's
  times 1.07 for each of its levels, so a matched player fells it in the blows combat is tuned for. A foe's blow is
  times 1.07 for each of its levels past the player's Defense ÷ 45, and a quarter more for each level the player is
  below it, up to double. Defense comes from the four armour pieces alone: head 0.3125 of a full set's, torso 0.3375,
  arms 0.2625, legs 0.2375.
- **Vestiges.** A kill may leave a Vestige for each player who struck the foe, seen by them alone: by the foe's
  chance (a boss's is sure), its colour weighted by the foe (Legendary from level 18, Atheric from 20), for one slot,
  its item at the foe's level. A player carries ten. Identified in a social space, it opens to a colour at, below or
  now and then above its own, never above what its level could drop (Legendary from 18, Atheric from 20), and to a
  named item of its slot (a Breach's excepted) or a lesser one of a kind the slot takes, its name and traits rolled,
  never a trait twice.
- **Asks.** Wearing, taking off, buying and choosing nodes, dismantling, identifying, feeding Fruit, and the vault.
  An ask refused changes nothing and says why. A slot carries nine beside the one worn; the vault, reached in a
  social space, twenty weapons, twenty armour and twenty Vestiges. A slot read past nine from a kept character
  carries what it holds, and takes no more until it is down to nine. Dismantling returns Aurem, fragments and, from a
  Legendary or Atheric, Essence with a third of what was spent on it.
- **Chance** comes from a hash of the room's seed, its tick, a count of the rolls the room has made, the player and
  what the roll is for. A deployed room's seed is its host's own, random and never sent, so no player can foresee a
  roll; a room in the page keeps one fixed seed, so it gives the same loot for the same play. A kept character is
  made whole as it is read: its stocks within their caps, each item's choices, nodes, level and XP within its own,
  one worn where it does not fit carried, so no keeping can make a room refuse or fail on it.

## In the rooms

- **Each player's gear** is held by the room they are in ([[Server]]), the starting kit as they join, and sent to
  them alone whenever it changes, every column of every item spelled out so the browser draws it without the rules.
- **Hands.** A player holds only what a loadout they wear puts in their hands, the fists with no Melee worn, or a
  torch beside a loadout that leaves the left hand free; the browser draws the hands from the loadout drawn, in a
  metal its rarity likes.
- **Blows.** Every blow is made with its power as it is struck: a player's on a foe by the Attack of the loadout it
  came from (a shot the Ranged one's, as it was when the shot was loosed; a swing Melee's, or Ranged's while it is
  drawn or no Melee is worn), a foe's on a player by the player's Defense, each by the two levels. A foe of level 0
  fights by combat's own numbers.
- **Kills.** A foe's death pays every player whose blow landed on it in its last ten seconds and could harm it (four
  levels below, a blow does nothing and shares nothing), and throws out what it drops for each, seen by them alone,
  for two minutes ("Drops", below).
- **Perks.** The traits a player's worn gear gives make a trim of combat's numbers, which their fighter carries, so
  their browser predicts it to the bit ([[Combat]]). The room adds what only it knows the moment of: Honed, Executioner,
  Undertow, Exploit and Attuned as a blow is struck, Point Blank and Long Shot by the ground a shot covered, the
  stamina a kill, a parry or a block gives back, with Last Light's reload, and the verbs ("Verbs", below).
- **Asks** ride the player's inputs and are answered in turn. A city's social space serves each at its own counter: a
  Vestige opened at the Reader's, the vault at a vault's, a ware at its vendor's ([[Interface]]); the [[Test Ground]]
  serves them all within reach of its stall. The Test Ground alone hands out gear.

## Loadouts

[[Weapons Are a Melee and a Ranged Loadout]], in [[Arts and Loadouts as Claude Shapes Them]]'s shape.

- **Two slots.** Melee holds a Sword & Shield, Dagger & Shield, Double Daggers, Sword, Double Swords, Staff, Mace,
  Double Mace, Mace & Shield, Great Axe, Greatsword, Flail or Warhammer; Ranged a bow, crossbow, pistolet, double
  pistolet or thunderlock (`gear::kinds`). A loadout is one item, however many hands it fills: one Attack, one element,
  one set of perks. A Vestige for Melee opens to any Melee kind, evenly, and one for Ranged to any Ranged.
- **How each fights** ([[Combat]], `room::power::loadout_arms`). A pair's blows take turns between its two blades or
  maces; an "& Shield" holds its weapon with a shield that blocks as a shield does (80 degrees, and shots); a lone
  sword, mace or flail, or a pistolet, leaves the left hand free for a torch; the Great Axe fights as the axe; the
  Greatsword is its own, a sword held on its hilt in both hands; a double pistolet fires right, then left, before one
  long reload.
- **Drawn.** Melee is drawn first; `1` draws Melee and `2` Ranged ([[Interface]]). The room takes up the arms of
  either worn loadout, and a swap between them holds off blows and shots for 0.4 s.
- **Perks.** A trait fits `melee`, `ranged`, `weapon` (either loadout), `armour` or `shield`. A shield's block perks
  fit only the loadouts with a shield: Bulwark is rolled onto no other piece, and Coral Guard is The Reefwall's own. A
  worn piece gives a trait only where a roll could offer it (`gear::catalogue::trait_fits`).
- **Named pieces.** One Legendary for each kind, in the harbour town's voice: Seawall the Sword & Shield, Tidegate the
  Dagger & Shield, Brinewhisper the Double Daggers, Harbourwarden the Sword, Crosscurrent the Double Swords,
  Beaconstaff, Anchorhead the Mace, The Bollards the Double Mace, Keeper's Watch the Mace & Shield, Wreckbreaker the
  Great Axe, Longshore the Greatsword, Mooring Chain, Breakwater, Stormpetrel, Harpooner, Quarterdeck, Signal Pair the
  double pistolet and Broadside. The Reefwall is an Atheric Sword & Shield.
- **A character kept with two hands** is read once into the loadouts (`gear::old_hands`), losing nothing. The main
  hand's piece takes its slot by its kind: a sword, dagger or mace with a shield beside it becomes its "& Shield",
  beside its twin their pair; a lone dagger becomes Double Daggers, an axe a Great Axe. An off-hand weapon is carried
  as its new kind. A shield is given back as its dismantle materials; a named one is made again as the named loadout
  it is now, carried or in the vault where it was, its XP kept and what its nodes cost given back. Carried and vaulted
  pieces read the same way, and a Vestige for either hand is one for Melee.

## Verbs

The weapons' perks that give a status ([[Combat]], "Statuses") or give back the Tenets ([[Arts]]), in
[[Arts and Loadouts as Claude Shapes Them]]'s shape. The room alone applies them, its statuses through its one door, as
a blow lands or a foe falls; none is in the trim, so no browser predicts them. What they count is the room's, for each
player while they are in it (`room::perks`). A blow lands when it strikes, is blocked or breaks a guard.

- **Melee**, on a swing. Exposing Strikes (perk) Exposes a foe on the third swing in a row to land on it, and the
  count starts again. A swing that lands on other foes and not on it ends its row, as does one it parries or dodges;
  a sweep that strikes it beside others keeps it. A swing that lands on no one leaves the other foes' rows as they
  were. Thunderclap (handling) Charges a foe whose guard a swing breaks. Exploit (perk) makes every swing on an
  Exposed foe a crit.
- **Ranged**, on a shot that lands. Marked Shot (handling) Exposes the foe struck by the first shot after a reload:
  every shot of a weapon that reloads after each one, and a double pistolet's right. Shocking Rounds (perk) Charges
  the foe struck by every fifth shot to land, on any foe; a shot that does not land is not counted.
- **Either loadout.** Keen Eye (perk) gives Crit for 4 s on a kill. Attuned (finish) makes a blow or shot 10% harder
  while its element is the worn Art's; a spell never takes it. Spellfeed (finish) takes 3% off both Tenets'
  cooldowns on a kill, a spell's kill too.
- **The pools.** Each column's pool grows by about half with them: a Melee loadout is offered among 4 handling traits,
  5 finishes and 8 perks (9 with a shield), a Ranged one among 4, 5 and 6; armour among its 6 perks.

## Drops

[[Loot Drops Are Seen, and Ranged Weapons Carry Ammo]], in [[Arts and Loadouts as Claude Shapes Them]]'s shape, after
DFO's spoils ([[Pick - Loot Drops]]).

- **What drops.** For each player who earned a kill: their Vestige, if one dropped; an Ammo box by the foe's rank
  (Minor one in five, Major 35 in 100, Elite 60 in 100, a Miniboss or a Boss always); and from a Miniboss or a Boss an
  Ammo crate, straight into their crates while they carry fewer than five, else lying with the rest (`room::drops`).
- **Thrown out.** The pieces leave the body in a fan toward the player, each its own slot of it, 1.2 radians either
  side, and come to rest 2 m out, on the ground or a block's top there, or at the body where a wall stands. A piece
  flies 0.6 s and is taken only once it rests.
- **Taken.** Walking within 1.5 m of a piece at rest takes it: a Vestige while fewer than ten are carried, a box while
  the ammunition is not full, a crate while fewer than five are carried. A piece not taken stays two minutes.
- **Seen.** Each piece arcs out of the body and bounces twice to rest, then stands upright as its own picture, the
  Vestige glyph in its rarity's colours, an Ammo box or an Ammo crate. A thin line rises from its top as it rests:
  Normal 0.7 m, Magic 1 m, Rare 1.4 m, Legendary 1.9 m, Atheric 2.5 m, ammunition's white at 0.7 m. A glint climbs
  it, a Legendary's and an Atheric's pulse, and a Rare or finer chimes as it comes to rest ([[Interface]]).

## Ammo

- **Capacity.** A Ranged loadout carries shots: a bow 60, a crossbow 30, a pistolet 24, a double pistolet 36, a
  thunderlock 16 (`gear::ammo`). The character keeps the ammunition as a share of the full capacity, in 720 parts
  every capacity divides, so another Ranged weapon worn keeps the same share; a character kept before ammunition reads
  full.
- **Spent.** Each shot spends one shot's parts; at none the weapon will not fire ([[Combat]], "Shots"). Foes never run
  dry.
- **Back.** An Ammo box gives back a quarter of the capacity, at least one shot of any kind. An Ammo crate, used
  anywhere by a held press on its cell (an ask, refused with none or at full), fills it. Five crates are carried at
  most; the Quartermaster sells one for 250 Aurem every day, besides the armour.
- **Sent.** The gear message carries the shots left in the Ranged loadout worn, its capacity, the share and the
  crates; the fighter carries the shots left, which the browser predicts it by.

## Vendors

- **The Quartermaster** sells armour (head, torso, arms, legs) and an Ammo crate, and **the Armsmith** loadouts, two Melee to each
  Ranged, in a social space's arcades ([[Cities]]). Each shows six wares a day, three Rare and three Magic, made at the
  buyer's
  level (at most 20), the same for everyone that day and new the next (`gear::vendor`). The slots turn with the day,
  so over four days the Quartermaster sells each armour piece at each rarity.
- A ware costs Aurem only: 2,000 for Rare, 600 for Magic. It is bought only in a social space, and carried with its
  slot's nine. Legendary and Atheric gear is never sold: it is earned.
- The room sends the day's wares with a player's gear while they stand in a social space, with the Tailor's emblems,
  sends them again as the day turns, and a purchase is an ask like any other.

## Emblems

An emblem is a cosmetic after Destiny's ([[Cosmetics Follow Destiny, Shown in Many Places]]): a sign and the nameplate
it heads, shown beside a player's name wherever others see it ([[Interface]], "Emblems"). Its catalogue is
`content/gear/emblems.json`, numbered by its order on the wire, each with a name, a rarity, words, where it comes from
and its art (`gear::emblems`).

- **Kept and worn.** A player keeps every emblem they have had, as Destiny's kiosks kept them, and wears one, both in
  their character; a character kept before emblems reads with the starting one, and one wearing an emblem it does not
  keep wears the starting one.
- **Where each comes from**: Overlook's own at the start; one at each of levels 5, 10, 15, 20, 25 and 30; deeds
  (a piece fully upgraded, a Vestige opened to a Legendary or an Atheric, a foe's shield broken, a foe slain at Storm
  seas, a resource gathered); and the Tailor, who sells six a day of twelve, the same for everyone that day, at 500
  Aurem for Magic and 2,500 for Rare, some from a level. Levels and a piece fully upgraded are earned as they happen.
- **Asks**: wearing one kept, anywhere; buying one of the day's at the Tailor's counter. A kept character carries what
  others see of it beside it (`shown`): level, Defense, the Melee loadout's Attack (the Ranged one's without one),
  the emblem worn, and each piece worn.

## Elements and shields

- **A weapon's element** ([[Weapons Carry Blaze, Volt or Cosmic, and Foes Carry Shields]]): Blaze, Volt or Cosmic,
  or none. It is rolled as the weapon is made, as a Vestige opens, a vendor stocks it or the Test Ground grants it, by
  rarity: one in ten for Normal, one in five for Magic, about one in three for Rare, one in two for Legendary and
  Atheric; it is not guaranteed. Armour carries none. A blow carries the element of the loadout that struck it, none
  from the fists; a shot keeps the one it was loosed with.
- **A foe's shield.** One foe in five that a garrison stands carries a shield of an element chosen evenly, holding half
  its health, drawn from its node's id, so its group stands with the same shields each time; a Boss or a Miniboss never
  does. A foe a Boss calls stands with none. While it holds, a blow wears the shield and not the foe's health: three
  times as hard with the shield's own element, half as hard with another, as hard as on health with none. A blow the
  shield holds whole fills no poise; what a guard pays in stamina is paid as ever. What a breaking shield cannot hold
  reaches health. A shield does not come back.
- **What is told.** The room tells each blow a shield takes, with what it took, and its breaking; the browser draws a
  shielded foe's shield over its health in its element's colour, says what the shield took in that colour for the
  player's own blows, and stacks the words told of one foe at once. Its glyphs show the elements on the screens
  ([[Interface]], [[Text Is Plain]]).

## Where foes stand

- **Each island** has a band of foe levels (`gear::world`), rising with the voyage away from Overlook as Destiny 1's
  worlds did: 1–4, 4–7, 7–10, 10–13, 13–16, 16–19, 19–22, 22–26 and 26–30, the ninth reaching the highest player.
- **The seas** a voyage sets out at raise them: Calm as they are, Rough two levels higher, Storm three, never past
  level 32; and pay by them: half again, or twice, the XP and Aurem of a kill and its chance of a Vestige.
- **A garrison's foes** ([[Garrisons Take the Gear Loop's Levels and Shields]], [[Enemies]]) each stand at a level
  drawn evenly from their island's band, from the node's id, raised by the room's seas; a Boss's called foes at its
  level. The level sets a foe's power against a player's gear, as above; its rank multiplies its health, poise, might
  and defence on top ([[Foes]]). A node with no island stands its foes at level 0.

## Looks

The figure wears its gear (`gearOutfit`), redressed whenever what it wears changes, and the room passes the dress on
to every other player. Every garment is armour ([[Clothing Is Armour, With a Wardrobe Later]]):

- **Normal and Magic** pieces are clothes: a shirt (Magic, with a tunic or vest over it), breeches, trousers or a
  skirt, and shoes (Magic, tall boots), dyed in the rarity's plain or brighter dyes. A Magic head or arms piece is
  leather; a Normal one shows nothing.
- **Rare and finer** pieces are armour sets of the forge: Rare in chain, steel or iron, Legendary in silver, elven,
  dwarven or the knights' set, Atheric in daedric, ebony, adamantium or mithril, the first the forge draws for every
  piece of the slot (the torso's cuirass and pauldrons, the legs' greaves and boots).
- **The cloak** is a casual cloak, or a formal one from Rare up, in the rarity's dye; the hands hold the loadout
  drawn, in the rarity's metal.
- Each rolled item keeps its own look by its name; a named item takes its rarity's first.

## Limits

- A loadout's traits work whichever of its hands strikes, and every trait worn counts once however many pieces give
  it.
- The menu ([[Interface]], "The menu") shows gear on foot in a room; offline, no room keeps
  gear, so it says so. The Test Ground keeps its own panel, with the grants.
- Gear is kept between visits only in the game's node rooms, for a page with a session ([[Accounts]]).
- A look is chosen by rarity and the item's own name, not drawn for each item: a named item has no look of its own,
  and a Normal head or arms piece shows nothing over the figure.
- No Breach items exist yet; cloaks belong to no faction.
- A piece kept with a trait that no longer fits it, such as armour with Bulwark, still shows that node, which gives
  nothing.
- The traits' and items' words are English only.
