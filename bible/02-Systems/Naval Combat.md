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
  - crates/naval/src/fight.rs#sail_hurt
  - crates/naval/src/fight_step.rs
  - crates/naval/src/laying.rs#preview
  - crates/naval/src/ram.rs#ram_blow
  - crates/naval/src/ram.rs#overlap
  - crates/naval/src/fight_ram.rs
  - crates/land-wasm/src/fight.rs#fight_step_json
  - client/src/editor/naval.ts#Naval
  - client/src/editor/fighting.ts#Fighting
  - client/src/editor/aim.ts#lookReach
  - client/src/ships/effects.ts#Effects
  - client/src/ships/markView.ts#MarkView
---
# Naval Combat

Broadsides, and rams, between players' Sloops and pirate captains' Sloops: DFO's naval combat, rebuilt in Rust
([[Pick - Sailing and Naval Combat]]) on the [[Sailing]] crate's ships. The owner fights one captain alone in the
[[World Editor]], or with other players in a fleet room on the [[Server]].

## The fight

A fight holds any number of ships by number, each sailed by a player's orders or by a captain's mind, and flying the
players' flag or the pirates'. Each tick, in this order: each player's ship steps once for each of her orders taken
(late orders catch up; with none she lies as she was, riding the swell), each captain steers and sails, hulls that
overlap are pushed apart, each player's stem may ram, the guns load, the captains fire and then the players, the
balls fly, fires burn and sinking ships go down, each player's hands mend her, and a captain who has sunk, or lies
past every player's ship and is not fighting, leaves the fight. A player's step under her hurts is one pure function
(`sail_hurt`), which a browser predicting her runs too.

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
- **What stops a ball** is the first hull of another flag, water or ground it meets: a player's ball passes through
  another player's ship, and a pirate's through another pirate's. A ball tears through any canvas it crosses
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

She sails a Sloop under the player's own helm, so her pace is the player's. She sees every player's ship and keeps,
for each, whether it struck her lately and whether she spares it. DFO's captain commands a swing and a
share of sail; here the swing is a share of her rudder and the sail the rung whose way is nearest. Under the ladder's
law the wind's eye costs her 0.55 of her way, so she never tacks.

- **Whom she fights.** A pirate is bold one time in four by her seed. A bold one takes on a player she sees within
  750 m; a wary one only a wreck, a hull nearly gone, or a ship she outguns 5 to 4 by DFO's fighting power (the time
  each takes to make the other strike). Struck by a player, she is hostile to that ship for 5 minutes. Of the ships
  she would fight and does not spare, she takes the nearest, the one she already fights reckoned a fifth nearer (as
  DFO ranks them), and runs from the nearest that struck her within 320 m. What she remembers of a chase, a wreck,
  her mark's way and the side she presented is let go when she marks another ship.
- **Her course.** She bends round every hull about her, the bends of each summed, as DFO's traffic does. Far off,
  she steers to intercept. A ship running from her she runs down astern, then sheers out to
  its beam. Otherwise she brings the side that costs least to bear on where her balls will meet him, bent off the beam
  to open or close her range of 50 m, and once presented keeps station with sail. She bends round his hull and sounds
  the land ahead, swinging off a foul course.
- **Her guns.** A side loaded, in reach, near her beam, bearing soon and whose lay would strike runs out: the tell.
  It fires no sooner than 1.3 s on, within her gunners' window, long or short by their want of skill. One run out too
  long unfired, or that loses its mark, is run in. She never fires on a wreck.
- **When she breaks off.** Any pirate runs under 30% of her hull; a wary one runs from a ship that outguns her. A chase
  that gains nothing in 150 s is given up, and a wreck left after 30 s. She leaves the fight when she has sunk, or lies
  past 1.9 km from every player's ship and is not fighting; the editor's fight ends when its one captain leaves.

## Ramming

DFO's law of the ram. A player's stem, 1 m above her waterline at her bow, strikes the hull of a ship of another flag
it comes within 1.2 m of, at the face it stands farthest outside of: her side, or her bow or stern. It rams when her
way along her keel, at the most over the last 0.6 s, closes on that face at 1.6 m/s or more.

- **The blow** is 0.15 of the lesser of the two whole hulls, times the closing way over 8 m/s (never more than whole),
  and 0.4 of that into her bow or stern. It never takes her hull under a quarter, where she strikes: a ram brings a
  ship to strike and no further. It takes a man for every 40 points it deals, over her men's toughness, by a roll
  drawn from the fight's stream.
- **The recoil**: the rammer takes 0.6 of the blow back (half that braced), and a ram is only as hard as she can pay
  for within her own room over her line, one point short of it, so her own ram never makes her strike and a hull at its
  line rams nothing. A wreck rams nothing.
- **One ram a tick** for each player, none on the same ship again within 3 s, and her remembered way is spent on it.
  A ram provokes the captain struck. Captains do not ram.
- **Hulls kept apart.** Two hulls whose boxes overlap on the flat are each pushed out half the overlap, and each loses
  the share of her way that drove squarely into it. DFO kept the player's own boat apart by Come Sail Away's sweep;
  here every ship is pushed alike, so the room can do it.

For the owner's Sloop and the Pirate Sloop, a ram at 8 m/s into her side deals 36 and costs the rammer 22; six from
whole bring the Pirate Sloop to strike.

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

## In a fleet room

With `?room=` in the World Editor's address, Sail joins a fleet room ([[Server]]) instead, on the open sea: every
player's Sloop and every captain called in fight in one fight, the room's. F calls a captain onto the ring round her
(four at most in a room), X sends them all off. Her lay's arcs are laid in the browser by the same functions the room
fires by (`preview`), among the ships the room last showed.

## One crate, every machine

Alone, the fight lives in `land-wasm` beside the open landmass: a request begins it, steps it by the player's orders
(up to a second's ticks, presses on the first alone) or ends it, and opening another landmass ends it too. Its state
never crosses, so requests and answers are JSON. A scripted fight's fingerprint at the end of each leg is pinned
natively and through WebAssembly ([[Agree to the Bit]]). In a fleet room the room's crate holds the fight, and a
browser predicts its own ship through `room-wasm` by the same steps.

## Limits

- Captains are Pirate Sloops: no other factions or classes, and no ambient traffic.
- Players' balls do not strike other players' ships, and players do not ram one another.
- Her canvas is always drawn, so her sails always take balls; it does not come down as her sail share falls.
- She cruises on her course until she sees a player's ship; DFO's captains wander between waypoints.
- No boarding, crew, sounds, flotsam or magazine blast yet: the rest of step 3 of the pick.
- Hulls are kept apart by their boxes on the flat; the player's helm is not refused a turn into another hull, as Come
  Sail Away's was, she is pushed back out of it.
