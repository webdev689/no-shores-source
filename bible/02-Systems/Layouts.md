---
type: system
status: live
code:
  - crates/layout/src/lib.rs#plan
  - crates/layout/src/settle.rs#settle
  - crates/layout/src/brief.rs#Briefs
  - crates/layout/src/areas.rs#place
  - crates/layout/src/compose.rs#stand
  - crates/layout/src/seat.rs#seat
  - crates/layout/src/paths.rs#find
  - crates/layout/src/carve.rs#carve
  - crates/land/src/sculpts.rs#Sculpts
  - crates/layout/src/pieces.rs#build
  - crates/layout/src/works.rs#build
  - crates/layout/src/rocks.rs#talus
  - crates/layout/src/rocks.rs#clad
  - crates/layout/src/skyline.rs#rim
  - crates/layout/src/skyline.rs#natural_arch
  - crates/layout/src/dressing.rs#dress
  - crates/layout/src/interiors.rs#build
  - crates/layout/src/sites.rs#mark
  - crates/layout/src/marks.rs#build
  - crates/layout/src/ring.rs#traced
  - crates/layout/src/collide.rs#boxes_of
  - content/world/briefs.json
  - client/src/layout/layoutPlan.ts#planOfLayouts
  - client/src/game/groundPaint.ts#paintOfLayouts
  - client/src/layout/passage.ts#passageAt
  - client/src/game/landDrawers.ts#landDrawers
---
# Layouts

Every patrol area and instance a continent draws is laid out from its claim on the land by the same rules on the
server and in every browser ([[Patrol Areas Are Laid Out With RMB, and Missions Run Through Them]]): its places, the
ways between them, villages of Daggerfall's RMB blocks, the land carved into basins and canyons under cliffs, great
works of stone across its canyons, buildings a body walks into, the sites its activities will stand on, and the
section a body may walk. Destiny's Cosmodrome is the reference for the feel: large regions joined to one another,
bounded by rock and walls rather than open ground. How it is laid out is Claude's ([[The World as Claude Shapes It]]).

## The brief

`content/world/briefs.json` gives each node a line on its character and the areas it holds, by kind and name, in the
order they are placed: a hamlet (one to four RMB blocks), a farm, a ruin, a keep, a graveyard, a coven, a shrine, a
camp, a watchtower, a lighthouse, open wilds, a dock, a mill, a quarry, a wreck, a graveyard of ships, the bones of
something enormous, a causeway, a cave's mouth, and an instance's way in and the arena it ends in. A node with no brief
is open ground to arrive on and fight over. Every one of the 90 drawn nodes has its own.

## How a layout is planned

