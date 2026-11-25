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
  - crates/passage/src/lib.rs#lamp_number
  - crates/passage/src/lib.rs#strength
  - crates/passage/src/lib.rs#cache_pay
  - crates/passage/src/zone.rs#Current
  - crates/gear/src/dive.rs#Dive
  - crates/gear/src/dive.rs#Haul
  - crates/gear/src/dive.rs#begin_dive
  - crates/gear/src/dive.rs#go_on
  - crates/gear/src/lamps.rs#pay_cache
  - crates/gear/src/lamps.rs#light_lamp
  - crates/gear/src/lamps.rs#keep_haul
  - crates/gear/src/lamps.rs#go_home
  - crates/gear/src/atheric_bounty.rs#Bounty
  - crates/gear/src/atheric_bounty.rs#roll_find
  - crates/gear/src/atheric_bounty.rs#toward_bounties
  - crates/gear/src/bounties.rs#PASSAGES
  - crates/gear/src/gate.rs#Place
  - content/gear/atheric_bounties.json
  - crates/room/src/passages.rs#passage
  - crates/room/src/passages.rs#open_mouths
  - crates/room/src/passages.rs#stand_bands
  - crates/room/src/passage_deal.rs#keep_passage
  - crates/room/src/passage_deal.rs#deal_done
  - crates/room/src/passage_asks.rs#ask_passage
  - crates/room/src/passage_asks.rs#passage_arrived
  - crates/room/src/passage_asks.rs#passage_seen
  - crates/room/src/run.rs#modded_blow
  - crates/bake/src/lib.rs#doors_of
  - crates/protocol/src/passage_wire.rs#passages_of
  - crates/protocol/src/passage_wire.rs#seen_offset
  - crates/room-wasm/src/passage_room_door.rs#open_passage
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
  point holds the depth reached there; a depth's zones 14 km apart across it. On Saltmere the spine runs under the
  Grey Reach, past the Driftwood Moors at depth 10, and ends under the Weirlands by the Gullwing Vale at 20.
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
  clear of torches, props, fixtures and landmarks; where a small dungeon cannot hold them so, they keep 6 m apart and
  12 m from the way in, then 4 m and 9 m, so every way on has its mouth. Its lamp stands in its greatest room, three cells or more each way.
- **Above ground**: a hollow 38, 55 or 75 m across, its floor's outline of its form (round, a winding ravine with
  rounded ends, terraced shelves, a squared court, a long strand, a grove) on a grid of heights 2 m apart, rolling a
  little and stepping down in shelves; its walls rise 12 to 25 m within 5 m of its edge, too steep for a body. It is
  dressed from the islands' kit of its climate: cliffs along its walls facing in, boulders at their feet, trees,
  shrubs and grass by its form, a court's ruins, a strand's wrecks. Its mouths stand a metre inside its edge, its
  section's ring half a metre inside it.
- **The pieces**: the way in, the onward mouths, the lamp (a plinth 1.6 m square in a ring of five standing stones
  3.5 m out), and what the deal stands on the spots farthest from the way in: three dead lamps for a Kindle, three
  tally posts for a Sever, six nodes for a vein, a reliquary.

## A dive

- **A dive is kept with the character** (`gear::dive::Dive`): its island and week, its route, the patrol zone's
  mouth it began at, the zone it is in and that zone's depth, whether the zone's deal was done while the player was in
  it, the deepest lamp lit, the zones whose caches it was paid, and its haul. An old save reads with none; a later
  build's keys are kept.
- **The haul** holds what is found in a passage zone: Vestiges picked up, items found as themselves, gathered
  resources, a cache's fragments, Vestiges left lying as the player goes on, and the cold lantern. While the player
  stands in a zone of their dive, the gear's own keeping (`pick_up`, `keep_found`, `gather`, `post`) sends each find
  there. XP and Aurem are paid at once.
- **A dive begins** at one of the patrol zone's mouths, the sealed doors of its runs, which the bake writes into the
  node file as `doors` (`bake::doors_of`): within 4 m of a door the page asks to begin, by its route, at the zone
  behind it, or at a lamp lit this week on that island (its lamp counted lit, the haul empty).
- **Going on** is asked within 4 m of an onward mouth, once the zone's deal was done while the player was in it, or
  at once from a Gauntlet; the dive is in the next zone from then, and the host moves the player there. Joining any
  room that is not the dive's zone ends the dive and loses its haul. A respawn asked for in a zone empties the haul
  and stands the player at its arrival; a revive loses nothing.

## A zone's room

- **`Room::passage`** lays the room from its plan: the dungeon's floor and rectangle, or the hollow's heights and
  ring, its spawn at the arrival facing in, the hollow's dressing and every piece's solids as blocks, its navmesh, its
  place for the gates (`Place::Passage`, gated as a patrol zone is) and its island. Drops come from the dungeons'
  content under ground, the world's above it.
- **Its foes** are the Grey Tithe's bands on the sites' posts at the island's band raised by depth
  (`passage::levels`): two to four Minors and Majors, led by an Elite in one band in three from depth 6 and in every
  band from depth 11. A lamp's guard is an Elite band at the first lamp, a Miniboss and an Elite band at the second and
  third, a Miniboss and two Elite bands at the fourth. A vault stands a dungeon's garrison with its Miniboss in the end
  room, and no cache chest of its own: its cache is the passage's. A guard never stands again by itself.
