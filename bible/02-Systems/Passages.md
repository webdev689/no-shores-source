---
type: system
status: live
code:
  - crates/passage/src/web.rs#Web
  - crates/passage/src/zone.rs#Zone
  - crates/passage/src/island.rs#Island
  - crates/passage/src/plan.rs#Plan
  - crates/passage/src/under.rs#layings
  - crates/passage/src/walk.rs#Walk
  - crates/passage/src/hollow.rs#Hollow
  - crates/passage/src/lib.rs#levels
  - crates/gear/src/passages.rs#week_modifiers
  - crates/room-wasm/src/passage_door.rs#web_json
  - crates/room-wasm/src/passage_door.rs#zone_plan_json
  - content/passages/saltmere.json
  - crates/passage/src/lib.rs#lamp_number
  - crates/passage/src/lib.rs#strength
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
  - crates/room/src/passage_foes.rs#stand_bands
  - crates/room/src/passage_foes.rs#zone_foes_most
  - crates/room/src/passage_holds.rs#keep_holds
  - crates/room/src/passage_deal.rs#keep_passage
  - crates/room/src/passage_deal.rs#deal_done
  - crates/room/src/passage_asks.rs#ask_passage
  - crates/room/src/passage_asks.rs#passage_arrived
  - crates/room/src/passage_asks.rs#passage_seen
  - crates/room/src/run.rs#modded_blow
  - crates/bake/src/sites.rs#doors_of
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
  - client/src/game/passages/passageWaypoint.ts#passageWaypoint
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
  point holds the depth reached there; a depth's zones 14 km apart across it, each in every week at least 2 km inside
  the island's coast as the world's layout draws it. On Saltmere the spine runs under the
  Grey Reach, past the Driftwood Moors at depth 10, and ends under the Weirlands by the Gullwing Vale at 20.
- **The ways on**: each zone leads on to one to three zones of the next depth beside it across the spine, the nearest
  always and two at least where two lie beside it, so a way is chosen at every depth but the last; a zone left
  without a way in is given one from the nearest. Ways lead deeper only.
- **The public way**: one zone a depth (`Zone::public`), from a zone of the first depth along one of each marked
  zone's ways on, where players in public rooms meet.
