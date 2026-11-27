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
  - crates/layout/src/basins.rs#basin
  - crates/layout/src/carve.rs#shape_of
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
  - crates/layout/src/chests.rs#mark
  - crates/layout/src/marks.rs#build
  - crates/layout/src/ring.rs#traced
  - crates/layout/src/collide.rs#boxes_of
  - crates/layout/src/spaces.rs#map
  - crates/layout/src/heights.rs#graded
  - crates/layout/src/caverns.rs#find
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
something enormous, a causeway, a cave's mouth, an instance's way in and the arena it ends in, and a plot. A node with
no brief is open ground to arrive on and fight over; an outpost site's is a landing, a plot and an arena (The Landing,
The Plot, The Muster Ground), and it links to no patrol area. A plot is the ground a guild builds on: a square 64 m a
side, axis-aligned round its middle, on flat dry ground within 250 m of the landing where the land allows. Nothing
stands on it: no beacon or resource is marked there, a way ends at its rim, and four low stones stand just outside its
corners. Of the 155 drawn nodes, the 74 that are not outpost sites each have their own. A brief may also carry hints:
`rock`, the shape its outcrops stand in where its climate's would not suit it (the Saltgrass Downs' whalebacks, the
Gullwing Vale's knolls, the Driftwood Moors' tors); `stone`, the stone its cliffs and rubble wear (the Downs' chalk);
and `river`, that a river runs through it (the Vale), which carries the claim along the river (below). `heights` stands its places at heights (Saltmere's
three zones, [[Zones Rise and Fall, Above and Below Ground]]), and an area's `level`, in hundredths of the massif's
height, sets its own height in place of its kind's (the Vale's Water Meadows lie by the river at 0). A layout
carries its `stone` out with it, and the client wears it (below).

## How a layout is planned

