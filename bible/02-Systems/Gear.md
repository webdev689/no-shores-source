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
  - crates/gear/src/asks.rs#Ask
  - crates/gear/src/vestige.rs#dropped
  - crates/room/src/dungeon_room.rs#keep_cache
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
  belongs to one Atheric; every slot has a Legendary and an Atheric a Vestige can open to; every rolled pool holds
  enough traits.
- **An item** is a kind (eleven weapons, the shield, four armour pieces, the cloak), a rarity, a level (1 to 20; a
  Legendary or Atheric is 20), its XP and the nodes bought and chosen. A named item copies its traits from the
  catalogue when it is made, so it stays what it was.
- **Where it is worn.** The main hand takes any weapon; the off hand a shield or a dagger, sword, mace or flail. A
  two-handed weapon (axe, warhammer, staff, bow, crossbow, thunderlock) empties the off hand. A player wears an item
  only at its level or above, and one Atheric in the hands and one in the armour at a time.
- **Nodes.** An item's columns run left to right, by its rarity and whether it is a weapon: upgrades, handling (how
  a weapon is gripped or fired), finish (how any weapon is balanced), perks and an Atheric's own. Each column
  unlocks when the item's XP reaches it; one node of each trait column is chosen among those bought, the first bought
  chosen at once. Upgrades raise Attack, or Defense and Prestige, by equal steps to the item's most. A node costs
  Aurem, and more as the rarity rises: a Magic's upgrades a fragment, a Rare's nodes one and its upgrades three; a
  Legendary's or Atheric's handling, finish and perks 2 fragments and 5 of its island's resource, a weapon's upgrades
  before its last three 5 fragments and 10 of the resource, and its last three upgrades (every upgrade of an armour
  piece) 6 Essence each; an Atheric's own, 1 Essence ([[Gear as Claude Shapes It]]).
- **XP.** A kill's XP goes to every player who struck the foe in its last 10 s, a tenth more with Scholar worn; for
  each, to the weapon whose blow last landed and to every armour piece and shield worn. An item stops earning at its
  last column. Past level 20, each 20,000 XP grows a Fruit of Dagon, which gives an item 5,000 XP when fed to it.