- **Each zone** is drawn its ground (under ground, a style by depth, chalk and barrow among them; above ground, a
  hollow of six forms), its size (small, medium or large, 40, 35 and 25 in a hundred to depth 10 and 15, 45 and 40
  past it, a lamp's zone and a vault medium at least), its deal (a lamp at every fifth depth, else a skirmish, a
  mission of seven, a vault, a vein or a reliquary, by weight; a vault only under ground, its draw above ground a
  mission), its currents (none to three by depth, three in four a
  bane, each one its deal takes, none saying again what the week's two modifiers do: `Current::fits`,
  `Current::restates`), its seed and its name (`names.rs`): under a place of the island's already named within 28 km
  (`content/passages/saltmere.json`'s places), "Under Grey Point Light"; else its ground's and its deal's, "A chalk
  cut held by the Tithe", no two zones of a web the same. Its foes' band is the island's raised by depth (`levels`):
  on Saltmere 1 to 4 at depth 1, 27 to 30 at depth 20.
- **The week's two modifiers** for an island's passages are drawn in gear (`week_modifiers`) from the runs' eight,
  two kinds, on their own stream.

## A zone laid whole

`Plan::of` lays a zone of a web: its ground, its sites in its own frame (where a body arrives and faces, the mouth
behind it, an onward mouth for each way on, the lamp, the foes' posts and spots spread over its floor) and the
passages' own pieces standing in it with their solids.

- **Under ground**: the Forge's dungeon in the zone's style, in one, two or three blocks by its size. Its way in is
  the mouth behind; its onward mouths stand on rock walls of its rooms (never on a great cave's free-standing stones),
  the end room's portal wall first, then the
  rooms farthest along the way, each in a room of its own where there are enough, 9 m apart and 16 m from the way in,
  clear of torches, props, fixtures and landmarks; where a small dungeon cannot hold them so, they keep 6 m apart and
  12 m from the way in, then 4 m and 9 m, so every way on has its mouth. Each is chosen by its place on its wall and
  stands 0.45 m further out (`MOUTH_BACK_M`), its whole piece in front of the wall's face, so its way on's daylight
  shows through its arch. Its lamp stands in its greatest room but the
  way in's, three cells or more each way, on the quiet cell nearest the room's middle where its plinth and stones,
  facing the arrival, stand on its rooms' floor clear of every prop, fixture, landmark, pillar and doorway, else in the next room as great
  and as tall. A zone is forged one storey deep (`forge_storeys`) from the first of its seeds where its floor gives
  its deal every spot it wants, every way on its mouth and its foes a post; a
  lamp's zone also where a room but the way in's is tall enough and the lamp stands clear, and a Hold's where its ring
  lies whole on the room floor at its spot (no rock or corridor cell, nor the dungeon's edge, within 6 m of its middle), the spot
  where the ring lies whole, else where most of it does. A band's post is the
  middle of a room's cells that no prop, fixture or landmark fills, the way in's room's none but in a zone laid as one
  great room, whose post is its clear floor farthest from the arrival; a room with no such floor stands no post; the deal's spots are quiet cells that hold none.
- **Above ground**: a hollow 38, 55 or 75 m across, its floor's outline of its form (round, a winding ravine with
  rounded ends, terraced shelves, a squared court, a long strand, a grove) on a grid of heights 2 m apart, rolling a
  little and stepping down in shelves, each easing into the next over an 8 m bank; its walls rise 12 to 25 m within
  5 m of its edge, walked up only aslant (the movement rules walk any slope along some way), and their ground ends 2 m
  past their full rise, a wall of the ground no body climbs, the page drawing the land round the hollow there at its
  lip's height (`drawnHeights`); the section is the square the ground is laid in (`Hollow::bounds`), so a body is
  held by the ground and never killed for walking. Its posts are as many as its
  room's most foes hold in bands of two (`Size::posts`: 3, 4 and 6), spread over the floor. It is dressed from the
  islands' kit of its climate: cliffs along its walls, each 3 m out along its own wall's normal, facing in, boulders at
  their feet (the round and the split, never the small stacked one), trees, shrubs and grass by its form, a court's
  ruins, a strand's wrecks, each keeping its footprint (a plant's at least 2 m, as far as the page's plant for it
  spreads) 5 m from the arrival, 2.5 m from a mouth, 4.5 m from the lamp, 1 m past each band's 2.5 m spread and a metre
  past a Hold's ring, tried at up to eight places (a wreck 16 whole, then 16 at seven tenths its size and 16 at half); a plant whose
  footprint meets a ruin's or a wreck's is pulled up. A Hold's ring stands the farthest from the way in where it lies
  whole inside the floor's ring and its stones keep 2.5 m from a mouth, its floor
  levelled a metre past it and eased into the floor round it over 4 m, so its stones lie in it; the page grows no meadow
  there.
  Its mouths stand a metre inside its edge, its floor's ring (`Hollow::ring`, where the page grows its
  meadow) half a metre inside it.
- **Laid where a body walks** (`Walk`): a zone is laid until a body, kept 0.5 m off every wall and solid and walking
  no steeper than 0.7, walks from the arrival to within 2.5 m of every onward mouth, the lamp and every spot, and
  within a blow (1.45 m) of every post and a Reckoning's collectors' spots: under ground (one storey, the only plane a walk maps) from each next seed, above
  ground dressed again, up to eight times, the laying that misses fewest kept. The page's door keeps the last zone it
  laid, so a zone's plan, its heights and its local room are laid once.
- **The pieces**: the way in, the onward mouths, the lamp (a plinth 1.6 m square in a ring of five standing stones
  3.5 m out, facing the arrival turned half a stone's step, so the way from it comes in between two stones), and what the deal stands on the spots farthest from the way in: three dead lamps for a Kindle, three
  tally posts for a Sever, six nodes for a vein, a reliquary, a Hold's ring (`passage.ring`, no solid: 32 worn flat stones of the grey-green
  stone laid end to end in the floor on its 6 m, none 5 cm over it, so a body walks over it).

## A dive

- **A dive is kept with the character** (`gear::dive::Dive`): its island and week, its route, the patrol zone's
  mouth it began at and the seas that zone's room was at (Home goes back to them), the zone it is in, that zone's
  depth and the depth it began at, whether the zone's deal was done while the player was in it, the deepest lamp lit,
  the zones whose caches it was paid, whether the sea has kept it, and its haul. An old save reads with none, and a dive kept before its seas at Normal; a later build's
  keys are kept.
- **The haul** holds what is found in a passage zone: Vestiges picked up, items found as themselves, gathered
  resources, a cache's fragments, Vestiges left lying as the player goes on, and the cold lantern. While the player
  stands in a zone of their dive, the gear's own keeping (`pick_up`, `keep_found`, `gather`, `post`) sends each find
  there. XP and Aurem are paid at once, and a Vestige paid outright (a guild's or a faction's package, a lamp's) is
  never hauled: carried, else the vault, else the mail (`keep_paid`).
- **A dive begins** at one of the patrol zone's mouths, the sealed doors of its runs, which the bake writes into the
  node file as `doors` (`bake::doors_of`): within 4 m of a door the page asks to begin, by its route, at the zone
  behind it, or at a lamp lit this week on that island or whose zone's foes stand at or under the player's level (its
  lamp counted lit for the dive but not the week, its zone's deal done and cache counted paid, the haul empty). Its
  room lights that lamp for them as they come, and a company's route stands its guard down, its deal done and paying
  no one (`stand_down_guard`); a public room's guard stands. The fourth lamp, depth 20, is no begin.
- **Going on** is asked within 4 m of an onward mouth, once the zone's deal was done while the player was in it, or
  at once from a Gauntlet; the dive is in the next zone from then, and the host moves the player there. Joining any
  room that is not the dive's zone ends the dive and loses its haul. The sea is not such a room: it never ends a
  dive, only marks it as kept by the sea (`Dive::sailed`), and the dive is judged in whatever room the character
  next lands in; a homeward one landed by sea in its patrol zone keeps its haul and stands where it landed. A respawn
  asked for in a zone empties the haul, losing the Vestiges still lying for the player with it, and stands the
  player at its arrival, however the body fell, and is refused in Gloom, where a company all down (the section's dead
  among them) falls back; a revive loses nothing. A body left fallen comes back fallen, and past its two minutes
  whole, its haul lost; a homeward dive left fallen comes home with its haul lost. A reload or a closed tab costs no
  more than a death: logging in again, a character whose last room was its dive's zone goes back into it, on the
  same dive, as does a public dive whose last room was the zone it went on from, reloaded on the way between
  ([[Accounts]], "Where a player logs back in").

## A zone's room

- **`Room::passage`** lays the room from its plan: the dungeon's floor and rectangle, or the hollow's heights and
  ring, its spawn at the arrival facing in, the hollow's dressing and every piece's solids as blocks, its navmesh, its
  place for the gates (`Place::Passage`, gated as a patrol zone is) and its island. Drops come from the dungeons'
  content under ground, the world's above it.
- **Its foes** (`passage_foes.rs`) are the Grey Tithe's bands on the sites' posts at the island's band raised by
  depth (`passage::levels`): two to four of the depth's roster (Runners, Collectors and Crossbowmen, Minors and Majors,
  at 1 to 5; Enforcers among them from 6; Majors alone past 10), led by an Elite in one band in three from depth 6 and
  in every band from depth 11 (the Enforcer or the Marksman, the Tithe-Taker too past 10, the Reeve past 15). A strand
  stands the deck crew instead: Deckhands, Hookmen and Pistoleers, Bosuns past 10, led by a Bosun or a Tithe-Mate. A
  lamp's guard is an Elite band at the first lamp, the Reeve and an Elite band at the second, the Tithe-Mate and an
  Elite band at the third, and at the fourth one of the island's two Elite Dungeons' Bosses, the week's by turns, and
  two Elite bands. Above ground a band's places and its beat keep inside the hollow's floor, its beat a band's spread
  in from the floor's edge, as under ground they keep inside the section. A vault stands a dungeon's garrison with its Miniboss in the end room (the Reeve to depth 10, the
  Tithe-Mate past it), and no cache chest of its own: its cache is the passage's. A guard never stands again by itself.
  A foe of a passage zone pays three quarters of a kill as it falls, its XP, Aurem and chances of a find
  (`lamps::KILL_SHARE`), and so of the officer and boon XP that follow it; Bountiful's more Vestiges are paid whole
  ([[A Passage Kill's Share Scales the XP That Follows It, and the Passages Read Gear's Week]]).
- **The most foes** a zone's bands stand is by its size (`Size::foes_most`): 7, 9 and 12 (small, medium, large), a
  hollow laying half as many posts (`Size::posts`); Crowded's extra foes are not counted, so it holds as many bands,
  and a band past it is held back. Its waves are held to the same most apart from the
  bands (Crowded's more in a wave on top), so a reliquary's keepers and a vein's waves come while its bands stand. It rises
  by three for each player in the zone past the first (`zone_foes_most`), and a band held back stands once the bands
  stood leave room for it and no player is within 12 m of its post. A wave brings a foe more for each player past the
  first, three at most, and a Miniboss or a Boss stands with half its health more for each, the most players seen at
  once, as a public event's waves and great foes do ([[Public Events]]). Every one who takes part is paid the whole
  cache.
- **The week's two modifiers** are the zone's run's, weighing the runs' hooks (`run.rs`); **the zone's currents**
  weigh them too at the depth's strength: Kindled and Sharpened a blow, Shielded the share shielded, Frail a heal, Spent
  a recharge, Hardened every foe's health, Crowded and Veteran each band, Gloom a darkness while the deal runs (no
  respawn, only a revive, and a company all down falls back to the arrival, its hauls lost), Bountiful more Vestiges from a kill, Rich
  Seam one more from a node.

## The deal

| Deal | Done when |
|---|---|
| Skirmish, vault, lamp | Its guard is down |
| Reliquary | Its chest is opened, E held 5 s within 3 m (`passage_holds.rs`); the first hold calls a wave, its keepers |
| Vein | Its six nodes are gathered, by any who take part, each gather calling a wave of two, into the haul as a patrol's, each node returning for its gatherer 9 minutes on (`keep_patrol`) |
| Kindle | Its three dead lamps are lit, E held 3 s at each within 3 m; a wave comes every 30 s meanwhile, once the last is down |
| Hold | Its ring (a piece at its first spot, 6 m round, drawn on the floor) is held 90 s by a living player; a wave every 30 s, once the last is down |
| Hunt | The marked band, "The Marked", an Elite, leading it on a round of the spots, is down |
| Reckoning | Its three collectors, each named "Collector", are down; each, once a player comes within 12 m, runs to the spot farthest from them |
| Gauntlet | A player whose dive is here and not done, having stood within 6 m of the arrival this round, reaches the farthest onward mouth (marked in the sites, `Sites::far_mouth`); past 90 s from each one's arrival (an account's first in the zone this round, whatever dive it comes on, so a reload keeps it) or the round's start, the later, it is late, and pays no cache; the page's seconds left run the same |
| Ambush | Its three waves are beaten, each called as the last is down; its mouths are barred until then |
| Sever | Its three tally posts, struck as foes standing still at their pieces and drawn as the posts alone, are broken; each is guarded |

A dead lamp kindles, a reliquary opens and the ring is held only while no foe stands within 8 m of it
(`CONTEST_M`); a hold begun with one near is refused so (`FoesNear`). A wave is two to four of the zone's roster
taking its currents (Crowded's more, Veteran's Majors, Hardened's health) standing at the post or spot nearest a
player but 12 m from every one, each hunting the nearest player. A wave's foe, and a deal's target, stands on the
floor at the navmesh's point nearest its place, never on a dungeon's rock or on a solid's top. Done, the deal has it done for the dive of each player in the zone, opening their mouths,
and pays its cache, once a dive, to those who took part: who brought down one of its foes, lit a dead lamp, opened
the reliquary, gathered a node of the vein, held the ring or reached the far mouth; only they count it toward the passages' bounties and the Atheric bounties. In a public room it begins again 60 s on, its guards and targets standing again, its bands as the players there
now make room for (a Hunt's marked band always among them), the rest standing again as more come; a player who came after
it was done goes on once that round is done. A company's room does not begin again, and a member who comes after it
was done finds it done.

## Rewards

- **A cache** is paid at the zone's level and depth (`Character::pay_cache`): its XP and Aurem times `pay_times` (1 at
  the first depth to 1.25 at the twentieth), its chances of finds times `find_times` (1 to 2); its finds go into the
  haul. At level 5: a skirmish 580 XP and 45 Aurem and a Vestige about one time in ten; a mission 760 and 57 and a
  Vestige about one time in six; a vault 1,180 and 88, its Miniboss's item about one time in three and a Vestige as a
  Miniboss's kill leaves one; a vein 300 and 22, its six nodes and two fragments; a reliquary 300 and 22, a sure
  Vestige and two to five fragments, their stock rolled apart from their count; a lamp 1,180 and 88 and a sure Vestige.
  A zone takes one player about three and a half minutes over about six foes (`room::deal_measure_tests`), so its
  cache, the passages' main pay, is sized for that and a third more, which with its foes' share of a kill keeps the
  passages inside the band at every depth a player plays for its pay ([[Activities]], "The band").
- **A lamp lit** (E held 2 s within 3 m of its plinth, once its guard is down, each player for themselves) keeps the
  haul: items as found, Vestiges carried or to the vault or the mail, materials added. The day's first lamp lit on an
  island whose zone's foes stand within three levels of the player pays a dungeon of the day's clear and a sure
  Vestige in a Boss's colours; the first time each week each lamp of an island is lit pays its week's lamp, a sure
  Vestige in a Boss's colours rolled apart from the day's, from the second one Essence of each stock, from the third
  two, and at the fourth a roll as the week's Elite Dungeon's first clear, a Legendary. The first lamp a character
  lights gives the passages' lore chapter ([[Lore]]). Each is kept on
  `Today` and `ThisWeek` by island, begun anew as they are. **Going home** from a lit lamp keeps what was found since
  and turns the dive homeward: no way on takes it further, and what is found on the way out goes into its haul. Its
  patrol zone's room, as it takes the kept character, keeps that haul, ends the dive and stands the player 2 m before
  the mouth the dive began at, toward its run's end arena, facing away from the door (`leave_passages`,
  `stand_before_mouth`). Any other room the character joins, another island's patrol zone among them, ends the dive
  and loses its haul.
- **The passages' bounties** are the board's fourth pool, two a day (`bounties::PASSAGES`), counting a lamp lit, a
  mission finished, a foe brought down in a passage, a zone reached at least 8 deep, a reliquary opened and a vein
  gathered. A deal counts, toward them and the Atheric bounties, only for those its cache paid, once a zone
  a dive, so a public round camped counts nothing more and a late Gauntlet nothing. A depth counts as a player goes
  on into a zone, as the zones the dive has gone into from the depth it began at (`Dive::zones_deep`), so a begin at
  a lamp reaches no depth by itself. They are the town's, at places 15 and 16 after the factions' 6 to 14 (`PASSAGE_PLACES_FROM`,
  `town_places`), so the town's six keep 0 to 5; the day's record keeps them under the town's keys (`is_town_place`).
- **Lanternfall** comes only from the first Atheric bounty, its data in `content/gear/atheric_bounties.json`: the
  cold lantern drops into the haul from a cache past depth 14, 3 times in a hundred, or from the fourth lamp's, 12, for a
  character of level 27 or more on Saltmere who holds none and has not finished its bounty, each zone rolling only on
  the character's first cache of it in a week (`ThisWeek::passage_finds`). 27 is the least level that harms every
  foe of depth 20, as a test holds it to the band and `power::gap`. Kept at a lamp, lit or gone
  home from, the bounty is held and its first step done; then five Kindle missions finished on Saltmere, 100 foes
  brought down there with a thunderlock, and the fourth lamp kindled: at its last step it stands cold for the holder
  (`lamp_cold`), held 3 s as a Kindle's dead lamp is, a wave of the Tithe coming at its guard's fall and every 30 s
  after while they have not lit it (`keep_cold_lamp`); the last step done, Lanternfall is kept as found. No Vestige or Shape gives it.

## On the wire

The gear carries the dive (homeward or not, and the seas it began at) and its haul, each island's lamps lit this week and its day's lamp (each
only where the record is of the room's week and day), and
the Atheric bounties held and finished; the snapshot the zone's deal as it stands for the player (`PassageSeen`): its key, done,
the dead lamps lit and targets down, the ring's share held, the seconds left, the waves, whether the mouths are open
and the lamp lit for the player (their dive in the zone having lit it), and their hold under way (a dead lamp's
number, 253 for a reliquary, 255 for the lamp). The asks are numbered 91 to 96 (`passage_wire`), after the ships' 86
to 90, the reliquary's open 96. A page or the host opens a zone's room with `open_passage` (the island, the week, the zone,
the route and the minute); once the
week on its clock is past the web's, judged as each join comes, the room refuses players: "The passage has shifted". The passages' refusals are
`Refusal`'s 173 to 184, answered one more: no dive, no such mouth, the deal not done, no lamp, the lamp not lit, the
lamp guarded, out of reach, not in a passage; `Shifted`, every ask of a zone whose week's web has turned but Home at a
lamp already lit; `AlreadyLit`, a dead lamp or the lamp lit already; `Fallen`, any ask while the player is down; and
`FoesNear`, a hold begun with a foe within 8 m of its piece.

## On the server

- **A zone's room** is named `passage-<island>-w<week>-z<zone>` for its first public room, `--2` to `--9` after it
  for the next when one is full (eight accounts), and `--run-<instance>` for a company's route ([[Server]], "A passage
  zone's room"). It opens from its name with `open_passage`, this week's web alone; last week's answers "The passage
  has shifted" and lays nothing.
- **Arrivals** are judged by the dive the accounts keep with the character: into a zone from the patrol zone at the
  seas the dive began at, at its mouth or begun at its lamp (still at the depth it began at, as only the rules begin
  one there, lit this week or by the player's level), from a zone whose ways on lead to it, from another
  public copy of its zone, or back into its own room; out of a lamp's zone to the patrol zone at those seas, once the
  dive went home from that zone with its lamp lit this dive (the dive judged, not the week's lamps, which a week
  turned since may have cleared).
- **The dive is saved** the moment it moves, a lamp lit and Home among it, so the next room reads it.

## In the browser

### Reading the rules

room-wasm's passage door (`startPassageDoor`, in an instance of the room module of its own) hands a page a week's web
(`room_passage_web`, each zone with its foes' levels as its room stands them), a zone laid whole (`room_passage_zone`,
under ground the Forge's layout as a dungeon's is handed over, above ground the climate its hollow is dressed in, whose
kit the page draws it from) and a hollow's heights (`room_passage_heights`), built by the same crate; each is read whole and refused, saying
why, where it does not read. An island with no passages, a zone the web lacks or a style the Forge does not lay yet
answers empty, read as none. The gear's dive, haul, lamps and Atheric bounties (`passagesOf`) and the snapshot's
`PassageSeen` (`passageSeenOf`) are read as the page reads the rest of the gear and the snapshot; the asks 91 to 96 go
as its other asks do, and a refusal is said in the room's words (174 to 185).

### Played

The page says only what a choice or an act needs, in short words:
[[The Passages' New Interface Says Less and Reads Better]].

- **At a mouth**: E within 4 m of a run's sealed door in the patrol zone ("Into the passages", the layout's runs'
  doors matched by name to the web's mouths) opens the mouths' card (`MouthsCardView`): the run's name; the zone
  beyond as its sign says it and the week's modifiers; the routes ("Public", and "Your company" in a company, else
  "Alone"); Go in (the Use key as bound), a begin for each lamp lit this week ("Lamp 2 · Foes 7-10", the foes of that
  lamp's zone at the mouth's place, where the room begins it), and Close (Esc). A choice asks to begin, by the mouth's place, its route and the lamp.
  The card closes once its place is left: another room, the ship or the map, or 10 m from the door. Playing alone,
  the patrol zone's node file the page writes names its runs' doors as the bake's does (`doorsOf`), so its room lays
  the same mouths.
- **The room's yes**: an ask of the passages is yes once the dive has moved (begun, gone on to another zone, or for
  a lamp's Home turned homeward, as the gear carries it); it plays the way between zones while the room gone to is
  joined. A passage refusal is said in a toast, as is no answer in 10 s; other asks answered meanwhile, done or not,
  are not taken for it. A hold asked (the lamp, a dead lamp, the reliquary) changes no dive: only its refusal is
  said, as the room's next answer ("Not while foes are near.", "It is lit already.", "Come closer."), and nothing
  waits on it.
- **A zone's room**: the server's by its name (`passageRoomName`, spelled as the server spells it): the first public
  room, the next copy (`--2`, `--3`) when one says "This passage is full." (judged full, or at its most sockets), or a company's route's own, a member's
  room found as runs are. A room is joined once the gear's dive names its zone: a room holds a player it has not
  judged and sends its snapshots meanwhile, and says it is full only after the judge. A zone gone on to that refuses
  the dive as come by no way there (the room left shut before the move was saved) sends the page back into the zone
  it left, where the accounts still keep the dive, saying "You cannot reach this place from where you were."; should
  the zone left refuse it in turn (its move saved meanwhile), the zone gone on to is joined once more; or, playing alone, the same room in the rooms' worker opened from its ask (`open_passage`'s
  JSON), the character the last room let go of given to it so the dive goes on. Under ground the zone is a dungeon to
  the page, its layout drawn by the dungeon's renderer; above ground its hollow is an island to the islands' layer
  (`zoneIsle`, by an id no sea island has), stood on as a sea island's beach, and drawn alone: no land or sea of the
  island round it and none of the sea's islands, under its own climate's sky read where its zone lies on the island
  (`hollowAir`). Its floor is its form's ground (`hollowGround`): a hollow the land's own grass or, named so, chalk; a
  ravine stony earth; shelves turf, or bare rock; a court paved; a strand sand, or a shell bed's dry sea floor; a
  grove leaf litter; a chalk hollow's walls chalk; each wearing the land's ground tile for its ground and the walls
  the caverns' rock ([[Island Drawing]], [[The Islands and the Passages' Hollows Wear the Procedural Textures]]);
  and the page grows the islands' kit's grass and shrubs over it by its form (`meadow`), which stand nothing solid,
  so the room's ground is as it lays it. Under ground its way in offers no Leave. Either way the body is predicted on the zone's own ground from the same ask (`fighter_passage`,
  `set_passage`): the ground and blocks its room stands bodies on (`passage_ground`), under ground the Forge's floor
  and the pieces' solids, above ground the hollow's heights, its dressing's blocks and the pieces' solids.