`plan` reads the land under the claim once on a grid of 8 m cells (height, water, slope, and how far each cell lies
from the sea, fresh water and the claim's edge), then:

1. **The areas.** Each kind scores the land by what it wants: flat ground for a hamlet, a summit for a tower, the shore
   for a dock, a river bank for a mill, a slope for a quarry. Areas keep at least 50 m of open ground between their
   reaches and spread over the claim, so something stands every couple of hundred metres. A patrol area's landing
   comes first on its seaward side, then a gate at its edge toward each instance it leads to (the mission, dungeon
   and boss nodes of its own region, `content/world/regions.json`, nearer it than any other patrol area of that
   region), then the brief's areas. Once the zone's runs are found, a way across toward each other patrol area of its
   island stands at a run's end, none on the landing (`crossings.rs`,
   [[The Ways Across Stand at the Runs' Ends, Not on the Landing]]): each zone takes the run whose end arena, seen
   from the claim's middle, lies at the bearing nearest the bearing to that zone's middle, the nearest pair of all
   taken first and no run taken twice. Where the run's sealed door is no passage's mouth (`content/passages`), the
   door is the way across; where it is one (the Saltgrass Downs), a second arch of the door's make stands in the end
   arena, 3.5 m in from its rim facing its middle. Of the headings whose frame keeps clear of the run's way, whose
   spot's reach keeps clear of the mouth's and whose frame stands on the arena's floor, those whose spot lies further
   from the run's way come first; the arch takes the first that stands off the run's climb, and not behind it from the
   arena's middle, with none of the run's pieces under head height in its frame's way or on the walk up to it, else
   the first off the climb, the pieces under head height where its frame stands, and what is stacked on them, left
   out (`run_kits.rs`). Each way across is a gate area marked as crossing (`crosses`, which `is_crossing` reads and
   the page's `across`; no other gate is taken for one) and a gate site holding its zone, 4 m round (a mouth's reach),
   a body's step (2 m) inside the end arena from its door or arch: where a player stands to use it, and where one
   crossing in from that zone arrives. Added last, it moves none of the zone's places or ways; its map joins it to
   its run's end arena (on Saltmere each of its three zones has one toward each of the others). An
   instance whose region holds no patrol area has no way in from one: it is landed at from the sea. The bake reads
   the regions into the briefs (`Briefs::regions`), and the settle's `links_of` reads them there.
   An outpost site's landing comes first
   the same way, then its plot near it. An instance's way in comes first,
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
   them, and where a taller room opens onto a lower one beside it, lined above that room's top, so its wall over the
   lower roof is not seen through from inside; floored with planks and ceiled under its eaves, each of the building's windows a hole through its wall and
   the lining, its picture on both faces and its panes clear, so the room is seen into and out of through it. The planks stand 3 cm over the highest ground under the room
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
   camp's palisade round tents and a fire, its gap toward the path, no stake within a cell and a metre (9 m) of the
   line out through it along the grid's rows or columns, whichever lie more across it, so a cell's middle always lies
   in the gap for a way to reach the camp by (how it is measured waits on the owner: [[Open Questions]]); a watchtower with a brazier on its battlements; a
   lighthouse; a jetty; a mill and its wheel; a quarry's stepped faces and crane; a wreck; a graveyard of hulls; ribs
   and a skull; a broken causeway; a cave's mouth; the wilds' outcrops and broken walls, set every 10 m round a ring
   at about 0.58 of its reach (an arena's every 8 m) with a share left out, round its standing stone.
5. **The paths.** A tree of the shortest links between the areas is laid as tracks (4.5 m, at most 18 % steep) and a
   loop or two closed with footpaths (2.6 m, at most 32 %), as Destiny's public areas form a loop; each gate is
   reached by a footpath. Each is the least-cost way over the 8 m grid in sixteen headings (Galin et al.): a step costs
   more the steeper it climbs, water is bridged at a price, a way already laid costs a third so later ways branch
   off it, and a slow noise bends it as worn tracks wander. It ends on a block's own streets and leaves a village
   between its buildings. No way steps from dry land over a river without setting foot in it, so every crossing is found and
   bridged; two ways crossing at one place, the second's deck lying on the first's, cross by the first bridge alone
   (`pieces_land.rs` `deck_over`). A way too steep for its tier is laid as a footpath, then stepped; an area no way
   reached is
   joined to the nearest that is. A way that ends at an area's middle stops short of what stands there (a gate's
   arch, a tower, a hull, the wilds' standing stone), so the piece stays. Bridges carry paths over rivers: a timber deck 0.5 m
   thick, so a body walks on it, 0.3 m over the land at its higher end, 3 m past each bank and on out along a lower
   bank until its two ends' land stands within 0.15 m, so a body steps onto it at either end; rails 0.8 m past the
   walked width; deck and rails laid in lengths short enough that each one's box keeps close to it on a slant, so no
   rail's box reaches onto the way.
   Along every way, beside it and clear of every other way and of what stands: a signpost where it leaves a place and
   where it reaches one; a milestone every 160 m between the places; a scene every 80 to 180 m (a cart broken down
   with its crates, a fallen log, a cold campfire with a log to sit on, a heap of stones); lanterns on posts every 42 m
   along the ways within 70 m of a settlement (a hamlet, farm, keep, landing, camp, dock or mill), side to side; and
   drystone walls along both sides of the tracks within 170 m of a hamlet or farm, 0.8 m through, broken by gaps,
   with fallen stones, each length sunk under the lowest ground along it and as much taller as the ground rises.
   Round the largest thing seated about a shrine's middle, 6 m past its corners, a ring of twelve standing stones 2.6 to
   4.2 m tall, a few leaning and every fifth fallen, none within 2 m of a way. Beside a farm, 10 m or 20 m past what is
   seated about its middle and by where its first way comes in where it can be, a fold for its stock: a 12 by 9 m pen of
   drystone 0.7 m through, its gate toward the farm, on ground level to 0.4 m and clear of every way, of what is seated
   and of what stands. Each keeps clear of its own way all along it, not only where it was set, so none stands on a
   bend; and once the ways are laid, every prop whose footprint reaches onto a way's width, the set pieces' small solids
   in a way's path (a lantern, a fire's stones), with what stands on them, and each building not walked into that a way
   runs through near its block (a yard's wall), with its pad and plinth, are left out, and a way bends round the corner
   of a building walked into rather than graze it. A way may not cross a cell reaching under a building walked into, nor
   one whose middle stands under anything else or within a metre of it (`KEEP_OFF_M`), each taken at least a cell wide
   so a thin wall never slips between the grid's cells; and a work's or a wall's turned pieces are laid in lengths whose boxes keep close to them, each kept
   off the ways, as the drystone walls, the climbs' kerbs, the viaduct's piers and the great wall are.
6. **The land carved.** Each area becomes a basin shaped by its kind, holding its reach and 32 m of floor round each of
   its buildings:
   - a farm: a straight-sided field along the run of its yards and buildings, 1.8 times as long as it is wide; a
     mill: such a field along its water;
   - a hamlet: a bowl with a lobe 64 m wide toward each of its blocks, standing 56 m out of it, so its ways out turn
     between rock;
   - the wilds and an arena: a bowl with three to five bowls of different sizes standing out of it;
   - a ruin: a bowl broken by five or six capsules whose sides part past its reach, so spurs of rock run in between;
   - a graveyard: a bowl 32 m wider than its reach, with one or two shelves along its rim at 0.14 of the massif's
     height, 24 m wide and 64 m long, each as far out as it fits clear of the ways, the other shelf and every solid,
     cutting through no building. A ramp runs on from one of its ends along the rim down to the floor, and rows of
     headstones stand on the shelf, askew, a few gone, either side of a lane down its middle, the last pieces stood,
     none in a building, a prop, a solid or on a ramp;
   - a keep, a camp and a plot: such a bowl with a platform round the middle, ramped wherever a way crosses its edge or ends
     short of it, each way its own ramp unless one already climbs there on the same bearing. A keep's reaches 6 m past its buildings and 34 m at the least, at 0.18 of the massif's height; a
     camp's reaches 6 m past its palisade, at 0.12; a plot's 6 m past its square's corners, at 0.12, so its whole square
     stands level;
   - every other kind: a round bowl 32 m wider than its reach.

   A shelf and a platform are level climbs, and a ramp a climb from the floor to their level ([[Land]]), 9 m wide,
   rising at most 0.25 a metre where the massif stands highest. What was stood before the carving on a terrace,
   a ramp or the fall of their edges is lifted onto the land as the last cut leaves it: a building whole by the raise
   at its middle, with its pad, plinth, rooms and walls and all in its footprint, a handcrafted module by the least
   the carving raises the land under its foot, so no edge of it stands off the land, every other prop and solid by
   the raise under it. Each path becomes a canyon, segment by segment: 15 m either side of a track and 11 of a footpath, closing
   to a slot (11 and 7 m) where the way runs 80 m or more with every point 60 m past any area's reach, and opening
   to a bay (22 and 18 m) at a bend sharper than 0.5 rad or by a river crossing; the great works take the half-width
   where they stand. The edges of basins and canyons wander outward with a noise; a gorge runs out of the claim from each gate toward its instance and from
   the landing toward the sea. Everything else in the claim is raised into a
   massif whose faces fall to the floor over 16 m in four ledges of strata, its top rough, as high as the biome's
   land stands (38 m in the highland, 12 m in the swamp). Outcrops stand up in the wilds and arenas (up to five) and
   at the rims of the wider basins (two), for cover and to break the long views, all of one shape ([[Land]]): the
   brief's `rock`, or else the climate's (mesas in the desert, steppe and savanna, tors on the temperate coast and in
   the woodland, crags in the highland and tundra, knolls in the rainforest, hummocks in the swamp). Each is as large
   as the room round it lets it be, each later try smaller: a mesa 18 to 52 m in radius (two faces from 49 m), a tor
   11 to 26 m, a crag 14 to 34 m, a knoll 12 to 26 m, a hummock 10 to 22 m, a whaleback 8 to 12 m and about seven
   times that long. A tor or crag stands up to its radius tall, a knoll 0.9 of it, a mesa and a whaleback 0.7, a
   hummock 0.4, and none over 0.8 of the massif's height. Each is turned across the view from its area's middle,
   give or take 17 degrees, so a whaleback shows its flank and a tor leans aside, and its footprint keeps off every
   way, climb, building, prop, solid and other outcrop, and off every passage: a tiered ruin's spokes and tiers, the
   gorges out, the pockets and the caverns. The carving is the land crate's sculpt
   (`Sculpts`), applied after the land is made and before the towns, rivers and roads; it never raises the sea or a
   35 m strand inland from the coast, and fades back into the natural land over 140 m past the claim.
   Out of the larger basins (two at most), a climb is cut up the massif's face to a lookout on its top: from where
   the basin's floor really ends, a straight way 7 m wide turned out from along its edge, rising at most 0.3 a metre,
   boring into the rock as it climbs so its face stands over it and its drop falls to the floor, clear of every
   other floor and well inside the claim; at its top a flat 22 m across, with a broken parapet but where the climb
   arrives and a brazier glowing on a plinth; a low drystone kerb runs along the climb's drop, broken here and
   there, each length seated into the ground at its lower end and standing its height over the higher, as the climb
   rises under it. Each climb is walked as a footpath, and the section takes in the climbs and the lookouts, so a
   patrol area has its heights as well as its floor.
   A brief with `river` carries its claim along the river it holds most of, where the river runs between the
   claim's north and south bounds: a wing 24 m either side of each stretch of the river's course (160 m at most),
   any stretch whose wing would reach another node's claim or come within 50 m of the sea and its own width left out,
   and the stretch's banks as floor, water meadows 12 m either side (both wider by as far as the river strays from its
   course), so the section takes the river in. Where a gorge out of the claim meets a river inside the section, a
   footbridge carries it over, reaching out along the lower bank until both its ends meet the land.
   Then the dead masses (`masses`): patches of the massif over 2,500 m2, sought on 16 m cells, raised over a quarter
   of its height (a terraced massif's lowest plateau stands at about a third), more than 150 m from every floor, climb
   and run and 120 m inside the claim's edge (the bounds). Before the
   runs are found, each layout answers its largest mass, seeks them again, and so on seven times at most: a straight
   climb from where a floor reached out of the mass's deepest point really ends (sixteen headings tried, the edge
   found to 2 m) back up toward it, to a lookout
   as above with a broken tower standing on the top 24 m past it (ahead or to either side, where the top is level and
   clear of every outcrop as for the rim's ruins, else none), where that leaves under 2,500 m2 of the mass dead;
   else a valley 22 m wide through the deepest point that joins two existing floors over walked land, keeps 48 m off
   every climb past both edges and off every outcrop, and reaches most of the mass, running at the levels of the
   floors it joins so it never cuts a raised floor down; else the climb that reaches most. On Saltmere the Downs take
   six climbs, the Vale four valleys across the rock round its keep, the Moors three valleys and three climbs.
7. **The great works**, across and along the canyons, so they make the ways and the bounds, each where a work as wide
   as the great wall would keep 12 m off every outcrop (the outcrops are placed first): a colossal
   ruined wall of ashlar dammed across the longest track's straightest run (the next run's where its wall would
   cross another way but at its breach), as high as the lower of its canyon's two
   cliff tops (each the highest the carved land stands within its face) and 10 m over, its ends sunk in the cliffs, buttressed
   and battlemented, a breach broken through it where the track runs; a viaduct carried over another canyon from
   cliff top to cliff top on piers and arches, its deck 0.92 of the way up to the lower top, one span fallen into the gorge, a pier that would stand on a way moved
   out from the middle until it stands clear (half a span at most) or left out, so each arch spans two piers that
   stand; a natural arch of rock (the rock arch,
   [[Cities]]) left standing over a third canyon, its feet on the canyon's floor either side of the way and out into
   its cliffs, its opening the way and 6 m either side, its crown 2 to 6 m over the lower cliff top, the way running under it; and
   retaining walls along part of the wider basins' feet, each length where the cliff really rises from the floor and
   clear of every way, the climbs' and runs' too, and of every outcrop. Along the cliff tops round the section, every
   130 to 210 m where the massif stands over the floor, its top level enough to hold one and no way runs out, stand
   the ruins of an older frontier: round towers broken off at their tops with a few merlons left, and runs of curtain
   wall in lengths broken to different heights, some buttressed, so the bounds read as a border once held. They are
   laid once every layout is planned, on the land as all the sculpts leave it, which is the ground as settled: a
   neighbour's massif can rise over a rim or its floor hold one down.
8. **The rock.** Rock fallen from the faces lies on the floor where each face meets it, never up the face, so every
   stone rests on level ground as if it had rolled there: along the section's edge every 11 m, a third of the way
   left bare and never by a path, a heap of a boulder or two against the foot, smaller stones by them and scree spilt
   out onto the floor too low to trip on; and such heaps all round each outcrop's foot, a whaleback's ends too, more
   the longer its footprint is round. A face's foot is found by walking in from the section's edge to where the
   carving no longer raises the floor. No stone that lies in what a run built, on the ground its climb takes or within
   1.2 m of its way (its line and on to its door, `WAY_CLEAR_M`) is laid, and a run's own loose stones (its cover's boulders, a stump's fallen courses) keep off the rest of what it
   built. All of it is the solids' rubble, which wears the ground's stone in the grey the
   terrain draws its cliffs in; in a layout with a `stone` of chalk its rubble wears chalk's white instead (the client
   turns its rubble solids to the `chalk` material, a picture of the same stone tile brought to white).
9. **The sites** the activities that come later will stand on: the landing, each gate and what it leads to, each
   wilds or arena as an event's ground, each hamlet's three stores, its raiders' approach and their two banners, where
   each wilds' fissure opens beside its obelisk and its growth spot ([[Public Events]]), two patrol beacons at each place's rim, up to sixteen resource nodes off the
   paths, each holding its island's resource (content/gear/resources.json, by the landmass's continent; [[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]), each beacon and resource
   5 m clear of every way's edge and a metre clear of every building and of every module's foot, whose floors level
   the land under it once the sites are marked, each resource 12 m from every other and from each beacon, and where
   foes hold ground: a foes' site at the middle of every area but a landing, a gate, an entrance, a hamlet, a wilds, a
   Breach's hollow and a guild's plot, its patrol's territories
   ([[Patrol Foes Hold Territories Across the Zone, and None Comes on a Timer]]; [[Enemies]], "Territories and runs"). Each resource lies in a pocket the carving leaves off its path, a side way 18 m wide in from the path's
   nearest point. Each resource's node stands 5 m before its dressing toward its path, clear of it (`node`; none where that lies outside
   the section's ring, on water, within a metre of a solid taller than a step or within 1.5 m of a planting, once all is
   laid), and a patrol stands its material nodes there, every one at once ([[Server]]). Each beacon and
   resource is a place (`marks`): a beacon's brazier glowing on a stone plinth in a ring of standing stones; and at each
   resource node the place its resource comes from, built of the solids' own materials: Brineglass's tide pool ringed
   with wet stones and salt shards, Cairn Iron's stacked cairn seamed with iron, Heartwood Resin's broad old stump with
   amber bled down it, Sunstone's desert stones bedded in sand and glowing, Goldgrass's stand of tall gold grass,
   Mistbloom's low mound of pale flowers, Windthistle's thistles gone to down, Bog Pearl's black pool rimmed with
   shells, and Rimecrystal's frozen rock grown with spikes of frost. Last, once everything stands where it will, a
   patrol's chest places (`chests`, [[Patrols and Dungeons Hold Chests, and Their Containers May Be Searched]]): round
   each area a body comes to but its landing, gates and way in, round each climb's lookout (10 m) and each run's beat,
   before a face of something standing at least 1 m tall from the ground, never overhead (a box of a building, a
   ruin's wall, a rock, a tent, a stack of crates, a lookout's parapet), its middle 0.75 m out, square to the world
   and facing away from it, each place's
   faces tried in an order drawn on the layout's seed. A place is kept where its swing (`swing`: its box, 1.1 by 0.8
   m, and behind it the band its lid swings back into, to 5 cm short of the face) stands clear of every box and prop
   over its ground, on dry, open land in the ring that rises or falls 0.2 m at most under it, 1.5 m off every way's
   edge (the climbs', the runs' and each run's way on to its door), 1.5 m off a building walked into and 0.1 m off
   any other, 1 m from a planting, 25 m from every other chest place, 10 m from a resource place, its node and a
   beacon, 3 m past a public event's fissure, growth, store, banner or approach, and 15 m from a spawn: two a place
   at most and 24 a layout. Once everything stands, the ruins along the cliffs' tops and the stores among it, the
   settle drops a place whose swing any box or prop then reaches, or that no longer stands before something tall
   (`keep_clear`). Continent 1's three patrols lay 22 to 24 each; a test holds them to four or more
   (`crates/room/tests/chests_planned.rs`).
10. **The section** is the land the carving left as floor, a few metres onto its cliffs' feet, no cell of it touching
    the sea, and the bridges over water a cell wider either side, in the claim, as one piece with its holes filled,
    traced into a ring: the layout's bounds are its cliffs and walls. Narrow gaps of rock between floors are closed
    into it, but never beside a rampart or a ledge: their floor is taken as far as it reaches and the rock's top beside
    them is left out of bounds ([[A Run on the Rock's Top Is Held by Out of Bounds]]). What a body walks and fights in
    lies inside it a metre either side: every way, each run's line to 3 m short of its door and its beats, each climb
    and lookout, each ledge's stair, each cavern's tunnel and hollow. Every cell of the claim within 4 m of those is taken, and where
    the ring's simplifying would cut one off, its corners within 24 m are kept as traced.
    Its three spawns stand round the landing or the
    way in (`spawns::round`), each on walkable ground in the section and clear of everything a body runs into (a
    gate's arch stands on its way in): the first three points that are, of the anchor itself, six metres east and
    west of it and three south, then rings round the anchor two metres apart out to 16 m; the anchor alone where none
    is.
11. **The plantings** (`plantings`), last, from the kinds the climate's nature already grows
    (`content/nature/flora.json`): its orchard tree and its shrub, the oak and the gorse on a temperate coast (no apple
    or pear grows anywhere). A farm with "orchard" as a whole word of its name is planted with the tree in rows along
    its field, 9 m apart in rows 10 m apart, 60 m either way along the field from its middle and 45 m across. Every
    farm's tracks have a hedgerow of the shrub every 2 m either side, as far out as their drystone walls run, 2.2 m
    behind each wall's line, so a bush clears the wall's half (0.4 m) by its reach; none where no length of wall
    stands, at a gap or where a way crossing took one. A wilds with "moor" as a whole word
    of its name holds eight thickets of the shrub, each reaching 5 to 10 m from its middle, a quarter to most of the
    way out. A planting stands only in the section, on the floor by its reach (a tree 4 m, a shrub 1.6 m) and as far
    off every climb, run and outcrop, on dry land no steeper than 0.4. It also keeps that far clear of every way, a
    run's way (at least 6 m) and beats (2 m past them), a building's 10 m yard, a tile, a pad and a prop, and of a solid
    by its own turned footprint where it stands upright (by its box where it leans or rolls). The tundra plants no
    orchard and the swamp nothing.

## Runs

A patrol area's brief may name its runs ([[Patrol Zones Stay as Built and Gain Linear Combat Areas]]): one-way linear
combat areas that break off it, where missions will run later. Saltmere's three zones have three each: in the open
(a gorge, a ledge, a rampart) or through a large building (a keep, a mine, an undercroft), in the zone's own rock or
out past its edge.

- **Its line** (`runs::find`): from where an area's floor ends (not a gate's, landing's or dock's), a way into the
  rock through three to five beats (small arenas 26 to 56 m across, fewer beats larger) to an end arena 42 to 54 m
  across and its sealed door: 200 to 400 m in all. Each passage between beats runs out of one beat's rim, bends 26
  to 49 degrees at its elbow and turns back into the next, so one beat never sees the next whole. The first fit wins
  among 24 headings from each area, seeded; a run keeps 16 m and its half-width off every floor, twice the face's run
  off every climb and other run, and its door has 40 m of rock behind it, which no floors close round (the section
  would take such rock in as a hole). A run in the rock keeps 30 m inside the
  claim; a run past the edge carries its door 80 m or more out of it, on dry land 50 m from the sea and clear of every
  other node's claim by the land's fade, read on a field 456 m wider than the claim's.
- **Its land**: cut into the sculpt as levelled capsules ([[Land]]), its beats flat and its passages climbing between
  their rims. Each starts at the level of the floor it leaves, raised or not. A ledge climbs from there to 0.55 of
  the massif's height, and is laid only where that is a fifth of it at the least; a rampart climbs to the top in
  its first two fifths, or longer where a slope of 0.6 needs it, keeps to it and drops to 0.55 into its end arena (a
  run whose passages are too short to climb at 0.6 or less is not laid there); on
  a massif under 27 m both end lower, so the face behind the door stands at least 12 m (on the swamp's they end on
  the floor). A gorge's entry ramps down from the floor it leaves, no steeper than 0.6, to the land's own level, and
  it keeps to it; a building run (a keep, a mine, an undercroft) keeps to the land's own level, its entry built for
  level ground, and where it breaks off a raised place a ramp 2 m wider than its passage is cut down through that
  place's floor to its mouth, no steeper than 0.6, so a body walks in and back out; a run whose ramp would come
  within its half-width of the place's middle, where what the place holds stands, is not laid there. A climbing run ends at 0.55 so the face
  behind its door rises in ledges too steep to climb. A run past the edge has a wing that carries the claim out round
  it, and the section takes the run in. Its way is walked as a footpath, painted on the ground but not bedded as a
  road. Its beats are marked as foes' sites, where its room stands a group as a player first comes near ([[Enemies]], "Territories and runs"); its end arena is an objective's site and its door a door's.
- **What stands in it** (`run_kits`, `run_halls`, `halls`): its mouth marked so the zone sees where it goes (a fallen
  arch of rock, two standing stones, a broken gateway of towers, a gatehouse, a head-frame and its spoil, a ruined
  chapel); cover on every beat no more than 10 m from any point of its floor (rock, broken masonry, crates, stone
  coffins; a ledge's and a rampart's masonry in three forms, about a third each: lengths of wall along the way with a
  course left on one end of its top, squared blocks, and heaps of rubble), and a stone shelf 1.6 m high with steps
  along the rim up to it; a gorge's fallen bridge, each of its ends
  set 1.5 m into its wall where the wall reaches its deck's height (none on a side lower than that), a ledge's broken
  watch post, a rampart's wall along its drop. A keep has walled courts and roofed great halls over its beats in turn,
  roofed passages and two towers at its door; a mine has timbered galleries boarded over, caverns roofed with rubble
  slabs on rock ribs and an iron grate; an undercroft has vaulted passages,
  pillared vaults and a slab of stone for its door. The door stands at the foot of the face behind the end arena, iron-
  banded timber in a stone arch for the rest. A building's rooms stand square to the world and open wherever the way
  crosses a wall; a slanted wall is laid in lengths short enough that each piece's box stays within half a metre of it.
  A cavern's rock pillars stand on an 11 m lattice clear of the way; its rock ribs, 1.2 m wide and 0.9 m deep under
  its roof 7 m up, run both ways 5.5 m apart, over the pillars on every other one, each springing from the rock where
  the face rises to it on either side (one that meets no rock within 24 m past the rim, along a passage's mouth, or
  that would run into the door's frame, is left out); a rubble slab spans each bay from rib to rib, laid only where a
  rib is under its edge, and a few beside the way are left out so light falls in shafts.
  A keep's rooms and an undercroft's vaults reach 0.7 of their beat's, so their corners stand on its floor, short of
  the rock's face; a beat's raised place stands inside its room, its cover 1.8 m or more off the room's walls, and a
  vault's pillars 2 m or more inside them. A keep's gatehouse (roofed 5.5 m up, to the way's first bend) and an
  undercroft's chapel (open to the sky, 12 m long) are laid along the way in from the mouth, their walls 1 m and 2 m
  past its passage's half-width, on the passage's flat floor short of the face. A keep's rooms' walls
  are windowed (openings 1.0 m wide and 1.6 m tall over sills 1.2 m up, 6 m apart, none in the wall the ward's stair
  climbs) and battlemented (merlons 0.9 m wide and 1.2 m tall every 2 m on the walls' outer halves, behind the
  wall-walk), and a round turret 11 m tall, taller than the walls, stands at each corner of its ward that its way keeps
  clear of.
- **What a body climbs** (`run_climbs`), square to the world so each box is its piece: in a keep's ward a stair of 0.2 m
  risers up the inside of the wall its way keeps furthest from to a wall-walk along it 8.4 m up, a parapet's height
  under the wall's top, and at its end a short stair onto a round turret's top at the corner, 11 m up and ringed with
  merlons, open where the stair comes on; just past an undercroft's mouth its chapel's floor raised 2.4 m on the way,
  with a stair up onto it from the zone and a stair down off it into the undercroft, along the axis nearest the way in
  (no point of the way stands on a step). The
  run's other pieces keep off them, and they are laid after the way is cleared.
- **Kept clear**: a run's way is its line and on from its end beat's middle to its door. No box of a run's pieces
  stands within 1.2 m of its way under head height, but for what a body climbs on it, and the rock and walls laid after
  it keep off it; every ceiling over a building run's way stands 2.6 m or more over its floor. A body walks every run
  from its mouth to within 3 m of its door, and no further; up each keep's stair to its turret's top; and over each
  undercroft's chapel floor and down its stair (`crates/room/tests/runs_walked.rs`). Every patrol zone of every
  continent is given a run of each of four kinds too, one test a continent (`runs_everywhere.rs`), with one failure
  known and named with its reason, so a new one fails CI ([[The Audit's Leftovers Are Fixed as Claude Suggested]]):
  on the savanna a body walks round a rampart's door across its face. It waits on the owner's call on the
  runs there; only Saltmere's zones have runs of their own yet.

## Laid on the land

`settle` plans every drawn node's layout on a landmass whose city is settled, then lays them on its ground: the
sculpts, then the buildings' seats as pads, then the paths as roads (their beds the ground smoothed along them), so
nature keeps off them, every window of the ground carries them, and a node's room stands its bodies on the carved
land ([[Land]], [[Server]]). Every prop and stone that stood on the ground as it was planned then follows it as it is
laid, by as far as the pads and roads moved it (`follow_ground`), and what stands on one (a lantern's cage on its
post) moves with it; a pile in the water, a battlement or a building's plinth keeps its height. A bridge's timbers
move together, by as far as the land under its deck's higher end moved, never one length on its own. The streets' and paths' heights
are then read from the ground as it lies. Saltmere's ten
layouts are planned and laid in about 0.65 s natively. The bake and the land's worker settle them alike; a node's
file takes its section, spawns and boxes from its layout.

## Boxes

What a body meets ([[Movement]]): each room's linings, lintels, planks, slabs, ceiling and stairs, the ceiling's box
over the room to its outer faces, so the rain stops under it ([[Weather]], "Shelter"), the outdoor steps, each wing
too low to enter whole, each building not walked into whole, each plinth, set piece, great work, rock and wall by the
ways, and each prop too tall to step over. What lies wholly past the section (at the cliffs' feet, on their tops) is
never reached and is no box: a piece is kept by its middle in the section or a cell of it, or, for one wider than 8 m,
by any corner. What a body meets keeps to what is drawn ([[What a Body Meets Keeps to What Is Drawn]]): no box stands
more than 0.45 m off what it boxes (`city::hug`), nor leaves more than that of it out, but for a tilted solid as
below. A prop is the parts its drawn shape fills ([[Forged Models]], "Parts"), each within a 0.25 m column of its
mesh; a turned prop is in strips within 0.2 m of its parts, so its edges stand no further past what is drawn than a
solid's. A gate's arch has its parts taken down to its foot so the opening under its bar stays shut. A solid is cut
into parts of its own frame: an arch its two jambs and its head over the crown of its opening, so a body walks under
it; a column, a dome, a pyramid and a gable in layers that narrow as it does, a wide round in crossed boxes inside it,
each kept to the faces the page draws (a round's polygon, a dome's rings). A part turned off the world's axes is
boxed in strips across the world, each the box of the part within it, as wide as keeps it within 0.45 m; one leaning
or rolled, however far (a mill's sails turn past a half-turn), is halved until each half's box keeps as close, but a
solid tilted so little none of it moves 0.45 m is boxed as if upright, standing off it as far again as its tilt
moves it, and a piece of 2 m or less is not halved for its tilt alone, standing off it as far as its tilt throws its
box out. A box's underside is its own, so a body walks under a viaduct's deck and a lintel.

What a solid or a turned prop may cost is held, as the owner approved ([[The Meadow Art Is the Owner's, Its Tables Stay in Git, and the Grass Takes the Trees' Rain]]; `city::collision::kept`,
`layout::collide::prop_kept`): at most 64
of its boxes over a 2 m square of ground, on a grid laid from its north-west corner (2 m is the finest cell of the
movement rules' grid, every box of which a tick tests), and at most a box a square metre of its footprint, never
fewer than 256. A solid's layers come first, as they take the fewest boxes; where they stack too thick over the
ground, the same layers are laid as terraces, each boxed only where no layer over it stands, up from the foot, which
holds the same and stands no further off. One that still costs more is boxed with its keep a quarter looser at a time
until it fits (and halving that stops short of its keep costs more), never leaving more than 0.45 m of it out. Over every landmass 268,489 of 270,438 solids are boxed unloosened, and 11,659 of 12,016 laid props; on continent
1's zones the loosened are small tilted stones and domes to within 0.56 to 1.1 m, the mills' two roofs 0.7 m, the
Saltgrass Downs' wide dome 1.7 m, and the beached ships' strips 0.6 to 1.2 m; the cities' leaning spires are to
within 13 m at most, nine in ten of their tilted columns unloosened. Continent 1's zones hold 86,909 boxes, every
landmass's zones and cities 1,433,893, a city boxed natively in 0.05 to 0.3 s (tested offline). Boxes are written to the centimetre, grown out so none shrinks. No box of a solid, prop or building stands across a way's walked width under head height on continent 1 (`crates/room/tests/layouts_laid.rs`). A
body walks in at every ground-floor door of the Saltgrass Downs' buildings, and up to every upper floor, as the bake
lays them (`crates/room/tests/rooms_walked.rs`).

## Heights

Where the brief asks for `heights`, each area's floor stands at a level by its kind, as a share of the massif's
height: the land's own for what meets the sea, a river or a gorge out, and for what lies sunk (a landing, a gate, a
dock, a wreck, a mill, a quarry, a graveyard, a coven, a cave); the wilds and an arena 0.2, a farm 0.25, a hamlet 0.35,
a camp 0.4, a ruin 0.45, a shrine 0.55, a tower and a lighthouse 0.6, a keep 0.7. Then every point of every way
(`heights`): a point on an area's floor holds that area's level; every other holds the lower of its way's two areas'
levels, raised wherever a higher point lies near enough along the ways that the way would climb steeper than 0.14
from it, and lowered likewise toward a lower place's floor; points of different ways within 10 m count as one way,
each way graded on points no more than 5 m apart, so ways that cross or run side by side are always graded together.
So a place up high stands on its platform over the ways with a ramp up to it, a way between two places up high runs
along a causeway, one between two places down low keeps down, and no stretch of any way climbs steeper than a track
may, nor two ways side by side stand further apart than such a slope. A ruin's floor is tiered: its bowl a plaza at
its middle (0.55 of its reach at most), each of its spokes running on at the plaza's level to its edge, then a ramp up
0.1, up 0.2 or down 0.1 of the massif's height in turn at the steepest a track takes (less where the spoke is too
short for its ramp) onto a flat tier 4 m wider than the spoke, so a ruin lies on broken ground round a level plaza
and no building stands across a slope; a spoke a way runs through past the plaza keeps the plaza's level, so no way
crosses a tier's edge; the outcrops keep off its spokes and tiers. A hamlet's blocks step up its
hillside. Its lanes are 44 m wide, some up to 10 m wider, so a ramp fits between its blocks. Each block but the
lowest (by the ground its buildings were seated on) stands on a terrace over its tile and 5 m past it, 0.08 of the
massif's height above the block before it, laid as level strips across the tile. A ramp 9 m wide runs straight up
to it from the plaza, at a lower step where the lane is too short for its ramp. A block a way runs into, one holding
the plaza, one whose ramp would run along a way and one whose terrace would stand across a building stay on the
plaza's floor. No hamlet or ruin building on Saltmere stands on more than a metre of the massif's own roll, every
place stands at its brief's height, and every ruin's spoke is walked from its plaza onto its tier
(`crates/room/tests`). A way's points on a basin hold the level of the floor under them. What stands
where a raised floor's edge has wandered past its reach is lifted with it. A way between two areas whose reaches stand within 120 m of each other opens its
canyon to 0.7 of the smaller's reach along its length, so the two read as one large place at their two heights, not
two bowls and a lane. A raised area's floors and every stretch of way off the land's own
level are carved as the sculpt's raised floors ([[Land]]), each way's in stretches between its points kept wherever
it bends on the ground (3 m) or in height (0.25 m), so a way held flat across a low place, then ramped, keeps flat
there; a terrace stands its area's level higher, a ramp's foot at the level of the land under it; a lookout's climb
starts at its floor's share of the massif's height, and a pocket opens at its way's. What was stood on the land
before the carving is lifted onto it, and the great works stand on the land as carved. A retaining wall stands only where a cliff rises from the
floor: past a raised floor's edge the land may fall away instead. In each of Saltmere's zones every way and climb is
walked without a step a body cannot take, and none is carved steeper than a track climbs but up a basin's ramp
(`crates/room/tests/map_planned.rs`). The Vale stands its keep highest,
then its shrine, its hamlet and its farm, its mill, meadows and coven by the river.

With heights a shrine, a keep and every cavern stand handcrafted [[Modules]] in place of their blocks, set pieces
and dressing, and every river crossing a stone bridge in place of a timber one. A way's points within 2 m past a
crossing's banks stay at the land's own level, so the bridge stands on its banks.

### Ledges

With heights a layout cuts cliff stairs between its heights (`ledges`), last of what is carved, so they yield to its
runs and climbs. Out from the edges of its raised floors (its places and ways standing over the land's own level),
square to the world so the stair's parts stay square, a ledge runs through the rock to the first floor met that
stands lower. The rock between must hold the stair, lie at least 30 m inside the claim on dry land, and pass no other
floor's edge more closely than its slot's half and 2 m, 10 m from its ends.

Its slot, a raised floor 6.8 m wide at the low floor's level, runs from there to the high floor's edge. Where the
rock runs on past the stair, the slot is a cleft leading to its foot. The cliff stair ([[Modules]]) stands in it, its
top landing 3 m onto the high floor, past where the slot and the floor blend. The shortest are tried first, twelve at
most, each measured on the land with its slot cut: one is kept only where its stair climbs 3 to 24 m there, its slot's
floor runs from its start to the stair's foot without a step, and no land stands over the steps as they climb. Up to
three are cut, 60 m apart, each keeping every stair cut before it climbing and its slot off every run's line. The
stair's top landing (3 m, from the high floor's edge) stands at the highest the land does under it. The map joins each ledge's two nearest places by a `Stair`. In the Vale they climb from the
ways below Gullwing, Valeguard and the Old Stones straight up onto their floors.

With heights a gate stands in a cleft of the rock, a floor of 14 m reach where its way arrives and its gorge leaves,
and once the land is carved its palisade runs on from its last stakes, a stake every 1.1 m, until each side meets the
rock. A coven or a cave at the land's own level opens into a cavern (`caverns`): from the first of the four quarters
along which its floor gives onto rock well inside the claim and dry, a tunnel 12 to 36 m long and 12 m wide into a
hollow of 20 m reach, both cut into the rock at its level before the climbs, runs and dead rock are found; each roofed
with rock (a cave roof, [[Cities]]) 7 m over the hollow's floor and 5 m over the tunnel's, its edges resting 5 m on
the rock round it, which stands whole right beside a roofed floor ([[Land]]), and its top at the lowest that rock
stands round its edges, so no roof stands over the massif (1 m thick at the least);
the tunnel's roof starts 4 m in, where the cliff the
tunnel opens in stands whole, and a tunnel mouth of rock frames the opening at the floor. The
map takes the cavern as a roofed space joined to its area by a tunnel. In the Vale the Hollow Coven opens into one.
Every coven's and cave's area marks a foes' site at its middle, as every territory does, where its room stands a
group ([[Enemies]], "Territories and runs").

## The map

Each layout keeps a map (`spaces`) of the spaces a body stands in and the connections between them, read off what was
laid, for missions, events and raids to place their fights, checkpoints and bosses on. Its first spaces are its areas
in their order; then the lookout at each climb's top; then each run's beats. Each space has its middle and reach, its
floor's level as a share of the massif's height (0 the land's own level, 1 the massif's top), and whether it is
roofed: five of its middle and eight points half its reach out under a solid at least 1.8 m over the floor, so a
tower on an open area's middle does not roof it. A gate's space names the node it leads to. The connections are its
ways (each joining the two areas it was laid between), its climbs (from the area it climbs out of to the lookout), its
ledges' stairs (between the places nearest their two ends), its caverns' tunnels and its runs' passages (from the area
it breaks off into the first beat, then beat to beat, each along the run's line), each with its walked width and its
line; a way across standing in a run's end arena, from that end arena. On continent 1 every space is reached from the
first (`crates/room/tests/map_planned.rs`).

## Gates

A gate's basin and an instance's way in are passages ([[Game]]): standing in one, the player is offered "Enter" the
instance or "Return to" the patrol area (E), and goes through the veil to arrive at the other's way in or gate. A
gate the layout marks as crossing to another patrol area (its `crosses`, a way across at a run's end: on the Vale and
the Moors E at the run's sealed door, on the Downs at the second arch in its end arena) offers "Go to" it: E plays the
way between the two zones over the island, never the veil, framed on the two, while the room of that zone's way across
toward the one left is joined, then the walk in, the player standing a step inside its end arena facing the arena's
middle (`client/src/layout/passage.ts`, `client/src/game/gates.ts`, the flow's `cross`,
`client/src/game/passages/wayBetween.ts`, as the passages' ways play, [[Passages]]). A way
into a locked node ([[World Map]], "Seen whole, reached by nodes") is shut: it offers "<name> is locked", and E there
does nothing.

## In the browser

The game draws the layouts within 4 km of the eye with the city layer ([[Cities]]), gathered again once the eye has
moved 1.5 km: a plan of placed pieces (each building and prop where its layout stood it, a building walked into with
its doorways open) and solids (plinths, set pieces, great works, rock, rooms), on a grid of cells just large enough
to hold them, with no plates. Their lights are the city's ([[Cities]], `cityLights.ts`): a camp's, a watchtower's and
a brazier's fire burns on its coals and casts its light, a post's lantern and the lighthouse's lantern room glow
with their lamps, a sunstone breathes. Nature keeps off the buildings' yards, each place's open ground and the paths, and grows each
layout's plantings where they were planted, as its own kind (`plantedOf`).

The paths and a block's streets are the terrain's own ground ([[Game]], "The ground's pictures"): painted within
2.5 km of the eye (`paintOfLayouts`) as a distance from their edges, a metre a texel at finest, the paths and a
block's dirt in one channel, its paving in the next, and a third (only where a chalk layout is painted) holds that layout's claim, its wings and the 140 m fade band past them,
where its cliffs stand, up to any other layout's claim; the claim is filled a row at a time and measured by a distance
transform, so its cost is the texels, not the texels times its edges. A block's tiles are read by their records'
classes at their corners, as Daggerfall's tile map lays them, across each tile and the next, so a street has no seam
between its tiles and fades out across the first tile not laid. The terrain draws them in its dirt's and paving's
grain, their edges wandering as trodden ones do, a path paler in its middle and darker where the grass is worn into
it. The terrain lays carved cliffs in strata of rock, white in a chalk claim and only on its raised, steep ground, so
its floors keep their grass, and draws the land's carving as far as the layouts are drawn
(the middle ground, [[Game]]).

## In the World Editor

The editor's land worker opens a landmass with the same texts as the game's, so its ground is the game's to the bit,
carved, and its layouts are the game's. After each stroke, place change, undo or redo the worker settles the land and
plans the layouts again, and hands the page only their plans (`layoutMarksOf`): sections, areas, paths and sites,
about 0.2 MB for continent 1 against 12.6 MB of whole layouts. The 3D view draws the buildings, props and solids of
the layouts within 4 km of its camera with the city layer, as the game does; it asks the worker for those layouts
whole, by name (`layoutsNamed`), so the page parses only them ([[World Editor]]).

## Limits

- Only Saltmere's three zones have runs; the other 8 zones' briefs name none yet.
- Few mesas show their ledges: a second face needs a radius of 49 m, which only a wide basin's rim has room for, so
  most stand in one face under their flat top.
- No layout seats a temple to walk into yet, so a temple's benches and lectern have not been seen inside.
- Missions are single player with invites, but an instance's room is still a node's shared room: private instances
  wait on the server.
- After every change in the World Editor all of a landmass's layouts are planned again, not only those it touches:
  about 2.3 s natively for continent 1's ten on a cloud session's machine, and about 3.5 s for the land's worker's
  whole settle of continent 1 there (WebAssembly, measured under node). The layouts' streets are not painted on its ground.
