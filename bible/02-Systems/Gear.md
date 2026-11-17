---
type: system
status: live
code:
  - crates/gear/src/item.rs#Item
  - crates/gear/src/grid.rs#columns
  - crates/gear/src/grid.rs#cost
  - crates/gear/src/power.rs#level
  - crates/gear/src/power.rs#by_player
  - crates/gear/src/power.rs#on_player
  - crates/gear/src/character.rs#Character
  - crates/gear/src/asks.rs#Ask
  - crates/gear/src/vestige.rs#dropped
  - crates/gear/src/vestige.rs#opens_to
  - crates/gear/src/vestige.rs#make
  - crates/gear/src/rewards.rs#worth
  - crates/gear/src/catalogue.rs#catalogue
  - crates/room/src/power.rs#empower
  - crates/room/src/power.rs#pay_kill
  - crates/room/src/asks.rs#answer
  - crates/protocol/src/gear_wire.rs#gear_bytes
  - client/src/player/gear.ts#gearHands
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
  Aurem; lesser upgrades fragments; a Legendary's or Atheric's nodes its island's resource, and its last three
  upgrades 6 Essence each.
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
  now and then above its own, and to a named item of its slot (a Breach's excepted) or a lesser one of a kind the slot
  takes, its name and traits rolled, never a trait twice.
- **Asks.** Wearing, taking off, buying and choosing nodes, dismantling, identifying, feeding Fruit, and the vault.
  An ask refused changes nothing and says why. A slot carries nine beside the one worn; the vault, reached in a
  social space, twenty weapons, twenty armour and twenty Vestiges. Dismantling returns Aurem, fragments and, from a
  Legendary or Atheric, Essence with a third of what was spent on it.
- **Chance** comes from a hash of the room's seed, its tick, the player and what the roll is for, so the same seed
  gives the same loot.

## In the rooms

- **Each player's gear** is held by the room they are in ([[Server]]), the starting kit as they join, and sent to
  them alone whenever it changes, every column of every item spelled out so the browser draws it without the rules.
- **Hands.** A player holds only what their gear puts in their hands, or a torch beside a one-handed weapon; the
  browser draws the hands from the gear worn, in a metal its rarity likes.
- **Blows.** Every blow is made with its power as it is struck: a player's on a foe by the Attack of the hand that
  struck it (a shot is the main hand's), a foe's on a player by the player's Defense, each by the two levels. A foe
  of level 0 fights by combat's own numbers.
- **Kills.** A foe's death pays every player whose blow landed on it in its last ten seconds, and lays each one's
  Vestige where it fell, seen by them alone, for two minutes.
- **Asks** ride the player's inputs and are answered in turn. A city's social space answers identifying and the vault
  anywhere in it; the [[Test Ground]] within reach of its stall. The Test Ground alone hands out gear.

## Limits

- Perks are named and chosen but change no fight until the combat rules read them.
- The Test Ground's panel is the only screen; the Enhanced Plus screens come next.
- Gear lives only while a player stays in one room, until there are accounts ([[Accounts Start as Guests, on Cloudflare D1]]).
- The hands are drawn in a metal the rarity likes, not each item's own look; armour, clothing sets and the cloak do
  not dress the figure yet.
- No Breach items exist yet, and no clothing is armour yet ([[Clothing Is Armour, With a Wardrobe Later]]); cloaks
  belong to no faction.
- The traits' and items' words are English only.
