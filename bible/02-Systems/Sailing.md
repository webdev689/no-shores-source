---
type: system
status: live
code:
  - crates/sailing/src/helm.rs#point_of_sail
  - crates/sailing/src/helm.rs#steerage
  - crates/sailing/src/helm.rs#sail_power
  - crates/sailing/src/hull.rs#SLOOP
  - crates/sailing/src/hull.rs#HullKind
  - crates/sailing/src/ship.rs#step_ship
  - crates/sailing/src/ship.rs#step_pulled
  - crates/sailing/src/pose.rs#pose_of
  - crates/sailing/src/waters.rs#LandWaters
  - crates/sailing/src/pose.rs#lag_of
  - crates/room/src/sea_weather.rs#SeaWeather
  - crates/sailing/src/waters.rs#sail_wind
  - crates/sailing/src/waters.rs#sea_wind_at
  - crates/sailing/src/waters.rs#OpenSea
  - crates/land/src/exact.rs#fingerprint
  - crates/land-wasm/src/sail.rs#sail_bytes
  - client/src/editor/afloat.ts#Afloat
  - client/src/editor/sailing.ts#Sailing
  - client/src/editor/harbour.ts#Harbour
  - client/src/ships/shipView.ts#ShipView
  - client/src/ships/swellPose.ts#poseOnSwell
  - client/src/ships/sails.ts#SailRig
  - client/src/ships/sails.ts#sailWind
  - client/src/ships/sails.ts#gaffTrim
  - client/src/ships/sails.ts#squareBrace
  - client/src/ships/shipModels.ts#ShipModels
  - client/src/ships/shipTags.ts#tagShip
  - client/src/ships/shipShader.ts#shipKit
  - client/src/game/seaShips.ts#heelShare
  - client/src/ships/hulls.ts#hullName
  - client/src/ships/hulls.ts#hullPaint
  - client/src/ships/dress.ts#DRESSES
  - client/src/ships/flag.ts#flagGrid
  - client/src/ships/flagPictures.ts#flagPictures
  - client/src/ships/shipModels.ts#openHull
  - client/src/textures/shipPictures.ts#shipPictures
  - tools/ships/shape_ship.py#main
  - tools/ships/export_ship.py#main
  - tools/ships/paint_ship.py#main
  - tools/ships/deck.py#deck_of
  - crates/room/src/deck.rs#Aboard
  - crates/room-wasm/src/deck_door.rs#sloop_deck
  - client/src/ships/deck.ts#SLOOP_DECK
  - client/src/game/aboard.ts#Aboard
  - client/src/game/deckWalk.ts#DeckWalk
  - client/src/game/crew.ts#Crew
  - client/src/cinema/sailAway.ts#SailAway
  - client/src/game/seaTravel.ts#SeaTravel
  - client/src/game/charting.ts#Charting
---
# Sailing

How a ship sails: the helm from oars to sails, its way and turn, its sails against the wind, its pose on the swell
and where it takes the ground. It is DFO's port of Come Sail Away ([[Come Sail Away's Sailing Comes Over]]),
rebuilt in Rust ([[Pick - Sailing and Naval Combat]]). The owner sails the Sloop in the [[World Editor]]; the captains
sail the other hulls ([[Hulls]]) by the same laws.

## How it works

