---
type: system
status: live
code:
  - crates/gear/src/emblems.rs#emblems
  - crates/gear/src/emblems.rs#sold_on
  - crates/gear/src/cosmetics.rs#cosmetics
  - crates/gear/src/cosmetics.rs#sold_on
  - crates/gear/src/shape.rs#present
  - crates/gear/src/shape.rs#wares
  - crates/gear/src/shape.rs#found
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
  - crates/room/src/perks.rs#sharpened
  - crates/room/src/perks.rs#verbs_after
  - crates/room/src/perks.rs#PerkCounts
  - crates/room/src/power.rs#drawn
  - crates/room/src/power.rs#perk_on
  - crates/gear/src/character.rs#has_drawn_trait
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
  - client/src/combat/drops.ts#motionAt
  - client/src/combat/vestigeCrystal.ts#crystalFrame
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
  and each intrinsic belongs to one Atheric, and every Atheric weapon has an intrinsic; every kind of loadout has a Legendary; every slot has a Legendary and an Atheric a Vestige
  can open to; every rolled pool holds enough traits.
- **An item** is a kind (a Melee or a Ranged loadout, four armour pieces, the cloak, or one of a ship's four modules,
  [[Ship Power]]), a rarity, a level (1 to 20; a
  Legendary or Atheric is 20), its XP and the nodes bought and chosen. A named item follows its catalogue entry: in
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
  piece) 6 Essence each; an Atheric's own, 1,000 Aurem and 1 Essence ([[Gear as Claude Shapes It]]).
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
- **Asks.** Wearing, taking off, buying and choosing nodes, dismantling, identifying, feeding Fruit, and the vault;
  a ship's modules are fitted, upgraded and infused by the same asks ([[Ship Power]]), and its officers have theirs
  ([[Crew]]).
  An ask refused changes nothing and says why. A slot carries nine beside the one worn; the vault, reached in a
  social space, twenty weapons, twenty armour and twenty Vestiges. A slot read past nine from a kept character
  carries what it holds, and takes no more until it is down to nine. Dismantling returns Aurem, fragments and, from a
  Legendary or Atheric, Essence with a third of what was spent on it.
- **Chance** comes from a hash of the room's seed, its tick, a count of the rolls the room has made, the player and
  what the roll is for. A deployed room's seed is its host's own, random and never sent, so no player can foresee a
  roll; a room in the game's worker keeps one fixed seed, so it gives the same loot for the same play. A kept character is
  made whole as it is read: its stocks within their caps, each item's choices, nodes, level and XP within its own,
  one worn where it does not fit carried, so no keeping can make a room refuse or fail on it.

## In the rooms

- **Each player's gear** is held by the room they are in ([[Server]]), the starting kit as they join, and sent to
  them alone whenever it changes, every column of every item spelled out so the browser draws it without the rules.
- **Hands.** A player holds only what a loadout they wear puts in their hands, the fists with no Melee worn, or a
  torch beside a loadout that leaves the left hand free; the browser draws the hands from the loadout drawn, in a
  metal its rarity likes.
- **Blows.** Every blow is made with its power as it is struck: a player's on a foe by the Attack of the loadout its
  came from (a shot the Ranged one's, as it was when the shot was loosed; a swing Melee's, or Ranged's while it is
  drawn or no Melee is worn), a foe's on a player by the player's Defense, each by the two levels. On top, at every
  level, a player's blow on a foe strikes twice (`PLAYER_HARM`) and a foe's on a player half (`FOE_HARM`), from
  [[The Whole Game Gets a Balance Pass]]. A foe of level 0 fights by combat's own numbers and those two alone.
- **Kills.** A foe's death pays every player whose blow landed on it in its last ten seconds and could harm it (four
  levels below, a blow does nothing and shares nothing), and throws out what it drops for each, seen by them alone,
  for two minutes ("Drops", below).
- **Perks.** The traits a player's worn gear gives make a trim of combat's numbers, which their fighter carries, so
  their browser predicts it to the bit ([[Combat]]). The room adds what only it knows the moment of: Honed, Executioner,
  Undertow, Exploit and Attuned as a blow is struck, Point Blank and Long Shot by the ground a shot covered, the
  stamina a kill, a parry or a block gives back, with Last Light's reload, the verbs ("Verbs", below) and the
  Atherics' own ("Atherics", below). A player's
  perks are the armour's and the drawn loadout's alone: the other loadout's wait until it is drawn, and drawing its
  sends the new trim to them at once. A shot takes the Ranged loadout's, a swing the drawn one's. No weapon's perk
  touches a spell or its kill.
- **Asks** ride the player's inputs and are answered in turn. A city's social space serves each at its own counter: a
  Vestige opened at the Mage's, the vault at a vault's, a ware at its vendor's ([[Interface]]); the [[Test Ground]]
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
  Exposed foe a crit.