- **Level and Prestige.** XP alone reaches level 20. Past it, the Prestige of the four armour pieces worn sets the
  level, to 30. A Rare at level 20 carries 13 to 15, a Legendary 18 to 27 (a Breach's to 30), an Atheric 21 to 30.
- **Attack and Defense.** A weapon's blow is times 1.07 for each of the foe's levels up to its Attack ÷ 15, and
  falls to 0.67, 0.56, 0.47 and none as the player is one to four levels below the foe. A foe's health is its kind's
  times 1.07 for each of its levels, so a matched player fells it in the blows combat is tuned for. A foe's blow is
  times 1.07 for each of its levels past the player's Defense ÷ 45, and a quarter more for each level the player is
  below it, up to double.
- **Vestiges.** A kill may leave a Vestige for each player who struck the foe, seen by them alone: by the foe's
  chance (a boss's is sure), its colour weighted by the foe (Legendary from level 18, Atheric from 20), for one slot,
  its item at the foe's level. A player carries ten. Identified in a social space, it opens to a colour at, below or
  now and then above its own, never above what its level could drop (Legendary from 18, Atheric from 20), and to a
  named item of its slot (a Breach's excepted) or a lesser one of a kind the slot takes, its name and traits rolled,
  never a trait twice.
- **Asks.** Wearing, taking off, buying and choosing nodes, dismantling, identifying, feeding Fruit, and the vault.
  An ask refused changes nothing and says why. A slot carries nine beside the one worn; the vault, reached in a
  social space, twenty weapons, twenty armour and twenty Vestiges. Dismantling returns Aurem, fragments and, from a
  Legendary or Atheric, Essence with a third of what was spent on it.
- **Chance** comes from a hash of the room's seed, its tick, a count of the rolls the room has made, the player and
  what the roll is for. A deployed room's seed is its host's own, random and never sent, so no player can foresee a
  roll; a room in the page keeps one fixed seed, so it gives the same loot for the same play. A kept character is
  made whole as it is read: its stocks within their caps, each item's choices, nodes, level and XP within its own,
  one worn where it does not fit carried, so no keeping can make a room refuse or fail on it.

## In the rooms

- **Each player's gear** is held by the room they are in ([[Server]]), the starting kit as they join, and sent to
  them alone whenever it changes, every column of every item spelled out so the browser draws it without the rules.
- **Hands.** A player holds only what their gear puts in their hands, or a torch beside a one-handed weapon; the
  browser draws the hands from the gear worn, in a metal its rarity likes.
- **Blows.** Every blow is made with its power as it is struck: a player's on a foe by the Attack of the hand that
  struck it (a shot is the main hand's, as it was when the shot was loosed), a foe's on a player by the player's
  Defense, each by the two levels. A foe of level 0 fights by combat's own numbers.
- **Kills.** A foe's death pays every player whose blow landed on it in its last ten seconds and could harm it (four
  levels below, a blow does nothing and shares nothing), and lays each one's
  Vestige where it fell, seen by them alone, for two minutes, under a beam in its rarity's colour ([[Game]], "On
  foot"). Walking within 1.5 m picks it up.
- **A dungeon's cache.** When a dungeon's Reeve falls, its cache opens, and every player then in the dungeon's room
  finds a Vestige lying before it, theirs alone, whoever struck him: sure, at the Reeve's level, in the colours a
  Reeve's kill leaves (a boss's), and lying and picked up as a kill's does ([[Dungeons]], "In the rooms").
- **Perks.** The traits a player's worn gear gives make a trim of combat's numbers, which their fighter carries, so
  their browser predicts it to the bit ([[Combat]]). The room adds what only it knows the moment of: Honed, Executioner
  and Undertow as a blow is struck, Point Blank and Long Shot by the ground a shot covered, and the stamina a kill, a
  parry or a block gives back, with Last Light's reload.
- **Asks** ride the player's inputs and are answered in turn. A city's social space serves each at its own counter: a
  Vestige opened at the Reader's, the vault at a vault's, a ware at its vendor's ([[Interface]]); the [[Test Ground]]
  serves them all within reach of its stall. The Test Ground alone hands out gear.

## Vendors

- **The Quartermaster** sells armour (head, torso, arms, legs) and **the Armsmith** weapons and shields, in a
  social space's arcades ([[Cities]]). Each shows six wares a day, three Rare and three Magic, made at the buyer's
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
  others see of it beside it (`shown`): level, Defense, the main hand's Attack, the emblem worn, and each piece worn.

## Elements and shields

- **A weapon's element** ([[Weapons Carry Blaze, Volt or Cosmic, and Foes Carry Shields]]): Blaze, Volt or Cosmic,
  or none. It is rolled as the weapon is made, as a Vestige opens, a vendor stocks it or the Test Ground grants it, by
  rarity: one in ten for Normal, one in five for Magic, about one in three for Rare, one in two for Legendary and
  Atheric; it is not guaranteed. Armour and shields carry none. A blow carries the element of the weapon that struck
  it, none from the fists while a bow or gun is worn; a shot keeps the one it was loosed with.
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
- **The cloak** is a casual cloak, or a formal one from Rare up, in the rarity's dye; the hands hold the weapons and
  shield worn, in the rarity's metal.
- Each rolled item keeps its own look by its name; a named item takes its rarity's first.

## Limits

- A weapon's traits work whichever hand strikes, and every trait worn counts once however many pieces give it.
- The menu ([[Interface]], "The menu") shows gear on foot in a room; offline, no room keeps
  gear, so it says so. The Test Ground keeps its own panel, with the grants.
- Gear is kept between visits only in the game's node rooms, for a page with a session ([[Accounts]]).
- A look is chosen by rarity and the item's own name, not drawn for each item: a named item has no look of its own,
  and a Normal head or arms piece shows nothing over the figure.
- No Breach items exist yet; cloaks belong to no faction.
- The traits' and items' words are English only.