- **Home**: the lamp's Home turns the dive homeward; the page joins the patrol zone's room at the seas the dive began
  at, and the way comes down to where the room stands the player, 2 m before the mouth the dive began at toward its
  run's end arena and facing away from the door (`stand_before_mouth`, `homeSpot` alone), once its first snapshot of
  the body has come.
- **In a zone**: the deal stands in the tracker (`dealTracker`), keyed to the room's word: headed where the zone lies
  ("Depth 7 · lamp 2 in 3"), its kind ("Kindle") over its steps, the zone's own name the place's; the deal's steps ("Light the dead lamps 1/3", a
  hold's clock; a vein's guard, then its six nodes counted; a reliquary's guard), all done once the player's mouths
  are open, whatever the round does after; a public round done before the player came, "Done before you came: begins
  again" with its clock (a route's round, never begun again, stands done); a Gauntlet's clock until its far
  mouth is reached; in a lamp's zone "Light the lamp"; then the way on ("Go on through a mouth", at a lit
  lamp "Go on, or Home at the lamp", at the deepest "Home at the lamp"); and in the last ten minutes before
  Tuesday 09:00 UTC "The web shifts" with its clock. The compass points at what the deal asks next, in place of the
  houses' roads ([[Every Objective Has a Waypoint on the Compass, on Land and at Sea]], `passageWaypoint`): the nearest
  foe standing, the Marked or a collector; a dead lamp still cold, a tally post whole, a node ungathered; the ring or
  the reliquary; a Gauntlet's far mouth, though its mouths are open from the start; once the player's mouths are open, a lamp's zone's lamp until lit, then the
  nearest way on (the lamp again where there is none, for Home); a round done before they came, nothing. Each mission is named by its kind (Kindle, Hold, Hunt, Reckoning,
  Gauntlet, Ambush, Sever) on its sign, the card, the tracker and the map. Near an onward mouth its sign shows a Gauntlet's far mouth as its goal ("The far mouth: reach it in time"), the
  zone beyond by name; on one line its kind ("Kindle", a lamp's "Lamp 3"), depth ("Depth 8"), foes' levels ("Foes
  15-18", in the loss's colour where the strongest stands three or more over the player) and "Public way" where it
  lies on the week's public way; what its deal asks ("Light 3 dead lamps", "Hold the ring 90 s"); its currents; and,
  shut, "Shut until this place's work is done.", the room's own words; E there goes on through it once open. E held at the lamp lights it, its prompt ringed as the room counts
  the hold, with its second line beneath ("Keeps what you carry"; once lit, "Or go on"); once lit E there is Home. The fourth lamp standing cold for one on Lanternfall's last step says "Kindle
  the lamp" ("The Tithe come while you hold"), and the tracker "Kindle the cold lamp". E held at a dead lamp kindles it; one lit already is passed over for a mouth beside it. A vein's six nodes stand
  as the island's resource nodes do, drawn where the room stands them for the player and gathered by E held, under
  ground among the dungeon's figures. A begin at a lamp lays the lamp's zone the room begins it at (the mouth's place
  among the mouths, or the last). E let go ends a hold, as a gather's. The haul
  stands on the right while anything is carried, its first five lines and then "and 4 more" (on a phone's narrow view two, under the tracker), no wider than the view,
  with "Lost if you fall or leave"; the leave held adds "What you carry is lost"; a respawn
  that empties it says "What you carried is lost." The cold lantern found stands a moment low in the view (on a narrow one in
  the haul's place), its name in the Atheric colour and its words. Home asked again once the dive has turned homeward goes home at once. The place's
  line reads "Passage"; a company member in one is "In the passages", and Go to them says to go in at a mouth.
- **The pieces** stand as the deal stands for the player (`PieceState`): a mouth open or shut, the lamp and the dead
  lamps lit (gold) or cold (grey), a tally post whole or broken, the reliquary shut or opened. Above ground they are
  the islands' kit's `passage` modules, placed in the hollow (`withPieces`), a lamp's and a dead lamp's lantern (the
  kit's ember) glowing once lit and the kit's stone while cold, no flame seen in its cage ([[An Enclosed Light Hides Its Flame]]) and its light a
  lantern's at the glass, as the islands light every ember ([[Island Drawing]], "The lights"); only while that pack
  has not come do they stand as plain boxes. Under ground they are the dungeon pack `passage`'s modules (`passagePiecesLaid`), laid at each piece's
  foot turned to its facing, in the pictures of the cell it stands on, into a mesh of the dungeon's own made again as
  the deal's state changes; a lamp's and a dead lamp's `glow` part is lit, or the cell's stone while cold, and an open
  mouth's is daylight, drawn as light. The lamp lit burns with no flame seen, its caged glass glowing and its light at
  the cage's middle 3.2 m up, across its room, and each dead lamp lit as a lantern at its small cage off its crook,
  each glass flickering with its light ([[Dungeons]], "Its flames"); an open mouth shows its way on in daylight's
  pale light behind its face (`passagePieceLights`), lighting the room as its torches do. While the pack is
  coming, or if it fails, they are plain boxes to their solids' sizes (`pieceMesh`).

### The way between zones

`wayOf` lays the way's rails and `wayAt` plays it, on the cinema's rails ([[Cinema]]), kept under way by
`WayBetween`, which a crossing gate between two patrol zones plays too ([[Layouts]], "Gates"); in the flow ([[Game]], "The
flow") a mouth, a begin or a Home is `passing`, drawn over the island from the way's camera with the web's places and
the way's dots over it, the place's prompt, tracker, crosshair and fight display stood down (`heldHud`); in the leave
and from the way down the place is drawn as on foot, the player's inputs held, and the flow is on foot again once the
way has played. The walks are the room's own: the way steps the body forward (`FootAsk.walk`), so it walks as any
body does and stops where the ground and solids stop it. A way on is asked of the room only once the zone beyond is
laid (`laidOrTold`), or the player is told it cannot be. A way that fails brings the veil down and takes the player
back, to the patrol zone from a zone, or to the hub, told why (`wayOut`, `tripOrBack`).

| Beat | Seconds | What is seen |
|---|---|---|
| Leave | 1.5 at most | The character turns to the mouth taken and walks into it, the foot's own camera following; the room is left once they reach it. A Home and a crossing gate have none |
| Rise | 1.5 | From where the foot's camera last stood up to the island seen whole, framed as an island's side is framed from the ship (`frameSide`), every zone of the web inside the picture |
| Draw | 2 | The way so far (the patrol zone and each zone passed this dive) shown, and the way being taken drawn a dot at a time, 10 a leg, to the next zone's place |
| Wait | until ready | Held over the island while the room gone to is joined (`wayClock`), a hollow's kits asked for meanwhile (`isles.warm`); then while the place is drawn unseen under the island until it has drawn whole (`drawnWhole`); 20 s at most from the join (`READY_WAIT_S`, as the veil waits) |
| Down | 1.5 | Above ground, from a low framing over the arrival (3 m back, 10 m up, looking 12 m past it) into the foot's own camera (`settledShot`); under ground, where rock and ceilings stand over the place, none: the way cuts to the foot's own |
| Walk | 1.5 | The character walks in from where the room stood them, the foot's own camera behind, kept out of the walls as on foot |

### The passages' map

Held in a passage zone, under ground or above, the held map shows the web as a land sheet (`passageSheet`,
[[Held Map]], "On land") in place of the land's: every zone a mark at its place by its deal's glyph, each mission by
its kind's own (the map's table saying each), named beside its mark by its foes' levels alone ("15-18"; a lamp by its
number too, "Lamp 2 lit · 7-10" once lit this week), in the loss's ink where they stand too strong for the player; the patrol zone by its name; every way of the
web washed faint, the week's public way inked from zone to zone, the way come this dive a track and the ways on from the player's zone footpaths; "You" at the
player's zone. It opens on the whole web, every mark inside it; a zone's name stands under, over or beside its mark or
not at all, and those too close to be lettered at that scale come as the wheel draws in. Over the island, the way's places are every zone's and the patrol zone's.

### The Journal and the board

The board's fourth pool is the passages', two a day, shown in the town's row after its six ([[Activities]], "Bounties"):
each wears the town's writ as every town bounty does, its card "Passage bounty" by a lamp's mark. The
Journal's timers show each island's lamp of the day and its four lamps this week, gold once lit and grey while cold
([[Interface]], "Journal"). Lanternfall's bounty, held or finished, is a card of its own under the board's in the
Journal's bounties (`athericCards`): its name in the Atheric colour, then its steps,
each done with a tick, under way with its count, or still to come.

### Pictures

The passages are checked by their pictures, drawn headless by `tools/uiShot.mjs` from `passageShots.ts` (which the
game never imports): `node tools/uiShot.mjs tools/passageShots.json` draws the standing set into `target/passages/`,
and a file of one's own asks for any other. Every picture is drawn by the game's own drawers:

- **A zone**: `zoneShot` (a `"call": true` shot) takes the week and the zone by its number, or the first of a form or
  style (`ground`) and `size`; the pieces' `state` and `done`; the size in pixels; and the eye behind the arrival
  (`eye`: metres back and up, and its pitch), over the zone (`above`), some metres before the first piece of a kind
  (`aim`; a lamp from its arrival's side), or from the game's own camera behind a body at the arrival (`own`, and under
  ground wherever no `eye` is asked, its boom kept off the way in's leaf), or above ground some metres (`back`, 3 unless said)
  short of the placement nearest it whose module begins `near` (a strand's wreck), facing it. Above ground the hollow is the islands' layer's ground and modules and the land's own plants
  (`IslesNature`), lit and shadowed by the sky of its climate where it lies at the world's `hour`, its embers' fires
  burning and their lamps lit as the game's scene draws them, under a plain sky
  colour where the game draws its dome; under ground the dungeon's scene (`DungeonScene`) with its torches and the
  pieces' lights. The pieces' boxes are drawn only while their pack has not come, as in the game.
- **The way between zones**: `wayShot`, its dots framed over the island at the moment `loadDoor` is given (seconds
  from the way's start), over a plain ground: the island's land is the sea's view's, not drawn here.
- **The map and the panels**: `mapShot` (a call), the mouths' card (`mouthsShot`), the sign, haul and lamp's prompt
  (`panelsShot`) and Lanternfall's card (`athericShot`), each after `"before": "loadDoor"` where it reads the web.

## Limits

- A body may scramble aslant up a hollow's wall to its lip (`crates/passage/src/hollow.rs`). No foe walks there, but a
  foe pressed into a hollow's cliff, backing off or fleeing, takes hold of it and climbs to its top, where only a
  player who climbs after it reaches it.
- A small strand stands its three hulls, some at seven tenths or half their size, and its mast and planks only where they fit.
- The way comes down over a hollow's arrival clear of its ground and blocks (`passageZone.test.ts`, four weeks'
  hollows), and the foot's camera keeps off the hollow's heights and its dressing's blocks; where a module's mesh
  reaches past the blocks it stands as (a cliff's face, a wreck's timbers), the eye behind the body can still stand
  in it, as on the sea's islands. That reach is unmeasured.
- A cache's roll for an Atheric bounty's find counts a zone once a week for all the island's bounties: with a second
  bounty on Saltmere, the first would take each zone's roll (`roll_find`). There is one.
- The pictures' hollows stand under a plain sky colour, and the way's frames over a plain ground.