- **Ranged**, on a shot that lands. Marked Shot (handling) Exposes a foe on the player's first shot to land on it:
  each player marks a foe once, and forgets it when it dies or leaves the room. Shocking Rounds (perk) Charges
  the foe struck by every fifth shot to land, on any foe; a shot that does not land is not counted.
- **Either loadout.** Keen Eye (perk) gives Crit for 4 s on a kill. Attuned (finish) makes a blow or shot 10% harder
  while its element is the worn Art's. Spellfeed (finish) takes 3% off both Tenets' cooldowns on a kill. Each counts
  only its own loadout's blows and kills, never a spell's.
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

- **What drops.** For each player who earned a kill: their Vestige, if one dropped; an Ammo box by the foe's rank
  (Minor one in five, Major 35 in 100, Elite 60 in 100, a Miniboss or a Boss always); and from a Miniboss or a Boss an
  Ammo crate, straight into their crates while they carry fewer than five, else lying with the rest (`room::drops`).
- **At sea** ([[Naval Combat]], "How a fight ends"), what floats where a captain's ship sank is the same law's: each
  piece a kill's drop for a foe of the ship's rank and level, kept for its player, gathered by their ship within 25 m, what
  they have no room for lost with it (`room::flotsam`).
- **Thrown out.** The pieces leave the body in a fan toward the player, each its own slot of it, 1.2 radians either
  side, and come to rest 2 m out, on the ground or a block's top there; or at the body where a block more than a step
  high stands anywhere in the throw's way, the ground there lies more than a step below, or the spot lies past the
  section's ring, so a piece never rests out of its player's reach. A piece is taken only once it has had time to
  settle, the longest it can bounce: a Vestige 94 ticks (about 1.6 s) after it is thrown, ammunition 60 (1 s).
- **Taken.** Walking within 1.5 m of a piece at rest takes it: a Vestige while fewer than ten are carried, a box while
  the ammunition is not full, a crate while fewer than five are carried. A piece not taken stays two minutes; then
  the room sends the player's gear again without it, so their page stops showing it.
- **Ammo full.** A box walked onto at full ammunition stays where it lies. The share kept is the character's own, worn
  Ranged weapon or not: one with only Melee worn and a full share leaves the box, and one whose share is short takes it.
  The page works this out from what it holds (where the player stands, their drops and the share of ammunition kept) and
  says "Ammo full" on the player, once each time they step within reach of such a box at rest, never again while they
  stand there ([[Interface]], "A blow's words"; `DropsShown`).
- **Seen** ([[Vestiges Are project-final's Crystals, and Physical Pictures Are Baked]],
  [[Pick - project-final Drops]]). Each piece pops up out of the body (a Vestige from 1.1 m at 4.4 to 5.4 m/s, ammunition from 0.9 m at 2.8
  to 3.4), falls under 16 m/s², and bounces, keeping 0.4 of its speed (ammunition 0.3) and 0.55 of its way along the
  ground at each, until it lands slower than 1.1 m/s (1.6); it comes down on the room's spot, and one thrown up to a
  spot over the body pops at least high enough to land there. Settled, it rises over 0.35 s (0.28) from 0.18 m to
  hover at 0.42 m (0.2 to 0.5), bobbing 5 cm (6). A Vestige is a crystal, turning 7 radians a second in the air and
  2.4 at rest, a faceted gem crusted with shards, in its rarity's white, green, yellow, red or cyan blue, baked into
  12 frames of 27 pixels for 0.7 m as its turn first reaches each, cel-shaded in five bands, its outline darkened and
  a halo of its glow round it, added light; an Ammo box or crate is its Blender model ([[Item Pictures]]),
  turning 5 radians a second in the air and 2.4 at rest, in 12 frames of 0.038 m a pixel. A thin line rises
  from its top as it settles: Normal 0.7 m, Magic 1 m, Rare 1.4 m, Legendary 1.9 m, Atheric 2.5 m, ammunition's white
  at 0.7 m. A glint climbs it, a Legendary's and an Atheric's pulse, and a Rare or finer chimes as it settles
  ([[Interface]]).

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
- A ware costs Aurem only: 2,000 for Rare, 600 for Magic. It is bought only at its smith's counter, and carried with
  its slot's nine. Legendary and Atheric gear is never sold for Aurem: it is earned, or had from Shape.
- **The Mage** identifies Vestiges, free.
- **The Tailor** sells six emblems a day ("Emblems") and four dyes; **the Tack** four horse pieces a day
  ("Cosmetics").
- **Shape** comes to Overlook from Friday 09:00 to Sunday 21:00 UTC and stands at one of eight places on the plaza,
  the week's (`gear::shape`, weeks counted from Monday 00:00 UTC). He sells six pieces for the week, four Legendary
  and two Atheric, each a named item at level 20 for a slot of the week's dice, for 7 and 15 Shapes, sold from level
  20 as a faction's are (his screen dims them "From level 20" below it). **Shapes** come
  only from kills at the Elite and Abyss seas (Rough and Storm today): one in 33 kills at Elite, one in 17 at Abyss, and
  2 or 4 from a Boss or Miniboss; a player holds 200 at most.
- The room keeps the minute, set by its host before its first tick and each second after (and by the page as its own
  room steps, playing alone), whose day sets the wares and whose week sets Shape. It
  sends the day's wares, the Tailor's emblems and dyes, the Tack's pieces and, while he is here, Shape's place and his
  wares (none twice in a week) with a player's gear while they stand in a social space, sends them again as the
  day turns or Shape comes, goes or moves, and a purchase is an ask like any other: 12 a smith's ware (its place in
  `node` and the day it was shown, which the gear message carries, so one shown before the day turned is refused as
  "It is not sold here today"), 16 an Ammo crate, 56 a cosmetic (its number in `item`), 57 a piece of Shape's (its
  place in `node` and the piece shown there, its place in the catalogue's items, in `item`, so a page shown another
  piece than his week now draws there, as the catalogue grew, is told it is not sold here).

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
  difficulty, a resource gathered); each faction's first rank ([[Factions]]); and the Tailor, who sells six a day of twelve,
  the same for everyone that day, at 500 Aurem for Magic and 2,500 for Rare, some from a level. Levels, ranks and a
  piece fully upgraded are earned as they happen.
