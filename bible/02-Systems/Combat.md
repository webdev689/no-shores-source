---
type: system
status: live
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
  In a room a player holds only what their [[Gear]] puts in their hands. Metals do not change a fight.

| Weapon | Reach (m) | Damage | Weight | Stamina | Blow lands / swing ends (ticks) |
|---|---|---|---|---|---|
| Fists | 1.0 | 6 | 0.6 | 6 | 21 / 54 |
| Dagger | 1.3 | 9 | 0.7 | 8 | 21 / 54 |
| Sword | 1.8 | 14 | 1.0 | 12 | 24 / 60 |
| Mace | 1.6 | 15 | 1.5 | 14 | 25 / 61 |
| Flail | 1.8 | 16 | 1.5 | 15 | 25 / 63 |
| Axe (two hands) | 2.0 | 22 | 1.44 | 20 | 27 / 66 |
| Warhammer (two hands) | 2.0 | 24 | 1.73 | 22 | 27 / 67 |
| Staff (two hands) | 2.2 | 13 | 1.15 | 14 | 25 / 61 |

- **Swings.** DFO's swing law times them: five strike frames, each a fifth of a second for a sword, shorter or longer
  by the weapon's handling and a two-handed weight; the blow lands as the third frame begins. Holding the button
  swings again as each blow ends. A swing costs its stamina, and while it is struck the fighter moves at a third of its
  pace. A click picks the stroke at random, as Daggerfall Unity's click to attack does, among the strokes that reach
  the locked foe when some do (the page rolls it): up thrusts half a metre further at one foe, in a narrow arc;
  down chops at one, heavier on poise and half again on a guard; left and right sweep a wide arc across three; the
  diagonals slash at two. A blow reaches a fighter of another side within its reach and arc (close in, almost any way
  it faces), near the striker's height, with no block between them; the soft lock's target first, then the nearest.
- **Stamina.** 100. It comes back at 45 a second once it has rested half a second since it was last spent, slower
  behind a guard. A fighter with none cannot swing or dodge; spending never takes it below none.
- **The guard and the parry.** Holding the guard raises it; pressing it opens a parry window of a fifth of a second
  (12 ticks), which stays open for its whole length even if the button is let go at once, so a tap parries. A blow
  that lands in the window, from within the guard's arc, is parried: it does nothing, its striker staggers for 54
  ticks, the parrier's lock turns on it, and the parrier's next swing at it within that time is a riposte, twice as
  hard, which no guard stops (it does not also count the stagger's quarter more). A press within half a second of a
  window left unused opens none, so mashing the button does not parry. After the window the guard blocks: a blade's guard covers 60 degrees either side, a shield's 80; a
  blade lets a fifth of the blow through, a shield a twentieth; the guard pays the blow's weight in stamina (a shield
  six tenths of it), and a blow it cannot pay for breaks it, staggering the fighter for 48 ticks with half the blow
  through. Guarding, a fighter moves at under half its pace. Iron blows and shots are never parried, iron blows never
  blocked, and shots blocked only by a shield.
