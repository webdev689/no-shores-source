---
type: system
status: live
code:
  - crates/sailing/src/helm.rs#point_of_sail
  - crates/sailing/src/helm.rs#steerage
  - crates/sailing/src/helm.rs#sail_power
  - crates/sailing/src/hull.rs#SLOOP
  - crates/sailing/src/ship.rs#step_ship
  - crates/sailing/src/ship.rs#step_pulled
  - crates/sailing/src/pose.rs#pose_of
  - crates/sailing/src/waters.rs#LandWaters
  - crates/sailing/src/waters.rs#steady_wind
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
---
# Sailing

How a ship sails: the helm from oars to sails, her way and turn, her sails against the wind, her pose on the swell
and where she takes the ground. It is DFO's port of Come Sail Away ([[Come Sail Away's Sailing Comes Over]]),
rebuilt in Rust ([[Pick - Sailing and Naval Combat]]). The owner sails the Sloop in the [[World Editor]].

## How it works

- **The laws.** The `sailing` crate holds Come Sail Away's handling and its sails' curves, under DFO's responsive
  helm. Her way under sail is her canvas (each sail at the crest of its curve) by the point of sail (0.9 running dead
  before the wind, 1 on the quarter, 0.55 in the wind's eye), in the sea's wind, a fifth again. Under sail her rudder
  swings her at her steerage, read at her way over her rig's gain: 3 degrees a second at no way, about 12 at her best
  way in the steady wind. On her oars she swings at 20.
- **The ladder.** W climbs a rung, S comes down one: oars astern, oars at rest, oars ahead, sails set. A and D steer;
  backing water, the helm answers the other way. Shift with A or D pulls her sideways on her oars.
- **A step.** Her swing and her way move toward what her rung asks, at the mod's rates under DFO's responsive helm.
  With her sails struck and her oars at rest, she coasts to a stop, faster for the share of her way her canvas made.
  She moves in her own frame, then swings, as the mod's boat did. Her heading stays in [0, 2π).
- **The wind.** One steady wind blows where the swell runs, at a ship's rated wind (1.5 m/s), until weather drives
  both.
- **Her pose.** She takes the mean of the water under her bow, stern, sides and middle as her height, and its slope
  along and across her as her pitch and roll. The swell replaces the mod's sine bob over a flat sea. She heels into a
  turn as the mod's boat did, once she makes a wake (0.5 m/s). On a lake or river she floats at its level.
- **Her hurts.** A ship's damage holds back the way her sails and her oars may ask ([[Naval Combat]]): bare poles
  leave her 35% of it, and a wreck's oars pull 35%. A sound ship's step is unchanged.
- **The ground.** Her keel has three points: aft, amidships and forward. A point is aground where the water over the
  bed is shallower than her draught. A step grounds her if it puts a point aground that was afloat, or carries one
  already aground onto higher ground. Then she runs on unswung if only her swing grounds her, or swings clear if only
  her way does, as the mod refused only what ran into what she touched; else she is held and loses her way. Oars
  astern take her off a shore. Within a hand of her draught she touches, and the panel says so.
- **The open sea.** A fleet room's waters ([[Server]]): deep water everywhere under the world's swell, and no land.
  The swell rolls whole over any sea 15 m deep or more, so wherever a landmass's sea is that deep, its water is the
  open sea's to the bit.
- **One crate, every machine.** The browser steps her through `land-wasm`'s door, over the open landmass, in ticks of
  1/60 s, a second's at most a request. Its maths is exact or `libm`'s, so a voyage's fingerprint is the same natively
  and as WebAssembly ([[Agree to the Bit]]). The door refuses numbers no ship could have: a way over 10 m/s, a swing
  over 45 degrees a second, a time past the world's.

## The Sloop

The owner's Sloop sails as Come Sail Away's Large Boat II, whose rig is hers: a small gaff sail and a small staysail.
Its handling is the mod's own, unscaled, and its gain (1.159) DFO's for that rig. Under sail on a beam reach she makes
2.4 m/s.

Her model is a `.blend`. `tools/ships/shape_ship.py` first shapes the owner's model ([[The Sloop Is About 18 m Long]]):
it brings her to three times its size about her origin, and opens the rail round her quarterdeck (raised 0.67 m over
her deck about her wheel) at its two front corners, either side of her hatch, closing the cut ends and laying four
steps down to her deck forward of each gap. The model keeps a record of each, so shaping a shaped model changes
nothing.

Its faces are in five part materials, `hull`, `deck`, `spar`, `sail` and `iron`, and its UVs are metres, each face
laid flat on the axis it faces most so the planks run along her and a spar's grain up it
(`tools/ships/paint_ship.py` sorted the owner's model so, and packed the game's pictures into it, so Blender shows her
as the game does). `tools/ships/export_ship.py` turns what Blender would render into Overlook's mesh: a header with
her waterline, 28 bytes a vertex (position, normal, UV, part) and the corners' indices. Her canvas is left out of the
mesh: the export writes each sail's corners to `ships.json`, and the game sets the sails on them. Her frame is x to her
bow, y to starboard and z up, mirrored from the model's as the world (east, south, up) is, so each face keeps the
model's corner order and reaches the screen counter-clockwise, as the land's and the water's do. The export refuses a
model whose faces are not wound outward. Her waterline is 1.2 m above the shaped model's z = 0 (0.4 m up the owner's),
where her beam nears its widest ([[The Sloop's Trim]]): 18.7 m long, 5.6 m across, her keel 1.8 m below it. The
mesh lives on R2 under its hash ([[Generated Files Stay Out of Git]]); its key and her waterline are in
`content/ships/ships.json`, and a test holds the rules' Sloop to that waterline. Her `.blend` is on R2 beside it
([[Ship Models Live on R2]]). Her cannons are the objects named `Cannon` in it, three a side, fore to aft: the export
reads each one's mouth and bore, and the boxes a ball can strike (her hull, and each sail's canvas), into `ships.json`
for [[Naval Combat]].

## Her look

Each part wears a picture of the [[Procedural Textures]], repeating at 40 texels a metre as the forged towns' do:
her hull's strakes and her deck's boards are Daggerfall's ship archive (50) as the painter files it, her spars one
length of grain, her canvas 0.8 m cloths over a faint weave, her guns mottled iron (`shipPictures`).

Every hull of [[Hulls]] is one model, fetched from R2 by her manifest entry the first time a ship of hers is drawn
and kept (`ShipModels`), and dressed in her side's colours as she is drawn (`dress.ts`). Every hull's view on a
device shares one pipeline, built off the frame, and one set of pictures and sampler (`shipKit`). While her model is
still coming a ship is drawn as the Sloop, her footprint, foam and plate the Sloop's too. A fetch that fails is said
once and tried again from a frame 5 s later, the wait doubling each time to 60 s. A colour is laid over the
picture's grain, the picture's lightness about its mean kept:

| Side | Hull | Stripe | Canvas | Flag |
|---|---|---|---|---|
| A player's | As painted | None | As painted | Overlook's blue |
| A friendly ship (merchantmen) | Natural timber, as painted | Overlook's blue | White | Overlook's blue |
| The Grey Tithe | Slate grey | Bone | Grey | Dark slate, the balance |
| The pirates | Black | Red | Dark | Black, the skull |

- **Her hull's paint** covers the outside of her shell, tagged when her model loads (`tagShip`). Her breadth is
  sampled across her hull's faces in slices 0.25 m along her and 0.1 m deep, taken from her planks and wales (her
  hull's pieces 5 m long or more) where a slice has them, so her channels, chainplates and catheads do not set it.
  A vertex of her hull facing outboard within 0.15 m of the narrowest breadth round its slice is her side, where
  that slice is at least 0.6 of her greatest breadth at or below it at that station: a deckhouse standing above her
  rail is not her side, and her bow flaring out over her forefoot is. Her stem and transom are her shell the same way
  along her, facing fore or aft within 0.15 m of how far she reaches in their slice across her, and within 0.6 m of
  how far she reaches at that height. A face modelled inside out, facing inboard on her outside, counts only within
  3 cm of her breadth in its own slice, where the inside of a bulwark never lies. A face whose corners differ is
  painted to the halfway between them. Her deck,
  its fittings and the insides of her bulwarks keep their timber.
- **Her stripe** is 0.6 m deep along the line through the mouths of her upper tier of guns, rising with her sheer.
- **Her flag** flies at the head of her tallest mast (the highest point of her spars), a tenth of her waterline's
  length long and two thirds as deep, its hoist down the mast. It streams the way the wind blows and waves along its
  length, a crest and a half on it, running at 1.4 a second. Its picture is `flagPictures`, bearing the faction's
  emblem where the [[Interface]]'s plates have one.

Which hull a ship sails is the wire's word, a number (0 the Sloop, 1 the Schooner, 2 the Brig, 3 the Frigate,
`hullName`): a `Pirate`'s `hull` at sea, a captain's `hull_kind` in a fight's or a fleet's view. A number with no
model is drawn as the Sloop. Until the page's records carry those fields, every captain is the Sloop
(`hullOfCaptain`).

## Her sails

DFO's sails ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]), on her own corners (`SailRig`), each
hull's from her manifest entry. Each canvas is a grid of 8 points along its foot by 7 up, in DFO's poses at its Large
Boat's sizes; a spanker is a gaff sail:

- **Filled.** A sail's wind walks one a second toward where the wind draws it (Come Sail Away's `sailWind`): a gaff
  fullest with the wind square across it, a staysail with it astern, to the side it blows toward. Full, the gaff
  bellies 1.1 m and the staysail 0.55 m; hanging, 0.12 and 0.1.
