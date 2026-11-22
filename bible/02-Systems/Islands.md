---
type: system
status: live
code:
  - crates/isle/src/lib.rs#Plan
  - crates/isle/src/shape.rs#Shape
  - crates/isle/src/coast.rs#Coast
  - crates/isle/src/sites.rs#Sites
  - crates/isle/src/dressing.rs#dress
  - crates/isle/src/catalog.rs#catalog
  - crates/room/src/sea_islands.rs#Islands
  - crates/room/src/island.rs#island
  - crates/room-wasm/src/isle_door.rs#plan_json
  - server/roomNames.ts#isleRoom
  - client/src/game/isleLaw.ts#detour
  - client/src/game/isles.ts#Isles
  - client/src/game/isleVisit.ts#ashoreOn
  - content/islands/kits.json
---
# Islands

The sea's procedural islands ([[Procedural Islands Are Coves, With Rarer Guarded Isles]],
[[The Ship's Power, Crew and Islands as Claude Shapes Them]]): rolled by the sea room in hostile waters, each a place
and a seed that every machine builds the same island from, landed on as a continent's node is, its wreckage
scavenged for the ship and its door leading to a dungeon. The modules that dress them are made in Blender
([[Island Modules]]) and drawn by the islands layer ([[Island Drawing]]).

## An island from its seed

The `isle` crate builds an island from its seed and its water's climate, the same bits on every machine
([[Agree to the Bit]]): integer draws (SplitMix64), value noise, + − × ÷, square roots and libm's sines and
arctangents. Its frame is its own: metres from its middle, x east, y south.

- **Its kind.** One seed in eight makes an isle, half of them a ruin and half a quarry; the rest are coves. The
  dungeon behind its door follows: caverns in a cove, a crypt in a ruin, mines in a quarry.
- **Its shape.** A reach drawn first (66 to 90 m for a cove, about 150 m across; 150 to 250 m for an isle, 300 to
  500 m across), and a coast round it: four ripples of its radius, a bay bitten in on the bearing it is landed on
  (deep in a cove), and a headland jutting either side of the bay, so a cove's beach lies between two arms of land.
- **Its ground**, a grid of heights 2 m apart (the continents' 1 km cells are far too coarse), reaching 60 m past its
  coast. Its height comes from how far in from the coast a point lies, an exact Euclidean distance transform over the
  grid (Felzenszwalb and Huttenlocher's) with the radial measure taken within a few metres of the coast, so beach,
  rise and seabed follow the real coast round the bay without a crease. A beach 1.2 m high, 4 to 24 m wide, widest
  toward the landing's strand; a hill whose top stands toward the far side, 7 to 14 m in a cove and 18 to 34 m on an
  isle, by the climate's relief; cliffs on the far side by the climate's share of cliff, rising from the sea to about
  half the hill within 6% of the radius; the seabed shelving gently off the beach and steeply elsewhere, to 14 m down.
  A quarry is cut in three terraces; the door's front, the landmark and the camp stand on levelled pads.
- **Its places** (`sites`): three spawns on the beach facing inland; the anchorage 45 m out past the coast on the
  landing's bearing; the door (a cove's set into the hillside to one side of the beach, a ruin's 16 to 22 m from its
  landmark, a quarry's in its pit's wall); an isle's landmark (a ruined tower or temple on a pad at its top, or a
  derrick at its quarry's rim), its camp 28 m from it (a quarry's on its rim, its pad clear of the pit), and its
  guards' posts, one for each group: by the landmark, at the door and at the camp;
  and two or three wrecks on a cove's strand, three to five on an isle's, apart from each other and the landing.
- **Its section** is its coast on 64 bearings, 14 m out into the shallows.
- **Its dressing** (`dressing`), from content/islands/kits.json: cliff faces every 8.5 m along its cliffs, raised to
  the land above them, and now and then a sea stack off them; rocks along the coast that is neither cliff nor beach,
  driftwood on the beach; boulders and outcrops; trees in clumps where noise runs high; shrubs and grass; a ruin's
  columns, walls, arches, fallen drums and statues in a ring 20 to 42 m round its landmark (a cove now and then keeps
  two or three ruin pieces of its own); each wreck's hull lying along the strand with two to four of its cargo spilt
  inland of it; an isle's camp. Each climate dresses from its own kit and trees (the contract's `climates`): a tundra
  isle's spruces and snow-capped slate, a desert's date palms and banded sandstone. The door, the landmark, the wrecks'
  hulls and cargo and the camp are set first, on their places; every module laid after them stands wholly off the
  places kept clear (the spawns, a lane from them to the door, the door's front, the landmark, the camp and the wrecks)
  and at least half its own and each neighbour's reach from every other, so a cliff breaks where a wreck lies under it.
  Each module's solids, discs as tall as it, stand as blocks a body cannot walk through. In the game its trees, shrubs
  and grass are drawn as its climate's own plants where they stand ([[Island Drawing]]).

## At sea

The sea room holds its islands (`sea_islands.rs`):

- **Rolled** every ten seconds round each ship at sea that has fewer than two islands within 8 km, three times in ten:
  3 to 7 km from it, in hostile water (never in home waters), 3 km clear of every coast and every other island, 1.2 km
  clear of every ship and hostile ship, and clear of every ship's course by its reach and 300 m. At most 96 stand.
  An island in a climate the contract does not dress is not rolled.
- **Seen and found.** Each player is told of the islands within 20 km of their ship and of those they have found;
  a ship within 2 km of one finds it. The [[Held Map]] marks the found ones while they stand.
- **Held and faded.** A ship within 8 km holds an island; so does its room while players stand ashore, telling the
  sea each minute. One held by nothing for ten minutes fades, and is forgotten by those who found it.
- **Land.** A standing island's coast, 34 m out past it (its shallows' 14 m and 20 m more), is land to the player told
  of it: a course that crosses an island in sight of the ship, or one they found, is refused, as the page bends its
  voyages round those alone; and the hostile ships' chart keeps them off every one. A ship a fight or a roll left within
  an island's land is not held by it: it sails out.
- **Whose guards**: the Grey Tithe's, in every water but home.
- **Washing up.** A player who loses a fight washes up at the nearest port city, or at the nearest island they have
  found that still stands where that is nearer: their ship lies at its anchorage with a sunk ship's hurts, unrepaired
  (only a port city repairs), and once the fight's view has panned home they walk ashore on its beach.

## Ashore

- **The room.** An island's room is `isle-<number>-<seed>` (its seed in 16 hex digits, so an island rolled after the
  sea restarts never opens an older one's room). It opens only on the sea's word: the server's room asks the `sea`
  room for the island by its number, and opens it if it stands with that seed ([[Server]]); while players stand ashore
  it holds that island, by its number and seed, each minute, until the sea says it no longer stands. Its ground and blocks
  stand in the world's metres, the island's own moved to its place, as a node's do, so the page predicts the player on
  the room's own ground to the bit.
- **Guards.** An isle stands three groups of the Grey Tithe's foes at its water's levels: one led by a Reeve at its
  Elite rank at the landmark, a band at the door and two to four at the camp, on a navmesh baked over
  their posts. A cove holds none.
- **Landing.** The sea lands an account on an island while its ship lies at rest within 40 m of the island's
  anchorage (the page anchors within 30 m), and keeps it landed while the player stands ashore, until its ship is at
  sea and under way or elsewhere, or the island fades. The server's island room checks it: as an account joins, the
  room asks its sea, and lets go of one the sea says is not landed there; only a landed account scavenges. A player of
  no account scavenges nothing there.
- **Wreckage.** A landed player within 4 m of a wreck's heap scavenges it once. Their character keeps the wrecks they
  scavenged by each island's seed (the latest 16 islands), so neither a rejoin nor the island's room opened again pays
  them twice, and every character has its own lot. Its salvage is the ship's own law ([[Ship Power]],
  `gear::ship::found`): a cove's wreck two common ship materials (Timber, Canvas or Iron) of one to three each,
  Heartwood 5 times in a hundred and a module 8 (less than a Minor ship's whole lot, as the owner chose); an isle's
  three of three to six, Heartwood 15 times in a hundred and a module one time in five; each chance raised by the
  room's tier. It is rolled at the middle of the island's water's band raised by the room's seas, and paid
  straight into the player's ship materials, a module carried as any item. The wrecks spent for them are told them in
  their gear's `scavenged`, so the page offers them no more.
- **Resource nodes.** Each island carries the resource of the island whose waters it lies in ([[Gear]], [[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]): two to four
  nodes inland, a third to three fifths of the way from its middle to its coast on gentle shores, 20 m apart and 15 m
  from every other place, laid on a draw of their own and kept clear by the dressing. Its room stands them all at once;
  each is gathered by holding E as a patrol's is, by a player landed there, once by each character a day: it stays
  spent for them, landing again or in another room of the island, until the day turns at 09:00 UTC (the day's record,
  `gather_on`, [[The Audit's Leftovers Are Fixed as Claude Suggested]]). They are drawn as the resource's picture
  alone, with no place built round them.
- **The door** stands where the dungeon of its style is entered: E there gives the dungeons' trip its room,
  `sea-dungeon-<continent>-<style>-<the island's seed folded to 32 bits, 8 hex digits>` and the sea's tier
  (`--elite`, `--abyss`), and the door's place in the world and the bearing its front faces (`isleLaw.ts`,
  `DungeonDoor`), and the trip goes in (`enterSeaDungeon`): shared at Normal, a run at Elite or Abyss ([[Game]], "A
  sea island's dungeon"). Its room opens only behind the door of an island the sea holds, for accounts the sea has
  landed there ([[Server]], "The sea"; [[The Server Is the Authority Over Everything]]). Leaving it, the player goes back to the sea at their ship.

## On the page

- The sea snapshot carries the islands the player is told of; the page builds each once through the room module, one
  at a time in a worker of its own (`islePlanWorker.ts`), so a build never holds up a frame (`isles.ts`, by its
  number and seed, let go of once the room tells of it no more), and every
  voyage's legs are bent round each island in sight, since the route planner's grid is far coarser than an island
  (`isleLaw.ts`, `detour`); a leg for a point within an island's keeping (its anchorage) comes in along the line out
  from its middle through that point. An island come into sight bends the voyage still ahead round it.
- Within 700 m past an island's coast the ship is offered to go ashore on it ("Go ashore on a cove"); taken, the ship sails
  out to the island's offing on its landing's bearing, round it where it must, and in to its anchorage, and once it lies
  there, once nothing else is under way (the map put away, the deck left, no fight), the player walks ashore on its
  beach behind the veil ("Going ashore on a cove"). Steered, sent elsewhere or chasing, the ship gives the landing
  up. The sea is left only once the island's room has opened: one that does not leaves the player aboard, told so,
  and online the sea room is joined again, as the island's room may have taken the character from it.
  The menu's Return to ship takes them back aboard, where the ship lies.
- On foot E scavenges a wreck within 3 m not spent for them ("Scavenge the wreck") and tries the door ("Enter the
  caverns").

## Limits

- A fight at sea is fought on waters made from the continents' coasts: an island near a fight is not in it.
- The breakers and foam of the [[Water]] follow the land's coasts, not an island's.
- What a player has found is kept by the sea room while they are in it; a player who leaves the sea and joins it
  again finds its islands again as they sail near.
- Playing alone, the sea in the game's worker is a new one each time it opens, so its islands are too.
