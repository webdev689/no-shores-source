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
| Skirmisher | `dagger_iron`, `dagger_iron_l` | 45 | 18 | light | 1.0 | 10 | 5% / - / 45% | lunge |
| Swordsman | `sword_steel`, `shield_kite_steel` | 70 | 35 | medium | 1.0 | 12 | 25% / 35% / 10% | sweep, lunge |
| Brute | `warhammer_iron` | 130 | 70 | heavy | 1.1 | - | - / - / - | slam (iron), sweep |
| Archer | `bow_short_iron` | 50 | 18 | light | 1.0 | 16 | - / - / 25% | aimed shot |
| Captain | `sword_ebony` | 400 | 120 | heavy | 1.2 | 10 | 35% / 30% / 15% | sweep, lunge, charge, leap |

  A skirmisher is a coward: below a fifth of its health it runs, once, for 8 s. The captain is the boss: elite, it
  throws its blade's whole set, feints and chains, and has a second phase.
- **Senses.** A foe sees a fighter of another side within 14 m (a shooter 51.2 m) with no block between their chests,
  and takes the nearest it sees, or the one that strikes it. Seen farther off, it is pursued, not fought. Out of sight,
  its target is hunted where it was last seen for 5 s, then let go. The foe's soft lock holds its target.
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
  edge, is open to it without a turn, and it goes on fighting while the target stays that close.
- **Swings.** A chop into a raised guard, a sweep when two or more stand in reach before it, a thrust at the edge of
  reach, otherwise a slash, chop or thrust by chance. A foe that guards keeps 30 stamina for its guard; short of a swing
  and that, it hands its turn on. Blocked twice running by a guard still raised, it stops swinging into it and winds up
  a telegraphed blow instead, or waits. A foe's riposte after its own parry, its counter after a perfect dodge, and,
  in its turn, a swing at a target spent in its own swing's follow-through, staggered, down or tending a bow, are
  struck at once with a chop.
- **Backing off and running.** A quarter of its health lost inside 3 s, or, for a foe that guards or dodges, its poise
  four fifths full: it hands its turn on and walks out to a ring 2 m farther for 2 s, at most once in 10 s.
- **Shooters.** A ranged turn gates a shot and a shot spends it; held 5 s unused it goes on. Without one an archer stands
  off and holds its fire, never circling. It draws by holding its shot for a full second, aiming up for the arrow's
  fall, and looses by letting go, 0.5 to 1.5 s between shots. A target inside 6 m it walks away from, one burst of at
  most 2 s, out to 7 m; caught or cornered, it fights close with its fists for 3 s, and kites again only 8 s after.

## Answers to blows

A foe that sees a swing begin at it (the striker within its reach and a metre, aiming at it) waits its reaction time,
then decides once, by its kind's shares and what it is doing: a parry presses the guard 6 ticks before the blow lands,
so the 12-tick window spans the landing, and never later than 2 ticks before it; a block raises the guard at once and
holds it until 4 ticks after; a dodge hops aside and a little back, still facing the blow, pressed 6 ticks before the
landing, deep in its perfect stretch. A guard already held is kept as a block, since a fresh press would be rushed. Too
late for a parry it blocks; too late for anything, it takes the blow. Mid-swing it can only dodge. A shot loosed at it
is timed by its distance: a shield-bearer blocks it, others may dodge it. Waiting on an answer, a foe does not swing.

## Telegraphed blows

DFO's TELL. A holder of a melee turn, free, off its cooldown and seen to its target, with no other wind-up within 20 m
of that target, winds one up with DFO's one in ten a classic tick of 1/16 s, here 2.8% a tick (81% a second). In reach
(and half a metre) it picks among its blows of reach; out of it, a charge from 5 to 12 m along a lane clear of blocks
or a leap from 3 to 9 m at its target's feet. Its wind-up is the shape's times 0.9 to 1.25, an elite's times 0.9,
never under 0.55 s; the combat rules add iron's 0.2 s. A heavy body's slam and ring are iron, and an elite's blow is
iron one time in three. Its cooldown is 8 to 15 s, an elite's 6 to 11, from the end of the wind-up. The captain's
blades feint one wind-up in five, cut at 0.55 of it and never two within three wind-ups, and swing at once after; a
gap-closer, a chain or a shot never feints. A blow that landed on someone is followed, 35% of the time for an elite, by
a chained blow at once: a sweep then a lunge, a lunge or a slam then a sweep, a ring then a slam, wound up 0.5 s (never
under 0.45). A blow that ends without a chain is the holder's turn, spent; one that missed leaves it overreached, and
it hands its turn on. An archer's shot is aimed one in three, its line as long as its target is far.

**The captain's second phase.** At 35% of its health, once, as soon as it is free: a roar of 1.2 s, an iron ring about
its feet; then its wind-ups are three quarters as long, its cooldowns six tenths, its blows a quarter harder (its
might 1.5), and it chains up to two blows after a first.

## Limits

- Foes do not seek a line around a block to shoot past it, nor flank; out of sight they walk to where the target was.
- A foe answers one blow at a time: a second swing seen while it answers the first is not weighed.
- A shot is taken to leave as the room says it was loosed; a draw is not read.
- Its own telegraphed blow's chain waits on the room telling it the blow landed before its next thought.
