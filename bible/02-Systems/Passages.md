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
  - crates/room/src/passages.rs#passage_ground
  - crates/room-wasm/src/fighter_door.rs#set_passage
  - client/src/game/dungeonDressing.ts#passagePiecesLaid
  - client/src/rules/passageRules.ts#startPassageDoor
  - client/src/network/passageMessages.ts#passagesOf
  - client/src/network/passageMessages.ts#passageSeenOf
  - client/src/network/passageRoomDoor.ts#passageAsk
  - server/roomNames.ts#passageRoomName
  - client/src/game/passages/passageEnter.ts#joinPassage
  - client/src/game/passages/passageGame.ts#PassageGame
  - client/src/game/passages/passageEnter.ts#enterZone
  - client/src/game/passages/passageReach.ts#mouthAt
  - client/src/game/passages/passageHeard.ts#passageWordOf
  - client/src/game/passages/passageZone.ts#zoneIsle
  - client/src/game/passages/passageZone.ts#withPieces
  - client/src/game/passages/passagePieces.ts#pieceMesh
  - client/src/game/passages/pieceView.ts#piecesDrawer
  - client/src/game/passages/passageWay.ts#wayAt
  - client/src/game/passages/wayBetween.ts#WayBetween
  - client/src/game/passages/passageMap.ts#passageSheet
  - client/src/game/passages/passageWords.ts#dealTracker
  - client/src/game/passages/passagePanels.ts#MouthsCardView
  - client/src/game/passages/athericBounty.ts#athericCards
  - client/src/game/passages/passageShots.ts#zoneShot
  - server/roomNames.ts#passageRoom
  - server/arrival.ts#arrives
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
  and turns the dive homeward: no way on takes it further, and what is found on the way out goes into its haul. Its
  patrol zone's room, as it takes the kept character, keeps that haul, ends the dive and stands the player 2 m before
  the mouth the dive began at, toward its run's end arena, facing away from the door (`leave_passages`,
  `stand_before_mouth`). Any other room the character joins ends the dive and loses its haul.
- **The passages' bounties** are the board's fourth pool, two a day (`bounties::PASSAGES`), counting a lamp lit, a
  mission finished, a foe brought down in a passage, a zone reached at least 8 deep, a reliquary opened and a vein's
  every node gathered. They are the town's, at places 15 and 16 after the factions' 6 to 14 (`PASSAGE_PLACES_FROM`,
  `town_places`), so the town's six keep 0 to 5; the day's record keeps them under the town's keys (`is_town_place`).
- **Lanternfall** comes only from the first Atheric bounty, its data in `content/gear/atheric_bounties.json`: the
  cold lantern drops into the haul from a cache past depth 14, 3 times in a hundred, or from the fourth lamp's, 12, for a
  character of level 20 or more on Saltmere who holds none and has not finished its bounty. Kept at a lamp, the bounty
  is held and its first step done; then five Kindle missions finished on Saltmere, 100 foes brought down there with a thunderlock, and
  the fourth lamp lit; the last step done, Lanternfall is kept as found. No Vestige or Shape gives it.

## On the wire

The gear carries the dive (homeward or not) and its haul, each island's lamps lit this week and its day's lamp, and
the Atheric bounties held and finished; the snapshot the zone's deal as it stands for the player (`PassageSeen`): its key, done,
the dead lamps lit and targets down, the ring's share held, the seconds left, the waves, whether the mouths are open
and the lamp lit for the player, and their hold under way. The asks are numbered 82 to 86 (`passage_wire`), after
the open-find ask's 81. A page or the host opens a zone's room with `open_passage` (the island, the week, the zone,
the route and the minute); once the
clock's week is past the web's, the room refuses players: "The passage has shifted".

## On the server

- **A zone's room** is named `passage-<island>-w<week>-z<zone>` for its first public room, `--2`, `--3` after it for
  the next when one is full (eight accounts), and `--run-<instance>` for a company's route ([[Server]], "A passage
  zone's room"). It opens from its name with `open_passage`, this week's web or last week's, the last refusing players.
- **Arrivals** are judged by the dive the accounts keep with the character: into a zone from the patrol zone at the
  dive's mouth or a lamp lit this week, from a zone whose ways on lead to it, or back into its own room; out of a
  lamp's zone, its lamp lit, to the patrol zone.
- **The dive is saved** the moment it moves, so the next zone's room reads it.

## In the browser

### Reading the rules

room-wasm's passage door (`startPassageDoor`, in an instance of the room module of its own) hands a page a week's web
(`room_passage_web`), a zone laid whole (`room_passage_zone`, under ground the Forge's layout as a dungeon's is handed
over) and a hollow's heights (`room_passage_heights`), built by the same crate; each is read whole and refused, saying
why, where it does not read. An island with no passages, a zone the web lacks or a style the Forge does not lay yet
answers empty, read as none. The gear's dive, haul, lamps and Atheric bounties (`passagesOf`) and the snapshot's
`PassageSeen` (`passageSeenOf`) are read as the page reads the rest of the gear and the snapshot; the asks 82 to 86 go
as its other asks do, and a refusal is said in the room's words (171 to 178).

### Played

- **At a mouth**: E within 4 m of a run's sealed door in the patrol zone ("Into the passages", the layout's runs'
  doors matched by name to the web's mouths) opens the mouths' card (`MouthsCardView`): the run's name; the zone
  beyond (its name, depth, deal and currents) and the week's modifiers; the routes ("The public passage", and "Your
  company's route" in a company, else "Your own route, alone"); Go in (E), "Begin at the second lamp" for each lamp lit
  this week, and Close (Esc). A choice asks to begin, by the mouth's place, its route and the lamp.
