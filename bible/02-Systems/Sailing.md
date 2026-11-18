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

## Her sails

DFO's sails ([[The Sloop Is Painted, Sails the Overworld and Meets Pirates]]), on her own corners (`SailRig`). Each
canvas is a grid of 8 points along its foot by 7 up, in DFO's poses at its Large Boat's sizes:

- **Filled.** A sail's wind walks one a second toward where the wind draws it (Come Sail Away's `sailWind`): a gaff
  fullest with the wind square across it, a staysail with it astern, to the side it blows toward. Full, the gaff
  bellies 1.1 m and the staysail 0.55 m; hanging, 0.12 and 0.1.
- **Luffing.** A sail more than 150 degrees off the wind flaps on a sine of the clock, a quarter full each way.
- **Trimmed.** The gaff swings about its luff to leeward (`gaffTrim`): square off with the wind astern, 45 degrees
  with it abeam, home by 150 off it, at 100 degrees a second (300 by DFO's rule for the swing).
- **Set and furled.** Over 2 s: the gaff brailed in to the mast, the staysail rolled down its stay, the gaff home.

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
Editor's motion ([[The Sloop Is Sailed by Its Keys and Seen Close From Any View]]):

- **On the swell.** Each takes her pose as `pose_of` does, from the swell the page draws: the mean of the water under
  her bow, stern, sides and middle at her drawn size, and its slope along and across her. Off the charts the sea is
  deep; over shallows the swell fades as the water's does.
- **Into a turn.** She heels as `turn_heel` has it, by her swing and a ship's own way under way, 12 m/s: 3 degrees
  with the helm hard over. Her swing is her heading's turn a second, followed at 3 a second and taken at most as the
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
  1.7 m (her hold through her hatch, the stair down into it), or that is off her deck holds none. Each cell is then
  let down to within 8 cm of every neighbour, nothing raised, so a dip in her planks or a raised part of her deck has a way in and out a
  body walks (a slope under 1.19). The grid is kept round the deck with a cell to spare, each row on a line of the
  manifest. The spot behind her wheel on her quarterdeck, 8.1 m aft of her middle, is her helm's; from it a body
  walks down her steps to all her deck.
- **The ground it makes.** The movement crate stands a body on the grid as a terrain ([[Movement]]): between cell
  centres the ground blends, and a cell with none, or the grid's end, is a wall no step or slope takes. A wall of the
  ground is never climbed, as a block's is, so a body never leaves her deck.
- **Her own frame.** A body on deck moves in her frame, so her way, her heading and the swell never move it; the game
  lays it into the world as she lies, at her drawn size.

## Limits

- One hull, the Sloop.
- A walker on deck stands on her heights, not her shape: no stairs below, no rigging to climb, and a body's edge
  may brush a rail it stands within a cell of.
- Her helm stands under the gaff, as the model has it: at the helm the canvas swings close by.
- Alone, the editor steps her; in a fleet room the [[Server]] does, on the open sea, which has no coast or shallows;
  in the sea room's fights, the room steps her by her orders.
- No current or cargo yet, and no crew but the stand-ins aboard ([[Game]]). Hulls are kept apart only in a fight
  ([[Naval Combat]]), as every fleet room is.
- She waits while the land worker makes a close-up (about every 400 m), then catches up.
