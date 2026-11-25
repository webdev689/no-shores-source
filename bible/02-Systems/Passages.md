---
type: system
status: live
code:
  - crates/passage/src/web.rs#Web
  - crates/passage/src/zone.rs#Zone
  - crates/passage/src/island.rs#Island
  - crates/passage/src/plan.rs#Plan
  - crates/passage/src/under.rs#lay
  - crates/passage/src/hollow.rs#Hollow
  - crates/passage/src/lib.rs#levels
  - crates/gear/src/passages.rs#week_modifiers
  - crates/room-wasm/src/passage_door.rs#web_json
  - crates/room-wasm/src/passage_door.rs#zone_plan_json
  - content/passages/saltmere.json
---
# Passages

The passages lead out of an island's patrol zone, through the sealed doors at the ends of its runs, into a web of
small zones across the island, twenty deep ([[Passages Web Out From the Patrol Zone Across Its Island]],
[[Passages as Claude Builds Them]]). Only Saltmere has them: from the Saltgrass Downs.

## The web

- **Drawn from the island and the week alone** (`Web::of`), so the server and every browser lay the same web; it
  turns each Tuesday at 09:00 UTC with the week.
- **Depths**: three zones at the first, one behind each mouth (the Chalk Adit's, the Beacon Stair's and the Tithe
  Barns' doors, in `content/passages/saltmere.json`), then three or four at each depth to the twentieth.
- **Where zones lie**: along the island's spine, a line on its land from the patrol zone to its far side whose every
  point holds the depth reached there; a depth's zones 14 km apart across it. On Saltmere the spine passes the Moors'
  places at depth 10 and ends at the Vale's at 20.
- **Landmark zones**: the Moors' and the Vale's places stand as zones at their own depths and places, dressed after
  them; the week shows its anchors (Grey Point Light at 10, the Old Stones at 20) and one or two of the rest at each
  of their depths.
- **The ways on**: each zone leads on to one to three zones of the next depth beside it across the spine, the nearest
  always; a zone left without a way in is given one from the nearest. Ways lead deeper only.
- **Each zone** is drawn its ground (under ground, a style by depth, chalk and barrow among them; above ground, a
  hollow of six forms), its size, its deal (a lamp at every fifth depth, else a skirmish, a mission of seven, a vault,
  a vein or a reliquary, by weight), its currents (none to three by depth, three in four a bane), its seed and a
  descriptive name. Its foes' band is the island's raised by depth (`levels`): on Saltmere 1 to 4 at depth 1, 27 to
  30 at depth 20.
- **The week's two modifiers** for an island's passages are drawn in gear (`week_modifiers`) from the runs' eight,
  two kinds, on their own stream.

## A zone laid whole

`Plan::of` lays a zone of a web: its ground, its sites in its own frame (where a body arrives and faces, the mouth
behind it, an onward mouth for each way on, the lamp, the foes' posts and spots spread over its floor) and the
passages' own pieces standing in it with their solids.

- **Under ground**: the Forge's dungeon in the zone's style, in one, two or three blocks by its size. Its way in is
  the mouth behind; its onward mouths stand on rock walls of its rooms, the end room's portal wall first, then the
  rooms farthest along the way, each in a room of its own where there are enough, 9 m apart and 16 m from the way in,
  clear of torches, props, fixtures and landmarks. Its lamp stands in its greatest room, three cells or more each way.
- **Above ground**: a hollow 38, 55 or 75 m across, its floor's outline of its form (round, a winding ravine with
  rounded ends, terraced shelves, a squared court, a long strand, a grove) on a grid of heights 2 m apart, rolling a
  little and stepping down in shelves; its walls rise 12 to 25 m within 5 m of its edge, too steep for a body. It is
  dressed from the islands' kit of its climate: cliffs along its walls facing in, boulders at their feet, trees,
  shrubs and grass by its form, a court's ruins, a strand's wrecks. Its mouths stand a metre inside its edge, its
  section's ring half a metre inside it.
- **The pieces**: the way in, the onward mouths, the lamp (a plinth 1.6 m square in a ring of five standing stones
  3.5 m out), and what the deal stands on the spots farthest from the way in: three dead lamps for a Kindle, three
  tally posts for a Sever, six nodes for a vein, a reliquary.

## In the browser

room-wasm's passage door hands a page a week's web (`web_json`), a zone laid whole (`zone_plan_json`, under ground
the Forge's layout as a dungeon's is handed over) and a hollow's heights, built by the same crate.