- **The room's yes**: an ask of the passages is yes once the dive has moved (begun, gone on to another zone, or for
  a lamp's Home turned homeward, as the gear carries it); it plays the way between zones while the room gone to is
  joined. A passage refusal is said in a toast, as is no answer in 10 s; other asks answered meanwhile, done or not,
  are not taken for it.
- **A zone's room**: the server's by its name (`passageRoomName`, spelled as the server spells it): the first public
  room, the next copy (`--2`, `--3`) when one says "This passage is full.", or a company's route's own, a member's
  room found as runs are; or, playing alone, the same room in the rooms' worker opened from its ask (`open_passage`'s
  JSON), the character the last room let go of given to it so the dive goes on. Under ground the zone is a dungeon to
  the page, its layout drawn by the dungeon's renderer; above ground its hollow is an island to the islands' layer
  (`zoneIsle`, by an id no sea island has), stood on as a sea island's beach, and drawn alone: no land of the island
  round it, and none of the sea's islands. Under ground its way in offers no Leave. Either way the
  body is predicted on the zone's own ground from the same ask (`fighter_passage`, `set_passage`): the ground and
  blocks its room stands bodies on (`passage_ground`), under ground the Forge's floor and the pieces' solids, above
  ground the hollow's heights, its dressing's blocks and the pieces' solids.
- **Home**: the lamp's Home turns the dive homeward; the page joins the patrol zone's room as ever, and the way comes
  down to where the room stands the player, 2 m before the mouth the dive began at and facing away from it, once its
  first snapshot of the body has come.
- **In a zone**: the deal stands in the tracker (`dealTracker`: "Light the dead lamps 1/3", a hold's clock, then "Go on
  through an open mouth"); near an onward mouth its sign shows the zone beyond and, shut, "Shut until this place's work
  is done."; E there goes on through it once open. E held at the lamp lights it, its prompt ringed as the room counts
  the hold; once lit E there is Home. E held at a dead lamp kindles it. E let go ends a hold, as a gather's. The haul
  stands on the right while anything is carried, with "Carried, not kept. Fall or leave, and it is lost."; the leave
  held adds "What you carry is lost"; a respawn that empties it says "What you carried is lost."
- **The pieces** stand as the deal stands for the player (`PieceState`): a mouth open or shut, the lamp and the dead
  lamps lit (gold) or cold (grey), a tally post whole or broken, the reliquary shut or opened. Above ground they are
  the islands' kit's `passage` modules, placed in the hollow (`withPieces`), and only the lamps' lights are drawn over
  them as boxes. Under ground they are the dungeon pack `passage`'s modules (`passagePiecesLaid`), laid at each
  piece's foot turned to its facing, in the pictures of the cell it stands on, into a mesh of the dungeon's own made
  again as the deal's state changes; a lamp's and a dead lamp's `glow` part is lit, or the cell's stone while cold.
  While the pack is coming, or if it fails, they are plain boxes to their solids' sizes (`pieceMesh`).

### The way between zones

`wayOf` lays the way's rails and `wayAt` plays it, on the cinema's rails ([[Cinema]]), kept under way by
`WayBetween`, which a crossing gate between two patrol zones plays too ([[Layouts]], "Gates"); in the flow ([[Game]], "The
flow") a mouth, a begin or a Home is `passing`, drawn over the island from the way's camera with the web's places and
the way's dots over it; from the way down the place gone to is drawn as on foot, the player's inputs held, and the
flow is on foot again once the way has played. A zone's own frame stands at its place on the island, so the camera
comes down from over the island without a jump.

| Beat | Seconds | What is seen |
|---|---|---|
| Rise | 1.5 | From where the foot's camera last stood up to the island seen whole, framed as an island's side is framed from the ship (`frameSide`), every zone of the web inside the picture |
| Draw | 2 | The way so far (the patrol zone and each zone passed this dive) shown, and the way being taken drawn a dot at a time, 10 a leg, to the next zone's place |
| Wait | until ready | Held over the island while the room gone to is not ready (`wayClock`); once it is joined, 20 s at most (`READY_WAIT_S`, as the veil waits) for its body, then down to where the character stands |
| Down | 1.5 | Down to 3 m short of behind where the room stood the character, in the place's own frame |
| Walk | 1.5 | The camera comes the last 3 m in to the character, settling into the foot's own (`settledShot`) |

### The passages' map

Held in a passage zone, under ground or above, the held map shows the web as a land sheet (`passageSheet`,
[[Held Map]], "On land") in place of the land's: every zone a mark at its place by its deal's glyph, its lamp named,
its currents under it, the patrol zone by its name, the way come this dive a track and the ways on footpaths, "You"
at the player's zone.

### The Journal and the board

The board's fourth pool is the passages', two a day, shown in the town's row after its six ([[Activities]], "Bounties"):
each wears the town's writ as every town bounty does, its card "Passage bounty" by a lamp's mark. The
Journal's timers show each island's lamp of the day and its four lamps this week, gold once lit and grey while cold
([[Interface]], "Journal"). Lanternfall's bounty, held or finished, is a card of its own under the board's in the
Journal's bounties (`athericCards`): its name in the Atheric colour, the cold lantern and its words, then its steps,
each done with a tick, under way with its count, or still to come.

### Pictures

`passageShots.ts`, which the game never imports, draws a zone of each kind with the game's own drawers onto a texture
of its own (above ground under a plain sky, under ground in the dungeon's dark), the way's dots, the map, the mouths'
card, the panels and Lanternfall's card.

## Limits

- In a hollow the sea of the open landmass's view still lies round it at 0 m, under its rim, and the sky and the
  shadows take the climate of the landmass open.
- Under ground an onward mouth open and one shut differ little at a distance: the pack's open mouth is backed by
  rough rock, close in tone to the shut slab.
