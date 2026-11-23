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
  - crates/foes/src/ranks.rs#Call
  - crates/foes/src/tell.rs#roar
  - crates/room/src/foes.rs#spawn_asked
  - crates/room/src/foes.rs#call
  - crates/room/src/foes.rs#fall_with_callers
  - crates/room/src/garrison.rs#groups
  - crates/room/src/garrison.rs#stand_garrison
  - crates/room/src/garrison.rs#keep_garrison
  - crates/room/src/garrison.rs#gird_of
  - crates/room/src/dungeon_room.rs#stand_dungeon_garrison
  - crates/room/src/dungeon_room.rs#band_rooms
  - crates/room/src/garrison.rs#raise_garrison
  - crates/room/src/garrison.rs#walk_beats
  - crates/room/src/beat.rs#Beat
  - crates/room/src/groups.rs#leader_of
  - crates/room/src/groups.rs#lead_groups
  - crates/room/src/groups.rs#give_ground
  - crates/room/src/groups.rs#arrive
  - crates/room-wasm/src/roster_door.rs#roster_json
  - client/src/rules/roster.ts#rankBand
  - client/src/rules/roster.ts#rankMark
  - client/src/combat/foePlate.ts#FoePlate
  - client/src/combat/statusIcons.ts#foeDebuffs
  - client/src/combat/foeBars.ts#FoeBars
  - client/src/combat/foeBars.ts#bossInFight
  - client/src/player/foeDress.ts#foeDress
  - client/src/combat/foeFigures.ts#FoeFigures
  - client/src/testground/panel.ts#Panel
---
# Enemies

Who a player fights: enemy factions, each with its own types of foe on land and at sea, every foe of a rank that sets
how much it takes, how it defends and which telegraphed blows it throws. The owner decided the ranks and the factions
([[Enemies Come in Five Ranks, After Destiny]], [[Enemy Factions Start With the Grey Tithe]]), and that a Miniboss
throws more often than an Elite, a Boss's called foes fall with it and a garrison leashes to its posts
([[Foes Leash to Their Posts and Fall With Their Boss]]), and that fewer plates show and their size goes with rank
([[Fewer Plates Show, Sized by Rank, After Destiny]]), and that garrisons fight in groups that lead, break and give
ground, after Bungie's ([[Foes Fight in Groups That Lead, Break and Give Ground, After Bungie]]); the roster, the
numbers and how the groups do it are Claude's ([[The Enemies as Claude Builds Them]],
[[Foe Groups as Claude Builds Them]]). How each foe thinks is [[Foes]]; ships' ranks are [[Naval Combat]]'s.
The Lattice, the next faction, has its types in the roster and comes out of the Fissure, a public event
([[Public Events]]); its look is drawn ([[The Lattice Are the Ruined Ports' People, Overtaken]], [[Lattice]]).

## Factions

A fighter's side is the players' or a faction's, by its number. Fighters of different sides are enemies: foes of two
factions fight each other as they fight players, and never their own side. The Brig's crew (number 0 for a faction)
fight on the players' side: foes of every faction fight them, and no player strikes them, nor they a player; so do
the crew's own five types (13 to 17), the types a companion fights as. On the prologue's wreck every boarder is the
Grey Tithe's ([[The Wreck's Boarders Are One Side]], [[Pirates Are Replaced by the Grey Tithe]]), each a Minor or a
Major at its own rank's strength but Thule, the boss ([[Prologue]]).

| Number | Faction | Present | On land | On deck | Ships |
|---|---|---|---|---|---|
| 1 | The Grey Tithe | at sea and on land | Runner, Collector, Crossbowman, Enforcer, Marksman, Reeve, High Assessor Corvane, the Elite Dungeons' 18 Bosses | Deckhand, Hookman, Pistoleer, Bosun, Tithe-Mate, Captain Brannoc Thule | Tithe Sloop |
| 3 | The Lattice | on land | Husk, Flicker, Idol, Ravager, Bulwark, Heart | | |

