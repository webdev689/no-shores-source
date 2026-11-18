---
type: system
status: live
code:
  - crates/foes/src/lib.rs#think
  - crates/foes/src/brain.rs#notice
  - crates/foes/src/kinds.rs#numbers
  - crates/foes/src/kinds.rs#spawn
  - crates/foes/src/board.rs#Board
  - crates/foes/src/senses.rs#sense
  - crates/foes/src/tactics.rs#decide
  - crates/foes/src/react.rs#defend
  - crates/foes/src/tell.rs#throw
  - crates/foes/src/shoot.rs#ranged
  - crates/foes/src/steer.rs#controls
  - crates/foes/src/tuning.rs#MELEE_TOKENS
  - crates/room/src/foes.rs#step_foes
  - crates/room/src/foes.rs#tell_brains
---
# Foes

The foes a player fights, and the brain each fights with: DFO's Enhanced AI, its tactics and its telegraphed blows,
built upon so foes use the guard, the parry and the dodge of [[Combat]] too
([[Combat Is Soulframe's, With DFO's Enhanced AI]], [[Pick - Enhanced AI]]).

## How it works

- **One crate for every machine.** The `foes` crate stands on the `combat` crate's rules. Each tick the room hands a
  foe's brain what it knows (the room's tick and seed, every fighter, the course's blocks, and routes, which the room's
  [[Navmesh]] gives), and the brain asks its fighter for controls and buttons, as a player's keys would, telegraphed blows
  included; the combat rules carry them out. What the room saw happen (a swing begun, a shot loosed, a blow landed on
  it or by it, its telegraphed blow's landing) it tells the brain, which notes it for its next thought. The foes of a
  room share a board of turns. Chance comes from a hash of the room's seed, the tick, the foe and what is being
  decided, so the same seed plays the same fight.
- **The kinds.** Each holds real forge layers, so the client dresses it alike. Reaction is the ticks from seeing a
  swing begin to answering it; the shares say how often it parries, blocks or dodges a swing at it, the rest it takes.

| Kind | Holds | Health | Poise | Weight | Might | Reaction | Parry / block / dodge | Telegraphed blows |
|---|---|---|---|---|---|---|---|---|
| Skirmisher | `dagger_iron`, `dagger_iron_l` | 45 | 18 | light | 1.0 | 15 | 5% / - / 45% | lunge |
| Swordsman | `sword_steel`, `shield_kite_steel` | 70 | 35 | medium | 1.0 | 16 | 15% / 35% / 10% | sweep, lunge |
| Brute | `warhammer_iron` | 130 | 70 | heavy | 1.1 | - | - / - / - | slam (iron), sweep |
| Archer | `bow_short_iron` | 50 | 18 | light | 1.0 | 18 | - / - / 25% | aimed shot |
| Captain | `sword_ebony` | 400 | 120 | heavy | 1.2 | 14 | 25% / 30% / 15% | sweep, lunge, charge, leap |

  A skirmisher is a coward: below a fifth of its health it runs, once, for 8 s. The captain is the boss: elite, it
  throws its blade's whole set, feints and chains, and has a second phase.
- **Senses.** A foe notices a fighter of another side within 14 m (a shooter 51.2 m), within 90 degrees of where it
  faces (DFO's half round), with no block between their chests, and takes the nearest it notices, or the one that
  strikes it. Seen farther off, it is pursued, not fought. Out of sight, its target is hunted where it was last seen
  for 5 s, then let go, and its turn at it is kept 1.5 s (DFO's stale lease). The foe's soft lock holds its target,
  but while it answers a blow, the striker. A player just stood again is left be for 3 s, unless they strike first.
- **Moving.** A foe faces a bearing of its own and turns at 320 degrees a second; walking somewhere it turns first and
  steps only within 45 degrees of its way, so no foe walks backwards. It runs to a spot more than 5 m off. It finds its
  way by the room's routes, and stops by its distance to the target, never to a route's corner. Foes steer apart inside
  1.2 m of each other, pushed at up to 0.7 of a walk; nothing is moved but by its own controls.
- **Turns and the ring.** Two foes a target fight it hand to hand at once and two shoot at it. A holder walks in to its
  reach, squares up within 22.5 degrees, waits 0.3 to 0.9 s and swings once; then it hops back for at most 0.4 s, holds
  its ground 0.8 to 1.6 s, and hands its turn on: the foe that has waited longest goes next, and one that has waited 6 s
  goes in whatever the count. The rest stand on a ring 1.5 m outside their reach, with 0.6 m of give, and circle it
  slowly toward their own place on it, which starts where each stood and drifts 0.15 radians a second. A target who
  turns its back on a waiting foe (more than 110 degrees) near the ring, or walks in on one inside the ring's near
  edge, is open to it without a turn, but to one such foe at a time, and it goes on fighting while the target stays
  that close. A foe that blocks holds its guard up on the ring while it waits its turn, as a shield-bearer does.
- **Swings.** A chop into a raised guard, a sweep when two or more stand in reach before it, a thrust at the edge of
  reach, otherwise a slash, chop or thrust by chance. A foe that guards keeps 30 stamina for its guard; short of a swing
  and that, it hands its turn on. Blocked twice running by a guard still raised, it stops swinging into it and winds up
  a telegraphed blow instead, or waits. A foe's riposte after its own parry, its counter after a perfect dodge, and,
  in its turn, a swing at a target spent in its own swing's follow-through, staggered or tending a bow (not one knocked
  down: the iron blow already punished that), are struck at once with a chop.
- **Backing off and running.** A quarter of its health lost inside 3 s, or, for a foe that guards or dodges, its poise
  four fifths full: it hands its turn on and walks out to a ring 2 m farther for 2 s, at most once in 10 s.
- **Shooters.** A ranged turn gates a shot and a shot spends it; held 5 s unused it goes on. Without one an archer stands
  off and holds its fire, never circling. It aims its bow and draws for a full second, aiming up for the arrow's
  fall, then pulls the trigger, 0.5 to 1.5 s between shots: its arrows strike as a quick shot does, never half again
  as a player's aimed shot does ([[Combat]], [[Ranged Weapons Aim and Fire]]). A target inside 6 m it walks away
  from, one burst of at most 2 s, out to 7 m; caught or cornered, it fights close with its fists for 3 s, and kites
  again only 8 s after.

## Answers to blows

A foe answers as a person would, no faster and no surer. Seeing a player's swing begin at it (the striker within its
reach and a metre, aiming at it, and in front of it: a blow from more than 110 degrees off its facing is not seen
coming), it waits its reaction time (14 to 20 ticks, a person's 230 to 330 ms), then decides once, by its kind's shares
and what it is doing. A parry presses the guard 2 to 14 ticks before the blow lands, by the dice, as a person's timing
wanders: within 12 the window spans the landing, earlier it has closed and the guard only blocks; never later than 2
ticks before. A block raises the guard only if its window will have closed before the blow lands (raised later it
would parry, which a block is not), or keeps one already held; too late for that, it takes the blow. A dodge hops
aside and a little back, still facing the blow, pressed 2 to 14 ticks before the landing. Mid-swing it can only dodge.
A shot loosed at it is timed by its distance: a shield-bearer blocks it, others may dodge it. Only a player's swing or
shot is weighed, never an ally's. Waiting on an answer, a foe does not swing; while it answers, it faces the striker.
The room judges a player's blow against a foe where the player's screen showed it but guarding and dodging as it is
now ([[Server]]), so these answers count the same at any lag.

## Telegraphed blows

DFO's TELL. A holder of a melee turn, free, off its cooldown and seen to its target, with no other wind-up within 20 m
of that target, winds one up with DFO's one in ten a classic tick of 1/16 s, here 2.8% a tick (81% a second). In reach
(and half a metre) it picks among its blows of reach; out of it, a charge from 5 to 12 m along a lane clear of blocks
or a leap from 3 to 9 m at its target's feet. Its wind-up is the shape's times 0.9 to 1.25, an elite's times 0.9,
never under 0.6 s; the combat rules add iron's 0.2 s. A heavy body's slam and ring are iron, and an elite's blow is
iron one time in three. Its cooldown is 8 to 15 s, an elite's 6 to 11, from the end of the wind-up. The captain's
blades feint one wind-up in five, cut at 0.55 of it and never two within three wind-ups, and swing at once after; a
gap-closer, a chain or a shot never feints. Once the room says the blow landed on someone (it judges each player as their screen showed it,
so the foe stands its ground up to half a second for the word), it is followed, 35% of the time for an elite, by a
chained blow: a sweep then a lunge, a lunge or a slam then a sweep, a ring then a slam, wound up 0.6 s (never under
0.55): long enough for a person who was just struck to react. A blow that ends without a chain is the holder's turn, spent; one that missed leaves it overreached, and
it hands its turn on. An archer's shot is aimed one in three, its line as long as its target is far.

**The captain's second phase.** At 35% of its health, once, as soon as it is free: a roar of 1.2 s, an iron ring about
its feet; then its wind-ups are three quarters as long, its cooldowns six tenths, its blows a quarter harder (its
might 1.5), and it chains up to two blows after a first.

## Limits

- Foes do not seek a line around a block to shoot past it, nor flank; out of sight they walk to where the target was.
  project-final's perception, cover, flanking and director are to come ([[project-final's AI Comes Over Onto DFO's]]).
- A foe answers one blow at a time: a second swing seen while it answers the first is not weighed.
- A wind-up goes on when its foe changes target (DFO's breaks it).
- A shot is taken to leave as the room says it was loosed; a draw is not read.
- Foes have no ranks, names or factions yet: the kinds stand for all of them
  ([[Enemies Come in Five Ranks, After Destiny]], [[Enemy Factions Start With the Grey Tithe]]).