- **Asks**: wearing one kept, anywhere; buying one of the day's at the Tailor's counter. A kept character carries what
  others see of it beside it (`shown`): level, Defense, the Melee loadout's Attack (the Ranged one's without one),
  the emblem worn, and each piece worn.

## Cosmetics

Dyes, coats and bardings, after Destiny's shaders and Sparrows: `content/gear/cosmetics.json`, numbered by its order
on the wire, each with a kind, a name, a rarity, words, where it comes from and its look (`gear::cosmetics`).

- **Kept and worn** as emblems are: a character keeps every one they have had and wears one dye, one coat and one
  barding. A new one keeps and wears the starts: Own Colours, Bay and Bare. One worn that is not kept, or of another
  kind, is the start again as the character is read.
- **Where each comes from**: the start; a faction's second rank (its dye, [[Factions]]); and the Tailor (dyes) and the
  Tack (coats and bardings), each showing four a day of those they sell, the same for everyone that day, for Aurem,
  some from a level.
- **Asks**: wearing one kept, anywhere (55, its number in `item`); buying one of the day's at its seller's counter
  (56). The gear message carries those kept, the three worn, and in a social space those sold today.

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
  never past level 32; and pays by them: half again, or twice, the XP and Aurem of a kill and its chance of a Vestige.
  The tier Elite is not the foe rank Elite (`Difficulty::Elite`, `Rank::Elite`).
- **A garrison's foes** ([[Garrisons Take the Gear Loop's Levels and Shields]], [[Enemies]]) each stand at a level
  drawn evenly from their island's band, from the node's id, raised by the room's difficulty; a Boss's called foes at its
  level. The level sets a foe's power against a player's gear, as above; its rank multiplies its health, poise, might
  and defence on top ([[Foes]]). A node with no island stands its foes at level 0.

## Looks

The figure wears its gear (`gearOutfit`), redressed whenever what it wears changes, and the room passes the dress on
to every other player. Every garment is armour ([[Clothing Is Armour, With a Wardrobe Later]]):

- **Normal** pieces are clothes: a shirt, breeches, trousers or a skirt, and shoes, dyed in the rarity's plain dyes;
  a Normal head or arms piece shows nothing.
- **Magic** pieces are light armour or clothes by the item's own number (its name while it has none, a smith's ware
  before it is bought): the head and arms leather or the thieves' set, the torso and legs clothes (a shirt with a
  tunic or vest over it, breeches, trousers or a skirt, and tall boots or shoes, in brighter dyes), leather or the
  thieves' set.
- **Rare and finer** pieces are armour sets of the forge. A rolled Rare piece climbs the sets' ladder (leather, the
  thieves', chain, iron, steel, the knights', silver, elven, dwarven, orcish, mithril, adamantium, ebony, daedric)
  from chain, nine rungs over levels 1 to 20 and up to two more by its name: chain, iron or steel at level 1,
  adamantium, ebony or daedric at 20. A named piece wears the set written on it in `content/gear/items.json`
  (`look`). A faction's armour is its guild's set instead, in the faction's own colour over any dye ([[Factions]],
  "Its own colour"). A torso wears its set's cuirass, with its pauldrons where the forge draws them (chain has none);
  the legs wear its greaves and boots. A set the forge does not draw for a body falls to the nearest on the ladder.
