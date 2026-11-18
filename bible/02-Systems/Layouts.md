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
   joined to the nearest that is. Bridges carry paths over rivers.
   Along every way, beside it and clear of every other way and of what stands: a signpost where it leaves a place and
   where it reaches one; a milestone every 160 m between the places; a scene every 80 to 180 m (a cart broken down
   with its crates, a fallen log, a cold campfire with a log to sit on, a heap of stones); lanterns on posts every 26 m
   along the ways within 70 m of a settlement (a hamlet, farm, keep, landing, camp, dock or mill), side to side; and
   drystone walls along both sides of the tracks within 170 m of a hamlet or farm, broken by gaps, with fallen stones.
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
   walls along part of the wider basins' feet. Along the cliff tops round the section, every 130 to 210 m where the
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
   paths (ore on steep ground, salvage by the sea, herbs by fresh water, timber elsewhere), and where foes hold
   ground. Each resource lies in a pocket the carving leaves off its path, a side way 18 m wide in from the path's
   nearest point. Each beacon and resource is a place before its activity comes (`marks`): a beacon's brazier glowing
   on a stone plinth in a ring of standing stones; ore as a broken outcrop seamed with metal and its spoil; salvage as
   broken timbers and spilt stores; herbs by a gatherer's drying rack hung with bundles; timber as felled logs stacked
   by a stump with its axe.
10. **The section** is the land the carving left as floor, a few metres onto its cliffs' feet, in the claim, as one
    piece with its holes filled, traced into a ring: the layout's bounds are its cliffs and walls. Its spawns stand at
    the landing or the way in.

## Laid on the land

`settle` plans every drawn node's layout on a landmass whose city is settled, then lays them on its ground: the
sculpts, then the buildings' seats as pads, then the paths as roads (their beds the ground smoothed along them), so
nature keeps off them, every window of the ground carries them, and a node's room stands its bodies on the carved
land ([[Land]], [[Server]]). Every prop and stone that stood on the ground as it was planned then follows it as it is
laid, by as far as the pads and roads moved it (`follow_ground`), and what stands on one (a lantern's cage on its
post) moves with it; a deck, a pile in the water or a battlement keeps its height. The streets' and paths' heights
are then read from the ground as it lies. Saltmere's ten
layouts are planned and laid in about 0.65 s natively. The bake and the land's worker settle them alike; a node's
file takes its section, spawns and boxes from its layout.

## Boxes

What a body meets ([[Movement]]): each room's linings, lintels, planks, slabs and stairs, the outdoor steps, each wing too low
to enter whole, each building not walked into whole, each plinth, set piece, great work, rock and wall by the ways,
and each prop too tall to step over. What lies wholly past the section (at the cliffs' feet, on their tops) is never
reached and is no box: a piece is kept by its middle in the section or a cell of it, or, for one wider than 8 m, by
any corner. An arch is its two jambs and its head over the crown of its opening, so a body walks under it. A box's
underside is its own, so a body walks under a viaduct's deck and a lintel. Boxes are written to the centimetre, grown
out so none shrinks. A body walks in at every ground-floor door of the Saltgrass Downs' buildings, and up to every
upper floor, as the bake lays them (`crates/room/tests/rooms_walked.rs`).

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
about 0.2 MB for continent 1 against 12.6 MB of whole layouts.

## Limits

- No layout seats a temple to walk into yet, so a temple's benches and lectern have not been seen inside.
- Missions are single player with invites, but an instance's room is still a node's shared room: private instances
  wait on the server.
- The World Editor shows the layouts' plans and the carved land, not their buildings, props and solids: those are
  drawn by the city layer, which the editor's layer may not import ([[World Editor]]). After every change all of a
  landmass's layouts are planned again, not only those it touches: about 1.5 s for continent 1's ten, in the land's
  worker.
