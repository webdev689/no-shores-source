---
type: system
status: building
code:
  - crates/combat/src/step.rs#step_fighter
  - crates/combat/src/judge.rs#judge
  - crates/combat/src/judge.rs#suffer
  - crates/combat/src/lock.rs#hold
  - crates/combat/src/strike.rs#struck
  - crates/combat/src/shapes.rs#Telegraph
  - crates/combat/src/shots.rs#fly
  - crates/combat/src/arms.rs#arms_of
  - crates/combat/src/tuning.rs#PARRY_WINDOW
---
# Combat

How fighters fight, as Soulframe has it, with DFO's swings and its foes' telegraphed blows
([[Combat Is Soulframe's, With DFO's Enhanced AI]]): a guard held and a parry pressed just as a blow lands, a dodge's
hop that blows pass through, stamina and poise, and a soft lock that steers a fighter's blows at the foe it fights.
Players and foes fight by the same rules, which the [[Server]] decides and each browser predicts for its own player.

## How it works

- **One crate for every machine.** The `combat` crate holds the rules, beside [[Movement]]'s, and steps a fighter in
  the same whole ticks of 1/60 s. A fighter is a body and everything a fight keeps for it: what it holds, health,
  stamina, poise, what it is doing, its aim and its soft lock's target. What a fighter does to others is the host's
  to ask: its tick says when a blow lands, and the host finds who it reaches and judges it against them.
- **What it holds.** The forge layers in its hands decide its arms: a dagger, sword, mace, flail, axe, warhammer or
  staff, fists with nothing drawn, or a bow, crossbow, pistolet or thunderlock. The left hand holds a shield, a second
  blade (the pair's blows take turns between the hands), a torch, or nothing; a two-handed weapon leaves it empty.
  Metals do not change a fight yet.

| Weapon | Reach (m) | Damage | Weight | Stamina | Blow lands / swing ends (ticks) |
|---|---|---|---|---|---|
| Fists | 1.0 | 6 | 0.6 | 6 | 21 / 54 |
| Dagger | 1.3 | 9 | 0.7 | 8 | 21 / 54 |
| Sword | 1.8 | 14 | 1.0 | 12 | 24 / 60 |
| Mace | 1.6 | 15 | 1.5 | 14 | 25 / 61 |
| Flail | 1.8 | 16 | 1.5 | 15 | 25 / 63 |
| Axe (two hands) | 2.0 | 22 | 1.44 | 20 | 27 / 67 |
| Warhammer (two hands) | 2.0 | 24 | 1.73 | 22 | 27 / 67 |
| Staff (two hands) | 2.2 | 13 | 1.15 | 14 | 25 / 62 |

- **Swings.** DFO's swing law times them: five strike frames, each a fifth of a second for a sword, shorter or longer
  by the weapon's handling and a two-handed weight; the blow lands as the third frame begins. Holding the button
  swings again as each blow ends. A swing costs its stamina, and while it is struck the fighter moves at a third of its
  pace. The mouse's drag picks the stroke, as in DFO: up thrusts half a metre further at one foe, in a narrow arc;
  down chops at one, heavier on poise and half again on a guard; left and right sweep a wide arc across three; the
  diagonals slash at two. A blow reaches a fighter of another side within its reach and arc (close in, almost any way
  it faces), near the striker's height, with no block between them; the soft lock's target first, then the nearest.
- **Stamina.** 100. It comes back at 35 a second once it has rested half a second since it was last spent, slower
  behind a guard. A fighter with none cannot swing or dodge; spending never takes it below none.
- **The guard and the parry.** Holding the guard raises it; pressing it opens a parry window of a fifth of a second
  (12 ticks). A blow that lands in the window, from within the guard's arc, is parried: it does nothing, its striker
  staggers for 54 ticks, and the parrier's next swing at it within that time is a riposte, two and a half times as
  hard, which no guard stops. A press within half a second of a window left unused opens none, so mashing the button
  does not parry. After the window the guard blocks: a blade's guard covers 60 degrees either side, a shield's 80; a
  blade lets a fifth of the blow through, a shield a twentieth; the guard pays the blow's weight in stamina (a shield
  six tenths of it), and a blow it cannot pay for breaks it, staggering the fighter for 48 ticks with half the blow
  through. Guarding, a fighter moves at under half its pace. Iron blows and shots are never parried, iron blows never
  blocked, and shots blocked only by a shield.
