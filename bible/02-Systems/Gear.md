---
type: system
status: live
code:
  - crates/gear/src/emblems.rs#emblems
  - crates/gear/src/looks.rs#shown
  - client/src/player/sourceLooks.ts#earnedFrom
  - client/src/game/gearCards.ts#cardOf
  - client/src/game/gearScreen.ts#itemDetailOf
  - crates/room/src/stats.rs#stats
  - crates/room/src/perks.rs#trim_by
  - client/src/game/itemStats.ts#statsOf
  - crates/gear/src/cosmetics.rs#dressed
  - content/gear/drawn.json
  - crates/gear/src/emblems.rs#sold_on
  - crates/gear/src/cosmetics.rs#cosmetics
  - crates/gear/src/cosmetics.rs#sold_on
  - crates/gear/src/shape.rs#present
  - crates/gear/src/shape.rs#wares
  - content/gear/cosmetics.json
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
  - crates/gear/src/catalogue.rs#faction_perks
  - crates/gear/src/vestige.rs#made_named
  - crates/room/src/perks.rs#sharpened
  - crates/room/src/perks.rs#verbs_after
  - crates/room/src/perks.rs#PerkCounts
  - crates/room/src/power.rs#drawn
  - crates/room/src/power.rs#perk_on
  - crates/gear/src/character.rs#has_drawn_trait
  - crates/gear/src/asks.rs#Ask
  - crates/gear/src/vestige.rs#dropped
  - crates/room/src/dungeon_room.rs#keep_cache
  - crates/gear/src/vestige.rs#opens_to
  - crates/gear/src/vestige.rs#make
  - crates/gear/src/rewards.rs#worth
  - crates/gear/src/rewards.rs#loot_kill
  - crates/gear/src/rewards.rs#keep_found
  - crates/gear/src/rewards.rs#unsealed
  - crates/gear/src/rewards.rs#Clear
  - crates/gear/src/vestige.rs#found_items
  - crates/room/src/clears.rs#pay_garrison_clear
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
  - client/src/combat/drops.ts#motionAt
  - client/src/combat/vestigeCrystal.ts#crystalFrame
  - crates/room/src/drops.rs#mail_lying
  - crates/gear/src/mail.rs#Letter
  - crates/gear/src/mail.rs#carry_or_post
  - crates/gear/src/ammo.rs#capacity
  - crates/gear/src/ammo.rs#box_chance
  - crates/room/src/asks.rs#answer
  - crates/protocol/src/gear_wire.rs#gear_bytes
  - client/src/player/gear.ts#gearHands
  - client/src/player/gearLooks.ts#gearOutfit
  - client/src/testground/gearPanel.ts#GearPanel
  - crates/room/src/companions.rs#keep_companions
  - crates/room/src/companions.rs#companion_times
  - crates/room/src/companions.rs#type_of
  - client/src/combat/companions.ts#officerName
  - client/src/player/foeDress.ts#officerDress
  - crates/gear/src/source.rs#Source
  - content/gear/looks.json
  - content/gear/rolled.json
  - client/src/player/gear.ts#itemName
  - content/gear/words.json
  - client/src/player/gear.ts#itemWords
  - client/src/player/sourceLooks.ts#setName
  - client/src/player/sourceLooks.ts#rolledArmourSet
  - crates/gear/src/vestige.rs#rolled
  - client/src/player/sourceLooks.ts#rareSet
  - client/src/player/sourceLooks.ts#rolledMetal
  - crates/room/src/run_room.rs#dungeon_run
---
# Gear

What a player wears and how it makes them stronger, after Destiny 1 at launch
([[Gear and Power Follow Destiny 1 Vanilla]]): items of five rarities whose nodes are unlocked by XP and bought with
materials, armour whose Prestige carries the player past level 20, and sealed Vestiges opened in a social space. Every
number is one of [[Gear as Claude Shapes It]].

## How it works

- **One crate for every machine.** The `gear` crate holds the rules, with no clock or platform, so the server and any
  browser agree. Its content is authored in `content/gear/` and built into it: the traits, the named items, the
  islands' resources, each armour and weapon kind's word and a ship's rolled modules' names. The catalogue is checked whole by a test: every trait a named item
  offers exists, sits in the right kind of column and fits the item; no item offers a trait twice; each signature
  and each intrinsic belongs to one Atheric, and every Atheric weapon has an intrinsic; every kind of loadout has a named Legendary; every slot has a named Legendary and an Atheric; every armour and weapon
  kind has its word; every rolled pool holds enough traits for a Legendary; every faction perk is a perk of a faction the factions' file
  holds, and each faction's armour piece and weapon writes no traits and has one of its faction's perks that fits it;
  every Breach perk is a perk and no faction's, and every armour and weapon kind has as many of them as its widest
  piece has perk nodes in all.
- **An item** is a kind (a Melee or a Ranged loadout, four armour pieces, the cloak, or one of a ship's four modules,
  [[Ship Power]]), a rarity, a level (1 to 20; a
  Legendary or Atheric is 20), its XP and the nodes bought and chosen. A faction's armour or weapon keeps the traits it
  rolled as it was made ("Verbs", "The factions' perks"), checked as a rolled item's are, its faction's perks among its
  perk columns' pools; one kept from before keeps the traits its entry once wrote. A Breach's armour or weapon
  (`breach`) keeps the traits it rolled too, the Breaches' perks its perk columns' pool, and one of those gone gives
  way to another of them ("The Breaches' perks"). Any other named item follows its
  catalogue entry: in
  a kept one's column whose traits changed, a node bought moves with its perk to where the perk stands now, else to the
  perk it merged into, else stays where it was if a plain perk stands there (a reworked one, as an Atheric's own);
  one where only a perk that gives and takes stands, or a place another took, is given back for what it cost, so no
  cost is pressed on a player who never chose it. Each choice follows its node. A rolled one offering a trait the
  catalogue no longer holds, or holds in another column (Double Shotted, a perk become a finish), offers in its place
  the perk it merged into where that fits it, else the first plain perk of its column's pool it lacks, bought and
  chosen as it was; with none left but perks that give and take, the first of those, its node given back
  (`old_hands::unfit`). A named item of another rarity than its entry keeps its traits and takes no intrinsic.
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
  piece) 6 Essence each, an Atheric's 8 and a Breach's Legendary armour's 7; an Atheric's own, 2,500 Aurem, 4
  fragments, 10 of the resource and 1 Essence, so an Atheric never costs less of anything to finish than a Legendary
  ([[Gear as Claude Shapes It]], [[The Balance and Economy Pass as Claude Shapes It]]). A resource is
  gathered at its island's nodes, each drawn as the resource itself
  ([[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]). In a patrol every node stands for everyone;
  one a player gathers is spent for them alone and returns for them nine minutes of wall-clock time later ([[Server]];
  [[The Harbourmaster Stands in the Market, Rain Spares the Trees, and Patrol Nodes Always Stand]]).
- **A kill's pay.** XP and Aurem are the foe's kind's as a Major at level 5 (Skirmisher 80 and 7, Archer 85 and 7,
  Swordsman 95 and 7, Brute 110 and 8, Captain 120 and 8), times its rank's health against a Major's (Minor 0.6,
  Elite 2.2, Miniboss 4, Boss 7; `rewards::RANK_PAY`), times (5 + its level) ÷ 10, times the voyage's tier. The kinds
  span less than one rank's step, so a higher rank always pays more, whatever the kinds, at every level and tier.