The Grey Tithe holds the land: a garrison of its foes stands in every node but the social spaces, on every continent
(below), and its Tithe-Taker comes only with its raid on a hamlet; its ships sail every water but Overlook's home
waters. The Lattice hold none
either: they pour out of a Fissure while it is open ([[Public Events]]), and their leaders are never screened.

## The roster

Each type fights as one of five roles (the behaviour and numbers of [[Foes]]) with its own weapons, and comes in the
ranks listed. Its numbers are its role's as a Major; its rank scales them. In a group a skirmisher is the one that
works round to its target's flank, and a shield-bearer holds the line; a group that sees several players shares itself
out among them ([[Foes]]).

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
| 11 | Tithe-Mate | Captain | `sword_steel` | | Elite, Miniboss, Major (the prologue's wreck alone stands it so) |
| 12 | Captain Brannoc Thule | Captain | `sword_ebony` | | Boss |
| 13 | Skirmisher (the crew's) | Skirmisher | `dagger_iron` | `dagger_iron_l` | Minor, Major |
| 14 | Swordsman (the crew's) | Swordsman | `sword_steel` | `shield_kite_steel` | Minor, Major |
| 15 | Brute (the crew's) | Brute | `warhammer_iron` | | Major, Elite |
| 16 | Archer (the crew's) | Archer | `bow_short_iron` | | Minor, Major |
| 17 | Captain (the crew's) | Captain | `sword_ebony` | | Elite, Miniboss |
| 18 | High Assessor Corvane | Captain | `flail_iron` | `shield_kite_iron` | Boss |
| 19 | Crew (the Brig's) | Swordsman | `sword_iron` | | Minor, Major |
| 20 | Crew (the Brig's) | Skirmisher | `dagger_iron` | `dagger_iron_l` | Minor, Major |
| 21 | Wreck-Reeve Oswin Tarr (krakens-grotto's Boss) | Captain | `sword_steel` |  | Boss |
| 22 | Pearl-Keeper Isolde Varne (pearl-tomb's Boss) | Captain | `mace_iron` | `shield_kite_iron` | Boss |
| 23 | Forgemaster Garrick Soot (cinder-deep's Boss) | Captain | `warhammer_iron` |  | Boss |
| 24 | Tithe-Warden Mabry Hollis (hollow-crypt's Boss) | Captain | `mace_iron` | `shield_kite_iron` | Boss |
| 25 | Wrecker Dunstan Black (black-tide-caverns's Boss) | Captain | `axe_iron` |  | Boss |
| 26 | Sister-Assessor Aldith (pale-undercroft's Boss) | Captain | `flail_iron` | `shield_kite_iron` | Boss |
| 27 | Cistern-Steward Corwin Vey (forsaken-cistern's Boss) | Captain | `sword_steel` | `shield_kite_steel` | Boss |
| 28 | Vaultwarden Hesk Amaro (sandworn-vault's Boss) | Captain | `warhammer_iron` |  | Boss |
| 29 | Gaoler Renna Crake (smugglers-labyrinth's Boss) | Captain | `sword_iron` | `shield_kite_iron` | Boss |
| 30 | Barrow-Reeve Tobin Silt (silt-barrows's Boss) | Captain | `mace_iron` |  | Boss |
| 31 | Treasurer Lucan Deeps (deepwater-vault's Boss) | Captain | `sword_ebony` |  | Boss |
| 32 | Factor Odile Coralle (coral-halls's Boss) | Captain | `flail_iron` |  | Boss |
| 33 | Lord-Assessor Edric Barrow (barrow-halls's Boss) | Captain | `sword_ebony` | `shield_kite_steel` | Boss |
| 34 | Digmaster Ulf Hargreave (saltworm-warrens's Boss) | Captain | `axe_iron` |  | Boss |
| 35 | Bog-Reeve Hester Mire (mire-hollows's Boss) | Captain | `mace_iron` | `shield_kite_iron` | Boss |
| 36 | Sluice-Warden Abel Rook (rotwater-sewers's Boss) | Captain | `sword_steel` |  | Boss |
| 37 | Abbess Ylva Frost (frozen-sepulchre's Boss) | Captain | `flail_iron` | `shield_kite_steel` | Boss |
| 38 | Catacomb-Reeve Silas Brine (brine-catacombs's Boss) | Captain | `warhammer_iron` |  | Boss |
| 39 | Husk (Lattice) | Swordsman | `sword_iron` | | Minor, Major |
| 40 | Flicker (Lattice) | Skirmisher | `dagger_iron` | `dagger_iron_l` | Minor, Major |
| 41 | Idol (Lattice) | Archer | `bow_short_iron` | | Major, Elite |
| 42 | Ravager (Lattice) | Brute | `warhammer_iron` | | Major, Elite |
| 43 | Bulwark (Lattice) | Brute | `mace_iron` | `shield_kite_iron` | Elite, Miniboss |
| 44 | Heart (Lattice) | Captain | `flail_iron` | | Boss, with no phases of its own yet |
| 45 | Tithe-Taker | Captain | `mace_iron` | | Elite |

Types 21 to 38 are the Elite Dungeons' Bosses, one each ([[Activities]]): each a Grey Tithe land Captain, the faction
of the dungeon garrison it ends, at Boss rank, fighting in Corvane's three phases under a name of its own over its
bar, dressed as Corvane is.

The Lattice's hands are those of the forge's weapons of the same reach: the [[Lattice]]'s own blades, emitter, maul and
anchor are drawn and dressed over them. A foe may stand under a name of its own in place of its type's, sent with it: a
public event's Warden and Marrow, and the Fissure's crystal growth.

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

- **A Miniboss's first phase**: cooldowns ×0.8, so it throws its blows more often than an Elite. A Captain against a
  player standing still throws about 7.4 telegraphed blows a minute as a Miniboss and 6.8 as an Elite; at the Elite's
  cooldowns the Miniboss threw 6.4, its feints taking the place of chains, which follow only a blow that landed.
- **A Miniboss's second phase**, at 35% of its health: a roar, then wind-ups ×0.75, cooldowns ×0.6, might ×1.25, and
  chains of two.
- **A Boss's three phases** are its type's own, changing at 2/3 and 1/3 of its health. A phase may call foes: it
  names their type, their rank, how many, and whether they stand beside the Boss (in pairs, 1.5 m either side, each
  pair 1.5 m farther out) or behind it (3 m back, then the same either side). Called foes face the way the Boss
  faces, alert toward its foe, while the room's living foes leave room under its limit. When the Boss falls, the foes
  it called fall in the same tick, each told as slain, and lie their ten seconds as any foe does: each fight with it
  starts clean, and every phase's call comes. Called foes have no post: they never leash ([[Foes]]).
- **A garrison's Boss or Miniboss walking home** to its post, leashed or its search let go, goes back to its first
  phase as the walk begins: its numbers, blows and chains are that phase's, a roar owed is dropped, and the foes it
  called fall as at its death. It roars into no later phase on the way. Its next fight has every phase and call again,
  but the foes it calls after a leash drop nothing, so pulling it to its leash again and again pays no more
  ([[The Audit's Leftovers Are Fixed as Claude Suggested]]).
- **Captain Brannoc Thule's**:
  1. **The blade**: sweep and lunge, feints, chains of one.
  2. **The boarding**: adds charge and leap; wind-ups ×0.85, cooldowns ×0.8, chains of two.
  3. **The last stand**: adds slam and ring, both iron; wind-ups ×0.75, cooldowns ×0.6, might ×1.25 more, chains of
     two; and he calls his crew: two Minor Deckhands beside him.
- **High Assessor Corvane's**:
  1. **The levy**: sweep and lunge, feints, chains of one; his shield up while he waits his turn.
  2. **The summons**: adds the slam, iron; wind-ups ×0.85; and he calls two Minor Crossbowmen behind him.
  3. **The seizure**: adds charge, leap and ring; wind-ups ×0.85, cooldowns ×0.6, might ×1.25 more, chains of one;
     and he calls two Major Collectors beside him.

  Each change of phase is a roar of 1.2 s (an iron ring about its feet) as soon as it is free, owed until its wind-up
  begins (a foe knocked down first roars once it stands), and as it begins the phase's numbers hold (its wind-ups,
  cooldowns, might, chains and blows), its poise is refilled and the foes its phase names called; a Boss killed in the
  step its roar begins calls none. Phases advance one at a time, so a blow that cuts through two roars twice.

Each Boss: 1,120 health, 210 poise. Thule fights with an ebony sword, Corvane with an iron flail and a kite shield.

## In a room

On a course, a player asks the room for a foe by type and rank (a rank the type does not come in takes its first); the
room stands it 5 m before them. A node's room stands its garrison as it opens ([[Server]]) and takes no such ask, but
one a page playing alone runs is told to take them, for trying a fight on the node's land ([[Game]], `?spawn=`). Every
foe stands on the surface its place on the navmesh was found on: a block's top within a step of it, else the ground. The
room sends each foe's type, rank, faction, phase and alert state. The rules hand the browser the roster through
WebAssembly, so names, factions and weapons are read in one place.

**A garrison** is a node's groups of the Grey Tithe's land foes, by the node's kind:

| Kind | Groups |
|---|---|
| Patrol area | three or four groups of two to four, each foe a Runner, Collector or Crossbowman, Minor or Major |
| Mission | the same, and a group of an Elite Enforcer and an Elite Reeve |
| Dungeon | three or four groups of two to four Majors and Elites (a Runner, Collector, Crossbowman or Enforcer Major; an Enforcer or Marksman Elite), and a Reeve as a Miniboss alone at the farthest post |
| World boss | High Assessor Corvane at the farthest post, with four Majors about him (Runners, Collectors, Crossbowmen or Enforcers) |
| Social space | none |

- **Who stands where** is drawn from the room's seed, the course's mixed with the node's id, so every machine stands
  the same garrison in the same places.
- **Levels and shields** ([[Garrisons Take the Gear Loop's Levels and Shields]]): each foe stands at a level drawn
  evenly from its island's band ([[Gear]], "Where foes stand"), raised by the difficulty its voyage set out at, and one foe in
  five, a Boss or a Miniboss never, with a shield of an element drawn evenly, holding half its health; both are drawn
  from the node's id, so a group stands again with the same. Its level sets its power against a player's gear, and its
  rank multiplies on top: a Grey Tithe Elite at level 13 has 2.2 times a Major's health, times 1.07 to the 13th (2.41),
  5.30 times in all, and its blow is 1.15 times a Major's, times 2.41 on a level-13 player with no Defense. A Boss's
  called foes fight at its level, with no shield. A kill pays every player whose blow landed in its last ten seconds, as
  any foe's does ([[Gear]], "In the rooms").
- **The posts** are on a 5 m lattice over the room's navmesh, 10 m inside the section's edge and 5 m inside the
  mesh's square, 20 m apart. Each group draws its post from those left; a Reeve alone and Corvane take the one
  farthest from the nearest spawn. A point its group cannot stand at is passed over, and only a post that stands
  clears the points within 20 m of it. Every foe stands at least 25 m from every spawn, inside the section, idle.
- **A patrol zone's landing** is a safe place to arrive: no foe starts a fight with a player standing within 15 m of a
  spawn there, past its boardwalk, stores and signpost and short of every guard, until that player strikes from it; a
  fight brought into it goes on, so it is somewhere to arrive, not to hide. A spell cast is a strike. Its leave comes
  back once the player has left it and come back, or has stood again (`Room::left_be`,
  [[Each Patrol Zone Has a Built Landing Site, Its Guards Beyond It]]).
- **Caverns and runs**: a patrol zone's layout marks foes' sites, and its room stands a group of the Grey Tithe at
  each in its caverns (a coven's or a cave's area, at the area's middle) and on its runs' beats short of their end
  arenas, which hold their objective's site ([[Layouts]], "Runs"); one in the garrison's own square stands none, its
  ground held already. A site's group stands the first time a player comes within 150 m of it and the room's
  living foes leave room for all of it, on a navmesh baked round the site then as a quest's
  place's is, so a room opens as quickly as before. It is drawn as a
  patrol's other groups are (two to four Runners, Collectors and Crossbowmen, Minor or Major, at the island's levels,
  raised by the seas, a shield drawn as any foe's), from the room's seed and where the site is, so every machine
  stands the same; it stands round the site's middle, or the nearest point of the lattice within 20 m where its foes
  have room, walks a beat over the lattice round it, and stands again as any cleared group does. A mission's, a dungeon's or a boss's node stands none.
- **The beats**: every group patrols a beat from its post but a Boss's or a Miniboss's, which holds its post, the
  fight a player seeks out at the node's far end, its phases calling foes about it in a known place. A beat is the
  post and up to three more points of the lattice, each 12 to 30 m from the one before and 10 m from every other,
  drawn from the room's seed apart from the posts, so every machine walks the same beats and drawing them moves no
  post. The way between points is the navmesh's, and each metre of it stays inside the section, 2.5 m inside its
  edge, and 27.5 m from every spawn; a point with no such way is given up, and a group with no second point holds
  its post. The group walks its beat at a stroll, 0.35 of a walk, its first foe leading on the way and the rest on a
  half ring 2.5 m behind it, each finding its way to its place by the room's routes; a place is the navmesh's point
  nearest it on the ground's level, else on its leader's, so beside a leader on a ledge or a ramp a foe keeps a place
  of its own there. It pauses 4 s at each point,
  its foes facing out from their leader and the leader the way on, then walks to the next, and from the last back to
  its post and round again. It halts while any of its foes is stirred, fights or walks back to its place, and waits
  for one more than 4 m from its place. A group that holds its post stands 2.5 m round it, each foe facing outward,
  a leader in the middle facing the nearest spawn.
- **A forged dungeon's garrison** ([[Dungeons]], "In the rooms") stands where the Forge puts foes rather than on the
  lattice: the Reeve, a Miniboss, alone in the end room, facing the way in; in each other room past the way in's, a
  band drawn from the dungeon's foes above, one for each ten of the room's cells, rounded, two to four, each on one of
  the room's free cells nearest its middle, those its props leave, its quiet cells first, facing out from the middle.
  When the bands and the Reeve would pass the room's 24, the rooms that stand one are the most that fit, spread evenly
  along the walk from the way in to the end. A dungeon has no lattice to draw beats from, so its bands hold their
  posts. Its levels, shields, leash and standing again are any garrison's, at its patrol's island band.
- **The leash**: a garrison foe, Corvane and his escort too, gives its fight up once its target stands 50 m from its
  place in its group or, farther than 14 m from the foe, stands on the ground off the room's navmesh
  ([[A Foe Gives Up Only When the Player Is Far Away]]), and walks back there, healing as it goes, to stand idle again; one whose search finds no one walks back the same way ([[Foes]]). Its group halts where its fight
  began, so it walks back to its place round that spot, and the group walks its beat on once all its foes are idle in
  their places. It is still its group's: a walk home never clears a group or stands it again.
- **Its leader** is its highest rank, a Captain first among equals, else the first of them. When it falls, every other
  foe of its group that is stirred and not walking home breaks, once each time the group stands: one of them that fights
  a target rages (a brute first, then a skirmisher, then a swordsman, the one nearest its target; never a shooter or a
  captain, and none if one of them rages already), and the rest fall back to cover for 8 s, breaking by their role where
  there is none ([[Foes]], "Its group").
- **Its breaking point**: once half the foes it stood have fallen, a garrison's group (never a wave) defends its ground
  until it stands again: its places gather back at its post (at its fallback point or the last stand while its garrison
  gives ground there), its foes fighting elsewhere fall back to them, each fighter hand to hand holds near its place,
  coming for a target that stands near it a while, and its shooters hide longer between their looks out ([[Foes]], "Its
  group"). In a patrol zone, as a Destiny patrol area resets once no one is near, it is made whole once no player has
  come within 40 m of its post for 120 s, its living foes are idle and the living foes leave room for its fallen: they stand at their places,
  it is led afresh, defends no more and walks its beat again.
- **The Grey Tithe's tactic**, its shield front: its shield-bearers hold the line before their target, and a leader that
  fights hand to hand, under a Miniboss, is screened by its lower ranks that fight hand to hand. While one of them that
  is not broken fights at its target, within its range and neither falling back nor holding ground away from it, the
  leader waits behind them, right behind the nearest shield-bearer of them, and lets them take the turns; once none of
  them stands unbroken, it goes in at once. A Miniboss or a Boss fights from its first phase, its escort screening
  nothing, and a shooter leads from where it shoots ([[Foes]], "Its group").
- **A mission's or a dungeon's garrison gives ground** as one encounter, by the share of the foes it stood that stand
  (its waves not counted). More than three quarters standing, it holds its territory: each group its own post and beat.
  More than half, it falls back: each group's places gather 2.5 m round its fallback point, a place each kept as others
  fall, halfway along the navmesh's way from its post to the last stand's post, the post farthest from the spawns (its
  own post where that point is off the mesh, outside the section or within 25 m of a spawn). Less, it makes its last
  stand: the last stand's group at its places there and every other of its foes on one ring 5 m round it, a place each
  kept as others fall, all defending (its waves come on, for the players), led by the highest rank standing as it
  begins; that one's fall breaks every foe there; groups standing again at its last stand take a leader afresh. As
  groups stand again the share rises, and they go back.
- **A mission's waves**: as its garrison falls back, a wave comes, and another for its last stand, both at once if it
  gives up both at once: each a band drawn as its bands are (two to four Runners, Collectors and Crossbowmen, Minor or
  Major), each wave its own, at the island's levels, a shield drawn as any foe's. It stands at the open point of the
  post lattice nearest the players that is at least 25 m from each of them, 20 m from every wave standing and 10 m from
  every foe and the place it keeps to, hunts the nearest player standing and seen, and holds there: its places are where
  it stood. A wave has its own leader and break, but no breaking point: it comes on whatever it loses. It never stands
  again once fallen. It comes once each time the garrison holds its territory, but not while a wave of before stands,
  not with no player standing and seen to hunt, and only while the room's living foes leave room for all of it; a
  garrison sent away calls none. No two places a garrison gives ground to stand within 1 m of each other or of a wave's
  where the floor round them has room: each is tried round three rings of twelve, 2.5 m apart, and in a pocket too small
  for them all the last go on their ring regardless.
- **Standing again**: a group whose last foe has fallen stands again, whole and idle at its places at its post and
  its beat begun again from there, 120 s later (a group with a Miniboss or a Boss, 10 minutes later, so neither is
  farmed: [[Bosses and Dungeons Drop Items, Clears Pay, and Shapes Come From the Week's Abyss]]), once
  no player stands within 40 m of its post and the room's living foes leave room for all of it.
- **The limit**: a node's room holds 24 foes, its garrison and every foe its Boss calls counted; a course's room 12.
  Only the living count when a group stands again or a Boss calls, so the fallen, lying their ten seconds, never
  hold them back.

## On screen

- **Over each foe**, just over its head (1.9 m over its feet, over its parry ring round the head), its plate in the
  [[Interface]]'s kit: its level in a square at the left (empty for a foe of no level), and to its right its type's name
  above a thin bar of its health, red for a Minor, orange for a Major, yellow for an Elite and a Miniboss, over a
  dark trough with a hairline edge. An Elite has one brass chevron beside its name, a Miniboss two. A "?" stands before
  the name while it is suspicious or searching, and a "!" for a second when it turns alert ([[Foes]]). An ally on the
  players' side (the Brig's crew) has its bar in green and no "?" or "!".
- **Over a figure, a plate's size goes with its rank**, as Destiny's bars do
  ([[Fewer Plates Show, Sized by Rank, After Destiny]]): a Minor's bar short and thin, a Major's as a ship's, an
  Elite's and a Miniboss's longer and cut in thirds ([[Interface]]). A Miniboss's second phase, at 35%, comes just over its lower third.
- **Plates are never overbearing.** The cone round the crosshair shows one plate: the foe whose body the crosshair is
  on, the nearest of them, else the foe in sight nearest it, within 6 degrees of its body (a Boss there takes the cone
  and shows none over its head); the foe the soft lock holds shows its plate wherever it is, and so do the foes fought
  in the last 6 s, theirs fading as the target plate does. None is seen through a block or the land, nor past 60 m; each
  shrinks with distance as its figure does ([[Interface]]; Claude's calls in [[Plates as Claude Shows Them]]).
- **Plates never overlap**, but for one fading out of the cone, which holds its place for its quarter second. The
  nearest foe's stays over it, in front; a farther one that would cover it is lifted just clear, and the plates hold
  still from frame to frame ([[Interface]]).
- **Plates stand still however far out.** Each is placed through the camera's matrix kept in 64-bit numbers
  (`shiftedExactly`): out at sea, some 2,800 km from the world's origin, a 32-bit matrix rounds its offset to a quarter
  metre, enough to shake a plate some 30 px as the camera moves.
- **The boss bar**: for the nearest living Boss that is alert or struck, the same plate wide across the top of the
  screen: its level, its name and faction, "Phase n of 3", its health in yellow marked at 2/3 and 1/3, and its poise
  track under it. A Boss has no plate over its head.
- **The target plate**: the foe the player is fighting (struck, locked or winding up at them), the same plate at the
  top with its poise track under its health, beneath the boss bar while one shows; it fades 6 s after the last
  exchange ([[Interface]]).
- **A blow's harm reads** on the target plate and the boss bar as a strip held where the bar stood and a piece
  breaking off and falling; a blow's number carries what it did besides ([[Interface]]).
- **Its debuffs** stand beside the bar of every plate of it, over its head, on the target plate and on the boss bar:
  an icon for its Expose in Cosmic purple and its Charge in Volt blue, and once a Charge ends, a faded Charge while it
  cannot be Charged again, each over a thin line that shrinks as its time runs out ([[Combat]], "Statuses";
  [[Interface]]). A Charged foe's poise track says "Charged". A Veiled player is no foe's target ([[Foes]]).
- **A group's break** shows in how its foes move, with no blurb over them
  ([[Foes Fight in Groups That Lead, Break and Give Ground, After Bungie]]): the broken fall back or run, and the one
  that rages charges in, its guard down.
- **Their dress**: the Grey Tithe in grey over leather or iron by role (Runner and Deckhand in leather; Crossbowman
  and Pistoleer women in leather; the Marksman under a grey hooded cloak; Collector and Tithe-Mate iron under a grey
  surcoat; the Hookman in leather and a vest; the Enforcer in full iron and a short grey cloak; the Bosun in iron with
  a grey sash; the Reeve in iron with a grey surcoat and cloak; Thule in full steel plate, a grey surcoat and a long
  grey cloak; Corvane in full iron plate, a grey surcoat and a long grey cloak); the crew's own five types in the Test
  Ground's first foes' clothes. A page may dress a foe in clothes of its own instead, its type's weapons drawn: the wreck dresses its
  crew as the Brig's hands ([[Prologue]]).
- **The [[Test Ground]]'s panel** picks a faction, a type (marked land or deck) and one of its ranks.
- **In the [[Game]]**, on foot in a node, every foe its room holds is drawn and fought as on the Test Ground.

## Limits

- A garrison stands within its room's navmesh, a 70 m square by the first spawn, never across the whole section:
  baking a section's whole ring costs more time and memory than a room has. A garrison foe gives up a player who
  leaves the mesh more than 14 m from it; a foe a player asked for, or one a Boss called, chases them off it and walks straight.
- A cleared group stands again only while no player is within 40 m of its post, so a player waiting nearby holds it.
- A wave stands from nowhere, at least 25 m from every player: a node's land has no ships to bring it, and its room's
  navmesh no ground beyond its square to walk it in from.
- A wave the room's limit leaves no room for does not come later, once foes have fallen, until its garrison holds its
  territory again.
- A group's leader is fixed as it stands: a leader walking home or leashed still leads it.
- Only the Sloop's hull for every rank of ship ([[Hulls]]).
- The Hookman's axe takes both hands, so he carries no shield.