- **The week's two modifiers** are the zone's run's, weighing the runs' hooks (`run.rs`); **the zone's currents**
  weigh them too at the depth's strength: Kindled and Sharpened a blow, Shielded the share shielded, Frail a heal, Spent
  a recharge, Hardened every foe's health, Crowded and Veteran each band, Gloom a darkness while the deal runs (no
  respawn, only a revive, and a company all down falls back to the arrival, its hauls lost), Bountiful more Vestiges from a kill, Rich
  Seam one more from a node.

## The deal

| Deal | Done when |
|---|---|
| Skirmish, vault, reliquary, lamp | Its guard is down (a reliquary's chest opens itself) |
| Vein | Its guard is down; its six nodes are gathered as a patrol's, into the haul |
| Kindle | Its three dead lamps are lit, E held 3 s at each within 3 m; a wave comes every 20 s meanwhile |
| Hold | Its ring (6 m round its first spot) is held 90 s by a living player; a wave every 20 s |
| Hunt | The marked band, an Elite leading it on a round of the spots, is down |
| Reckoning | Its three collectors are down; each, once a player comes within 12 m, runs to the spot farthest from them |
| Gauntlet | A player reaches the farthest onward mouth; past 90 s from each one's own arrival it is late, and pays no cache |
| Ambush | Its three waves are beaten, each called as the last is down; its mouths are barred until then |
| Sever | Its three tally posts, foes standing still at their pieces, are down; each is guarded |

A wave is two to four of the bands' foes standing at the post or spot nearest a player but 12 m from every one, each
hunting the nearest player. Done, the deal has it done for the dive of each player in the zone, opening their mouths,
and pays its cache, once a dive, to those who took part: who brought down one of its foes, lit a dead lamp, held the
ring or reached the far mouth. In a public room it begins again 60 s on, its guards and targets standing again; a player who came after
it was done goes on once that round is done. A company's room does not begin again, and a member who comes after it
was done finds it done.

## Rewards

- **A cache** is paid at the zone's level and depth (`Character::pay_cache`): its XP and Aurem times `pay_times` (1 at
  the first depth to 1.25 at the twentieth), its chances of finds times `find_times` (1 to 2); its finds go into the
  haul. At level 5: a skirmish 1,400 XP and 105 Aurem and a Vestige one time in three; a mission 1,800 and 135 and a
  Vestige one time in two; a vault 2,800 and 210, its Miniboss's item and a Vestige one time in three; a vein 700 and
  52, its six nodes and two fragments; a reliquary 700 and 52, a sure Vestige and two to five fragments; a lamp 2,800
  and 210 and a sure Vestige. A zone holds some eighteen foes and takes one player about ten minutes, so its cache
  stands in for a patrol zone's public events and keeps the passages inside the band ([[Activities]], "The band").
- **A lamp lit** (E held 2 s within 3 m of its plinth, once its guard is down, each player for themselves) keeps the
  haul: items as found, Vestiges carried or to the vault or the mail, materials added. The day's first lamp lit on an
  island pays a dungeon of the day's clear and a sure Vestige in a Boss's colours; the first time each week each lamp
  of an island is lit pays its week's lamp, a sure Vestige in a Boss's colours, from the second one Essence of each
  stock, from the third two, and at the fourth a roll as the week's Abyss Dungeon's first clear. Each is kept on
  `Today` and `ThisWeek` by island, begun anew as they are. **Going home** from a lit lamp keeps what was found since
  and ends the dive.
- **The passages' bounties** are the board's fourth pool, two a day (`bounties::PASSAGES`), counting a lamp lit, a
  mission finished, a foe brought down in a passage, a zone reached at least 8 deep, a reliquary opened and a vein's
  every node gathered.
- **Lanternfall** comes only from the first Atheric bounty, its data in `content/gear/atheric_bounties.json`: the
  cold lantern drops into the haul from a cache past depth 14, 3 times in a hundred, or from the fourth lamp's, 12, for a
  character of level 20 or more on Saltmere who holds none and has not finished its bounty. Kept at a lamp, the bounty
  is held and its first step done; then five Kindle missions finished on Saltmere, 100 foes brought down there with a thunderlock, and
  the fourth lamp lit; the last step done, Lanternfall is kept as found. No Vestige or Shape gives it.

## On the wire

The gear carries the dive and its haul, each island's lamps lit this week and its day's lamp, and the Atheric
bounties held and finished; the snapshot the zone's deal as it stands for the player (`PassageSeen`): its key, done,
the dead lamps lit and targets down, the ring's share held, the seconds left, the waves, whether the mouths are open
and the lamp lit for the player, and their hold under way. The asks are numbered 81 to 85 (`passage_wire`). A page or
the host opens a zone's room with `open_passage` (the island, the week, the zone, the route and the minute); once the
clock's week is past the web's, the room refuses players: "The passage has shifted".

## In the browser

room-wasm's passage door hands a page a week's web (`web_json`), a zone laid whole (`zone_plan_json`, under ground
the Forge's layout as a dungeon's is handed over) and a hollow's heights, built by the same crate. A zone's room, its deal and the dive are opened as **On the wire** above says.