- **Luffing.** A sail more than 150 degrees off the wind flaps on a sine of the clock, a quarter full each way.
- **Trimmed.** The gaff swings about its luff to leeward (`gaffTrim`): square off with the wind astern, 45 degrees
  with it abeam, home by 150 off it, at 100 degrees a second (300 by DFO's rule for the swing).
- **Square sails.** A square sail is laid on its four corners, its columns from port to starboard. It bellies forward
  as a gaff does sideways, 1.1 m full and 0.12 hanging, most a little under its middle, its head bent straight to its
  yard; its wind is the cosine of the wind's way off its yard's face: full with the wind astern of it, empty along
  it, aback past that. Its yard is braced round its mast (`squareBrace`), its leeward arm aft: square with the wind
  astern, 45 degrees with it abeam and held there closer to it, at the gaff's 100 degrees a second. The yard is drawn
  turning with it: when her model loads, the round spar pieces lying across her within 0.8 m of the line through each
  sail's head are its yard, and a bare one across a mast with no sail on it turns with that mast's lowest sail. Each
  yard and its canvas turn by the same angle about the same upright line through the middle of the yard, so the
  sail's head stays on its yard at every brace.
- **Set and furled.** Over 2 s: the gaff brailed in to the mast, the staysail rolled down its stay, a square sail
  gathered in a bundle half a metre deep along its yard, the gaff and the yards home.

In the editor her sails are set on the helm's top rung; at sea, while she is under way. The wind is the steady one
along the swell's bearing.

Sail (`B`) puts her to sea at the camera's target, heading where the camera looks; the rules refuse her where the
water is shallower than her draught, and the camera stands back off. Each frame owes her its time in whole ticks, one
request at a time; time spent waiting on the land worker is caught up, a second at most. The ships layer draws her
into the land's pass, lit as the land is, so the water sees her ([[Water]]): none inside her, foam at her bow, and her
wake in the ripples. Picking another landmass brings her in.

With `?room=` in the editor's address, Sail joins a fleet room on the [[Server]] instead, from open water 15 m deep
or more: the room steps her by her orders, a tick at a time, and the browser predicts her by the same rules through
`room-wasm`, correcting her by each snapshot. The water then rolls by the room's clock, so every ship the room shows
rides the wave drawn under her ([[Naval Combat]]).

## Drawn at sea

The Overworld's ships are drawn by the page, not stepped by the rules (`swellPose.ts`, `seaShips.ts`), with the World
Editor's motion ([[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]), each in her own hull and her
side's colours, her pose, her heel and her footprint on the water taken from her own hull's waterline:

- **On the swell.** Each takes her pose as `pose_of` does, from the swell the page draws: the mean of the water under
  her bow, stern, sides and middle at her drawn size, and its slope along and across her. Off the charts the sea is
  deep; over shallows the swell fades as the water's does.
- **Into a turn.** She heels as `turn_heel` has it, by her swing and a ship's own way under way, 12 m/s: the Sloop 3
  degrees with the helm hard over, and every other hull by the Sloop's beam over her own (`heelShare`), so the narrow
  Schooner heels more and the broad Frigate less. Her pose on the swell is her own hull's, from her waterline. Her swing is her heading's turn a second, followed at 3 a second and taken at most as the
  helm's 10 degrees, so a voyage turning onto its next leg heels her as a hard turn would.
- **Her wake.** Under way the player's ship stirs the water's ripples at her bow and quarters each frame, as the
  editor's does.
- **Her deck** and everyone on it lie with her: her heading, pitch, roll and drawn size (`deckToWorld`).

## Her deck

A body walks her deck ([[The Ship Is Managed and Walked From the Sea's Panel]]):

- **The grid.** `tools/ships/deck.py` measures it from her published mesh, and the export writes it with her: a grid
  of 10 cm cells in the walk's frame (x to her starboard, y to her stern, the origin amidships), each holding the
  height over her waterline of the highest of her hull's and deck's upward faces there, in centimetres. A cell where
  a spar or a gun stands in the room a body takes (from 0.25 m to 1.8 m over the planks), where the floor lies under
  1.7 m (her hold through her hatch, the stair down into it), or that is off her deck holds none.
- **Her walls.** A cell standing more than 30 cm over a neighbour holds none either, judged on her heights as
  measured: her rails, her bulwarks and the drop at her quarterdeck's edges are walls. Her steps rise 13 cm a tread,
  so they stay a way up and down.
- **Her ramps.** Each cell left is then let down to within 8 cm of every neighbour, nothing raised, so her steps
  and a dip in her planks become slopes a body walks (under 1.19).
- **Her ways off her quarterdeck** are the steps at its two front corners and the stair down its open aft end, as
  her model has it. The grid is kept round the deck with a cell to spare, each row on a line of the manifest.
- **Her helm.** The spot behind her wheel on her quarterdeck, 7.25 m aft of her middle and 0.45 m aft of the wheel,
  is her helm's: where a player leaving the helm stands, the helm's view stands, and the helm is taken again.
- **The ground it makes.** The movement crate stands a body on the grid as a terrain ([[Movement]]): between cell
  centres the ground blends, and a cell with none, or the grid's end, is a wall no step or slope takes, along the
  whole of every move, so a run is never carried through one. A wall of the ground is never climbed, as a block's
  is, so a body never leaves her deck.
- **Her own frame.** A body on deck moves in her frame, so her way, her heading and the swell never move it; the game
  lays it into the world as she lies, at her drawn size.

## Limits

- One hull, the Sloop; the others are planned ([[Hulls]]).
- A walker on deck stands on her heights, not her shape: no stairs below, no rigging to climb, and a body's edge
  may brush a rail it stands within a cell of. The tops of her rails and bulwarks lie past her walls, where no body
  comes.
- Her helm stands under the gaff, as the model has it: at the helm the canvas swings close by.
- Alone, the editor steps her; in a fleet room the [[Server]] does, on the open sea, which has no coast or shallows;
  in the sea room's fights, the room steps her by her orders.
- No current or cargo yet, and no crew but the stand-ins aboard ([[Game]]). Hulls are kept apart only in a fight
  ([[Naval Combat]]), as every fleet room is.
- She waits while the land worker makes a close-up (about every 400 m), then catches up.
