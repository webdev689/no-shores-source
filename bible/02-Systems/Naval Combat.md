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
  - crates/naval/src/gunnery.rs#zone_radius
  - crates/naval/src/damage.rs#shot_harm
  - crates/naval/src/shots.rs#step_balls
  - crates/naval/src/shots.rs#stop_of
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
  - crates/naval/src/fight.rs#meet
  - crates/naval/src/wire.rs#view_numbers
  - crates/room/src/pirates.rs#Pirates
  - client/src/game/seaCombat.ts#SeaCombat
---
# Naval Combat

Broadsides between the owner's Sloop and one pirate captain: DFO's naval combat, rebuilt in Rust
([[Pick - Sailing and Naval Combat]]) on the [[Sailing]] crate's ships, and fought in the [[World Editor]].

## How it works

- **A ball** is a point under gravity alone (9.81 m/s², no drag), leaving its gun at the gun's speed plus the deck's
  way. Its flight is a closed form of its launch, swept as a segment from where it was to where it is, so no step bends
  a shot or tunnels one through a hull.
- **A gun is laid, not pointed.** A broadside fires square to the hull ([[Ship Guns Keep Square Broadsides]]); the
  gunner sets only the range, and the low arc that lands there is found within the carriage. Each gun's mouth rides
  her heel; the lay stays her upright hull's.
- **The guns** are DFO's swivel, three a side: 55 m/s, -10 to 14 degrees, 149 m at most from her deck. A broadside
  ripples 0.09 s a gun, each ball from where its port is by then, scattered by the volley's seed (more for a poorer
  gunner). No battery bears within 35 degrees of her bow or 40 of her stern. Each side reloads on its own clock: 5.6 s
  single-handed, 4 to 7.2 s with a crew.
- **The loads** are round, grape, chain and heated shot, with DFO's factors over round shot: grape is slower and wider
  and kills men (less as its flight lengthens), chain tears canvas, heated shot sets her alight. A loaded side drawn
  for a new load takes half its reload; one loading keeps its progress.
- **A look on her** lays for the point it meets (DFO's `lookOnShip`): the look's ray from the aim eye is tested
  against her hull's box and her sails' boxes out to the laid gun's longest throw and 60 m, the nearest entry taken.
  The side is laid on that point, its range out along the fire and its own height. A look on her canvas lays chain
  for that very point and every other load for her hull's middle. The point is led along the fire by her way over the
  ball's flight there. A look that meets no part of her lays for the water's range. A release fires that same lay.
- **The aim shows each gun's end**: its ball, unscattered, flown by the same law a fired ball flies by (in the fight's
  ticks) with her where her way will have carried her by then, to where it stops. The lay is on target only when one
  of those balls meets her, canvas or hull. Its landing zone's radius is DFO's: half the width the crew scatters the
  gun's yaw across at the splashes' mean range (at least 2 m wide), and never under 1.6 m.
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
lookReach), unless the look is on her: then the guns are laid on the point it meets. Letting go fires the lay held; a left click holds fire, the wheel changes shot, and `C` braces.

Her Sloop is drawn darker from the same model, and the water cuts her footprint as it does the player's. The balls,
the lay's arcs, and each event's flash and smoke, spray and ripples, splinters, dust, and fire aboard
are small lit spheres. The panel shows both ships' hull, canvas and men, the guns' reload and load, DFO's messages,
and "BROADSIDE! Brace (C)." while her guns stand run out. Each arc of the lay starts where its ball leaves, a
ripple after the gun before it and carried on by her way, and runs only to where that ball stops: a larger red mark
where it strikes her, and a ring of the landing zone's radius where it splashes. The arcs are red, and
the panel reads "Laying the ... guns: on target.", only when an unscattered ball strikes her.

## At sea

The sea room ([[Server]]) sails pirates among the players' ships on the [[Overworld]]: DFO's director, trimmed to
pirates alone ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]).

- **Who comes.** Each player at sea rolls half a minute after reaching the water and then every 60 to 140 s. While
  fewer than two pirates sail within 1.9 km of them, a roll brings a ship 0.8 of the time, and she is a pirate 0.3 of
  that (DFO's open sea: 30 of its factions' 100); no other ship sails yet.
- **Where.** On the ring 650 to 1000 m round their ship, no nearer than 450 m to any player, where open water lies
  between, heading across their waters on a slant; she sails on at 2.4 m/s, going about at land, and goes once no
  player is within 1.9 km. Her seed is her temper: one in four is bold.
- **The meeting.** A bold pirate within 750 m of a player who is not fighting meets them: she leaves the sea and the
  fight begins with her where she lay, under sail, and the player's Sloop hove to (`Fight::meet`). The room steps it
  each tick by the player's orders, on waters made from the coasts (open sea, the swell on it, dry land on them), until
  she sinks or is gone; its last view is shown once, and the player sails on from where it left them.
- **In the game** the view pans down over 1.5 s from the raised sea to their Sloop at true scale, and the fight is
  the World Editor's (its look and lay, effects and panel), its controls A and D, W and S, the right button to aim and
  let go to fire, a left click to hold fire, the wheel for the load and C to brace; the sea's own wait for its end.
  Then the view pans back up. Pirates at sea are drawn as the Overworld's ships are, darker.

## One crate, every machine

The fight lives in `land-wasm` beside the open landmass: a request begins it, steps it by the player's orders (up to a
second's ticks, presses on the first alone) or ends it, and opening another landmass ends it too. Its state never
crosses, so requests and answers are JSON. A scripted fight's fingerprint at the end of each leg is pinned natively and
through WebAssembly ([[Agree to the Bit]]).

## Limits

- One captain, a Pirate Sloop: no other factions or classes, and at sea pirates alone.
- At sea there are no ports' waters (DFO's crown waters, fewer pirates by a port), no notoriety and no slowing near
  enemies; a fight's land is the coasts' outlines, and a fight leaves no hurts on the Sloop after it.
- Her canvas is always drawn, so her sails always take balls; it does not come down as her sail share falls.
- She cruises on her course until she sees the player; DFO's captains wander between waypoints.
- No boarding, ramming, crew, sounds, flotsam or magazine blast yet: step 3 of the pick.
