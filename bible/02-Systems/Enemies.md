---
type: system
status: live
code:
  - crates/combat/src/fighter.rs#Side
  - crates/foes/src/factions.rs#FACTIONS
  - crates/foes/src/roles.rs#numbers
  - crates/foes/src/roster.rs#ROSTER
  - crates/foes/src/roster.rs#spawn
  - crates/foes/src/ranks.rs#ranked
  - crates/foes/src/ranks.rs#phases
  - crates/foes/src/tell.rs#roar
  - crates/room/src/foes.rs#spawn_asked
  - crates/room-wasm/src/roster_door.rs#roster_json
  - client/src/rules/roster.ts#rankBand
  - client/src/combat/foeBars.ts#FoeBars
  - client/src/combat/foeBars.ts#bossInFight
  - client/src/testground/foeDress.ts#foeDress
  - client/src/testground/panel.ts#startPanel
---
# Enemies

Who a player fights: enemy factions, each with its own types of foe on land and at sea, every foe of a rank that sets
how much it takes, how it defends and which telegraphed blows it throws. The owner decided the ranks and the factions
([[Enemies Come in Five Ranks, After Destiny]], [[Enemy Factions Start With the Grey Tithe]]); the roster and the
numbers are Claude's ([[The Enemies as Claude Builds Them]]). How each foe thinks is [[Foes]]; ships' ranks are
[[Naval Combat]]'s.

## Factions

A fighter's side is the players' or a faction's, by its number. Fighters of different sides are enemies: foes of two
factions fight each other as they fight players, and never their own side.

| Number | Faction | Present | On land | On deck | Ships |
|---|---|---|---|---|---|
| 1 | The Grey Tithe | at sea and on land | Runner, Collector, Crossbowman, Enforcer, Marksman, Reeve | Deckhand, Hookman, Pistoleer, Bosun, Tithe-Mate, Captain Brannoc Thule | Tithe Sloop |
| 2 | Pirates | at sea | | Skirmisher, Swordsman, Brute, Archer, Captain | Pirate Sloop |

## The roster

Each type fights as one of five roles (the behaviour and numbers of [[Foes]]) with its own weapons, and comes in the
ranks listed. Its numbers are its role's as a Major; its rank scales them.

| No. | Type | Role | Right hand | Left hand | Ranks |
|---|---|---|---|---|---|
| 1 | Runner | Skirmisher | `dagger_iron` | `dagger_iron_l` | Minor, Major |
| 2 | Collector | Swordsman | `sword_iron` | `shield_kite_iron` | Minor, Major |
| 3 | Crossbowman | Archer | `crossbow_iron` | | Minor, Major |
| 4 | Enforcer | Brute | `warhammer_iron` | | Major, Elite |
| 5 | Marksman | Archer, standing off half as far again | `thunderlock` | | Elite |
| 6 | Reeve | Captain | `mace_iron` | `shield_kite_iron` | Elite, Miniboss |
| 7 | Deckhand | Skirmisher | `dagger_iron` | `dagger_iron_l` | Minor, Major |
| 8 | Hookman | Swordsman | `axe_iron` (two hands) | | Minor, Major |
| 9 | Pistoleer | Archer | `pistolet` | | Minor, Major |
| 10 | Bosun | Brute | `warhammer_iron` | | Major, Elite |
| 11 | Tithe-Mate | Captain | `sword_steel` | | Elite, Miniboss |
| 12 | Captain Brannoc Thule | Captain | `sword_ebony` | | Boss |
| 13–17 | The pirates' Skirmisher, Swordsman, Brute, Archer, Captain | as named | the Test Ground's foes' arms | | Minor and Major; the Brute Major and Elite; the Captain Elite and Miniboss |

The roles as a Major: Skirmisher 45 health, 18 poise; Swordsman 70, 35; Brute 130, 70; Archer 50, 18; Captain 160,
60 (with [[Foes]]' other numbers for each).

## Ranks

| Rank | Bar | Health | Poise | Might | Reaction | Parry, block, dodge | Telegraphed blows | Tier |
|---|---|---|---|---|---|---|---|---|
| Minor | red | ×0.6 | ×0.7 | ×0.9 | 4 ticks slower | ×0.5 | none; a shooter never aims | ordinary |
| Major | orange | ×1 | ×1 | ×1 | as its role | ×1 | half its role's, rounded up, gap-closers last | ordinary |
| Elite | yellow | ×2.2 | ×1.6 | ×1.15 | 2 ticks quicker | ×1.25 | all its role's | elite |
| Miniboss | yellow | ×4 | ×2.4 | ×1.25 | 3 ticks quicker | ×1.4 | all, and a melee role's charge and leap | elite; feints; a second phase |
| Boss | the boss bar | ×7 | ×3.5 | ×1.35 | 4 ticks quicker | ×1.5 | by its phase | elite; feints; three phases |

Parry, block and dodge together never pass 0.85, scaled down evenly past it; a reaction is never under 13 ticks. The
elite tier is [[Foes]]' (quicker wind-ups and cooldowns, one blow in three iron, chains).

- **A Miniboss's second phase**, at 35% of its health: a roar, then wind-ups ×0.75, cooldowns ×0.6, might ×1.25, and
  chains of two.
- **The Boss's three phases**, changing at 2/3 and 1/3 of its health:
  1. **The blade**: sweep and lunge, feints, chains of one.
  2. **The boarding**: adds charge and leap; wind-ups ×0.85, cooldowns ×0.8, chains of two.
  3. **The last stand**: adds slam and ring, both iron; wind-ups ×0.75, cooldowns ×0.6, might ×1.25 more, chains of
     two; and it calls its crew: two Minor Deckhands stand 1.5 m either side of it, alert, counted against the room's
     limit of foes.

  Each change of phase is a roar of 1.2 s (an iron ring about its feet) as soon as it is free, and refills its poise.
  Phases advance one at a time, so a blow that cuts through two roars twice.

Captain Brannoc Thule as the Boss: 1,120 health, 210 poise.

## In a room

A player asks the room for a foe by type and rank (a rank the type does not come in takes its first); the room stands
it 5 m before them. The room sends each foe's type, rank, faction, phase and alert state ([[Server]]). The rules hand
the browser the roster through WebAssembly, so names, factions and weapons are read in one place.

## On screen

- **Over each foe**, its type's name above a bar of its health coloured by rank, where the parry ring stands; a "?"
  while it is suspicious or searching, and a "!" for a second when it turns alert ([[Foes]]).
- **The boss bar**: for the nearest living Boss that is alert or struck, across the top of the screen, its name and
  faction, "Phase n of 3", and its health in yellow marked at 2/3 and 1/3. A Boss has no bar over its head.
- **Their dress**: the Grey Tithe in grey over leather or iron by role (Runner and Deckhand in leather; Crossbowman
  and Pistoleer women in leather; the Marksman under a grey hooded cloak; Collector and Tithe-Mate iron under a grey
  surcoat; the Hookman in leather and a vest; the Enforcer in full iron and a short grey cloak; the Bosun in iron with
  a grey sash; the Reeve in iron with a grey surcoat and cloak; Thule in full steel plate, a grey surcoat and a long
  grey cloak); the pirates as the Test Ground's foes were dressed.
- **The [[Test Ground]]'s panel** picks a faction, a type (marked land or deck) and one of its ranks.

## Limits

- A faction's presence is fixed and not yet placed in the world: foes stand only where a player asks for them.
- No boss on land yet, and only the Sloop's hull for every rank of ship ([[Hulls]]).
- The Hookman's axe takes both hands, so he carries no shield.
