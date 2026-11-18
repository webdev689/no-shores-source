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
  - crates/layout/src/dressing.rs#dress
  - crates/layout/src/interiors.rs#build
  - crates/layout/src/sites.rs#mark
  - crates/layout/src/ring.rs#traced
  - crates/layout/src/collide.rs#boxes_of
  - content/world/briefs.json
  - client/src/layout/layoutPlan.ts#planOfLayouts
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
   them, floored with planks and ceiled under its eaves. A wing tall enough has an upper floor on a slab and a stair
   of 0.2 m risers up to it. Its main room is furnished by its kind: a tavern's counter, hearth and benches, a
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
7. **The great works**, across and along the canyons, so they make the ways and the bounds: a colossal ruined wall of
   ashlar dammed across the longest track's straightest run, its ends sunk in the cliffs, buttressed and
   battlemented, a breach broken through it where the track runs; a viaduct carried over another canyon from cliff
   top to cliff top on piers and arches, one span fallen into the gorge; and retaining walls along part of the wider
   basins' feet.
8. **The rock.** Every cliff's foot is walked every 7 m and given a heap of talus where no path runs: a great boulder
   on the carved face's first ledge, smaller ones round it, scree spilt onto the floor too low to trip on, now and
   then one of the forged rocks, and every 46 m a slab several metres high broken from the face and leant back on it.
   Each mesa and spire stands in a ring of rubble pillars against its face, the columns its rock breaks into, tallest
   round a spire, with boulders fallen at its foot. All of it is the solids' rubble, which wears the ground's stone in
   the grey the terrain draws its cliffs in.
9. **The sites** the activities that come later will stand on: the landing, each gate and what it leads to, each
   wilds or arena as an event's ground, two patrol beacons at each place's rim, up to sixteen resource nodes off the
   paths (ore on steep ground, salvage by the sea, herbs by fresh water, timber elsewhere), and where foes hold
   ground.
10. **The section** is the land the carving left as floor, a few metres onto its cliffs' feet, in the claim, as one
    piece with its holes filled, traced into a ring: the layout's bounds are its cliffs and walls. Its spawns stand at
    the landing or the way in.

## Laid on the land

`settle` plans every drawn node's layout on a landmass whose city is settled, then lays them on its ground: the
sculpts, then the buildings' seats as pads, then the paths as roads (their beds the ground smoothed along them), so
nature keeps off them, every window of the ground carries them, and a node's room stands its bodies on the carved
land ([[Land]], [[Server]]). The streets' and paths' heights are then read from the ground as it lies. Saltmere's ten
layouts are planned and laid in about 0.65 s natively. The bake and the land's worker settle them alike; a node's
file takes its section, spawns and boxes from its layout.

## Boxes

What a body meets ([[Movement]]): each room's linings, lintels, slabs and stairs, the outdoor steps, each wing too low
to enter whole, each building not walked into whole, each plinth, set piece, great work, rock and wall by the ways,
and each prop too tall to step over. Rubble past the section, at the cliffs' feet, is never reached and is no box. A box's underside is its own, so a body walks under a viaduct's deck and a lintel. Boxes are written to
the centimetre, grown out so none shrinks.

## Gates

A gate's basin and an instance's way in are passages ([[Game]]): standing in one, the player is offered "Enter" the
instance or "Return to" the patrol area (E), and goes through the veil to arrive at the other's way in or gate.

## In the browser

The game draws the layouts within 4 km of the eye with the city layer ([[Cities]]), gathered again once the eye has
moved 1.5 km: a plan of placed pieces (each building and prop where its layout stood it, a building walked into with
its doorways open), solids (plinths, set pieces, great works, rooms) and ground pictures laid on the land (a block's
streets and yards, and the paths as ribbons of dirt), on a grid of cells just large enough to hold them, with no
plates. Nature keeps off the buildings' yards and each place's open ground. The terrain lays carved cliffs in strata
of rock.

## In the World Editor

The editor's land worker opens a landmass with the same texts as the game's, so its ground is the game's to the bit,
carved, and its layouts are the game's. After each stroke, place change, undo or redo the worker settles the land and
plans the layouts again, and hands the page only their plans (`layoutMarksOf`): sections, areas, paths and sites,
about 0.2 MB for continent 1 against 12.6 MB of whole layouts.

## Limits

- Missions are single player with invites, but an instance's room is still a node's shared room: private instances
  wait on the server.
- A patrol area full of rooms holds three thousand boxes or so; the movement rules test them one by one.
- A block's streets are pictures laid in squares of 6.4 m with hard edges.
- Only the third-person camera's distance is kept from the land; indoors it can stand outside the walls.
- The World Editor shows the layouts' plans and the carved land, not their buildings, props and solids: those are
  drawn by the city layer, which the editor's layer may not import ([[World Editor]]). After every change all of a
  landmass's layouts are planned again, not only those it touches: about 1.5 s for continent 1's ten, in the land's
  worker.
- A set piece stands on the land as it was before the paths' beds were laid, so a prop beside a path can stand a
  hand high or low.