- **XP.** A kill's XP goes to every player who struck the foe in its last 10 s, a tenth more with Scholar worn; for
  each, to the loadout whose blow last landed and to every armour piece worn. Every deed's XP (a kill, a clear, a
  chest, a sinking, a bounty, the day's and the week's clears, a road's task) also grows the worn Art and, while its
  cape is worn, the faction pledged, before Scholar's share (`earn_play_xp`). An item stops earning at its
  last column. Past level 20, each 20,000 XP grows a Fruit of Dagon, used from the inventory: one gives every piece
  worn (the loadouts, the armour and the cloak, never a ship's module or a horse) 5,000 XP each, up to its last column,
  and is refused while none of them can grow ([[A Fruit of Dagon Is Used From the Inventory and Grows Everything Worn]]).
- **Level and Prestige.** XP alone reaches level 20. Past it, the Prestige of the four armour pieces worn sets the
  level, to 30. A Rare at level 20 carries 13 to 15, a Legendary 18 to 27 (a Breach's to 30), an Atheric 21 to 30,
  each climbing by equal steps over its upgrades, however many its grid holds (a ship's guns five, armour three).
- **Attack and Defense.** A weapon's blow is times 1.07 for each of the foe's levels up to its Attack ÷ 15, and
  falls to 0.67, 0.56, 0.47 and none as the player is one to four levels below the foe. A foe's health is its kind's
  times 1.07 for each of its levels, so a matched player fells it in the blows combat is tuned for. A foe's blow is
  times 1.07 for each of its levels past the player's Defense ÷ 45, and a quarter more for each level the player is
  below it, up to double. Defense comes from the four armour pieces alone: head 0.3125 of a full set's, torso 0.3375,
  arms 0.2625, legs 0.2375.
- **Vestiges**, in Destiny 1's order ([[The Balance Pass Goes Halfway Back, and Loot Follows Destiny 1's Order]], [[Bosses and Dungeons Drop Items, Clears Pay, and Shapes Come From the Week's Abyss]]). A kill may leave a Vestige for each player who
  struck the foe, seen by them alone: by the foe's rank (Minor 2 in 100, Major 4, Elite 10, Miniboss 35, a Boss always;
  `vestige::chance`), raised by the voyage's tier, a chance past one leaving one sure and another by what is over; its
  colour weighted by its rank, for one slot, its item at the foe's level. At every rank each colour is half or less of
  the one below it, and each colour or better likelier the higher the rank (`vestige::colours`, in 1,000: Minor 750,
  188, 47, 12, 3; Major 716, 204, 58, 17, 5; Elite 670, 223, 74, 25, 8; Miniboss 606, 242, 97, 39, 16; Boss 517, 258,
  129, 64, 32); a colour too good for the foe's level (Legendary below 18, Atheric below 20) is struck out, the rest
  keeping their order. A player carries ten. Identified in a social space, it opens to its
  own colour three times in four, one colour below one time in five and one above one time in twenty (a Normal opens
  Normal 95 in 100, an Atheric Atheric 80), never above what its level could drop. An Atheric is a named Atheric of
  its slot, one of its own content's ("Where it came from", below) where that content has one of its slot, else any
  content's. Any other colour, a Legendary too, is a piece of a kind the slot takes in its content's set look, its look
  and traits rolled, never a trait twice ([[Every Drop Wears Its Content's Set, With Random Perks]]); a Legendary is
  level 20, its Prestige a Legendary's, its nodes asking for an island's resource rolled among the catalogue's, and a
  Breach's Legendary armour climbs to 30 Prestige. A Breach's armour or weapon rolls its perk columns from the
  Breaches' own perks ("Verbs", "The Breaches' perks"). A ship's Legendary module is a named one ([[Ship Power]]).
- **Commons drop as themselves** ([[Commons Drop as Themselves, Never as Vestiges]]). A Vestige is Magic or finer:
  wherever a Vestige rolls Normal (a kill's, a Boss's or a Miniboss's, at sea too, a chest's, a first clear's, a
  playlist's, the [[Test Ground]]'s), the Normal item comes instead, made as that Vestige would have opened, at
  Normal, of its slot, level and content (`unsealed`), at the same chance, the colours' weights as they stand. It is
  kept as an item found as itself is: in its slot's nine, else the vault, else the mail ("Items as themselves", "The
  mail"); the page shows it in the loot feed as every new item, never as a crystal on the ground. A Vestige still
  opens below its colour as above, so a Magic one may open Normal. A Normal Vestige a save already holds is kept and
  opens as before. A package is Rare or Legendary and a week's clear Legendary or Atheric, so neither ever rolls one.
- **Names** ([[Everything Carries a Set Name, and Perks Roll by Pool]]). Every rolled armour piece and weapon is named
  by its set and its kind's word: "Portwatch Helm", "Wreckborn Sword and Shield" (`itemName`). Its set is the one its
  look is drawn in, before the forge's fallbacks: each look of each content carries its set's name in
  `content/gear/looks.json` (an armour set and the weapon metal of one look share it, the Breach's daedric is the
  Lattice); a Normal piece, and a Magic one drawn as clothes, is Homespun. Each kind's word is in
  `content/gear/rolled.json` (a weapon's as the game words its kind, "Twin Daggers", "Brace of Pistolets"; armour
  Helm, Hauberk, Gauntlets, Greaves). A faction's pieces are named in `content/gear/items.json` by its faction's set:
  Stormcaller, Lamplighter, Veiled. An Atheric keeps its own name, and so does any other named piece. The named
  Legendaries that are no faction's leave every drop, Vestige and vendor: no Vestige, kill, clear, package or Shape
  gives one. They are kept-only, and one a player keeps stays as it is, its name its own. A rolled piece's `name`
  byte is its look roll. A gun is named by its content's metal, though drawn plain or gilded, so it says where it was
  earned. A ship's module keeps its rolled name.
- **Words** ([[Weapons and Armour Carry Flavour Text]]). Every armour piece and weapon has words on its card and its
  page (`itemWords`). A rolled one reads its set's line for its kind, in `content/gear/words.json` by set name and kind
  word ("Portwatch", "Helm"): one line for every pair a rolled piece is made in, Homespun's for every kind. A test makes
  every rolled piece of every content, rarity, level and look roll, and holds each to its line and every line to a
  piece. A named piece reads its own words in `content/gear/items.json`; a faction's piece with none, its faction's.
- **Stats** ([[The Inspect Panel Follows Destiny's Weapon Page, Its Stats Shown and Its Nodes Square]],
  [[The Inspect Panel as Claude Shapes It]]). An item's fight numbers, as its card and page show them, are the room's
  own (`room::stats`), never numbers of the screen's: what its kind fights with, from combat's arms and shots and the
  player's swing and reload as the step paces them, under the trim the traits it gives make (`trim_by`, the one
  `trim_of` makes of a player's worn gear), so a page and play agree to the bit; a test steps a fighter holding each
  weapon's stroke or trigger and holds the rates to it. Damage is a player's on a foe of level 0, half again as the
  room strikes a foe (`PLAYER_HARM`), before the Attack and the levels weigh it. A Melee loadout's: a diagonal blow's
  damage (a pair's at its pair's share), blows a second, how far the blow reaches from the feet to a body's middle, the
  poise it fills and the stamina a swing costs. A Ranged one's: a quick shot's damage (a bow's two thirds) and a full
  draw's, shots a second (the tick a reload ends begins nothing, so the next shot comes a tick after it; a pair of
  pistolets fires twice, the left a brace's gap and a tick after the right, then reloads), the poise a shot fills (its
  weight's alone), the shots it carries (`ammo::capacity`), how fast an arrow or a bolt flies (a ball at once) and the
  share of the pace kept aiming. How either is held: a hand free (the page says nothing of it), a shield, a pair, or both hands (a
  two-handed blade, a bow, a crossbow, a thunderlock). Any item's body numbers, which armour shows: the stamina back a
  second resting, a dodge's cost, the poise held before a stagger and a healing charge's share; a weapon's with its
  finish's trims while it is drawn. The browser asks them of the room's module (`fighter_item_stats`), as it predicts
  the player's fighter; an Atheric's intrinsic counts only at its catalogue entry's rarity, as the room counts it.
- **Items as themselves.** A Boss's kill always leaves each player who struck it an item, not sealed, and a Miniboss's
  35 times in 100, each beside its Vestige and by a roll of its own, raised by the tier as the Vestige is
  (`vestige::found_items`, `loot_kill`). It is made as a Vestige of its rank's colours, opened, would make it, for any
  slot, at the foe's level, and goes into its slot's nine, else the vault; with both full it is laid as a Vestige of
  its colour and slot at the foe's level, whatever a named item's own, but a Normal one is posted as itself
  (`keep_found`).
- **A clear** ([[Bosses and Dungeons Drop Items, Clears Pay, and Shapes Come From the Week's Abyss]], `room::clears`):
  once every group of a mission's, a dungeon's or a world boss's garrison is down at once, no wave standing, each
  player still in the room who shared a kill of a foe of its own groups, not a wave's or a quest's, since its last
  clear ([[Only the Garrison's Own Kills Share Its Clear, and a Failed Trip Goes Back to the Beach]]; as their account, so one who rejoined keeps it) is paid, at the garrison's highest level as a
  kill is: at level 5 a mission 400 XP and 30 Aurem, a dungeon 800 and 60, a world boss 1,600 and 120
  (`rewards::Clear`). A dungeon's clear also leaves an item, coloured as its Miniboss's, and a Vestige as often as its
  Miniboss leaves one. It pays once until a group stands again. A patrol never ends, so it pays none. A laid
  dungeon's room pays the same clear as its cache opens ([[Dungeons]], "The cache").
- **Asks.** Wearing, taking off, buying and choosing nodes, dismantling, identifying, feeding Fruit, and the vault;
  a ship's modules are fitted, upgraded and infused by the same asks ([[Ship Power]]), and its officers have theirs
  ([[Crew]]).
  An ask refused changes nothing and says why. A slot carries nine beside the one worn; the vault, reached in a
  social space, twenty weapons, twenty armour and twenty Vestiges. A slot read past nine from a kept character
  carries what it holds, and takes no more until it is down to nine. Dismantling returns Aurem, fragments and, from a
  Legendary (2, or 3 one time in two) or an Atheric (3), Essence, with a third of what was spent on it.
- **Chance** comes from a hash of the room's seed, its tick, a count of the rolls the room has made, the player and
  what the roll is for. A deployed room's seed is its host's own, random and never sent, so no player can foresee a
  roll; a room in the game's worker keeps one fixed seed, so it gives the same loot for the same play. A kept character is
  made whole as it is read: its stocks within their caps, each item's choices, nodes, level and XP within its own,
  one worn where it does not fit carried, so no keeping can make a room refuse or fail on it.

## In the rooms

- **A new character** arrives with no weapon and no armour, only their ship's first modules
  ([[The Stranger Welcomes the Player, and a Quest Walks Them Round Overlook]]); the Test Ground's player, and the
  scripted players that try the public events, wear a level 1 Normal sword and level 1 Normal armour
  (`Character::kitted`). A character kept before keeps its gear.
- **Each player's gear** is held by the room they are in ([[Server]]), a new character's as they join, and sent to
  them alone whenever it changes, every column of every item spelled out so the browser draws it without the rules.
- **Hands.** A player holds only what a loadout they wear puts in their hands, the fists with no Melee worn, or a
  torch beside a loadout that leaves the left hand free; the browser draws the hands from the loadout drawn, in a
  metal its rarity likes.
- **Blows.** Every blow is made with its power as it is struck: a player's on a foe by the Attack of the loadout its
  came from (a shot the Ranged one's, as it was when the shot was loosed; a swing Melee's, or Ranged's while it is
  drawn or no Melee is worn), a foe's on a player by the player's Defense, each by the two levels. On top, at every
  level, a player's blow on a foe strikes half again (`PLAYER_HARM`) and a foe's on a player three quarters
  (`FOE_HARM`), from [[The Whole Game Gets a Balance Pass]] and
  [[The Balance Pass Goes Halfway Back, and Loot Follows Destiny 1's Order]]. A foe of level 0 fights by combat's own
  numbers and those two alone.
- **Kills.** A foe's death pays every player whose blow landed on it in its last ten seconds and could harm it (four
  levels below, a blow does nothing and shares nothing), and throws out what it drops for each, seen by them alone,
  for two minutes ("Drops", below). While a player holds the Abyss boon this week ([[Activities]]), each kill pays
  them a quarter more of its XP, rounded down, to them and to the weapon that earned it, their worn Art and the
  faction pledged, as the kill's own goes ([[Factions]]) (`boon_xp`).
- **A dungeon's cache.** When a dungeon's end foe falls (its Reeve, or an Elite Dungeon's Boss), its cache opens
  and pays every player then in the dungeon's room a dungeon's clear at the end foe's level, whoever struck it
  (`pay_cache`; "A clear", above): its XP and Aurem, an item coloured as its Miniboss's, and a Vestige as often as its
  Miniboss leaves one, thrown out of the cache to lie before it for them as a kill's drop does ("Drops", below;
  [[Dungeons]], "In the rooms"). A run's first clear in its period pays as well, the dungeon of the day's or the
  week's two's, its Vestige kept straight into the carried ten, else the vault, else the mail ([[Activities]], "What it
  pays, once").
- **Perks.** The traits a player's worn gear gives make a trim of combat's numbers, which their fighter carries, so
  their browser predicts it to the bit ([[Combat]]). The room adds what only it knows the moment of: Honed, Executioner,
  Undertow, Exploit, Attuned, Thunderhead, Shared Flame and From the Dark as a blow is struck, Point Blank and Long Shot by the ground a shot covered, the
  stamina a kill, a parry or a block gives back, with Last Light's reload, the verbs ("Verbs", below) and the
  Atherics' own ("Atherics", below). A player's
  perks are the armour's and the drawn loadout's alone: the other loadout's wait until it is drawn, and drawing its
  sends the new trim to them at once. A shot takes the Ranged loadout's, a swing the drawn one's. No weapon's perk
  touches a spell or its kill.
- **Asks** ride the player's inputs and are answered in turn. A city's social space serves each at its own counter: a
  Vestige opened at the Mage's, the vault at a vault's, a ware at its vendor's ([[Interface]]), a bounty taken
  or turned in at the bounty board's (`CounterKind::Board`, [[Activities]]), and a letter taken at the mail's
  (`CounterKind::Mail`); the [[Test Ground]] serves them all within reach of its stall. The Test Ground alone hands
  out gear.

## Loadouts

[[Weapons Are a Melee and a Ranged Loadout]], in [[Arts and Loadouts as Claude Shapes Them]]'s shape.

- **Two slots.** Melee holds a Sword & Shield, Dagger & Shield, Double Daggers, Sword, Double Swords, Staff, Mace,
  Double Mace, Mace & Shield, Great Axe, Greatsword, Flail or Warhammer; Ranged a bow, crossbow, pistolet, double
  pistolet or thunderlock (`gear::kinds`). A loadout is one item, however many hands it fills: one Attack, one element,
  one set of perks. A Vestige for Melee opens to any Melee kind, evenly, and one for Ranged to any Ranged.
- **How each fights** ([[Combat]], `room::power::loadout_arms`). A pair's blows take turns between its two blades or
  maces, coming round faster than the lone weapon's, each a little lighter; an "& Shield" holds its weapon with a shield that blocks as a shield does (80 degrees, and shots); a lone
  sword, mace or flail, or a pistolet, leaves the left hand free for a torch; the Great Axe fights as the axe; the
  Greatsword is its own, a sword held on its hilt in both hands; a double pistolet fires right, then left, before one
  long reload.
- **Drawn.** Melee is drawn first; `1` draws Melee and `2` Ranged ([[Interface]]). The room takes up the arms of
  either worn loadout, and a swap between them holds off blows and shots for 0.4 s.
- **Perks.** A trait fits `melee`, `ranged`, `weapon` (either loadout), `armour` or `shield`; a faction's own perk
  fits only its faction's pieces ("Verbs", "The factions' perks"). A shield's block perks
  fit only the loadouts with a shield: Bulwark is rolled onto no other piece, and Coral Guard is The Reefwall's
  intrinsic. A worn piece gives a trait only where a roll could offer it (`gear::catalogue::trait_fits`). A node bought on a kept
  piece whose trait does not fit it, such as armour with Bulwark, is given back once as the character is read, for the
  Aurem and materials it cost, and a choice of it cleared (`gear::old_hands::unfit`).
- **Named pieces.** One Legendary for each kind, in the harbour town's voice: Seawall the Sword & Shield, Tidegate the
  Dagger & Shield, Brinewhisper the Double Daggers, Harbourwarden the Sword, Crosscurrent the Double Swords,
  Beaconstaff, Anchorhead the Mace, The Bollards the Double Mace, Keeper's Watch the Mace & Shield, Wreckbreaker the
  Great Axe, Longshore the Greatsword, Mooring Chain, Breakwater, Stormpetrel, Harpooner, Quarterdeck, Signal Pair the
  double pistolet and Broadside. Ten Atherics, one or more for each family ("Atherics", below).
- **Perks that give and take**, as Destiny 1's rolls traded one strength for another, offered among their column's
  others and trimmed as any perk is: Heavy Head (Melee handling) strikes 12% harder for a swing 20% dearer; Feather
  Edge (Melee handling) swings for 25% less stamina and fills a foe's poise 15% less; Overdrawn (Ranged handling) aims
  20% harder and reloads 20% slower; Hair Trigger (Ranged handling) reloads 25% faster and aims 10% softer; Reckless
  (finish) strikes 10% harder while blows fill the player's poise 20% more with it drawn; Guarded (finish) the
  other way, 20% less poise for 5% softer.
- **A character kept with two hands** is read once into the loadouts (`gear::old_hands`), losing nothing. The main
  hand's piece takes its slot by its kind: a sword, dagger or mace with a shield beside it becomes its "& Shield",
  beside its twin their pair; a lone dagger becomes Double Daggers, an axe a Great Axe. A named weapon takes its named
  kind whatever stood beside it, so each name stays one Legendary of one kind. An off-hand weapon is carried as its
  new kind. A shield is given back as its dismantle materials; a named one is made again as the named loadout
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
  Exposed foe strike 25% harder (`EXPLOIT_TIMES`).
- **Ranged**, on a shot that lands. Marked Shot (handling) Exposes a foe on the player's first shot to land on it:
  each player marks a foe once, and forgets it when it dies or leaves the room. Shocking Rounds (perk) Charges
  the foe struck by every fifth shot to land, on any foe; a shot that does not land is not counted.
- **Either loadout.** Keen Eye (perk) gives Crit for 4 s on a kill. Attuned (finish) makes a blow or shot 10% harder
  while its element is the worn Art's. Spellfeed (finish) takes 3% off both Tenets' cooldowns on a kill. Each counts
  only its own loadout's blows and kills, never a spell's.
- **The factions' perks** ([[Every Perk Stands, the Factions' Nine With Them]]). Nine perks, three a faction, which no
  shared pool offers: a faction's armour and weapons roll every trait column from their kind's shared pools, never one
  trait twice, and the first node of their first perk column from their faction's perks that fit them, as they are
  bought at its counter or handed out at the [[Test Ground]] (`vestige::made_named`); its counter shows each piece
  unrolled. The Stormcallers': Gathering Storm (weapon) Charges a foe on the fourth swing in a row to land on it, as
  Exposing Strikes counts a row, or on the fourth shot in a row to land on it (one landing on another foe begins a row
  of its own; one the foe dodges or parries ends it); Thunderhead (weapon) strikes a Charged foe 15% harder, a blow or
  a shot, a riposte counted; Squall Step (armour) gives Haste for 3 s on a perfect dodge. The Lamplighters': Kindling
  (weapon) Links its striker for 6 s on a kill, and the nearest other living player within 10 m of them, the Sunwell's
  reach (none beside them alone); Shared Flame (weapon) strikes 10% harder while its striker is Linked; Lightbearer
  (armour) heals 15% more with each healing charge, a trim. The Veiled's: Nightfall (melee) Veils its striker for 3 s
  on a riposte that lands; From the Dark (weapon) crits a blow or shot struck or loosed while its striker is Veiled,
  the one that ends the veil; Shade Step (armour) makes a dodge while Veiled cost 20% less stamina, a trim. Shared
  Flame and From the Dark take the striker's statuses as the blow is struck or the shot loosed. Every number is
  Claude's, in [[Gear as Claude Shapes It]] ("The factions' perks").
- **The Breaches' perks** ([[Breaches Roll From a Perk Pool of Their Own]]). Thirteen perks, the Breaches' own
  (`breach` in `content/gear/traits.json`), which no shared pool and no faction offers and which fit only a Breach's
  piece. A Breach's armour or weapon (`vestige::make` from a Breach) rolls its handling and finish columns from the
  shared pools as any piece does, and every node of its perk columns from the Breaches' perks that fit it, never one
  the piece already offers, as a shared piece never offers a trait twice. Six fit armour, every perk node of a
  Legendary's, and four or five each kind of weapon, a Legendary weapon's four. Shatterpoint (melee) Exposes a foe
  whose guard a blow breaks. Vein Strike (weapon) strikes an Exposed foe 15% harder, a blow or a shot. Bloom (weapon) Exposes every other living foe within
  4 m of a foe it slays. Crystal Sight (ranged) Exposes a foe a shot lands on 20 m or more from the shooter, as the
  shot lands. Crystal Skin (armour) takes 10% off every blow while above three quarters of its wearer's health, a trim
  (`hale_taken`), so a browser predicts it, a blocked blow's chip too. Regrowth (armour) gives back 5% of the most
  health on a kill of a foe, a spell's too, as the room heals (none once fallen). Resonance (armour) Exposes the foe whose blow is perfectly dodged.
  Lattice Wall (shield) Exposes the striker of a blow blocked while its loadout is drawn. Fracture (armour) Exposes
  the foe whose blow is parried. Lattice Shell (armour) takes 20% off every blow while below a quarter of its
  wearer's health, a trim beside Crystal Skin's (`low_taken`), a blocked blow's chip too. Shardburst (armour) Exposes
  every foe within 3 m of its wearer when a foe's blow breaks the wearer's guard, the striker too if it is that near.
  Splinter (melee) Exposes the foe a riposte lands on and every other foe within 3 m of it. Shard Round (ranged)
  Charges a foe a shot lands on that was Exposed as it landed. Each is in the room's one door for statuses but
  Crystal Skin and Lattice Shell; every number is Claude's, in [[Gear as Claude Shapes It]] ("The Breaches'
  perks"). No Breach is built yet, so only the rules and their tests make a Breach's piece.
- **The pools.** With the verbs and the perks that give and take, a Melee loadout is offered among 6 handling traits,
  7 finishes and 8 perks (9 with a shield), a Ranged one among 6, 7 and 6; armour among its 6 perks.

## Atherics

[[Atheric Gear Plays Like Destiny's Exotics, and Every Model Is Worn]], in [[The Perk Pass as Claude Shapes It]]'s
shape.

- **Two perks of its own.** An Atheric weapon has an intrinsic, on whenever it is worn, and its own node, bought for 1,000
  Aurem and 1 Essence in the column the Atheric has for it. Its other columns offer what a Legendary's do. Its page shows the
  intrinsic at its head, apart from the nodes ([[Interface]]).
- **The ten.**
  - Gullwing, a bow. Storm Gull: an aimed shot (one loosed from the draw, which strikes harder than a quick one) that
    lands leaps as lightning to up to 3 more foes, each the nearest within 8 m of the foe struck before it that none
    has struck, each for half the shot in Volt; a dodged leap still leaps on. Squall Line: each foe a leap lands on is
    Charged.
  - The Drowned Oath, a sword. Undertow: blows on a foe below half its health strike 30% harder. Pulled Under: a kill
    strikes the foes within 4 m of the slain for a third of the blow, in Cosmic, and Exposes each it lands on.
  - Lanternfall, a thunderlock. Last Light: a kill reloads it at once and gives back 25 stamina. Lantern's Wake: a
    kill bursts in Blaze, half the shot on the foes within 4 m of the slain.
  - The Last Bell, a warhammer. Tolling: a foe it staggers by poise stays staggered half again as long. Knell: a blow
    that staggers a foe by poise strikes the foes within 5 m of it for a quarter of the blow, in Volt.
  - The Reefwall, a Sword & Shield. Coral Guard: a blow it blocks gives back 15 stamina and bites its striker for a
    fifth of the blow. Riptide: a riposte strikes 50% harder and Exposes its foe.
  - Saltfang, Double Daggers. Thousand Cuts: each swing in a row landed on one foe strikes 10% harder than the last,
    to 50%, its row counted as Exposing Strikes' is ("Verbs"). Bleed the Tide: a kill gives Haste for 4 s.
  - Widow's Walk, a crossbow. Vigil: a shot that covered 20 m or more to its foe is a crit. Long Wait: a kill gives
    Veiled for 3 s.
  - Brass Chorus, a double pistolet. Call and Answer: every second shot to land strikes 40% harder; one that does not
    land counts for nothing. Encore: a kill gives back two shots.
  - Deepwatch, a staff. Conduit: each blow of it that lands takes 2% off both Tenets' cooldowns. Undercurrent: a kill
    gives Linked for 3 s.
  - The Ninth Wave, a greatsword. Swell: each kill makes its blows strike 10% harder for 10 s, to 50%; a kill starts
    the time again, and one after it has run out starts the count again. The Ninth: every ninth swing to land (a sweep
    counts once) strikes the foes within 4 m of the foe struck for half the blow, in Volt.
- **Leaps, bursts and bites** are the player's blows, made with the Attack of the loadout the Atheric is worn in
  against each foe's level, from the blow they came from, and judged as a spell's are: never parried or guarded, a
  dodge passes one whole, a foe's shield takes it by its element. A leap or a burst carries its perk's element, a
  bite the weapon's. Each rides a spell's blow with a number no spell has (`room::atheric::CHAIN`), so it sets off no
  perk of the weapon's: nothing chains from it, and it leaves its striker's soft lock alone. A burst passes by the
  foes its own sweep strikes, so one blow strikes a foe once. Its kill charges the Anima as any kill does, counts for
  the worn Art by the element it carries (Recharge, Zeal, Dread: [[Arts]]), and pays and shares as a kill of that
  loadout's; the Crit status crits it as it does any blow.
- **Where they play.** What a trim can hold is in the trim, which the browser predicts: Undertow, Last Light, Tolling,
  Coral Guard's stamina and Riptide's 50%. The rest is the room's alone, as the verbs are (`room::atheric`); what it
  counts (Call and Answer's shot, Swell's kills and their time, The Ninth's swings, and the rows Thousand Cuts shares
  with Exposing Strikes) is kept for each player while they are in the room.
- **Told and drawn.** The room tells each leap, burst and bite as a blow of its own kind, a leap's and a burst's with
  the foe it came from ([[Combat]], "Weighing a blow"). The browser draws a leap as a bolt in its element from the one
  foe's chest to the other's, a burst as a ring round the foe it came from, an impact on each foe either lands on,
  and a bite as a blow's flash on the foe bitten; each says its damage as a blow does.

## Drops

[[Loot Drops Are Seen, and Ranged Weapons Carry Ammo]], in [[Arts and Loadouts as Claude Shapes Them]]'s shape, after
DFO's spoils ([[Pick - Loot Drops]]).

- **What drops.** For each player who earned a kill: their Vestiges, if any dropped (by its rank, "Vestiges" above);
  an Ammo box by the foe's rank (Minor one in five, Major 35 in 100, Elite 60 in 100, a Miniboss or a Boss always);
  and from a Miniboss or a Boss an Ammo crate, straight into their crates while they carry fewer than five, else
  lying with the rest (`room::drops`).
- **At sea** ([[Naval Combat]], "How a fight ends"), what floats where a captain's ship sank is the same law's: a
  ship drops as one foe of its rank and level does, its Vestige, Ammo box and crate in the first piece laid for each
  player, and a boarded hold as one foe a rank higher, items from a Miniboss or a Boss kept as on land; every piece
  holds the ship's salvage ([[Ship Power]]). A kill on a boarded deck leaves no Vestige or item: the hold is the
  boarding's loot. Each piece is kept for its player, gathered by their ship within 25 m, what they have no room for
  lost with it, but a Vestige they have no room for sent to the mail (`room::flotsam`).
- **Thrown out.** The pieces leave the body in a fan toward the player, each its own slot of it, 1.2 radians either
  side, and come to rest 2 m out, on the ground or a block's top there; or at the body where a block more than a step
  high stands anywhere in the throw's way, the ground there lies more than a step below, or the spot lies past the
  section's ring, so a piece never rests out of its player's reach. A piece is taken only once it has had time to
  settle, the longest it can bounce: a Vestige 94 ticks (about 1.6 s) after it is thrown, ammunition 60 (1 s).
- **Taken.** Walking within 1.5 m of a piece at rest takes it: a Vestige while fewer than ten are carried, a box while
  the ammunition is not full, a crate while fewer than five are carried. A piece not taken stays two minutes; then
  the room sends the player's gear again without it, so their page stops showing it, and a Vestige among them goes
  to the mail. A Vestige still lying as its player leaves the room goes there too ("The mail").
- **Ammo full.** A box walked onto at full ammunition stays where it lies. The share kept is the character's own, worn
  Ranged weapon or not: one with only Melee worn and a full share leaves the box, and one whose share is short takes it.
  The page works this out from what it holds (where the player stands, their drops and the share of ammunition kept) and
  says "Ammo full" on the player, once each time they step within reach of such a box at rest, never again while they
  stand there ([[Interface]], "A blow's words"; `DropsShown`).
- **Seen** ([[Vestiges Are project-final's Crystals, and Physical Pictures Are Baked]],
  [[Pick - project-final Drops]]). Each piece pops up out of the body, falls, and bounces until it lands slower than it
  settles, coming down on the room's spot; one thrown up to a spot over the body pops at least high enough to land
  there. Settled, it rises to hover, bobbing and turning:

  | | A Vestige | Ammunition |
  |---|---|---|
  | Leaves the body, its middle over the feet | 1.15 m | 1.01 m |
  | Pops up at | 4.4 to 5.4 m/s | 2.8 to 3.4 m/s |
  | Falls under | 16 m/s² | 16 m/s² |
  | Keeps of each bounce's speed, and of its way along the ground | 0.4, 0.55 | 0.3, 0.55 |
  | Settles once it lands slower than | 1.1 m/s | 1.6 m/s |
  | Its middle over the ground bouncing, then hovering | 0.23 m, then 0.42 m | 0.31 m, then 0.5 m |
  | Rises to hover over | 0.35 s | 0.28 s |
  | Bobs | 5 cm | 6 cm |
  | Turns in the air, then at rest | 7, then 2.4 radians a second | 5, then 2.4 radians a second |
  | Is drawn as | its crystal, 12 frames of 27 pixels for 0.7 m | its Blender model, 12 frames of 0.038 m a pixel |

  The heights keep every frame's lowest pixel over the ground. A Vestige's crystal is a faceted gem crusted with
  shards, in its rarity's white, green, yellow, red or cyan blue, each frame baked as its turn first reaches it,
  cel-shaded in five bands, its outline darkened and a halo of its glow round it, added light. An Ammo box or crate is
  its model ([[Item Pictures]]). A thin line rises from its top as it settles: Normal 0.7 m, Magic 1 m, Rare 1.4 m,
  Legendary 1.9 m, Atheric 2.5 m, ammunition's white at 0.7 m. A glint climbs it, a Legendary's and an Atheric's
  pulse, and a Rare or finer chimes as it settles ([[Interface]]).

## The mail

[[A Mail Vendor Keeps Lost Items and the Game's Mail]], in [[Factions and Vendors as Claude Shapes Them]]'s shape
("The mail"), after Destiny's Postmaster.

- **Letters.** Each character keeps a mailbox (`Character.mail`, `gear::mail`): letters only the game writes, oldest
  first, each its number, which no item, Vestige or officer of theirs shares, where what it holds came from (a
  `mail::Source`, kept as its number, which the page words), whether it tells of a letter a full mailbox let go, and
  what it holds, a Vestige or an item, or neither. A letter keeps any key a later build wrote on it, as items and
  Vestiges do; taken, one holding such a key gives what this build knows of it and stays, so a rollback loses nothing.
- **What goes there.** What a player owned and would lose: a Vestige drop that lay its two minutes out, or still lay
  as they left the room ("Drops"); a first clear's Vestige while the carried ten and the vault were full
  ([[Activities]], "Where it is paid"); a Vestige in flotsam gathered while the ten were full; a module salvaged while
  its slot carried nine ([[Ship Power]]); a Normal item found, or come in a Vestige's place, while its slot carried
  nine and the vault was full ("Commons drop as themselves").
  Each letter says in plain words where its piece came from. Ammo boxes, Ammo crates and materials
  past their most are not items, and stay as they were.
- **Fifty letters.** A mailbox keeps 50 (`MAIL_MOST`). One more lets go the letter holding the least (by rarity, a
  letter holding what this build does not know above all), the oldest of those and the new one among them, and the
  newest letter kept says so: the new one, or the one before it when the new one held the least and went. So nothing
  leaves the mail unsaid. A post makes room for its own letter only, so a mailbox a later build kept fuller loses no
  more than one letter a post. 50 is more than the carried ten and the vault's twenty Vestiges together, and keeps a
  save far under what the [[Accounts]] keep.
- **Taking.** At the mail counter in Overlook's plaza only ([[Interface]], "The social space's counters"), free: 71
  takes one letter by its number in `item`, its Vestige into the carried ten or its item into its slot's nine, each
  numbered anew; refused while there is no room ("You already carry ten Vestiges.", "That slot already carries
  nine."), and a letter not there is refused as "There is no such letter." 72 takes every letter there is room for,
  oldest first, leaving the rest, and is refused only when it can take none.
- **Sent.** The gear message carries the letters, oldest first (`GearLetter`): each its number, its source, whether it
  tells of a letter a full mailbox let go, and its Vestige or its item with every column of its nodes, as a carried
  piece's.

## Ammo

- **Capacity.** A Ranged loadout carries shots: a bow 60, a crossbow 30, a pistolet 24, a double pistolet 36, a
  thunderlock 16 (`gear::ammo`). The character keeps the ammunition as a share of the full capacity, in 720 parts
  every capacity divides, so another Ranged weapon worn keeps the same share; a character kept before ammunition reads
  full.
- **Spent.** Each shot spends one shot's parts; at none the weapon will not fire ([[Combat]], "Shots"). Foes never run
  dry.
- **Back.** An Ammo box gives back a quarter of the capacity, at least one shot of any kind. An Ammo crate, used
  anywhere by a held press on its cell (an ask, refused with none, at full, or with no Ranged weapon worn: answer
  120, "Wear a Ranged weapon first."), fills it. Five crates are carried at
  most; the Weaponsmith sells one for 250 Aurem every day, besides the weapons.
- **Sent.** The gear message carries the shots left in the Ranged loadout worn, its capacity, the share and the
  crates; the fighter carries the shots left, which the browser predicts it by.

## Vendors

The keepers of Overlook's counters ([[Overlook's Keepers Are the Mage, the Smiths, the Tailor, the Tack and Shape]]);
the factions' counters are in [[Factions]].

- **The Armorsmith** sells armour (head, torso, arms, legs), and **the Weaponsmith** loadouts, two Melee to each
  Ranged, and an Ammo crate, in a social space's arcades ([[Cities]]). Each shows six wares a day, three Rare and three
  Magic, made at the buyer's level (at most 20), the same for everyone that day and new the next (`gear::vendor`). The
  slots turn with the day, so over four days the Armorsmith sells each armour piece at each rarity.
- **The starter stock.** Beside the day's wares each smith always sells plain pieces to start with, Normal at the
  buyer's level (at most 20), 50 Aurem each: the Armorsmith a head, a torso, arms and legs; the Weaponsmith a Sword &
  Shield (Melee) and a bow (Ranged). Their screens show them first, under "To start". A smith's stock is numbered the
  day's six first, then the starter stock (`gear::vendor::stock`).
- A ware costs Aurem only: 2,000 for Rare, 600 for Magic, 50 for a starter piece. It is bought only at its smith's
  counter, and carried with its slot's nine; the quest walked hears of it by its slot ([[Quests]]). The smiths sell no Legendary or Atheric gear: it is earned, had from Shape, or a faction's own
  bought at its counter by rank ([[Factions]]).
- **The Mage** identifies Vestiges, free.
- **The Tailor** sells six emblems a day ("Emblems") and four dyes; **the Tack** four a day of horses and bardings
  ("Horses", "Cosmetics").
- A day runs from 09:00 UTC to 09:00 UTC (`gear::clock`): the smiths' wares, the Tailor's and the Tack's turn then.
- **Shape** comes to Overlook from Friday 09:00 to Sunday 21:00 UTC and stands at one of eight places on the plaza,
  the week's (`gear::shape`, in the clock's weeks from Tuesday 09:00 UTC). He sells six pieces for the week, four
  Legendary and two Atheric, at level 20, a Legendary for 7 Shapes, an Atheric's armour for 13 and its weapon for 23,
  as Xûr's exotics cost Strange Coins. Each Legendary is rolled for one of four Vestige slots
  the week's dice draw, as a Vestige makes one (`vestige::make`), in a content the week's dice draw among the world,
  a dungeon, a sea dungeon, an Elite Dungeon and an Abyss Dungeon (never a faction's or a Breach's): it wears that
  content's set look and set name and rolls its traits, like every other Legendary ("Names" above). The Atherics are
  named, as every Atheric is. Why: the owner's "Everything recieves set names" and "Atherics remain unique" leave
  only Atherics their own names, so a vendor's Legendary is rolled as a drop's is (Claude's call, in
  [[Gear as Claude Shapes It]]). They are sold
  from level 20 as a faction's are (his screen dims them "From level 20" below it). **Shapes** come only from the
  week's Abyss content ([[Bosses and Dungeons Drop Items, Clears Pay, and Shapes Come From the Week's Abyss]]): the
  week's Abyss Dungeon's first clear pays 10 (`gear::clears`, [[Activities]]), and no kill gives any. A player holds
  200 at most.
- The room keeps the minute, set by its host before its first tick and each second after (and by the page as its own
  room steps, playing alone), whose day (`gear::clock`, from 09:00 UTC) sets every daily list and whose week (from
  Tuesday 09:00 UTC) sets Shape. It sends each smith's stock and the Shipwright's in turn, the Tailor's emblems and dyes, the Tack's pieces and, while he is here, Shape's place and his
  wares (none twice in a week) with a player's gear while they stand in a social space, sends them again as the
  day turns or Shape comes, goes or moves, and a purchase is an ask like any other: 12 a smith's ware (its place in
  `node` and the day it was shown, which the gear message carries, so one shown before the day turned is refused as
  "It is not sold here today"), 16 an Ammo crate, 56 a cosmetic (its number in `item`), 57 a piece of Shape's (its
  place in `node` and in `item` the number the room sent with it as its `id`, `gear::shape::shown`: an Atheric's
  place in the catalogue's items, a rolled Legendary's a hash of the piece, so a page shown another piece than his
  week now draws there, another week's or one drawn again as the catalogue grew, is told it is not sold here).

## Emblems

An emblem is a cosmetic after Destiny's ([[Cosmetics Follow Destiny, Shown in Many Places]]): a sign and the nameplate
it heads, shown beside a player's name wherever others see it ([[Interface]], "Emblems"). Its catalogue is
`content/gear/emblems.json`, numbered by its order on the wire, each with a name, a rarity, words, where it comes from
and its art (`gear::emblems`).

- **Kept and worn.** A player keeps every emblem they have had, as Destiny's kiosks kept them, and wears one, both in
  their character; a character kept before emblems reads with the starting one, and one wearing an emblem it does not
  keep wears the starting one.
- **Where each comes from**: Overlook's own at the start; one at each of levels 5, 10, 15, 20, 25 and 30; deeds
  (a piece fully upgraded, a Vestige opened to a Legendary or an Atheric, a foe's shield broken, a foe slain at Abyss
  difficulty, a resource gathered); each faction's first rank ([[Factions]]); and the Tailor, who sells six a day of
  twelve, the same for everyone that day, at 500 Aurem for Magic and 2,500 for Rare, some from a level. Levels, ranks
  and a piece fully upgraded are earned as they happen.
- **Asks**: wearing one kept, anywhere; buying one of the day's at the Tailor's counter. A kept character carries what
  others see of it beside it (`shown`): level, Defense, the Melee loadout's Attack (the Ranged one's without one),
  the emblem worn, and each piece worn.

## Cosmetics

Dyes, coats and bardings, after Destiny's shaders and Sparrows: `content/gear/cosmetics.json`, numbered by its order
on the wire, each with a kind, a name, a rarity, words, where it comes from and its look (`gear::cosmetics`). A coat
is a horse's hide, kept as its horse ("Horses").

- **Kept and worn** as emblems are: a character keeps every dye and barding they have had and wears one of each. A
  new one keeps and wears the starts: Own Colours and Bare. One worn that is not kept, or of another kind, is the
  start again as the character is read.
- **Where each comes from**: the start; a faction's second rank (its dye, [[Factions]]); and the Tailor (dyes) and the
  Tack (horses and bardings), each showing four a day of those they sell, the same for everyone that day, for Aurem,
  some from a level.
- **Asks**: wearing a dye or barding kept, anywhere (55, its number in `item`); buying one of the day's at its
  seller's counter (56), a coat's number buying its horse. The gear message carries those kept, the dye and barding
  worn and the worn horse's coat, and in a social space those sold today.

## Horses

[[Horses Are Items Worn in a Mount Slot]] (`gear::horses`; Claude's calls in
[[The Prologue, Horses and the Welcome to Overlook as Claude Builds Them]]; the stranger's Bay in
[[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]]).

- **A horse is an item** of its own kind (28), worn in the Mount slot (11), one to each coat: the Bay Horse, the
  Chestnut Horse and so on, its name its coat's place among the coats (`content/gear/rolled.json` names them in that
  order). It is Normal, of level 1, with no stats, nodes or perks; it is never upgraded, fed or dismantled. It is
  carried with the Mount slot's nine and kept in the vault among the armour. Nothing buys an item back, so a horse is
  kept until stored. The Test Ground hands out no horse.
- **Riding** needs a horse worn in the Mount slot (`Character::may_ride`).
- **The Tack** sells horses as it sells bardings, at its coat's price; one bought goes to the pack, one of each coat,
  refused while the Mount slot carries nine. Beside its day's four it sells the Bay Horse every day, first on its
  screen, at the cheapest coat's price (1,500 Aurem, from level 1).
- **A new character starts with no horse, and the stranger gives the Bay** (`horses::FIRST_HORSE`): her task's reward
  (`"horse": true` in `content/quests/quests.json`) is her 400 Aurem and the Bay Horse, paid together as the room
  pays the task, so a page that asks for her gift late, after a reload, has both from it then. It is worn in the Mount
  slot, or carried where one is worn already, and never a second: one who keeps a Bay already is given only the
  Aurem. A character already past her task is given nothing new. A character kept while coats were cosmetics is given, as it is read, a horse in
  the pack for each coat it kept and the one it wore worn in the Mount slot; one kept before cosmetics wore the Bay,
  so it is given the Bay Horse worn. The coats leave its cosmetics, and a room with horses marks every character's
  cosmetics (`horses`), so this is done once: a coat found beside the mark is what a room from before horses wrote
  back as its own default, and is dropped, so a room rolled back and forward gives no horse; a coat bought from the
  older room meanwhile is dropped with it, and a character made there is read as one from before horses (the Bay
  worn). A room rolled back past the welcome to Overlook resets an opening task it does not know to its own first, so a
  new character rolled back and forward reads on "Hear the three houses": the stranger's 400 Aurem and the round of the
  counters are lost to it.

## Elements and shields

- **A weapon's element** ([[Weapons Carry Blaze, Volt or Cosmic, and Foes Carry Shields]]): Blaze, Volt or Cosmic,
  or none. It is rolled as the weapon is made, as a Vestige opens, a vendor stocks it, a faction sells it or the Test
  Ground grants it, by
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
- **The difficulty** a voyage sets out at raises them: Normal as they are, Elite two levels higher, Abyss three,
  never past level 32; and pays by them: half again, or twice, the XP and Aurem of a kill and its chance of a Vestige,
  on land, on a boarded deck (whose room takes the sea's tier) and at sea, where a ship's sinking pays its XP and its
  drop the same way. The tier Elite is not the foe rank Elite (`Difficulty::Elite`, `Rank::Elite`).
- **A garrison's foes** ([[Garrisons Take the Gear Loop's Levels and Shields]], [[Enemies]]) each stand at a level
  drawn evenly from their island's band, from the node's id, raised by the room's difficulty; a Boss's called foes at its
  level. The level sets a foe's power against a player's gear, as above; its rank multiplies its health, poise, might
  and defence on top ([[Foes]]). A node with no island stands its foes at level 0.

## Where it came from

Every item and Vestige keeps the content it came from (`gear::Source`), as the owner chose
([[Armour and Weapon Looks Belong to the Content That Gives Them]]; Claude's calls in
[[The Playlist and Its Dungeons as Claude Shapes Them]]): the world, a faction, a dungeon, an Elite Dungeon, an Abyss
Dungeon, a sea dungeon or a Breach. Its looks follow it ("Looks", below), and its card and its page name it ("From", capitalised: "The world", "An Elite Dungeon"; a
faction's piece its faction, "The Veiled", `earnedFrom`), but a ship's module's, which keeps no look of a content. A
Vestige's line says it too ("For the head, level 20, from an Abyss Dungeon.").

- **The room's content** (`Room.source`): a patrol's dungeon, shared or a run at any tier, is a dungeon's; an Elite
  Dungeon's run at Normal or Elite an Elite Dungeon's, and at Abyss an Abyss Dungeon's; a sea island's dungeon a sea
  dungeon's; every other room the world's, the sea's flotsam among them.
- **What carries it**: a kill's Vestiges and items, a clear's and a cache's (`loot_kill`, `reward_clear`), from the
  room's content; the dungeon of the day's first clear a dungeon's, the week's two an Elite's and an Abyss's
  (`gear::clears`), and each playlist's daily and weekly its tier's (`gear::playlist`); the smiths' wares, a faction's packages, the public events' chests and the Test Ground's the
  world's; a faction's ware the faction's; Shape's Legendaries the content the week drew for each, his Atherics each
  its own.
- **A Vestige opened** makes its item from its own content: a rolled one, Legendary included, keeps it; an Atheric is
  drawn among its content's Atherics of its slot (`source` in `content/gear/items.json`, by the content its look
  belongs to), else among every content's, and keeps its own (`vestige::make`). A kill's or a clear's item laid back as a Vestige for want of room is of the content it dropped
  in; one found elsewhere keeps its item's.
- **Kept with the character**: written only when not the world's, so a save without it reads as the world's; a named
  piece reads as its entry's content whenever it was kept (`old_hands::unfit`).
- **On the wire**: `source` at the end of `GearItem` and `GearVestige`, by `Source`'s numbers (0 the world to 6 a
  Breach).

## Looks

The figure wears its gear (`gearOutfit`), redressed whenever what it wears changes, and the room passes the dress on
to every other player. Every garment is armour ([[Clothing Is Armour, With a Wardrobe Later]]):

- **Normal** pieces are clothes: a shirt, breeches, trousers or a skirt, and shoes, dyed in the rarity's plain dyes;
  a Normal head or arms piece shows nothing. The prologue's own armour is the one Normal set: its steel
  ([[Prologue]]).
- **Each content's sets and metals** (`content/gear/looks.json`, in `Source`'s order); by worth, each of the world, a
  dungeon, an Elite Dungeon and an Abyss Dungeon is wholly above the one before, a sea dungeon's apart: the world leather, the thieves', chain, iron and steel, in iron and steel; a dungeon
  the knights' and silver, in silver; a sea dungeon elven and dwarven, in elven and dwarven; an Elite Dungeon orcish
  and mithril, in orcish and mithril; an Abyss Dungeon adamantium and ebony, in adamantium and ebony; a Breach
  daedric, in daedric; a faction its guild set. No armour set is two contents'; a faction's weapons share a metal with
  another content's but wear their faction's colour.
- **Magic** pieces are light armour or clothes by the sixths of their look roll (`numberOf`): the head and arms its content's lightest sets (the world's leather or the thieves', another
  content's first), the torso and legs clothes (a shirt with a tunic or vest over it, breeches, trousers or a skirt,
  and tall boots or shoes, in brighter dyes) or those sets.
- **A smith's ware**, and Shape's, is drawn by its look roll alone, rolled as it was made and kept once bought
  (`vestige::LOOK_ROLLS`: 36, its remainders by 2, 3 and 4 climbing its sets and metals and picking its dye, its
  sixths its make, shield and Magic set, so each pairs with each), so the shop shows the piece the player gets: its
  set or clothes, its name, its shield and its make. A test buys each of the day's wares in turn and holds each to its
  look in the shop.
- **Rare and finer** pieces are armour sets of the forge. A rolled Rare piece of the world climbs its sets over levels 1
  to 20, chain to steel, and one more by its look roll where one is left (`rareSet`); a rolled Legendary climbs as a
  Rare does; another content's drops at its own
  levels (an Abyss Dungeon's all at 20), so its set is chosen by its look roll alone, and each of its sets is seen at every
  level it drops. A named piece wears the set written on it in `content/gear/items.json` (`look`), one of
  its own content's (a test holds every one to it). Daedric's
  armour and weapons are to give way to the Lattice's own, on hold for now
  ([[The Lattice's Armour and Weapons Take Daedric's Place]]). A faction's armour is its guild's set instead, in the
  faction's own colour over any dye ([[Factions]], "Its own colour"). A torso wears its set's cuirass, with its
  pauldrons where the forge draws them (chain has none); the legs wear its greaves and boots. A set the forge does not
  draw for a body falls to the nearest of its own content's, then to the nearest on the ladder of every set by worth
  (leather to daedric); a faction's straight to the ladder.
- **The cloak** is a casual cloak, or a formal one from Rare up, in the rarity's dye; a faction's cape is the formal
  cloak in its faction's rank-2 dye whatever its rarity, laid on its greys as any garment dye is.
- **The hands** hold the loadout drawn in its look (`weaponLook`). A rolled Normal weapon is iron to level 10 and steel
  past it from any content, as Normal armour is clothes; a Magic or finer one is made in its content's metals: the
  world's climbing them over levels 1 to 20 and one more by its look roll where one is left, another content's chosen
  by its look roll alone (`rolledMetal`). Its make is chosen by its look roll's sixths: a Sword & Shield's shield kite, round or tower, a Dagger & Shield's buckler, round or kite, a Mace & Shield's
  round, kite or tower, a bow long or short. A Normal shield is plain or iron to level 10 by its look roll's sixths and its weapon's
  metal past it; a finer one its weapon's metal. A rolled pistolet, double pistolet or thunderlock is plain, gilded from Legendary up. A named
  weapon wears the metal (or a gun's `gilded` or `plain`) and make (a shield's kind, a bow's, `short` for a short sword)
  written on it; a faction's weapon its faction's metal and colour, its shield and bow their make by its name. A metal
  the forge does not draw for a kind (a crossbow past mithril) falls to the nearest of its content's that it does, then
  to the nearest on the metals by worth (iron, steel, silver, elven, dwarven, orcish, mithril, adamantium, ebony,
  daedric); a faction's and a Normal one's straight to the metals by worth. The figure, the other players, first
  person and the item pictures all draw the same layers.
- **Cosmetics** ("Cosmetics", above) ride the dress (`Outfit.dye`, `coat`, `barding`), so every player sees them. A
  dye's four colours are laid as a 16-step ramp (`rampOf`: its anchors at steps 0, 5, 10 and 15) and snapped once to the
  game's palette where it is made, so the figure, first person, the Appearance tiles and the keepers' swatches draw the
  same sixteen colours; each dye and faction colour keeps ten steps at least, never steps darker (white dyes and coats
  end at the palette's lightest neutral) and stands apart from every other (a test measures it). On armour and its padding a worn dye covers the whole piece, every texel by its light, as a shader
  covers a whole piece, since many of the forge's sets (leather, elven, dwarven, the knights', daedric, adamantium and
  the guilds') are drawn in colours of their own a ramp on greys alone would leave. A ramp that covers a piece is laid
  across its set's span of light: each piece of the set (every armour piece and the padding under it; a weapon with
  itself put away), read in the move it stands in, gives its span with the darkest and brightest fiftieth left out;
  the set's span runs from the darkest of them to the brightest, laid across the ramp, its darkest to the first step
  and its brightest to the last (a span under 24 keeps the light as it is). A piece takes one shade whatever else is
  worn, in every move, in its item picture, on the Appearance screen and in first person, where the gauntlets, boots,
  bow, staff and shield are laid by the same set's span on the player's body.
  A faction's blade keeps its metal and wears its faction's colour on the hilt, guard and trim the forge marks
  ([[Sprite Forge]], "Colours"; `layerRamps` `trimmed`), laid across the span of the trim's light alone, read from
  the blade in hand and put away as it stands; first person reads it from the blade's first frame in hand. Another
  content's blade of the same metal keeps its own hilt. Claude's calls in [[Gear as Claude Shapes It]] ("The faction
  blades' colour").
  The ramp lies in place of the forge's own on every armour piece's layer, its padding and every garment but the cloak;
  never on a weapon, a shield, a sheath, the cloak or the hair. A coat lays its ramp on the horse's hide by its light
  (texels of the hide's hue, 25 to 65 degrees), leaving the saddle, blanket, mane and metal as the forge drew them; the
  ride from the saddle has its own hide test and its own hide top, measured on its strips, so a coat covers its hide,
  leaves the bridle and takes the same steps as on the figure. A barding is the forge's own layer stacked over the horse
  in every mounted move, drawn over the hide unless it lies more than 0.15 m behind it, so its far side and inside stay
  hidden, and in the riding view its own published strip. Own Colours, Bay and Bare change nothing. The room puts the
  worn dye, coat and barding into each dress it relays, so others see only what a player keeps and wears; another
  player's dress naming one that is not of its kind is refused as any broken dress is. A dress's armour and the things
  in its hands keep only the looks the page could draw the pieces worn in on the dress's body (`looks::shown`,
  [[The Room Keeps Only Looks of a Piece's Own Content]]): the prologue's own armour's steel, an armour piece's
  faction's set, the set written on a named piece, or else its content's by its rarity (a Magic piece's lightest, a world Rare piece's chain to steel, none for a
  Normal piece's clothes); a weapon and its shield in its faction's metal, its written metal and make, or else its
  content's metals (a Normal one's iron or steel, a gun's plain or gilded) with any of its shield's or bow's makes; and
  for each look the forge does not draw for the body, the one the page falls to, read from the forge's table of drawn
  layers (`content/gear/drawn.json`, which `forgeDrawn.test.ts` holds to the fitted bodies). The page picks one look by
  the piece's level, name and number; the room keeps any it could pick, and drops any other from what others see. A
  page test dresses every item the game can hold on each body and passes the dress through the room module
  (`room_dressed`), which must keep every layer (`modelsWorn.test.ts`). A light in the left hand stays.
  Of the colours a dress lays by
  layer, the room keeps a faction's only on the layers of that faction's pieces worn (a helm's, a cuirass's, its
  pauldrons' and padding, gauntlets', greaves', boots' and padding, a weapon's own), a faction's dye only on its cape
  worn, and a dye the player keeps on any (`colours_shown`, `dressed`); a page test holds the room's layer names to
  the page's (`dressLayers.test.ts`).
- Each rolled item keeps its own look by its look roll; a named item takes its rarity's first.

## Companions

Officers ashore fight beside their player, as DFO's crew companions did
([[The Ship's Power, Crew and Islands as Claude Shapes Them]]).

- **Who.** Each officer on duty ashore (two at most) stands as a fighter on the players' side beside a player in a
  land room (a continent's node, a patrol, the Test Ground), thinking with a foe's own brain, as the crew's own types ([[Enemies]]): the First
  Mate the Swordsman, the Gunner and the Lookout the Archer, the Bosun the Brute, the Carpenter the Skirmisher,
  each at Major, dressed by their post (below). A boarded deck has none yet.
- **Following.** Their place is 1.8 m behind the leader, 1.1 m either side when two are ashore; their post moves there
  each tick, and with no one to fight they walk back once 2.5 m from it (3.7 m for the second). One 40 m from the
  leader, or 6 m below a leader on the ground, is put back at their place at once.
- **Power.** They fight at the officer's level as a player matched to it would: a weapon of 15 Attack a level, armour
  of 45 Defense a level and 15% more again, their health their type's, and the land's ×1.5 on their blows and ×0.75
  on a foe's, as a player's. Weathered gives 15% more health, Brawler
  10% more harm, Steady Nerve 20% more poise.
- **Never killed.** No player harms them. A blow that would leave one at 1 health or less holds them at 1: they leave
  the fight and rest eight minutes, kept with the officer so a return to this room or another keeps it
  ([[The Audit's Leftovers Are Fixed as Claude Suggested]]), then come ashore again while still on duty ashore. One
  stationed aboard or at their post, or whose player leaves, goes.
- **Kills.** A kill a companion had a hand in their leader shares as though they had struck it. On land, every kill a
  player shares pays its XP to each of their officers ashore too.
- **Heat.** What a companion deals, kills and takes moves the fight's heat as a player's would ([[Foes]], "The
  director"): their health is a player's, unraised by level.
- **Seen.** The snapshot carries them among the foes, with their leader, their names' places in
  `content/gear/crew.json` and their post; the browser draws them in their post's own clothes in the crew's blue, with
  their type's weapons (`officerDress`), so no two posts look alike, and names them over their heads in the players'
  blue. The Test Ground's grants sign on a First Mate and a Bosun and send them ashore.

## Limits

- A loadout's traits work whichever of its hands strikes, and every trait worn counts once however many pieces give
  it. Until a drawn loadout's new trim reaches the browser, the player's own screen predicts them by the old one.
- A swing's kill gives the stamina of the loadout drawn as it lands. A shot keeps what it was loosed with: its Attack,
  element and trim (a kill's stamina, Last Light's reload), and the perks of the item it left, wherever that item is
  as it lands (`Room::shot_loosed`), so Gullwing's arrow leaps though Gullwing is put away as it flies.
- A leap, a burst or a bite is a share of its blow as it struck: a blow on a foe four or more levels above its player
  does nothing ([[Gear]], "Kills"), so it sets off none.
- The menu ([[Interface]], "The menu") shows gear on foot in a room; offline, no room keeps
  gear, so it says so. The Test Ground keeps its own panel, with the grants.
- Gear is kept between visits only in the game's node rooms, for a page with a session ([[Accounts]]).
- A look is chosen, not drawn for each item: by a rolled item's rarity, level, name and number, a named item's
  written look, or a faction's. A test wears every item a player can hold, at every level, on the man's body and the
  woman's, and fails on any weapon or armour layer of the forge no item wears but a class's own (the class sword, axe,
  bow and staff, the archer's dark helm, the woman's horned one) and the laced boots, a garment. A gilded double
  pistolet's left gun is worn only by a named gilded double pistolet, Brass Chorus.
- No Breach items exist yet, and no Breach drops one: a Breach's piece and its perks are in the rules alone. The factions' pieces (each one's cape, armour and two weapons) are the only named items a
  Vestige never opens to ([[Factions]]).
- The Wraith Mist barding's ride strips on R2 are blank, so it shows in third person only until the forge draws them
  again. In the ride, about a tenth of the hide (its darkest texels) keeps the bay's colour under a coat: colour alone
  cannot tell it from the bridle, and the forge's ride `_uv` strips would make an exact mask. A coat leaves the mane
  grey (the forge publishes no mane mask).
- The traits' and items' words are English only.
