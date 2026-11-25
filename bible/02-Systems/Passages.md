---
type: system
status: live
code:
  - crates/passage/src/lib.rs#levels
  - crates/passage/src/lib.rs#lamp_number
  - crates/passage/src/lib.rs#strength
  - crates/passage/src/lib.rs#cache_pay
  - crates/passage/src/web.rs#Web
  - crates/passage/src/plan.rs#Plan
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
  - crates/gear/src/passages.rs#week_modifiers
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
  - crates/room-wasm/src/passage_door.rs#web_json
  - crates/room-wasm/src/passage_room_door.rs#open_passage
---
# Passages

The passages web out from an island's patrol zone across the island, a dive twenty zones deep
([[Passages Web Out From the Patrol Zone Across Its Island]]). The calls are Claude's
([[Passages as Claude Builds Them]]).

## How it works

- **The web and its zones are the `passage` crate's.** `Web::of` draws an island's week's web from the island and
  the week alone; `Plan::of` lays a zone whole: its ground (the Forge's dungeon, or a hollow above ground), its sites
  and its pieces with their solids. The server and every page lay the same ones.
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

- **A cache** is paid at the zone's level and depth (`Character::pay_cache`): its XP and Aurem times `pay_times`, its
  chances of finds times `find_times`, as the design's table gives each deal; its finds go into the haul.
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