- **The laws.** The `sailing` crate holds Come Sail Away's handling and its sails' curves, under DFO's responsive
  helm, for any hull: its waterline, its draught, its sails and its rig's gain are its own. Its way under sail is its
  canvas (each sail at the crest of its own curve: a gaff, a staysail or a lateen 135 degrees off the wind, a square
  sail running dead before it) by the point of sail (0.9 running dead
  before the wind, 1 on the quarter, 0.55 in the wind's eye), in the sea's wind, a fifth again. Under sail its rudder
  swings it at its steerage, read at its way over its rig's gain: 3 degrees a second at no way, about 12 at its best
  way in the usual breeze. On its oars it swings at 20. In a sea fight every ship sails and rows 1.8 times as fast,
  swings twice as fast and answers its helm twice as soon, and a player's ship may burst for more ([[Naval Combat]]).
- **The ladder.** W climbs a rung, S comes down one: oars astern, oars at rest, oars ahead, sails set. A and D steer;
  backing water, the helm answers the other way.
- **A step.** Its swing and its way move toward what its rung asks, at the mod's rates under DFO's responsive helm.
  With its sails struck and its oars at rest, it coasts to a stop, faster for the share of its way its canvas made.
  It moves in its own frame, then swings, as the mod's boat did. Its heading stays in [0, 2π).
- **The wind.** The [[Weather]]'s wind where it is ([[World Map]], "Weather and travel"), held for a minute of
  world time at a time and read at the minute's start. Its sails feel it scaled so the weather's usual breeze
  (6.5 m/s) is its rated wind (1.5 m/s), and the helm holds it between 0.3 and 2 times that: a gale drives it at most
  twice as hard, a near calm still gives way. Every ship sails in the wind where it is, in a fight, among captains
  alone and in a fleet room alike, and the World Editor takes it too. A room's world time is its host's wall at its
  first tick, which its welcome carries, so a browser predicting its ship reads the same wind by the same rules; an
  order the room takes just after a world minute turns can bring a small correction. A fight takes the sea's weather
  where and when it began, and keeps it while it lasts (`sea_weather.rs`).
- **Its pose.** It takes the mean of the water under its bow, stern, sides and middle at its waterline as its height,
  and its slope along and across it as its pitch and roll, each felt through its inertia: every wave answered as a
  first-order lag answers it, its time constant 0.02 s a metre of its waterline's length (`lag_of`), so a bigger hull
  answers slower and rides the short waves less. The swell replaces the mod's sine bob over a flat sea. It heels into
  a turn as the mod's boat did, once it makes a wake (0.5 m/s). On a lake or river it floats at its level.
- **Its hurts.** A ship's damage holds back the way its sails may ask ([[Naval Combat]]): bare poles leave it 35% of
  it. A sound ship's step is unchanged.
- **The ground.** Its keel has three points: aft, amidships and forward. A point is aground where the water over the
  bed is shallower than its draught. A step grounds it if it puts a point aground that was afloat, or carries one
  already aground onto higher ground. Then it runs on unswung if only its swing grounds it, or swings clear if only
  its way does, as the mod refused only what ran into what it touched; else it is held and loses its way. Oars
  astern take it off a shore. Within a hand of its draught it touches, and the panel says so.
- **The open sea.** A fleet room's waters ([[Server]]): deep water everywhere under the weather's swell where the
  room lies (the world frame's middle) when it opened, and no land.
  The swell rolls whole over any sea 15 m deep or more, so wherever a landmass's sea is that deep, its water is the
  open sea's to the bit.
- **One crate, every machine.** The browser steps it through `land-wasm`'s door, over the open landmass, in ticks of
  1/60 s, a second's at most a request, the Sloop unless the request names another hull. Its maths is exact or `libm`'s,
  so a voyage's fingerprint is the same natively and as WebAssembly ([[Agree to the Bit]]). The door refuses numbers no
  ship could have: a way over 20 m/s, a swing over 45 degrees a second, a time past the world's. A fight hands its
  ship back to sailing as it left it, so the bounds stand past a fight's: a burst in the strongest sea wind makes
  14.4 m/s, and oars in a fight swing at 40.

## The Sloop

The owner's Sloop sails as Come Sail Away's Large Boat II, whose rig it shares: a small gaff sail and a small staysail.
Its handling is the mod's own, unscaled, and its gain (1.159) DFO's for that rig. Under sail on a beam reach it makes
2.4 m/s.

Its model is a `.blend`. `tools/ships/shape_ship.py` first shapes the owner's model ([[The Sloop Is About 18 m Long]]):
it brings it to three times its size about its origin, and opens the rail round its quarterdeck (raised 0.67 m over
its deck about its wheel) at its two front corners, either side of its hatch, closing the cut ends and laying four
steps down to its deck forward of each gap. The model keeps a record of each, so shaping a shaped model changes
nothing.

Its faces are in five part materials, `hull`, `deck`, `spar`, `sail` and `iron`, and its UVs are metres, each face
laid flat on the axis it faces most so the planks run along the ship and a spar's grain up it
(`tools/ships/paint_ship.py` sorted the owner's model so, and packed the game's pictures into it, so Blender shows it
as the game does). `tools/ships/export_ship.py` turns what Blender would render into Overlook's mesh: a header with
its waterline, 28 bytes a vertex (position, normal, UV, part) and the corners' indices. Its canvas is left out of the
mesh: the export writes each sail's corners to `ships.json`, and the game sets the sails on them. Its frame is x to its
bow, y to starboard and z up, mirrored from the model's as the world (east, south, up) is, so each face keeps the
model's corner order and reaches the screen counter-clockwise, as the land's and the water's do. The export refuses a
model whose faces are not wound outward. Its waterline is 1.2 m above the shaped model's z = 0 (0.4 m up the owner's),
where its beam nears its widest ([[The Sloop's Trim]]): 18.7 m long, 5.6 m across, its keel 1.8 m below it. The
mesh lives on R2 under its hash ([[Generated Files Stay Out of Git]]); its key and the ship's waterline are in
`content/ships/ships.json`, and a test holds the rules' Sloop to that waterline. Its `.blend` is on R2 beside it
([[Ship Models Live on R2]]), named by the SHA-256 of its bytes, so the `ships` and `wreck` workflows check what they
fetch against that hash before Blender opens it.
Its cannons are the objects named `Cannon` in it, three a side, fore to aft: the export
reads each one's mouth and bore, and the boxes a ball can strike (its hull, and each sail's canvas), into `ships.json`
for [[Naval Combat]].

## The other hulls

Each hull's waterline, draught and sails are its manifest's (`content/ships/ships.json`), every sail small as the
Sloop's are, and a test holds each to it; its gain is DFO's for the Come Sail Away rig that matches its own. A hull is
named by its key in the manifest (`HullKind`), numbered 0 to 3 on the wire.

| Hull | Waterline | Draught | Sails | Gain (DFO's rig) |
|---|---|---|---|---|
| Sloop | 18.7 × 5.6 m | 1.8 m | a staysail, a gaff | 1.159 (Large Boat II) |
| Schooner | 25.2 × 4.3 m | 2.0 m | a staysail, two gaffs | 1.233 (Large Boat V: a staysail and two gaffs) |
| Brig | 30.7 × 5.3 m | 2.2 m | two staysails, six square sails, a gaff spanker | 1.643 (the galleon, a square-rigged two-master) |
| Frigate | 38.1 × 6.2 m | 2.4 m | two staysails, eight square sails, a gaff spanker | 1.798 (the Carrack, a square-rigged three-master) |

No hull's rig drives it harder than the Sloop's: its canvas drives it as the Sloop's does (`canvas_drive`), so every
hull makes the Sloop's way on every point of sail, 2.4 m/s on a beam reach, and its rank's way alone makes it faster
([[Naval Combat]]); its sails' kinds shape only how they are drawn and trimmed. Its square sails pull by the same law as the rest:
under the responsive helm each draws at its crest (a square sail running dead before the wind), so the point of sail
alone says how its heading takes it, and a Brig or a Frigate runs, reaches, beats and comes about through the wind's
eye as the Sloop does, keeping its way. Its gain still shapes it: a bigger rig gathers and loses way faster and steers
at its way over its gain. The game sets its square sails' trim only to draw them.

## Its look

Each part wears a picture of the [[Procedural Textures]], repeating at 40 texels a metre as the forged towns' do:
its hull's strakes and its deck's boards are Daggerfall's ship archive (50) as the painter files it, its spars one
length of grain, its canvas 0.8 m cloths over a faint weave, its guns mottled iron (`shipPictures`).

Every hull of [[Hulls]] is one model, fetched from R2 by its manifest entry the first time a ship of that hull is drawn
and kept (`ShipModels`), and dressed in its side's colours as it is drawn (`dress.ts`). Every hull's view on a
device shares one pipeline, built off the frame, and one set of pictures and sampler (`shipKit`). While its model is
still coming a ship is drawn as the Sloop, its footprint, foam and plate the Sloop's too. A fetch that fails is said
once and tried again from a frame 5 s later, the wait doubling each time to 60 s. A colour is laid over the
picture's grain, the picture's lightness about its mean kept:

| Side | Hull | Stripe | Canvas | Flag |
|---|---|---|---|---|
| A player's | As painted | None | As painted | Overlook's blue |
| A friendly ship (merchantmen) | Natural timber, as painted | Overlook's blue | White | Overlook's blue |
| The Grey Tithe | Slate grey | Bone | Grey | Its canvas grey, the balance in dark slate |
| The pirates | Black | Red | Dark | Black, the skull |

- **Its hull's paint** covers the outside of its shell, tagged when its model loads (`tagShip`). Its breadth is
  sampled across its hull's faces in slices 0.25 m along it and 0.1 m deep, taken from its planks and wales (its
  hull's pieces 5 m long or more) where a slice has them, so its channels, chainplates and catheads do not set it.
  A vertex of its hull facing outboard within 0.15 m of the narrowest breadth round its slice is its side, where
  that slice is at least 0.6 of its greatest breadth at or below it at that station: a deckhouse standing above its
  rail is not its side, and its bow flaring out over its forefoot is. Its stem and transom are its shell the same way
  along it, facing fore or aft within 0.15 m of how far it reaches in their slice across it, and within 0.6 m of
  how far it reaches at that height. A face modelled inside out, facing inboard on its outside, counts only within
  3 cm of its breadth in its own slice, where the inside of a bulwark never lies. A face whose corners differ is
  painted to the halfway between them. Its deck,
  its fittings and the insides of its bulwarks keep their timber.
- **Its stripe** is 0.6 m deep along the line through the mouths of its upper tier of guns, rising with its sheer.
- **Its flag** flies at the head of its tallest mast (the highest point of its spars), a tenth of its waterline's
  length long and two thirds as deep, its hoist down the mast. It streams the way the wind blows and waves along its
  length, a crest and a half on it, running at 1.4 a second. Its picture is `flagPictures`, bearing the faction's
  emblem where the [[Interface]]'s plates have one, in its own tones or, on the Grey Tithe's, shaded from its dark
  slate, so its grey flag never reads as the pirates' black at a fight's range.

Which hull a ship sails is the wire's word, a number (0 the Sloop, 1 the Schooner, 2 the Brig, 3 the Frigate,
`hullName`): a `Pirate`'s `hull` at sea and a fleet vessel's, a captain's `hull_kind` in a fight's view, where `hull`
is its hull points (`hullOfCaptain`). A number with no model, or none sent, is drawn as the Sloop.

## Its sails

DFO's sails ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]), on its own corners (`SailRig`), each
hull's from its manifest entry. Each canvas is a grid of 8 points along its foot by 7 up, in DFO's poses at its Large
Boat's sizes; a spanker is a gaff sail:

- **Filled.** A sail's wind walks one a second toward where the wind draws it (Come Sail Away's `sailWind`): a gaff
  fullest with the wind square across it, a staysail with it astern, to the side it blows toward. Full, the gaff
  bellies 1.1 m and the staysail 0.55 m; hanging, 0.12 and 0.1.
- **Luffing.** A sail more than 150 degrees off the wind flaps on a sine of the clock, a quarter full each way.
- **Trimmed.** The gaff swings about its luff to leeward (`gaffTrim`): square off with the wind astern, 45 degrees
  with it abeam, home by 150 off it, at 100 degrees a second (300 by DFO's rule for the swing).
- **Square sails.** A square sail is laid on its four corners, its columns from port to starboard and its rows from
  its foot up to its yard; laced along its head and sheeted at its two foot corners, it bellies forward, fullest
  amidst, 1.2 m full and 0.15 hanging. Its wind is read off its yard's face: full with the wind astern of it, half
  full abeam and hanging with the wind ahead, never aback. Its yard is braced round its mast (`squareBrace`), its leeward arm aft: square with the wind
  astern, 45 degrees with it abeam and held there closer to it, at the gaff's 100 degrees a second. The yard is drawn
  turning with it: when its model loads, the round spar pieces lying across it within 0.8 m of the line through each
  sail's head are its yard, and a bare one across a mast with no sail on it turns with that mast's lowest sail. Each
  yard and its canvas turn by the same angle about the same upright line through the middle of the yard, so the
  sail's head stays on its yard at every brace.
- **Set and furled.** Over 2 s: the gaff brailed in to the mast, the staysail rolled down its stay, a square sail
  gathered up to its yard in loose folds, the gaff and the yards home.
- **Holed and torn.** In a fight ([[Naval Combat]], "How it looks") its canvas is drawn with holes: a cell of a
  sail's grid (7 by 6 a sail) is left out where a ball passed through it, and more open as its canvas's share falls,
  each new one beside an old, a third of every sail's cells shot through with none left; a hole never closes for the
  fight. Its masts stand where its sails' heads and gaffs' luffs stand along it (`mastsOf`), each staysail on the mast
  its head is set to; when its model loads, every spar whose forward end lies within 1.2 m of a mast is tagged with
  it, then every piece of its rig whose top lies within 2.5 m of a mast along it and 3 m over its foot (its shrouds,
  stays, ratlines and crosstrees), and whatever hangs within about 0.6 m of a mast's spar (a gaff's peak block, a boom's
  end), so a fallen mast goes over its side with all its rig and its sails; only its bowsprit stays. A sail torn away falls
  from its yard, head first, and floats astern; its flag comes down its mast when it strikes. The harm goes with the
  fight.

Any published hull is drawn by its number (`openHull`: its mesh and its sails' corners from `ships.json`), as the
story draws the Brig and the Frigate.

In the editor its sails are set on the helm's top rung; at sea, while it is under way. They are drawn in the wind
the rules sail it in, where it is, which the page reads from the sky's law.

Sail (`B`) puts it to sea at the camera's target, heading where the camera looks; the rules refuse it where the
water is shallower than its draught, and the camera stands back off. Each frame owes it its time in whole ticks, one
request at a time; time spent waiting on the land worker is caught up, a second at most. The ships layer draws it
into the land's pass, lit as the land is and in the sun's shadows, casting its own ([[Game]], "Drawing"), so the water sees it ([[Water]]): none inside it, foam at its bow, and its
wake in the ripples. Picking another landmass brings it in.

With `?room=` in the editor's address, Sail joins a fleet room on the [[Server]] instead, from open water 15 m deep
or more: the room steps it by its orders, a tick at a time, and the browser predicts it by the same rules through
`room-wasm`, correcting it by each snapshot. The water then rolls by the room's clock, so every ship the room shows
rides the wave drawn under it ([[Naval Combat]]).

## Drawn at sea

The Overworld's ships are drawn by the page, not stepped by the rules (`swellPose.ts`, `seaShips.ts`), with the World
Editor's motion ([[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]), each in its own hull and its
side's colours, its pose, its heel and its footprint on the water taken from its own hull's waterline:

- **On the swell.** Each takes its pose as `pose_of` does, from the swell the page draws, the weather's ([[Water]]):
  the mean of the water under its bow, stern, sides and middle at its drawn size, and its slope along and across it,
  felt through its inertia at its drawn length. Off the charts the sea is deep; over shallows the swell fades as the
  water's does.
- **Its bow.** Its bow slams when, pitching down, the crest at its stem rises over it faster than 1 m/s; each slam
  throws a burst of spray from its bow by its way and the sea state, fading in 0.8 s, over the spray a rough sea
  throws at way.
- **Into a turn.** It heels as `turn_heel` has it, by its swing and a ship's own way under way, 12 m/s: the Sloop 3
  degrees with the helm hard over, and every other hull by the Sloop's beam over its own (`heelShare`), so the narrow
  Schooner heels more and the broad Frigate less. Its pose on the swell is its own hull's, from its waterline. Its swing is its heading's turn a second, followed at 3 a second and taken at most as the
  helm's 10 degrees, so a voyage turning onto its next leg heels it as a hard turn would.
- **Its wake.** Every ship under way leaves a Kelvin wake and throws a bow wave, foam along its own hull line and
  spray, at its drawn size ([[Water]], "A ship on it"); the player's ship also stirs the water's ripples at its bow
  and quarters each frame, as the editor's does.
- **Its deck** and everyone on it lie with it: its heading, pitch, roll and drawn size (`deckToWorld`).

## Its deck

A body walks its deck ([[The Ship Is Managed and Walked From the Sea's Panel]]):

- **The grid.** `tools/ships/deck.py` measures it from its published mesh, and the export writes them together: a grid
  of 10 cm cells in the walk's frame (x to its starboard, y to its stern, the origin amidships), each holding the
  height over its waterline of the highest of its hull's and deck's upward faces there, in centimetres. A cell where
  a spar or a gun stands in the room a body takes (from 0.25 m to 1.8 m over the planks), where the floor lies under
  1.7 m (its hold through its hatch, the stair down into it), or that is off its deck holds none.
- **Its walls.** A cell standing more than 30 cm over a neighbour holds none either, judged on its heights as
  measured: its rails, its bulwarks and the drop at its quarterdeck's edges are walls. Its steps rise 13 cm a tread,
  so they stay a way up and down.
- **Its ramps.** Each cell left is then let down to within 8 cm of every neighbour, nothing raised, so its steps
  and a dip in its planks become slopes a body walks (under 1.19).
- **Its ways off its quarterdeck** are the steps at its two front corners and the stair down its open aft end, as
  its model has it. The grid is kept round the deck with a cell to spare, each row on a line of the manifest.
- **Its helm.** The spot behind its wheel on its quarterdeck, 7.25 m aft of its middle and 0.45 m aft of the wheel,
  is its helm's: where a player leaving the helm stands, the helm's view stands, and the helm is taken again.
- **The ground it makes.** The movement crate stands a body on the grid as a terrain ([[Movement]]): between cell
  centres the ground blends, and a cell with none, or the grid's end, is a wall no step or slope takes, along the
  whole of every move, so a run is never carried through one. A wall of the ground is never climbed, as a block's
  is, so a body never leaves its deck.
- **Its own frame.** A body on deck moves in its frame, so its way, its heading and the swell never move it; the game
  lays it into the world as the ship lies, at its drawn size.

## Travel by the held map

The [[Held Map]] takes the ship to other waters, seen sailing away
([[The Held Map Takes the Ship to Other Waters, Seen Sailing Away]]). A course chosen into another water asks whether to
travel there; yes runs the cinematic (`SailAway`, `SeaTravel`), which no key, press or wheel breaks:

1. The map lowers and the camera leaves the helm on an eased rail out to the ship's aft starboard quarter, 70 m off and
   28 m up, carried along with the ship as it gets under way on the course at the world's own pace, 3 s.
2. The camera holds there, looking at the ship as it sails off, while the picture fades to black over 2 s; the veil's
   words, "Sailing for <water>", come up in its last 0.7 s. The travel is asked of the sea room as the fade begins
   ([[Server]], "The sea"): a course into other waters with the travel flag, sent in its turn as any course is, and no
   other course sent in its place until the room answers. Too soon after a course, it is asked again; a room joined
   since is asked again; one that gives no answer in 10 s is given up.
3. Black for at least 1.5 s, and longer until the room has answered and no continent near the ship's new place is
   still to open (`Charting.waiting`); the sea, its islands and the sky come with the room's word and the land.
   Taken, the ship is laid where the room put it, 400 m short of the course's end on its last leg, with no easing
   across the jump, and sails on to the end; the view over it snaps there too, and the old waters' islands, flotsam
   and marks go with the room's next word.
4. The black lifts over 1.5 s on a low wide shot off the ship's starboard bow, 110 m out and 5 m up, that pans round
   its beam to a view from its stern, 60 m back and 16 m up, as it sails in, 4 s.
5. The view eases back to the usual one over the ship over 1.5 s, and the player has the ship again, sailing on to
   the course's end.

A refused travel fades back in where the ship is over 1.5 s: it heaves to, its voyage kept to be resumed, and its line
says why ("No travel while fighting.", "No travel off the helm.", "No travel with a hostile ship giving chase.", "That
lies in these waters.", "The way there crosses land.", else "The sea would not take that course."). A course set at
another tier on the map begins the cinematic at once and enters that tier's sea room as setting sail does, the travel
asked of it by the fade; a tier the player's level shuts is never sailed for. The ship is drawn under way, sails set
and wake behind, from the yes until it has arrived.

## Limits

- A walker on deck stands on its heights, not its shape: no stairs below, no rigging to climb, and a body's edge
  may brush a rail it stands within a cell of. The tops of its rails and bulwarks lie past its walls, where no body
  comes.
- Its helm stands under the gaff, as the model has it: at the helm the canvas swings close by.
- Alone, the editor steps it; in a fleet room the [[Server]] does, on the open sea, which has no coast or shallows;
  in the sea room's fights, the room steps it by its orders.
- No current or cargo yet, and no crew but the stand-ins aboard ([[Game]]). Hulls are kept apart only in a fight
  ([[Naval Combat]]), as every fleet room is.
- It waits while the land worker makes a close-up (about every 400 m), then catches up.