`plan` reads the land under the claim once on a grid of 8 m cells (height, water, slope, and how far each cell lies
from the sea, fresh water and the claim's edge), then:

1. **The areas.** Each kind scores the land by what it wants: flat ground for a hamlet, a summit for a tower, the shore
   for a dock, a river bank for a mill, a slope for a quarry. Areas keep at least 50 m of open ground between their
   reaches and spread over the claim, so something stands every couple of hundred metres. A patrol area's landing
   comes first on its seaward side, then a gate at its edge toward each instance it leads to (the mission, dungeon
   and boss nodes nearer it than any other patrol area), then the brief's areas. An instance's way in comes first,
   at its edge toward its patrol area, and each later area lies further on, so the way through runs one way.
2. **The blocks.** A hamlet stands a tavern, houses, a shop and a temple; a farm, a ruin, a keep, a graveyard, a
   coven, a shrine and a cave's mouth stand one block of their kind. A hamlet's blocks stand apart across lanes and
   greens, out of line, each at the quarter turn the land holds best. Each building is seated on its own footprint,
   level with the highest ground under it and on a stone plinth where the ground falls away; one the land cannot
   hold is left out. Props stand on the ground where they are, and only a block's streets and yards near its
   buildings are laid on the land, to a ragged edge, never its grass: no block's square shows.
3. **The rooms.** Every shop, guild hall, temple, tavern, palace and house is walked into
   ([[Patrol Areas Are Laid Out With RMB, and Missions Run Through Them]]: "Buildings are now open spaces"): its
   doorways stand open, and inside its outline it is lined with plaster, gaps left at its doors with lintels over
   them, floored with planks and ceiled under its eaves, each of the building's windows laid again on the lining's
   face so the room shows the windows the building shows outside. The planks stand 3 cm over the highest ground under the room
   (7 cm over its base at least, 40 cm at most), so neither the land nor the model's own floor shows through, and a
   body walks on them. A wing tall enough has an upper floor on a slab and a stair of 0.2 m risers up to it, along a
   long wall and from whichever end leaves every door clear: none in its wall within a metre of its run or the
   landing at its top, none in the end wall at its foot. The well over it is 0.45 m wider than the steps on each
   side, more than a body's radius, so a head going up beside their edge clears the slab. Its main room is furnished by its kind: a tavern's counter, hearth and benches, a
   house's bed, hearth and wardrobe, a temple's benches and lectern, a shop's counter and shelves, a table and chairs
   in the middle. Stone steps lead down from a door whose sill stands over the ground. Wings too low to stand in,
   outdoor steps and platforms stay solid.
4. **The set pieces** of the kinds no block stands, each of forged props and the city's solids, facing the way it
   is entered: a landing's boardwalk, lanterns, stores and a beached boat; a gate's stone arch between palisades; a
   camp's palisade round tents and a fire, its gap toward the path; a watchtower with a brazier on its battlements; a
   lighthouse; a jetty; a mill and its wheel; a quarry's stepped faces and crane; a wreck; a graveyard of hulls; ribs
   and a skull; a broken causeway; a cave's mouth; the wilds' outcrops and standing stone.
5. **The paths.** A tree of the shortest links between the areas is laid as tracks (4.5 m, at most 18 % steep) and a
   loop or two closed with footpaths (2.6 m, at most 32 %), as Destiny's public areas form a loop; each gate is
   reached by a footpath. Each is the least-cost way over the 8 m grid in sixteen headings (Galin et al.): a step costs
   more the steeper it climbs, water is bridged at a price, a way already laid costs a third so later ways branch
   off it, and a slow noise bends it as worn tracks wander. It ends on a block's own streets and leaves a village
   between its buildings. A way too steep for its tier is laid as a footpath, then stepped; an area no way reached is
   joined to the nearest that is. A way that ends at an area's middle stops short of what stands there (a gate's
   arch, a tower, a hull, the wilds' standing stone), so the piece stays. Bridges carry paths over rivers.
   Along every way, beside it and clear of every other way and of what stands: a signpost where it leaves a place and
   where it reaches one; a milestone every 160 m between the places; a scene every 80 to 180 m (a cart broken down
   with its crates, a fallen log, a cold campfire with a log to sit on, a heap of stones); lanterns on posts every 42 m
   along the ways within 70 m of a settlement (a hamlet, farm, keep, landing, camp, dock or mill), side to side; and
   drystone walls along both sides of the tracks within 170 m of a hamlet or farm, broken by gaps, with fallen stones.
   Each keeps clear of its own way all along it, not only where it was set, so none stands on a bend; and once the
   ways are laid, every prop whose footprint reaches onto a way's width, the set pieces' small solids in a way's
   path (a lantern, a fire's stones), with what stands on them, and each building not walked into that a way runs
   through near its block (a yard's wall), with its pad and plinth, are left out, and a way bends round the corner of
   a building walked into rather than graze it. A way may not cross a cell reaching under a building walked into,
   nor one whose middle stands under anything else, each taken at least a cell wide so a thin wall never slips
   between the grid's cells; and a work's or a wall's turned pieces are laid in lengths whose
   boxes keep close to them, each kept off the ways, as the drystone walls, the climbs' kerbs, the viaduct's piers and
   the great wall are.
6. **The land carved.** Each area becomes a basin 32 m wider than its reach and each path a canyon (15 m either side
   of a track, 11 of a footpath), their edges wandering outward with a noise; a gorge runs out of the claim from
   each gate toward its instance and from the landing toward the sea. Everything else in the claim is raised into a
   massif whose faces fall to the floor over 16 m in four ledges of strata, its top rough, as high as the biome's
   land stands (38 m in the highland, 12 m in the swamp). Mesas and spires stand up in the wilds and arenas and at
   the rims of the wider basins, for cover and to break the long views. The carving is the land crate's sculpt
   (`Sculpts`), applied after the land is made and before the towns, rivers and roads; it never raises the sea or a
   35 m strand inland from the coast, and fades back into the natural land over 140 m past the claim.
   Out of the larger basins (two at most), a climb is cut up the massif's face to a lookout on its top: from where
   the basin's floor really ends, a straight way 7 m wide turned out from along its edge, rising at most 0.3 a metre,
   boring into the rock as it climbs so its face stands over it and its drop falls to the floor, clear of every
   other floor and well inside the claim; at its top a flat 22 m across, with a broken parapet but where the climb
   arrives and a brazier glowing on a plinth; a low drystone kerb runs along the climb's drop, broken here and there. Each climb is walked as a footpath, and the section takes in the climbs
   and the lookouts, so a patrol area has its heights as well as its floor.
7. **The great works**, across and along the canyons, so they make the ways and the bounds: a colossal ruined wall of
   ashlar dammed across the longest track's straightest run, its ends sunk in the cliffs, buttressed and
   battlemented, a breach broken through it where the track runs; a viaduct carried over another canyon from cliff
   top to cliff top on piers and arches, one span fallen into the gorge; a natural arch of rock left standing over a
   third canyon, its feet in the cliffs, its crown over the massif's top, the way running under it; and retaining
   walls along part of the wider basins' feet, each length where the cliff really rises from the floor and clear of
   every way, the climbs' and runs' too. Along the cliff tops round the section, every 130 to 210 m where the
   massif stands over the floor, its top level enough to hold one and no way runs out, stand the ruins of an older
   frontier: round towers broken off at their tops with a few merlons left, and runs of curtain wall in lengths
   broken to different heights, some buttressed, so the bounds read as a border once held.
8. **The rock.** Rock fallen from the faces lies on the floor where each face meets it, never up the face, so every
   stone rests on level ground as if it had rolled there: along the section's edge every 11 m, a third of the way
   left bare and never by a path, a heap of a boulder or two against the foot, smaller stones by them and scree spilt
   out onto the floor too low to trip on; and a few such heaps round each mesa's and spire's foot. A face's foot is
   found by walking in from the section's edge to where the carving no longer raises the floor. All of it is the
   solids' rubble, which wears the ground's stone in the grey the terrain draws its cliffs in.
9. **The sites** the activities that come later will stand on: the landing, each gate and what it leads to, each
   wilds or arena as an event's ground, two patrol beacons at each place's rim, up to sixteen resource nodes off the
   paths (ore on steep ground, salvage by the sea, herbs by fresh water, timber elsewhere), each beacon and resource
   5 m clear of every way's edge, and where foes hold ground. Each resource lies in a pocket the carving leaves off its path, a side way 18 m wide in from the path's
   nearest point. Each beacon and resource is a place before its activity comes (`marks`): a beacon's brazier glowing
   on a stone plinth in a ring of standing stones; ore as a broken outcrop seamed with metal and its spoil; salvage as
   broken timbers and spilt stores; herbs by a gatherer's drying rack hung with bundles; timber as felled logs stacked
   by a stump with its axe.
10. **The section** is the land the carving left as floor, a few metres onto its cliffs' feet, in the claim, as one
    piece with its holes filled, traced into a ring: the layout's bounds are its cliffs and walls. Its spawns stand at
    the landing or the way in.

## Runs

A patrol area's brief may name its runs ([[Patrol Zones Stay as Built and Gain Linear Combat Areas]]): one-way linear
combat areas that break off it, where missions will run later. Saltmere's three zones have three each: in the open
(a gorge, a ledge, a rampart) or through a large building (a keep, a mine, an undercroft), in the zone's own rock or
out past its edge.

- **Its line** (`runs::find`): from where an area's floor ends (not a gate's, landing's or dock's), a way into the
  rock through three to five beats (small arenas 25 to 60 m across, fewer beats larger) to an end arena 40 to 54 m
  across and its sealed door: 200 to 400 m in all. Each passage between beats runs out of one beat's rim, bends 26
  to 49 degrees at its elbow and turns back into the next, so one beat never sees the next whole. The first fit wins
  among 24 headings from each area, seeded; a run keeps 16 m and its half-width off every floor, twice the face's run
  off every climb and other run, and its door has 40 m of rock behind it. A run in the rock keeps 30 m inside the
  claim; a run past the edge carries its door 80 m or more out of it, on dry land 50 m from the sea and clear of every
  other node's claim by the land's fade, read on a field 456 m wider than the claim's.
- **Its land**: cut into the sculpt as levelled capsules ([[Land]]), its beats flat and its passages climbing between
  their rims. A ledge climbs to 0.55 of the massif's height; a rampart climbs to the top in its first two fifths,
  or longer where a slope of 0.6 needs it, keeps to it and drops to 0.55 into its end arena; on a massif under 27 m
  both end lower, so the face behind the door stands at least 12 m (on the swamp's they end on the floor); the rest keep to the floor. A climbing run ends at 0.55 so the face
  behind its door rises in ledges too steep to climb. A run past the edge has a wing that carries the claim out round
  it, and the section takes the run in. Its way is walked as a footpath, painted on the ground but not bedded as a
  road. Foes hold its beats; its end arena is an objective's site and its door a door's.
- **What stands in it** (`run_kits`, `run_halls`, `halls`): its mouth marked so the zone sees where it goes (a fallen
  arch of rock, two standing stones, a broken gateway of towers, a gatehouse, a head-frame and its spoil, a ruined
  chapel); cover on every beat no more than 10 m from any point of its floor (rock, broken masonry, crates, stone
  coffins), and a stone shelf 1.6 m high with steps along the rim up to it; a gorge's fallen bridge, a ledge's broken
  watch post, a rampart's wall along its drop. A keep has walled courts and roofed great halls over its beats in turn,
  roofed passages and two towers at its door; a mine has timbered galleries boarded over, caverns roofed with rubble
  slabs on rock pillars (light falling in shafts beside the way) and an iron grate; an undercroft has vaulted passages,
  pillared vaults and a slab of stone for its door. The door stands at the foot of the face behind the end arena, iron-
  banded timber in a stone arch for the rest. A building's rooms stand square to the world and open wherever the way
  crosses a wall; a slanted wall is laid in lengths short enough that each piece's box stays within half a metre of it.
- **Kept clear**: a run's way is its line and on from its end beat's middle to its door. No box of a run's pieces
  stands within 1.2 m of its way under head height, and the rock and walls laid after it keep off it; every ceiling over a
  building run's way stands 2.6 m or more over its floor. A body walks every run from its mouth to within 3 m of its door, and no
  further (`crates/room/tests/runs_walked.rs`).

## Laid on the land

`settle` plans every drawn node's layout on a landmass whose city is settled, then lays them on its ground: the
sculpts, then the buildings' seats as pads, then the paths as roads (their beds the ground smoothed along them), so
nature keeps off them, every window of the ground carries them, and a node's room stands its bodies on the carved
land ([[Land]], [[Server]]). Every prop and stone that stood on the ground as it was planned then follows it as it is
laid, by as far as the pads and roads moved it (`follow_ground`), and what stands on one (a lantern's cage on its
post) moves with it; a deck, a pile in the water, a battlement or a building's plinth keeps its height. The streets' and paths' heights
are then read from the ground as it lies. Saltmere's ten
layouts are planned and laid in about 0.65 s natively. The bake and the land's worker settle them alike; a node's
file takes its section, spawns and boxes from its layout.

## Boxes

What a body meets ([[Movement]]): each room's linings, lintels, planks, slabs and stairs, the outdoor steps, each wing
too low to enter whole, each building not walked into whole, each plinth, set piece, great work, rock and wall by the
ways, and each prop too tall to step over. What lies wholly past the section (at the cliffs' feet, on their tops) is
never reached and is no box: a piece is kept by its middle in the section or a cell of it, or, for one wider than 8 m,
by any corner. An arch is its two jambs and its head over the crown of its opening, so a body walks under it. A box's
underside is its own, so a body walks under a viaduct's deck and a lintel. A leaning or rolled solid's box is the box
of its turned corners. Boxes are written to the centimetre, grown out so none shrinks. No box of a solid, prop or
building stands across a way's walked width under head height on continent 1 (`crates/room/tests/layouts_laid.rs`). A
body walks in at every ground-floor door of the Saltgrass Downs' buildings, and up to every upper floor, as the bake
lays them (`crates/room/tests/rooms_walked.rs`).

## Gates

A gate's basin and an instance's way in are passages ([[Game]]): standing in one, the player is offered "Enter" the
instance or "Return to" the patrol area (E), and goes through the veil to arrive at the other's way in or gate.

## In the browser

The game draws the layouts within 4 km of the eye with the city layer ([[Cities]]), gathered again once the eye has
moved 1.5 km: a plan of placed pieces (each building and prop where its layout stood it, a building walked into with
its doorways open) and solids (plinths, set pieces, great works, rock, rooms), on a grid of cells just large enough
to hold them, with no plates. Nature keeps off the buildings' yards and each place's open ground.

The paths and a block's streets are the terrain's own ground ([[Game]], "The ground's pictures"): painted within
2.5 km of the eye (`paintOfLayouts`) as a distance from their edges, a metre a texel at finest, the paths and a
block's dirt in one channel and its paving and stone in the other. A block's tiles are read by their records'
classes at their corners, as Daggerfall's tile map lays them, across each tile and the next, so a street has no seam
between its tiles and fades out across the first tile not laid. The terrain draws them in its dirt's and paving's
grain, their edges wandering as trodden ones do, a path paler in its middle and darker where the grass is worn into
it. The terrain lays carved cliffs in strata of rock, and draws the land's carving as far as the layouts are drawn
(the middle ground, [[Game]]).

## In the World Editor

The editor's land worker opens a landmass with the same texts as the game's, so its ground is the game's to the bit,
carved, and its layouts are the game's. After each stroke, place change, undo or redo the worker settles the land and
plans the layouts again, and hands the page only their plans (`layoutMarksOf`): sections, areas, paths and sites,
about 0.2 MB for continent 1 against 12.6 MB of whole layouts. The 3D view draws the buildings, props and solids of
the layouts within 4 km of its camera with the city layer, as the game does; it asks the worker for those layouts
whole, by name (`layoutsNamed`), so the page parses only them ([[World Editor]]).

## Limits

- Only Saltmere's three zones have runs; the other 24 zones' briefs name none yet.
- No layout seats a temple to walk into yet, so a temple's benches and lectern have not been seen inside.
- Missions are single player with invites, but an instance's room is still a node's shared room: private instances
  wait on the server.
- After every change in the World Editor all of a landmass's layouts are planned again, not only those it touches:
  about 1.5 s for continent 1's ten, in the land's worker. The layouts' streets are not painted on its ground.
