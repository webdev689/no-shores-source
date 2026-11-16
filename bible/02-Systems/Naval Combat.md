---
type: system
status: live
code:
  - crates/naval/src/ballistics.rs#elevation_for_range
  - crates/naval/src/ballistics.rs#segment_entry
  - crates/naval/src/guns.rs#SWIVEL
  - crates/naval/src/guns.rs#loaded
  - crates/naval/src/random.rs#Mulberry32
  - crates/naval/src/arms.rs#SLOOP_ARMS
  - crates/naval/src/gunnery.rs#volley
  - crates/naval/src/damage.rs#shot_harm
  - crates/naval/src/shots.rs#step_balls
  - crates/naval/src/captain/mod.rs#Captain
  - crates/naval/src/captain/engage.rs#engage
  - crates/naval/src/captain/aim.rs#captain_guns
  - crates/naval/src/captain/odds.rs#odds
  - crates/naval/src/fight.rs#Fight
  - crates/land-wasm/src/fight.rs#fight_step_json
  - client/src/editor/naval.ts#Naval
  - client/src/editor/fighting.ts#Fighting
  - client/src/editor/aim.ts#lookReach
  - client/src/ships/effects.ts#Effects
  - client/src/ships/markView.ts#MarkView
---
# Naval Combat

Broadsides between the owner's Sloop and one pirate captain: DFO's naval combat, rebuilt in Rust
([[Pick - Sailing and Naval Combat]]) on the [[Sailing]] crate's ships, and fought in the [[World Editor]].

## How it works

- **A ball** is a point under gravity alone (9.81 m/s², no drag), leaving its gun at the gun's speed plus the deck's
  way. Its flight is a closed form of its launch, swept as a segment from where it was to where it is, so no step bends
  a shot or tunnels one through a hull.
- **A gun is laid, not pointed.** A broadside fires square to the hull; the gunner sets only the range, and the low arc
  that lands there is found within the carriage. Each gun's mouth rides her heel; the lay stays her upright hull's.
- **The guns** are DFO's swivel, three a side: 55 m/s, -10 to 14 degrees, 149 m at most from her deck. A broadside
  ripples 0.09 s a gun, each ball from where its port is by then, scattered by the volley's seed (more for a poorer
  gunner). No battery bears within 35 degrees of her bow or 40 of her stern. Each side reloads on its own clock: 5.6 s
  single-handed, 4 to 7.2 s with a crew.
- **The loads** are round, grape, chain and heated shot, with DFO's factors over round shot: grape is slower and wider
  and kills men (less as its flight lengthens), chain tears canvas, heated shot sets her alight. A loaded side drawn
  for a new load takes half its reload; one loading keeps its progress.
- **What stops a ball** is the first hull, water or ground it meets. A ball tears through any canvas it crosses
  (once a ship) and flies on. The water is the swell's surface under it, and the ground the land's, sampled every 4 m.
- **The harm** of a ball is DFO's: by where it struck (holed within 1.1 m of the water under it, 40% more; the hull
  above; the canvas), 85 to 115% by its own roll. A captain's men stand 1.6 blows each, a player's crew 3.2.
- **A ship** has hull, canvas and men. A captain strikes at a quarter of her hull or with no men left, and goes down
  over 22 s at none, listing and trimming by her seed and settling slowly, then fast. The rest of the volley that made
  her strike cannot sink her. The player's Sloop is wrecked at none, never sunk: no sail sets, her oars pull 35%,
  her guns are silent. Fires (three at most) burn hull, canvas and men for 15 s. Bare poles leave 35% of her way.
  Braced, she takes half the harm to hull and canvas, but her guns are silent and do not load. Unhurt for 15 s,
  with no ship within 700 m that would take her, her hands mend her to half, and a wreck floats again past 15%.
- **Chance** is one seeded stream (DFO's mulberry32), drawn in a fixed order, so a fight is the same on every machine.

## The captain

She sails a Sloop under the player's own helm, so her pace is the player's. DFO's captain commands a swing and a
share of sail; here the swing is a share of her rudder and the sail the rung whose way is nearest. Under the ladder's
law the wind's eye costs her 0.55 of her way, so she never tacks.

- **Whom she fights.** A pirate is bold one time in four by her seed. A bold one takes on the player she sees within
  750 m; a wary one only a wreck, a hull nearly gone, or a ship she outguns 5 to 4 by DFO's fighting power (the time
  each takes to make the other strike). Struck by the player, she is hostile to him for 5 minutes.
- **Her course.** Far off, she steers to intercept. A ship running from her she runs down astern, then sheers out to
  its beam. Otherwise she brings the side that costs least to bear on where her balls will meet him, bent off the beam
  to open or close her range of 50 m, and once presented keeps station with sail. She bends round his hull and sounds
  the land ahead, swinging off a foul course.
- **Her guns.** A side loaded, in reach, near her beam, bearing soon and whose lay would strike runs out: the tell.
  It fires no sooner than 1.3 s on, within her gunners' window, long or short by their want of skill. One run out too
  long unfired, or that loses its mark, is run in. She never fires on a wreck.
- **When she breaks off.** Any pirate runs under 30% of her hull; a wary one runs from a ship that outguns her. A chase
  that gains nothing in 150 s is given up, and a wreck left after 30 s. The fight ends when she has sunk, or sailed
  out past 1.9 km and is not fighting.

## In the World Editor

While sailing, `F` calls a pirate captain onto the ring 650 to 1000 m round the Sloop, where the water floats her,
heading across her waters on a slant; `F` again sends her off. The fight then steps the Sloop in her helm's place.
Holding the right mouse aims: the camera stands at the aim eye past the ports on the side looked at, the look's
bearing picks the side, and where it meets the water is the range, on at 30 m a degree past the dip (DFO's
lookReach). Letting go fires the lay held; a left click holds fire, the wheel changes shot, and `C` braces.

Her Sloop is drawn darker from the same model, and the water cuts her footprint as it does the player's. The balls,
the lay's arcs (red on target), and each event's flash and smoke, spray and ripples, splinters, dust, and fire aboard
are small lit spheres. The panel shows both ships' hull, canvas and men, the guns' reload and load, DFO's messages,
and "BROADSIDE! Brace (C)." while her guns stand run out.

## One crate, every machine

The fight lives in `land-wasm` beside the open landmass: a request begins it, steps it by the player's orders (up to a
second's ticks, presses on the first alone) or ends it, and opening another landmass ends it too. Its state never
crosses, so requests and answers are JSON. A scripted fight's fingerprint at the end of each leg is pinned natively and
through WebAssembly ([[Agree to the Bit]]).

## Limits

- One captain, a Pirate Sloop: no other factions or classes, and no ambient traffic.
- Her canvas is always drawn, so her sails always take balls; it does not come down as her sail share falls.
- A look lays for the water's range, not for a point on her hull.
- She cruises on her course until she sees the player; DFO's captains wander between waypoints.
- No boarding, ramming, crew, sounds, flotsam or magazine blast yet: step 3 of the pick.