- **The dodge.** A press dodges: a low, fast hop (3 m/s up, 10 m/s along) the way the keys point, or straight back with
  none, landing about 3 m away. It costs 22 stamina, needs the ground under it, and is not taken on horseback. It
  faces the soft lock's target if there is one, so a fighter hops aside still facing its foe. Blows pass through it
  from its second tick to its eighteenth; one that lands in its first nine is a perfect dodge, giving back 15
  stamina and earning a counter: the next swing within 48 ticks strikes half again as hard and twice as heavily. A
  dodge cancels a swing's wind-up or its follow-through, and a swing may follow it from its eighteenth tick. The
  movement rules carry the hop with no steering, so it slides along a wall and falls off a ledge, and never catches a
  lip.
- **Poise.** A blow that lands fills its fighter's poise meter by its weapon's weight times ten, by its stroke's share,
  half again from behind. Full, the fighter staggers (light 84 ticks, medium 72, heavy 60, massive 48), takes a quarter
  more from every blow, and no new poise stagger begins until three seconds after. The meter drains a quarter a second
  after two seconds untouched. A player struck flinches for a quarter of a second, losing a swing's wind-up; a foe
  stands through a blow until its poise breaks.
- **Death.** At no health a fighter dies and lies where it fell.

## The soft lock

As in Soulframe, there is no button. A fighter's lock takes the foe it swings at or raises its guard to (the nearest
to its look within 70 degrees and 9 m, in sight) and the one that strikes it. While it holds, the fighter's swings turn
after it in their wind-up (540 degrees a second, if it is within the weapon's reach and 2.5 m), its guard turns to
face it, and its dodge faces it. It lets go when the foe dies, is past 14 m, has been out of sight for a second, or
the fighter's look has stayed more than 110 degrees away for half a second. The camera stays its player's.

## Foes' telegraphed blows

A foe may wind up a telegraphed blow, as DFO's TELL draws them: a shape on the ground it stands still through, landing
on whoever's feet stand in it when the wind-up ends. A lunge and a charge are lanes ahead, a sweep an arc, a slam a
disc just ahead, a ring an annulus safe at the foe's feet, a leap a disc where its target stood, and an aimed shot the
line its arrow flies. A lunge and a charge turn after their target through the first half of the wind-up. A charge
crosses its lane and a leap flies to its disc as the wind-up ends. A feint is cut short. A non-iron blow can be parried
or blocked by a fighter facing the foe; an iron one, winding up a fifth of a second longer, must be dodged, and an iron
slam or ring knocks down. A blow that finds no one leaves its foe overreached for its shape's punish (longer for iron,
half again after a perfect dodge), taking 1.3 times more and staggered by the first blow landed.

| Shape | Wind-up (s) | Ground | Damage |
|---|---|---|---|
| Lunge | 0.7 | a lane 4.5 m by 1.2 m | x1.5 |
| Sweep | 0.8 | an arc of 3.2 m, 65 degrees either side | x1.25 |
| Slam | 0.9 | a disc of 2 m, 1 m ahead | x1.75 |
| Ring | 1.0 | 1.6 m to 4 m about its feet | x1.5 |
| Charge | 0.9 | a lane 9 m by 1.6 m, crossed in 0.45 s | x1.5 |
| Leap | 1.0 | a disc of 1.8 m where its target stood, flown in 0.35 s | x1.6 |
| Aimed shot | 0.6 | its arrow's line, 0.5 m wide | x1.4 |

## Shots

A bow is drawn while the button is held and loosed when it is let go: drawn under 0.2 s nothing leaves; at a second it
is at full power. An arrow flies at 45 m/s and a bolt at 55, each falling 6 m/s² as it flies, until a block or a body
stops it; a pistolet's or thunderlock's ball reaches 60 m along its line at once. A body is an upright cylinder 0.35 m
wide and 1.8 m tall. A shot comes again after the first person's firing and reload: a bow's 0.6 s, a crossbow's 1.6, a pistolet's
1.9, a thunderlock's 2.2.

## Limits

- No gear power yet: every sword strikes alike whatever its metal.
- Running costs no stamina.
- Casting does no harm yet.