- **The dodge.** A press dodges: a low, fast hop (3 m/s up, 10 m/s along) the way the keys point, or straight back with
  none, landing about 3 m away. It costs 22 stamina, needs the ground under it, and is not taken on horseback. It
  faces the soft lock's target if there is one, so a fighter hops aside still facing its foe. Blows pass through it
  from 1 to 18 ticks after the press; one that lands within 12 is a perfect dodge, giving back 15 stamina and earning a
  counter: the next swing within 48 ticks strikes half again as hard and twice as heavily. A dodge cancels a swing's
  wind-up or its follow-through (never the blow's own tick), a bow's draw, and a flinch from its eighth tick; a swing,
  a guard or another dodge may follow it 18 ticks after the press, as it lands. The
  movement rules carry the hop with no steering, so it slides along a wall and falls off a ledge, and never catches a
  lip.
- **Poise.** A blow that lands fills its fighter's poise meter by its weapon's weight times ten, by its stroke's share,
  half again from behind. Full, the fighter staggers (light 84 ticks, medium 72, heavy 60, massive 48), takes a quarter
  more from every blow, and no new poise stagger begins until three seconds after. The meter drains a quarter a second
  after two seconds untouched. A player struck flinches for a quarter of a second, losing a swing's wind-up; a foe
  stands through a blow until its poise breaks. A blow on a player already flinching does not start the flinch again,
  and a blow in a swing's follow-through or a reload does not flinch at all (that would end it sooner). While no
  poise stagger can begin, blows do not fill the meter; an overreached foe staggers at the first blow whatever.
- **Presses kept.** A press of the attack, the guard or the dodge is kept 8 ticks: one made while the fighter is busy
  (a dodge on a blow's own tick, a guard late in a wind-up, a swing in a dodge's air) is acted on as soon as it can
  be. The newest press wins over a button only held: a click of the attack swings out of a held guard, and a
  riposte is struck through one. The guard, held or pressed, cuts a swing's follow-through short once its blow has
  landed, as the dodge does.
- **What hands hold.** A fighter takes up new arms only at rest: never in the middle of a swing, a guard, a draw or a
  reload. Arms no one could hold (a gun beside a blade, a two-handed weapon with a shield) are bare hands.
- **Numbers that are none.** A look, a push or a pitch that is not a number is never taken: the look keeps the aim.
- **Death.** At no health a fighter dies and lies where it fell.

## The soft lock

As in Soulframe, there is no button. Each swing or guard takes the foe best ranked for it (by nearness to the look
within 70 degrees and nearness within 9 m, in sight, by equal shares), but keeps the one it holds unless another
ranks clearly better, so it does not flick between neighbours; one that strikes a fighter with no lock is taken too,
and a parry turns the lock on the parried. A sweep that lands on three leaves the lock where it was. While it holds,
and while the look is within 70 degrees of it, the fighter's swings turn after it in their wind-up (540 degrees a
second, if it is within the weapon's reach and 2.5 m) and its guard turns to face it; turned to face another, the
guard follows the look. The dodge faces it. It lets go when the foe dies, is past 15 m, has been out of sight for a
second and a half, or the fighter's look has stayed more than 110 degrees away for half a second. The camera stays
its player's.

## Foes' telegraphed blows

A foe may wind up a telegraphed blow, as DFO's TELL draws them (which foe, when and which shape is its brain's:
[[Foes]]): a shape on the ground it stands still through, landing
on whoever's feet stand in it when the wind-up ends, within a blow's height of the foe and with no block between them
(a leap's from where it lands). A lunge and a charge are lanes ahead, a sweep an arc, a slam a
disc just ahead, a ring an annulus safe at the foe's feet, a leap a disc where its target stood, and an aimed shot the
line its arrow flies. A lunge and a charge turn after their target through the first half of the wind-up, and never once a charge has set
off. A charge crosses its lane and a leap flies to its disc as the wind-up ends. A feint is cut short. A non-iron blow can be parried
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

A bow, a crossbow or a gun raises no guard: the guard's button fires it ([[Ranged Weapons Aim and Fire]]).

- **A quick shot.** A pull of the trigger at rest fires at once, a bow with no draw. If the soft lock holds a foe, or
  takes one as the trigger is pulled (as a swing takes one), and the look is toward it (within the lock's 70 degrees),
  the shot flies at its chest, an arrow or a bolt laid high enough for its fall over the flight; with none, or one the
  look has turned from, along the look. Holding the trigger fires again as the weapon reloads.
- **An aimed shot.** Holding the aim raises the weapon: the fighter moves at half its pace with no running, its lock
  lets go and takes none, and its arms point at the aim's mark, the point under its player's crosshair. A fresh pull
  fires onto the mark, an arrow laid for its fall; with no mark, along the look, and with one inside the fighter's own
  round across the ground (looking straight down at its feet), down onto it along the look's bearing. An aimed shot
  strikes half again as hard as a quick one: a crossbow's or a gun's at once, a bow's by its draw, from a quick shot's
  power at none to half again at a full second; a foe's drawn shot strikes as a quick one. Letting the aim go lowers
  the weapon unfired.
- **In flight.** An arrow flies at 45 m/s and a bolt at 55, each falling 6 m/s² as it flies, until a block or a body
  stops it; a pistolet's or thunderlock's ball reaches 60 m along its line at once. A body is an upright cylinder
  0.35 m across its middle (0.7 m wide) and 1.8 m tall; a shot strikes only what lies ahead of where it flew from, and
  one coming down over a head meets its top.
- **Reloading.** A shot comes again after the first person's firing and reload: a bow's 0.6 s, a crossbow's 1.6, a
  pistolet's 1.9, a thunderlock's 2.2. While it reloads, the weapon stays pointed where it fired.

| Weapon | Quick shot | Aimed in full |
|---|---|---|
| Bow | 18 | 27, after a second's draw |
| Crossbow | 26 | 39 |
| Pistolet | 30 | 45 |
| Thunderlock | 45 | 67.5 |

## Why these numbers

The timings are set against shipped games and what a person can do, measured or stated by their makers:

| Ours | Set beside | Why |
|---|---|---|
| Parry window 12 ticks (200 ms) from the press, kept if let go | Sekiro's deflect 200 ms; Lies of P 155 ms; Stellar Blade 150 ms | A tight read of the blow, as those games ask; a tap counts, as theirs does |
| No window for 30 ticks after one unused | Sekiro and Lies of P reset after 500 ms | Mashing does not parry; the guard still blocks |
| Dodge safe 1 to 18 ticks (300 ms), perfect within 12 (200 ms) | A backstep or quickstep's 230 to 300 ms; Stellar Blade's perfect dodge 150 ms, more with upgrades | A short hop; the perfect stretch matches the parry window, so the two reads feel alike |
| Stamina back at 45 a second after 0.5 s; a dodge 22 of 100 | The Souls games' 37 to 45 a second | Four dodges from full, back in about two seconds |
| A sword's blow 24 ticks (400 ms) after the press | For Honor's quickest light, 400 ms, "reactable" | A foe's swing can be answered by a person who watches for it |
| A press kept 8 ticks | Fighting games' 5 to 10 frame buffers | A press a moment early is not lost |
| Lock takes within 9 m and 70 degrees; lets go past 15 m, after 1.5 s unseen | FromSoftware's 15 m lock and its keep time; God of War's on-screen targeting | Holds through a moment behind a pillar, and follows the look |

A person reacts to what they see in 200 to 250 ms at best, more with a choice to make. Each blow is judged against
the defender as their own screen showed it, so a player's lag never shortens these windows. Foes are held to the same
human limits ([[Foes]]).

## Limits

- Gear's power scales a blow's damage in the rooms ([[Gear]]), but its perks change nothing the fight's rules do yet.
- Running costs no stamina.
- Casting does no harm yet.
- A reload is not cut short by a dodge; a press made in one waits for it to end (8 ticks at most).
- No hit-stop: the rules step in fixed ticks for everyone, so a blow cannot pause them.
