---
type: system
status: live
code:
  - crates/gear/src/ship/mod.rs#ShipPower
  - crates/gear/src/ship/mod.rs#ship_level
  - crates/gear/src/ship/mod.rs#reward_sinking
  - crates/gear/src/ship/mod.rs#fit_first_modules
  - crates/gear/src/ship/materials.rs#ShipMaterial
  - crates/gear/src/ship/materials.rs#made_of
  - crates/gear/src/ship/materials.rs#price_of
  - crates/gear/src/ship/found.rs#salvage
  - crates/gear/src/ship/found.rs#take_salvage
  - crates/gear/src/ship/infuse.rs#infuse
  - crates/gear/src/ship/trim.rs#ShipTrim
  - crates/gear/src/kinds.rs#Group
  - crates/gear/src/vendor.rs#for_ship
  - crates/naval/src/fitting.rs#Fitting
  - crates/naval/src/fitting.rs#gunners_lay
  - crates/naval/src/fight_exotics.rs#hampered
  - crates/room/src/ship_power.rs#fitting
  - crates/room/src/ship_power.rs#pay_sinking
  - crates/room/src/flotsam.rs#Held
  - crates/protocol/src/ship_wire.rs#ship_offset
---
# Ship Power

A ship's own power, apart from its captain's
([[Ships Have Their Own Power, Modules and Crew Who Fight Beside You]],
[[The Ship's Power, Crew and Islands as Claude Shapes Them]]). Ship power decides every fight of ship against ship;
character power decides everything on foot, a boarded deck included. The two are never summed. Its officers and hands
are in [[Crew]].

## How it works

- **The same law as the character's** ([[Gear]]). A ship's Attack is its guns', its Defense its hull's, sails' and
  rigging's, by the gear's own sums: a Legendary's guns carry 248 to 300 Attack, a lesser module 15 times its level
  times its rarity's share. Its three defending modules share a full set's Defense as the four armour pieces do: hull
  0.5, sails 0.35, rigging 0.3.
- **Its level**, 1 to 30 (`Character::ship_level`): to 20 by its own experience, on the player's own curve
  (190,000 for level 20), then by the Prestige its four modules carry, each as an armour piece carries it from level
  20 (a Rare 13 to 15, a Legendary 18 to 27, an Atheric 21 to 30, by equal steps over however many upgrades its grid
  holds, the guns' five as a hull's three), against the player's own Prestige steps. A
  module is fitted only at the ship's level or below, and one Atheric among the four.
- **Its modules** are items of four kinds (`Kind::Guns`, `Hull`, `Sails`, `Rigging`), each fitted in its own slot
  and carried nine to a slot beside it, kept in the vault with the ship's other modules (twenty). Each has a rarity,
  a level, experience and the gear's grid of nodes (`grid.rs`): its guns a weapon's grid (handling, finish, perks),
  the other three armour's (perks). Every module fitted earns all the experience the ship earns. A Fruit of Dagon grows no
  module. A new ship, and one kept from before modules, is fitted once with a level 1 Normal module in each slot that
  wears none.
- **Its materials** (`ship::materials`): Timber, Canvas, Iron and Heartwood, the rare one, each to 200. A module's
  nodes cost Aurem and its own two common materials (guns iron and timber, hull timber and iron, sails canvas and
  timber, rigging canvas and iron) where the gear asks for fragments and a resource, and Heartwood where it asks for
  Essence. Dismantled, a module gives back Aurem, twice the fragments the gear would in its first material, and its
  Essence as Heartwood.
- **Infusion** (`ship::infuse`): a carried module of the same kind and a higher level fed into a kept one raises it
  to the fed one's level; the kept one keeps its rarity, nodes, choices and experience, the fed one is gone. Each
  level climbed costs 150 Aurem and 2 of the kept module's first material.
- **Found** (`ship::found`): each piece of what floats where a ship went down holds one common material (1 to 3), a
  chance of Heartwood (2% a rank) and of a module (36% and 12% a rank, so an hour at sea finds about a patrol zone's
  gear by colour: [[Activities]], "The band"); its chest holds three (2 to 4 each), Heartwood 25% and 5% a rank (a
  chest is rolled at a Miniboss's or a Boss's) and a module always. An island's wreckage
  holds one (1 to 2), Heartwood 1.5% and a module 3%, so a cove's two or three wrecks together hold less than a Minor
  ship's whole lot; an isle's three (3 to 6) and one in five. A sea Breach's hold always
  holds a module, three materials of 4 to 8 and two Heartwood. Every Heartwood and module chance is raised by the
  voyage's tier, as a kill's chances are. A module is coloured as a Vestige from a foe of its source's rank ([[Gear]],
  "Vestiges"): a piece its ship's, a chest the rank it is rolled at, a cove's wreckage a Minor's, an isle's an
  Elite's, a Breach's a Boss's; never past what its level could drop.
- **The Shipwright** sells six modules a day (the clock's, from 09:00 UTC: [[Activities]]), three Rare and three Magic, at the buyer's ship's level, at the
  Harbourmaster's counter in a social space (`Vendor::Shipwright`, the vendors' third).

## At sea

- **Fitted for a fight.** Each tick the sea fits every fighting player's ship whose character it holds
  (`room::ship_power::fitting`): its balls on each captain are times `power::by_player` of its Attack, its level and
  the captain's level; a captain's balls on it are times `power::on_player` of its Defense and the two levels, in place
  of what the captain's level makes of its guns. A ship matched to the water's level fights a captain as a matched
  player fights a foe; four levels under, its balls do nothing. A ship with no fitting (the fleet room, the tests) fights
  as it always has.
- **Its trim** (`ship::trim`): its fitted modules' chosen perks and its posted officers' posts and perks, as factors on
  its guns' reload and scatter, its harm on a ship's hull, canvas and men (and on one below a third of its hull), its
  way and turning in a fight, what its hull, canvas and men take (its hull below a third, below its waterline, its men
  below half), its ram, its Carpenter's patches and its sight. A ball in the rigging, whose harm is all canvas and
  men, takes the canvas perks and the crew perks, never the hull's. The words of each perk are in
  `content/gear/traits.json`; a test holds every module's and officer's perk to a factor the sea reads.
- **Its modules' perks** ([[The Perk Pass as Claude Shapes It]]): each thing a module's perk does is done by one perk.
  Guns offer in handling Quick Tackle (reload 10% faster), Steady Lay (scatter 15% less), Heavy Charge and Hot Guns; in
  their finish, what is loaded, Double Shotted (hole a hull 10% more), Chain Locker (tear canvas 20% more) and Grape
  Locker (cut down men 20% more); in their perks Raking Fire (20% more on a ship below a third of its hull), Firing
  Drill (reload 5% faster and scatter 5% less), Run Out and Overcharged. A hull offers Oak Ribs (it takes 10% less),
  Copper Sheathing (a ball below its waterline harms it 20% less), Iron Ram, Last Timbers, Carpenter's Stores (its
  Carpenter patches back 25% more of each ball's harm, so it asks for one at that post) and Stripped Ballast; sails
  Storm Canvas (tears 12% less), Flying Jib (sails 6% faster), Lookout Yard, Crowd of Sail, Reefed Sails and Backed
  Sails; rigging Quick Braces (turns 10% faster), Grapnels, Boarding Nets (balls cut down 12% fewer of its men), Taut
  Rigging, Boarding Ladders and Preventer Stays. No module offers a perk twice. The officers' perks are their own
  ([[Crew]]).
- **Perks that give and take**: Heavy Charge (balls hole a hull 15% more, guns reload 8% slower), Hot Guns (reload
  18% faster, scatter 12% more), Run Out (reload 12% faster, balls cut down 10% more of its men), Overcharged (hole a
  hull 20% more, scatter 15% more), Stripped Ballast (sails 8% faster in a fight, its hull takes 8% more), Crowd of
  Sail (sails 10% faster, its canvas tears 15% more), Reefed Sails (its canvas tears 20% less, it sails 5% slower),
  Backed Sails (turns 12% faster, sails 4% slower), Taut Rigging (turns 15% faster, its canvas tears 10% more),
  Boarding Ladders (three more hands board, balls cut down 10% more of its men) and Preventer Stays (its canvas tears
  15% less, it turns 8% slower).
- **Its Atheric** ([[Atheric Gear Plays Like Destiny's Exotics, and Every Model Is Worn]]) carries an intrinsic,
  always on while it is fitted, and its own node (`naval::fight::exotics`):

  | Atheric | Intrinsic | Its own |
  |---|---|---|
  | Kraken's Roar (guns) | **From the Deep**: its balls in a ship's waterline band hole it twice as hard | **Feeding**: a ship it sinks reloads both its sides at once |
  | Leviathan's Rib (hull) | **Living Bone**: afloat in a fight its hull mends 1% of its whole a second, with a Carpenter or none | **Hard to Kill**: once a fight, a ball that would sink it leaves it a tenth of its hull |
  | Stormcaller's Sheet (sails) | **Own Wind**: torn canvas costs it no way while any canvas stands; with none left it sails as any ship does | **Squall**: each ball that strikes it gives it 3% more way for 6 s, to 15% |
  | The Spider's Web (rigging) | **Web**: four more hands board with it, and a ship its balls strike in the rigging turns 30% slower for 6 s | **Snare**: in a fight, a ship of another flag within 30 m of it sails 15% slower, under sail or at its oars |

  A ship sinks to the ball that takes the last of its hull: that ball's shooter sank it. Only a player's ship is
  fitted, so a captain's carries none of these. The trim's numbers cross in the gear message beside the rest.
- **Its hands.** The player's ship carries its hull's men, the Sloop ten ([[Crew]], [[Shipyard]]): balls cut them down as a captain's are, a thinned crew
  reloads its guns slower (whole, at the pace one player alone always loaded them), and the sea keeps the share left
  until a port city repairs it ([[Naval Combat]], "How a fight ends").
- **What a fight pays.** A captain going down pays as twenty-one kills of a foe of its rank would (so an hour at
  sea sits in the band beside a patrol zone's: [[Activities]], "The band"), at its level, raised by
  the sea's tier (`reward_sinking`, `SINKING_KILLS`): its XP to the ship, its fitted modules and every officer aboard,
  and its XP and Aurem to the player, their worn Art and their faction, as a kill pays them; nothing to a player whose
  ship is four levels or more below it, as on land. A player fighting on a boarded deck meanwhile is paid on the deck
  room's character too, which is theirs as they step off (`pay_boarders`), as is the guild bounty it counts. A sea fight
  with the sighting before it takes about as long as a dozen fights on foot, so a ship climbs as its player does on land
  and the sea pays as a patrol ([[The Balance and Economy Pass as Claude Shapes It]]). What floats holds ship salvage
  beside the ship's one kill's drop (`flotsam::Held`).

## In the browser

- The gear message carries the ship's part (`GearShip`): its experience, level, Prestige, Attack and Defense and how
  far to its next level, its materials, its hands and its whole complement, its officers and the officers offered at
  the muster, its trim, and the fleet: each ship kept with its name and dress, the hull sailed and every dress kept
  ([[Shipyard]]). Its modules are the gear message's items of kinds 24 to 27, worn in slots 7 to 10.
- Infusion is ask 17 (the kept module in `item`, the fed one in `count`).

## In the fleet room

The World Editor's fleet room holds no characters, so its panel sets the levels: F calls a captain at the level
chosen (none by default, as combat's own numbers), its ship raised as a captain's level raises one at sea, and fits the
caller's ship from then on as a plain ship of the level chosen (`ShipPower::plain`: four Normal modules of that level,
no officers; unfitted by default). Both cross with the call (`Orders.call_level`, `ship_level`, 30 at most), so a
browser predicting its ship fits it alike.

## Limits

- A player beaten on a boarded deck who washes up and comes back into the same fight comes back under a new number
  (none is given twice, so a ball still flying from their old ship is laid at no one's door), its Squall and
  Carpenter's debt begun again; a Hard to Kill spent there stays spent.
- Way and turn act in a fight; out of one the sea moves the ship on a course at its own pace. The fleet room fits a
  plain ship, so no Atheric acts there and a browser's prediction of its ship needs none of them. A Lookout's sight
  lengthens each ship's sight in that player's own sea snapshot.