- **The cloak** is a casual cloak, or a formal one from Rare up, in the rarity's dye; a faction's cape is the formal
  cloak in its faction's rank-2 dye whatever its rarity, laid on its greys as any garment dye is.
- **The hands** hold the loadout drawn in its look (`weaponLook`). A rolled weapon climbs the metals' ladder (iron,
  steel, silver, elven, dwarven, orcish, mithril, adamantium, ebony, daedric) with its level, from 1 to 20, and its
  name: Normal iron to level 10 and steel past it; Magic steel, silver or elven at level 1, elven, dwarven or orcish
  at 20; Rare elven, dwarven or orcish at level 1, adamantium, ebony or daedric at 20 (`rung`: a rarity's start, its
  climb over the levels rounded, and up to two more rungs by its name). Its make is chosen by its own number: a Sword
  & Shield's shield kite, round or tower, a Dagger & Shield's buckler, round or kite, a Mace & Shield's round, kite
  or tower, a bow long or short. A Normal shield is plain or iron to level 10 by its number and its weapon's metal
  past it; a finer one its weapon's metal. A rolled pistolet, double pistolet or thunderlock is plain. A named weapon
  wears the metal (or a gun's `gilded` or `plain`) and make (a shield's kind, a bow's, `short` for a short sword)
  written on it; a faction's weapon its faction's metal and colour, its shield and bow their make by its name. A
  metal the forge does not draw for a kind (a crossbow past mithril) falls to the nearest it does on the ladder. The
  figure, the other players, first person and the item pictures all draw the same layers.
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
  The ramp lies in place of the forge's own on every armour piece's layer, its padding and every garment but the cloak;
  never on a weapon, a shield, a sheath, the cloak or the hair. A coat lays its ramp on the horse's hide by its light
  (texels of the hide's hue, 25 to 65 degrees), leaving the saddle, blanket, mane and metal as the forge drew them; the
  ride from the saddle has its own hide test and its own hide top, measured on its strips, so a coat covers its hide,
  leaves the bridle and takes the same steps as on the figure. A barding is the forge's own layer stacked over the horse
  in every mounted move, drawn over the hide unless it lies more than 0.15 m behind it, so its far side and inside stay
  hidden, and in the riding view its own published strip. Own Colours, Bay and Bare change nothing. The room puts the
  worn dye, coat and barding into each dress it relays, so others see only what a player keeps and wears; another
  player's dress naming one that is not of its kind is refused as any broken dress is. Of the colours a dress lays by
  layer, the room keeps a faction's only on the layers of that faction's pieces worn (a helm's, a cuirass's, its
  pauldrons' and padding, gauntlets', greaves', boots' and padding, a weapon's own), a faction's dye only on its cape
  worn, and a dye the player keeps on any (`colours_shown`, `dressed`); a page test holds the room's layer names to
  the page's (`dressLayers.test.ts`).
- Each rolled item keeps its own look by its name; a named item takes its rarity's first.

## Companions

Officers ashore fight beside their player, as DFO's crew companions did
([[The Ship's Power, Crew and Islands as Claude Shapes Them]]).

- **Who.** Each officer on duty ashore (two at most) stands as a fighter on the players' side beside a player in a
  land room (a continent's node, a patrol, the Test Ground), thinking with a foe's own brain: the First Mate a pirate
  swordsman, the Gunner and the Lookout pirate archers, the Bosun a pirate brute, the Carpenter a pirate skirmisher,
  each at Major, dressed by their post (below). A boarded deck has none yet.
- **Following.** Their place is 1.8 m behind the leader, 1.1 m either side when two are ashore; their post moves there
  each tick, and with no one to fight they walk back once 2.5 m from it (3.7 m for the second). One 40 m from the
  leader, or 6 m below a leader on the ground, is put back at their place at once.
- **Power.** They fight at the officer's level as a player matched to it would: a weapon of 15 Attack a level, armour
  of 45 Defense a level and 15% more again, their health their type's. Weathered gives 15% more health, Brawler
  10% more harm, Steady Nerve 20% more poise.
- **Never killed.** No player harms them. A blow that would leave one at 1 health or less holds them at 1: they leave
  the fight and rest eight minutes of room time, then come ashore again while still on duty ashore. One stationed
  aboard or at their post, or whose player leaves, goes.
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
- No Breach items exist yet. The factions' pieces (each one's cape, armour and two weapons) are the only named items a
  Vestige never opens to ([[Factions]]).
- The Wraith Mist barding's ride strips on R2 are blank, so it shows in third person only until the forge draws them
  again. In the ride, about a tenth of the hide (its darkest texels) keeps the bay's colour under a coat: colour alone
  cannot tell it from the bridle, and the forge's ride `_uv` strips would make an exact mask. A coat leaves the mane
  grey (the forge publishes no mane mask).
- The traits' and items' words are English only.
