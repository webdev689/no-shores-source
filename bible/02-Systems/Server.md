---
type: system
status: live
code:
  - crates/room/src/lib.rs#Room
  - crates/room/src/floor.rs#Floor
  - crates/room/src/dungeon_room.rs#dungeon
  - crates/room/src/entrances.rs#laid
  - crates/room/src/entrances.rs#join_at
  - crates/room/src/judging.rs#Event
  - crates/room/src/players.rs#VIEW_LAG
  - crates/gear/src/cosmetics.rs#dressed
  - crates/gear/src/looks.rs#shown
  - client/src/network/localRoom.ts#LocalRoom
  - client/src/network/roomThread.ts#RoomThread
  - client/src/combat/fighting.ts#Fighting
  - crates/room/src/players.rs#SLACK_TICKS
  - crates/room/src/players.rs#WAITING_LIMIT
  - crates/room/src/sea.rs#Sea
  - crates/room/src/sea.rs#PACES
  - crates/room/src/plates.rs#take_plate_changes
  - crates/room/src/sea_waters.rs#water_name
  - crates/room/src/fleet.rs#Fleet
  - crates/room/src/fleet.rs#CAPTAINS_MOST
  - crates/protocol/src/fleet.rs#read_orders
  - crates/protocol/src/fleet.rs#fleet_snapshot_bytes
  - crates/room-wasm/src/fleet_door.rs#predict
  - crates/room/src/hostiles.rs#Hostiles
  - crates/room/src/friendlies.rs#Friendlies
  - crates/naval/src/wire.rs#view_numbers
  - crates/naval/src/wire.rs#parted
  - crates/bake/src/lib.rs#nodes_of
  - crates/bake/src/lib.rs#MARGIN_M
  - crates/bake/src/lib.rs#lock
  - crates/protocol/messages.fbs
  - crates/protocol/gear.fbs
  - crates/protocol/src/lib.rs#read_input
  - crates/protocol/src/lib.rs#read_course
  - crates/room/src/sea_travel.rs#TravelRefused
  - crates/protocol/src/land.rs#snapshot_bytes
  - crates/protocol/src/pack.rs#pack
  - crates/protocol/src/lib.rs#read_inputs
  - crates/room-wasm/src/sent.rs#Sent
  - client/src/network/snapshots.ts#SnapshotKeeper
  - client/src/network/pack.ts#unpack
  - client/src/network/linkMeasure.ts#LinkMeasure
  - tools/wireSizes.mjs
  - crates/room-wasm/src/lib.rs#room_input
  - crates/room-wasm/src/lib.rs#open_node
  - crates/room-wasm/src/dungeon_door.rs#open_dungeon
  - crates/room-wasm/src/dungeon_door.rs#room_join_at
  - crates/room-wasm/src/run_door.rs#open_run
  - crates/room-wasm/src/run_door.rs#activities_json
  - server/roomNames.ts#nodeRoom
  - server/roomNames.ts#runAsk
  - server/roomNames.ts#startedAtSea
  - server/accounts/companies.ts#launchedFor
  - server/keeping.ts#forCompany
  - server/keeping.ts#judgingArrivals
  - server/keeping.ts#rename
  - server/arrival.ts#arrives
  - server/arrival.ts#cameOutOf
  - crates/room/src/entrances.rs#stand_at_spawn
  - crates/room-wasm/src/lib.rs#refusal
  - crates/room/src/course.rs#stand_foe_at
  - crates/room-wasm/src/course_door.rs#stand_foe
  - crates/room/src/garrison.rs#garrisoned
  - server/worker.ts#RoomHost
  - server/roomDoor.ts#startRoomDoor
  - server/wrangler.jsonc
  - client/src/network/messages.ts#readFromRoom
  - client/src/network/roomConnection.ts#RoomConnection
  - client/src/network/prediction.ts#Prediction
  - client/src/combat/fleetSession.ts#FleetSession
  - client/src/game/footGround.ts#standOn
---
# Server

The authority every player's game answers to ([[Server-Authoritative Multiplayer]]), on Cloudflare
([[Servers on Cloudflare]]). Each shared space is one room: a node of an island, the sea, or a course to play on.
Built so far: the rooms, their messages, their Cloudflare host, the bake that cuts each node's ground, and the
browser's side; the [[Game]] plays its node rooms and the sea, and the [[Test Ground]] plays in a room. It is deployed
on Cloudflare.

## The room

- **One shared space:** its ground, the blocks standing on it, its clock in ticks and its players. It has no network
  and no clock of its own: its host hands it each player's inputs, ticks it 60 times a second, and sends out what it
  sees.
- **Its ground:** a node's room stands its bodies on the node's window of the [[Land]], among the boxes of its city a
  body runs into ([[Movement]]). A dungeon's room stands them on the dungeon's own ground in its own frame, whose
  rock, doorways' jambs and pillars are walls no body passes or climbs, kept a body's half-width off ([[Dungeons]]).
  Any other room stands them on its course of blocks on open ground at 0 m, or, for a course laid over open sea
  (`room_open_over_sea`, the [[Prologue]]'s wreck), on its blocks over the sea at 0 m.
- **Joining:** a player gets a number no one else in the room has had, and comes in with all three healing charges
  ([[Combat]], "Healing charges"; [[Three Healing Charges, Refilled by Blows and Kills]]) and whole, unless their
  character left a room within the last two minutes: then with the health and charges it left with, fallen if it
  left fallen (`left.rs`, [[The Audit's Leftovers Are Fixed as Claude Suggested]]). In
  a node's room they stand on the ground at the node's spawns in turn, the first player at the first spawn, the next
  at the next; elsewhere at the room's spawn, on the top of the block under it (or the ground where none stands), and
  a respawn stands them there too. A patrol's room may instead stand a player 1.5 m before one of its entrances'
  doors, facing away from it, as they come out of that entrance's dungeon, and stand them at the next spawn after all
  (`stand_at_spawn`), as an ordinary join, when its host learns they did not. A room holds 16 players; past that, it
  turns the next away.
- **Inputs:** each player numbers their inputs 1, 2, 3 and so on, and one out of order is refused, as is one with a
  movement or facing that is not a number. An input is one tick's intent, the controls ([[Movement]]) and the fight's
  buttons ([[Combat]]), with what the player's hands hold and the room tick their screen last showed. It steps that
  player's fighter once by combat's player tick, on the room's ground, among the fighters as that screen showed them,
  exactly as the browser that predicted it did, so a prediction can only differ where the server knows more
  ([[Clients Predict With the Shared Rules]]). What the hands hold is taken up only at rest, never in the middle of a
  swing, a guard, a draw or a reload.
- **Riding:** a player rides wherever they walk, in a node's room, a dungeon, a run or on an island, on the room's
  word: it takes a page's mounted input only from a character with a horse worn in the Mount slot (`may_ride`,
  [[Horses Are Items Worn in a Mount Slot]]); on a deck, the ship's own or one boarded, the
  room walks every body on foot (`riding.rs`). A player on foot shows others no horse: a horse move their page sends
  is relayed as the body's own, walking while it moves, else standing. Nothing is fought from the saddle, as the page
  asks nothing there: a mounted input's swing, guard, shot and aim are dropped, and its cast refused.
- **Foes:** on a course, a player may ask for a foe by its type and rank, at a level and with a shield (the
  [[Test Ground]]'s panel), one with each input; the room stands it 5 m along the player's aim, which follows their
  look, on its navmesh, facing them, and holds at most twelve. A foe of level 0 has none and fights by combat's own
  numbers; one with a level has its health grown for it ([[Gear]]). A node's room takes no ask: as it opens, its
  node's kind and id stand its garrison at its island's levels, raised by its seas once the host sets them, one foe in
  five shielded, each group but a Boss's or a Miniboss's walking a beat, and the garrison stands again as it is
  cleared; the room holds at most 24 ([[Enemies]]). A Boss's called foes come the same way, at its level. Each tick
  the fight's heat eases and every foe thinks over the room as it stands and steps by the same rules ([[Foes]]),
  routing, taking cover, and climbing and dropping where its links say, on a [[Navmesh]] the room bakes when it
  opens: a course's over its blocks and 30 m round them (over open sea, its blocks' tops alone, every part a body
  stands in kept); a node's over a 70 m square of its land and its layout's boxes there, its first spawn
  15 m inside the square's edge toward the middle of its section's ring, where its garrison stands; a dungeon's over
  the whole dungeon, kept to the floor its way in stands on ([[Navmesh]]). The room tells each foe the noises made and
  its allies' shouts, and keeps the fight's heat, fed where blows are settled.
- **Foes of different factions** fight each other: a foe's swing, telegraphed blow or shot on a foe of another side
  is judged at once, as a player's blow on a foe is.
- **A patrol** (a patrol node's room) fights its garrison alone ([[Enemies]]). Its island's resource stands where its
  layout stands its nodes ([[Layouts]], "The sites";
  [[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]), which the bake writes into the node's file
  (`resources`) and the room numbers in that order, as the page does; a third of them hold a node at once, the next
  third every three minutes, and each player may gather each node once while it stands. Its three dungeons'
  entrances are laid out from the node's id, the same every time: inside the ring and 60 m inside its edge, 60 m from
  every spawn, 40 m from every resource place and 300 m from one another, on dry ground (above the sea, out of a river
  or a lake) whose height varies by 3 m at most across the 12 m round it; fewer when fewer fit. Each is the entrance
  model its dungeon's seed draws, turned so its door faces the middle of the ring. A kill, in any node, pays by the
  room's seas ([[Gear]], "Where foes stand").
- **A patrol's dungeon** has a room of its own ([[Dungeons]], "In the rooms"), opened from its patrol's node file:
  its floor, its one spawn at the way in, a body standing there facing into the room, and the patrol's island band
  for its garrison's levels. The Grey Tithe's dungeon garrison stands where the Forge puts foes ([[Enemies]]). Beside
  the Reeve's post stands its cache, shut while the Reeve stands; when he falls it opens, and every player then in the
  room finds a Vestige lying before it for them alone ([[Gear]]); it shuts when he stands again.
- **Blows, as each defender saw them:** a player's blow on a foe is judged at once against the foe where the player's
  screen showed it, up to 24 ticks back, but guarding, dodging and staggered as it is now, so a foe's answers count the
  same at any lag; a player's ball (a pistolet's, a thunderlock's) is judged the same way.
- **Blows on a player** (a foe's swing, a telegraphed blow, a shot) wait until the player's inputs show they had seen
  them land, 24 ticks at most, and are judged against the player as they stood then: whether it reached them, their
  guard, their parry window, their dodge. What the verdict does is done to everyone as they are now. A telegraphed
  blow that finds no one overreaches its foe once every player near it has been judged.
- **Shots** fly a tick at a time and strike the first body of the other side on their line; arrows and bolts fly in
  the room's own time.
- **Gear** ([[Gear]]): each player holds their gear while they are in the room, a new character's as they join (in a
  node's room, their own kept character once their session is given, [[Accounts]]), and
  only what it puts in their hands (or a torch beside a one-handed weapon): any other arms asked for are bare hands.
  Every blow is made with its power: a player's on a foe by the Attack of the hand that struck and their levels (an
  arrow's or a bolt's by the Attack and perks it was loosed with), a foe's on a player by the player's Defense and
  their levels. A foe's kill pays every player whose blow landed on it in its last ten seconds and could harm it, each their own XP and Aurem and perhaps a Vestige, which lies where the foe fell for them
  alone for two minutes and is picked up by walking within 1.5 m.
- **Counts:** the room counts each foe felled for each player its kill pays, each node gathered, and each dungeon
  cleared for each kept player in it as its cache opens, once a day for each account, toward their bounties and side
  quests, on the island its node's file or its dungeon names ([[Activities]], "Quests and bounties").
- **Asks:** an input may carry an ask of the player's gear, answered in turn with it, and the answer kept to send
  them. A social space's room serves each of its asks within 4 m of that ask's counter, which its node
  file names (a ruin's plaza names none, and its room serves and shows nothing: [[Cities]], "Ruins"): a Vestige
  opened at the Mage's, the vault at a vault's, a ware at its own smith's, an emblem or a dye at
  the Tailor's, a horse or barding at the Tack's, a faction's asks and its Art's at that faction's counter, and Shape's
  at his place of the week while he is there ([[Factions]], [[Gear]]); the Test Ground's course serves them all within
  4 m of its stall. A resource node is gathered by a player alive and on foot within
  2.5 m of it who holds E two seconds: the gather ask begins it, and the room gathers it two seconds on unless they
  were hurt (from their health the tick before), fell, mounted, filled its resource, or it stopped standing for
  them; or they let go (the stop-gather ask) or stirred 0.3 m before its last quarter second, which the room, counting
  from its answer while the page counts from the press, gathers all the same. A stop-gather ask is heard at once,
  past the queue, and lets go of every gather asked before it. Starting and keeping a gather share one check
  (`gather_refused`). It is then
  spent for them until the nodes' turn passes; a kept character's is spent for its account, however often its player
  rejoins. One whose resource the player holds the most of is left standing, and a body dead past the edge gathers
  nothing. A room answers one player's asks five times a second at most, in the order asked, holding four for their
  turn and letting go of any past those; and sends their gear five times a second at most, so each answer reaches
  them before the next is made and a page that asks without end cannot flood its socket or slow the room. A change to
  how they fight (their trim, or the arms their gear allows) is sent at once, and before the snapshot, so their
  browser predicts them by it from that snapshot on. Only the Test Ground's room hands out gear to try the loop
  with.
- **The dead** stand again, whole and with all three healing charges, after four seconds, at the spawn nearest where
  they fell (in a dungeon, at its way in, facing into the room), and the foes leave them be for three more unless they
  strike first (a blow, a shot or a spell); a dead foe is gone after ten. One standing again past a node's section, as
  they ask, stands with all three too. In an Abyss run each stand takes one of the company's five revives, and the
  fallen stay down once none is left; when every player in it is down at once and it was never won, the run starts over
  (`abyss.rs`).
- **A run's room** opens from a JSON ask (`room_open_run`): its dungeon (a patrol's by its number, an Elite Dungeon
  by its place, or a sea island's by its seed, style and continent), its tier and the Unix minute it opens, as
  `Room::dungeon_run` stands it ([[Dungeons]]); an ask no rule lays opens nothing. A patrol's dungeon's run also takes
  its patrol's node file, and opens only with that patrol's; while the patrol is locked it takes no player and says
  why (`refusal`), as the patrol's shared dungeon does. `room_activities` answers what is
  on at a minute as JSON ([[Activities]]): the day's and the week's numbers and the minutes to the next of each, each
  island's dungeon of the day, the day's modifier, the week's two with their modifiers' keys and levels, each island's
  band at each tier, the revives, and each modifier's name and words. `room_gates` answers why each place is shut to
  a level, past the prologue or not, in the gates' own words (`gear::gate::shut_at`).
- **An Elite Dungeon's node** lays its one entrance as it opens (`lay_elite_entrance`), and is joined before it as a
  patrol's room is before its entrances.
- **The clock:** an input waits for the room's next tick. A player's inputs step their body no more often than the
  ticks since they joined, plus a slack of 6 ticks for the network's jitter, and a tick takes at most 3, so no one
  moves faster than real time and one catching up after a stall replays no faster than three times over.
- **A player whose inputs stop** is stepped standing still once they fall a view's lag (24 ticks) behind, so nothing
  they were doing (a dodge's safe stretch, a parry window) outlasts its time, and time away is never banked to spend as
  speed; a body the section killed is stepped with no controls of its own, so it falls on and lies where it lands, its
  ticks counting the same. Past 30 waiting inputs, the oldest
  is let go as though taken, so a burst after a stall never breaks the order. The room tick a player says their screen
  showed moves on at most 4 ticks an input, so they cannot pick the moment they are judged at. A dress change is taken
  at most once a second.
- **The section:** after each player's inputs a node's room judges their body against the node's section ([[Reach]]):
  inside, warned with a count, or dead; in a social space a fall of 6 m or more from where the feet last stood kills.
  A body dead past the section is stepped with no controls of its own: its inputs are taken, and it falls on and lies
  where it lands. An input that asks to respawn, once the section allows it, stands the body on the ground at the spawn
  nearest where it died, a fall measured from there. A room with no section never judges.
- **What it sees:** every player's fighter, where they stand with the section, and the number of their last input it
  took; every foe; the shots in flight, each with the ticks it has flown, and every gun's ball that stopped since it
  was last asked as its last segment, to where it stopped, with the point it left its gun, so every screen ends its
  tracer there however many ticks the room ran first; and what happened in the fight since it was last asked (a
  swing's blows with their stroke): hits, blocks, parries, guard breaks, dodges, staggers, deaths, players standing
  again, feints, foes arriving, and a player's drink with the health it gave back. The same on every machine.

## The sea

The room named `sea` holds every player's ship at Normal; `sea--elite` and `sea--abyss` are the same sea at a
voyage's harder difficulty, each a room of its own whose ships come at the levels that difficulty raises them to
(`room_difficulty` after `room_open_sea`). A player sets their ship's course: the world points it sails through
in turn, to the nearest metre, and its pace, one of DFO's steps, 5, 10, 20, 30, 40, 60 or 100 times a ship's 12 m/s,
or 1, the world's own time, which the page sails it at while its view is close on it ([[Game]], "At sea").
A ship not yet at sea puts in only by a port city, its course's first point within 3 km of the roadstead, and then at
that roadstead itself, never the page's own point, the page told so (`Sea::puts_in`; a sea opened with no port cities
puts it to sea where the page asks); a ship its owner sailed before comes back where the sea last had it, however far
the page puts it, as a ship sails nowhere while its player is away
([[The Audit's Leftovers Are Fixed as Claude Suggested]]); one at sea starts the course from where it is, to the nearest
metre, so the legs it sails are the legs judged. A course with no points brings a ship to rest, turned to its
facing when it holds one: the helm turned while it lies still. A player sets one course, facings among them, each half
second, and one sooner is dropped: judging a course against the coasts takes up to a few
milliseconds, which no player may ask for every tick. The browser keeps its latest course and sends it once the sea
will take it, by the room's own tick.

- Each tick, each ship sails its pace's distance along its course, turning onto each leg as it comes to it, and comes
  to rest at the course's end. Its heading is the bearing of the leg it sails, clockwise from north.
- A course is refused whole when any point lies on a continent, or any leg, from where the ship is on, crosses or
  touches a continent's coast in the layout ([[World Map]]). The coasts are judged in whole metres, in integer
  arithmetic. A pace neither one of the steps nor 1, a point outside the world's frame, and a course of more than 64
  points are refused.
- **Travel.** A course asked with the travel flag (the held map's, [[Sailing]], "Travel by the held
  map") takes the ship most of the way at once (`sea_travel.rs`). It is refused while the player fights, stands on a deck or boards,
  is off the helm, or is any hostile ship's quarry, when the course ends in the water the ship is in, and as any
  course is refused; its last leg and the place it would lie are judged besides against every standing island, told
  to the player or not, and judged before anything is set, so a refusal there leaves the ship, its course and its turn as they were. Taken, the ship lies on the course's last leg 400 m short of its end (at the leg's start where the
  leg is shorter), heading along it, its course the end alone at the pace asked, and the player's next roll for a
  hostile ship waits its first 30 s again; the hostile ships no player keeps go as ever. Either way the player is told
  (code 24: taken, or the reason's number), and a refused travel leaves the ship as it was.
- Ships move by + - * / and square root; the heading is the pure-Rust arctangent ([[Agree to the Bit]]).
- The Grey Tithe's ships sail among the players', each with its rank, and a bold one that meets a player fights them
  in the room, by the player's orders ([[Naval Combat]], "At sea"). One that meets a friendly ship of the traffic
  attacks it with no player (`friendlies.rs`, `clash.rs`): the room steps that fight each tick, the snapshot shows its
  ships at sea where the fight has them, and a player who comes within 750 m joins it beside the friendly ship. Each
  Tithe captain sails its rank's hull ([[Hulls]]), a friendly ship the traffic's. Who comes, at which rank and level, how far out and where, is the water's at the
  player's ship (`sighting.rs`, on the room's chart of its coasts, waters and lanes, `chart.rs`). The sea's snapshot
  carries each hostile ship's faction, rank, hull, level and the distance it is sighted from, and each player's fight
  its captain's faction, rank and hull; a fight's view carries every ship's hull. While a player fights,
  the room takes their orders and no course, and their ship is where the fight has it, at rest on the room's word. A
  ship sails at its pace held down as a hostile ship comes near, and the snapshot's pace for it is the one it sailed at. The
  sea opens on a seed for its hostile ships, from the runtime's random numbers (`room_open_sea`'s third number), round a
  layout file's text, or `{ "layout", "ports" }` with the ports as the waters' door takes them, whose lanes between the
  port cities the Grey Tithe patrols; with a layout alone it has no lanes. The server opens it with the port cities
  read from the land files (`server/seaPorts.ts`), as the page does (`portsOf`).
- **Measured** (`measure_tests.rs`, by hand in release): 20 players in each kind of water of the world's layout, each
  voyaging at ×60 straight out 150 km and back for ten minutes: sailing on whatever they sight, chasing every ship they
  sight (the room told), or turning away from a ship coming for them. Sailing on, a fight comes by 5 minutes for 30 to
  35% in the hostile waters and by 10 for 40 to 65%; the first
  ship is sighted at a median of 132 to 160 s; a ship stays in sight 37 to 59 s on average, 68 to 92% of them 30 s and
  over. Chasing, by 10 minutes 70 to 85% (by 5: 55 to 60%). Turning away, 35 of 36 a ship came for in hostile waters
  never fought. A voyage is held under ×60 for 3 s at most as a ship comes near along its way, but for one voyage,
  held up to 89 s.
- **How its fights end** ([[Naval Combat]], "How a fight ends"): a fight holds any number of players (`battle.rs`),
  joined by a player not fighting or a hostile ship at sea within 750 m of it; a captain's ship that sinks lays what
  floats for each player who fought it (`flotsam.rs`); a struck captain may be boarded, its deck a room on land the
  sea holds and steps (`deck_fight.rs`, `sea_decks.rs`), whose boarders' land inputs the sea passes to it; a player
  whose ship sinks, or beaten aboard it, washes up at the nearest port city (`harbour.rs`, `sea_ports.rs`); each ship
  keeps its hurts, with the player's character, which the sea claims and saves as a node does ([[Accounts]]), and is
  repaired by a port city. The sea keeps characters (`room_keep_characters`): a player's course asked before the
  accounts answered for them waits, then sails from where the room last kept it once their character is given back
  (a fight met from the page's spot meanwhile is over for it), or as asked once the host says none is kept
  (`room_none_kept`: the claim failed, or the page sent an input before its token; a token after it still gives it
  back where it was kept). A character given back with no place kept in it (a new one) puts to sea at Overlook's
  roadstead, wherever the page put it or asks. A new account's
  character is the one the room holds, given back to it. The account the
  keeper names (`room_own`) is kept with the player, and after they leave: what floats for it is theirs again when
  they join once more. Whatever
  changes a character at sea (a piece gathered, a fight's hurts, a repair done or stopped, washing up, the character
  given back) is sent to the player as their gear (`room_gear`, written as a land room writes it), at most every 12
  ticks, which flags it for its save 2 s on. No ship is left outside the world's frame: a fight's waters run past it,
  but where the fight has it, where it washes up and where its next course starts are held within it. A course's message asks for a repair (1), a boarding (2) or leaving its deck (3). The sea's
  snapshot carries what floats for each player, each ship's kept hurts and its repair's seconds left, what each player
  is told beside their fight's view (the naval crate's numbers, or the sea's own: washed up, what a piece held, who
  joined with its hull, moored; their codes one export on the page, `seaHarbour.ts` `TOLD`), whether each fighting
  player may board now (`may_board`), and each deck boarded with its boarders and its room's own snapshot. The host takes the snapshot
  once a tick (`room_snapshot_prepare`) and sends each socket its own cut (`room_snapshot_for`): what floats, kept
  hurts, what is told and a deck's own snapshot reach only the players they are for, and each player is sent only the
  ships near them: the hostile ships within 1.1 times the distance each is sighted from (the share that keeps it at
  sea), the other players' within 60 km (the page's farthest view at sea), and every player in their fight. A boarding
  is refused when its deck would hold no crew.
- **Measured** (`room-wasm/src/load_tests.rs`, by hand in release): the tick and every player's snapshot, players 60 km
  apart with three wary ships each: 432, 568 and 590 bytes a player a tick at 1, 8 and 16 players (tested offline).
- **Off the helm.** A player at sea and out of a fight may leave the helm: their body stands behind its wheel on its
  deck, facing its bow, and walks it by the movement crate on the deck's grid, in its own frame ([[Sailing]], "Its
  deck"). Their steps are taken as a land room takes inputs: numbered 1, 2, 3 and so on from the helm left, refused
  out of order or with controls that are not numbers or ask past a whole pace; never more than the ticks since they
  left the helm and 6 of slack, and 3 a tick at most to catch up; past 30 waiting the oldest is let go as taken. One
  whose steps stop coming is stood out a tick at a time once a view's lag (24 ticks) behind, as on land.
- **Its helmsman** keeps its course meanwhile: under way it sails on, at rest it stays. A course is refused but one
  that keeps its way, at any pace the room takes: the course it sails, its points to the whole metre, or one point
  straight on along its heading (within 0.01 radians of it), the page's course straight on, set again as it nears
  its end. So it sails on, at the pace the page eases it to for the view.
  They take the helm again within 0.8 m of the spot behind its wheel, standing, judged where their steps leave them
  once the steps the clock allows by then are taken; a bold hostile ship that meets them calls them to it at once.
- Playing alone, the [[Game]] runs this same room in a worker of its own (`LocalRoom.openSea`, through `RoomThread`;
  [[Game]], "Threads").

- **Islands.** The sea rolls its procedural islands near players' ships in hostile waters, tells each player those
  within 20 km of their ship and those they found, keeps every course and hostile ship off their coasts, and lets each
  fade ten minutes after nothing holds it ([[Islands]]). An island's room is `isle-<number>-<seed>`: the host opens it
  only on the `sea` room's word that the island stands with that seed (a call between the two Durable Objects), and
  while players stand ashore it tells the sea each minute, so the island is held under them. As an account joins it, the
  room asks the sea whether that account is landed on the island (its ship at rest at the island's anchorage) and lets
  go of one that is not; only landed accounts scavenge. An island's dungeon (`sea-dungeon-...`) opens the same way: only
  when the sea of its tier holds an island whose door leads there, named from that island's seed, water and style
  (`room_sea_dungeon`, `dungeon_room`), so no page opens one for a seed or a style it names. It holds that island while
  players are in it, lets go of an account the sea has not landed there (one the sea did not answer for, or not within
  20 seconds, may join again), and plays each input before the sea's answer as standing still, though a dress sent then
  is shown as any other.

## A fleet

A room named `fleet-<name>` is a place at sea at true scale, on the open sea under the world's swell ([[Sailing]]),
where each player sails their own Sloop by its helm and fights, and captains called into the room, of a faction and a
rank each, fight whom they choose, all in one fight ([[Naval Combat]]).

- **Its weather.** The host opens it at the world's time (`room_world_start`); its sea takes the weather at its place
  then and keeps it, and its snapshot carries that time (`world_start`), so a browser predicting its ship sails in the
  same weather.
- **Putting to sea.** A player joins with no ship at sea. The first of their orders that says where puts their Sloop to
  sea there, at that heading, anywhere in the world's frame; after that only its helm moves it.
- **Orders** are taken as a land room takes inputs: numbered 1, 2, 3 and so on, refused out of order or with a number
  that is not one (a rudder past its throw, a rung of more than one, a look past its half circle or the guns' 100 km);
  one a tick, never more than the ticks since they joined and 6 of slack, 3 a tick at most to catch up, and none in a
  tick after one that fires, since the fight judges a release by their brace and ship after all their orders of the
  tick; past 30 waiting, the oldest let go as though taken. Each order taken steps their ship once, so late ones catch
  it up and a browser's prediction of it is their orders stepped in turn. A player whose orders stop lies as they were,
  riding the swell, until they fall a view's lag (24 ticks) behind; then they stand, a tick at a time, from the moment
  they join (their helm too once they are at sea), so time spent before putting to sea is not banked to catch up on.
- **Captains.** An order may call a captain onto the ring round the player's ship, while the room holds fewer than
  four, or send every captain off. A captain who sinks, or lies past every ship it may fight (each player's, and
  each afloat captain's of another faction) and is not fighting, leaves the room.
- **What it sees:** every ship (its hull, its helm's numbers and pose, hull, sail and men, state and fires, guns and
  load, a captain's mode, target and sides run out, and a player's last order taken), the balls aloft, what happened in
  the fight since it was last asked, and the fight's clock.
- A room holds 16 players. Its chances are drawn from one seed, so one room fights the same fight for the same orders.
  A room on land the servers host is given two seeds of its own, random and never sent: one its loot is drawn from,
  and one its foes' choices are, so what a player sees of the foes tells them nothing of the loot. The sea is given
  the same two: what floats and what each boarded deck drops roll on them, a deck's mixed by its ship, never on the
  sea's own seed, which its islands' seeds show ([[The Audit's Leftovers Are Fixed as Claude Suggested]]). A node's
  garrison is drawn, as the room opens, from its id alone, so it stands the same on every machine.

## The bake

A whole continent takes 104 to 230 MB to generate, more than a room's 128 MB. So `npm run bake` (`crates/bake`) cuts
each node's ground at build time: it generates every continent with its edits, settles its city on it, and writes
`generated/nodes/<node id>.json` for every node, the drawn ones and each city's social space, and an index of them,
`generated/nodes/index.json`. It reads the RMB index in `content/world/rmb/index.json` when there is one; with none,
a city has the same pads and walls.

A drawn node's section, spawns and boxes are its layout's: the bake settles every layout on its landmass after its
city ([[Layouts]]), so the window is cut from the carved land. A node's file holds its id, kind, name and continent; its section's ring and spawns; the rect its window covers (the
ring's bounds and 100 m past them, beyond the 60 m where a body dies); the exact window of the ground over that rect,
city terraces and the layouts' carving included; the boxes of the city and the layouts a body runs into there, each
with its top and its underside; for a social space, the counters that serve a player's gear (the Mage's, the vaults',
the Armorsmith's, the Weaponsmith's, the Tailor's, the Tack's and the three factions'), Shape's eight places
(`shape_spots`, Overlook's alone) and in Overlook's, `board`, the bounty board's counter, where a player stands before
it (none in any other node); and whether it is locked: each patrol area and mission the open list,
`content/world/open.json`, does not name ([[World Map]], "Seen whole, reached by nodes"), and each social space but
Overlook's ([[Only Overlook's Social Space Opens for Now]]); and its gates: the nodes its layout's gates and way in
lead to, each with a layout of its own, as the [[Game]]'s passages go. The index lists each node's id, kind, name,
continent, rect and gates, which the host reads to judge arrivals. A locked node's room opens but takes no player, and so does
each dungeon's room of a locked patrol, its runs among them, which open only with the patrol's file. The bake takes
about 17 s for the nine continents' 99 nodes, a few at a time, and writes about 15.2 MB in all, a patrol area's file
the largest at about 0.59 MB (the Saltgrass Downs', its rooms' and rock's boxes). `server`, `server:bundle` and
`server:deploy` run it first. It fails, writing nothing, when two nodes of the world share an id, when one is called
`index`, or when an id is too long for its rooms' longest name, `node-<id>--abyss--dungeon-2--run-00000000`, of at
most 64 characters.

## Messages

Every message is defined once, in `crates/protocol/messages.fbs` and the player's gear in `gear.fbs`, which it
includes, and `flatc` makes the Rust and the TypeScript for them ([[Messages Are FlatBuffers]]). A body and controls cross as the movement crate's numbers, in its order: a body's
22 and the controls' 7, the same as through the browser's WebAssembly door. A table gains fields only at its end, so
an older reader skips them.

| Message | From | Holds |
|---|---|---|
| Input | A browser, on land | Its number, one tick's controls and the fight's buttons (with a ranged weapon's aim, the point an aimed shot is laid on and a drink asked), the look of the player's figure on their own screen (its move, frame and facing), their dress when it changed, what their hands hold, the room tick their screen showed, a foe asked for (0 none, 255 every foe sent away) with its type and rank (a page from before the roster asks by role alone, 1 to 5, taken as the Grey Tithe's type in that role, a foe, a Major or its first rank), its level and the element of its shield, whether they ask to respawn, an ask of their gear: what, and the item or Vestige, slot, node, rarity, level, count, kind or named item it names, and a spell cast that tick (1 Tempest to 9 Vanish) with where it is aimed (Dusk Daggers' ring while held and as it is let go), and whether a menu is open on their screen |
| Course | A browser, at sea | The points its ship sails through, x then y, and its pace, or no points and the one heading it faces at rest; in a fight, its orders instead, in the naval crate's numbers (`naval::wire`); off the helm, a step of the walk on deck instead, its controls and its number; or the helm left (1) or taken again (2) |
| Orders | A browser, in a fleet | Its number; the helm (rudder, a rung); while aiming, the look's bearing and range, then its ray (2 or 8 numbers); the fire and the brace; a load to take; where the ship puts to sea (3 numbers, heeded once); and a captain called (with its faction and rank; 0 for both is the Grey Tithe's Major) or every one sent off |
| Joined | The room | The joining player's number, every dress in the room, in a node's room the node's id and its window's rect (west, north, east, south), so the browser cuts the same window (none in a dungeon's room, which stands on no land), and the protocol's version: the hash of the schema, of the files laying out the fights' numbers that cross as plain lists (`FLOATS` in `server/protocolVersion.ts`: a fighter with its body, statuses and trim, an intent and a glance, the sea fight's view and lay, the foes' list and how others' numbers are packed) and of the content and rules the wire numbers by place (`tools/numbered.json`, `server/protocolVersion.ts`: cosmetics, emblems, factions, items, resources, rolled names, the Arts, the lore's chapters, the quests' tasks, the keepers spoken with and their counters' numbers, the cast's speakers, the items' kinds and slots, and the smiths' stock), so a page built from another schema, other layouts or another order of that content loads again, once; and everyone's plate |
| Snapshot | The room | Cut for each player (under this table): the room's tick, the snapshot it is built on (0 for whole), the room's middle, the players and foes gone since; each player whole or as what changed: their number, their fighter without its gear's trim (its first 22 numbers their body, its healing charges and meter after its action's numbers and the shots its Ranged weapon has left, then its statuses' ticks left, a Veiled player's among them), the number of their last input taken, the look that came with it, and their standing (0 inside, 1 warned with the ticks left, 2 dead with the ticks since); the dresses changed since the screen's snapshot; the plates changed since it, each player's newest alone; each foe whole or as what changed: its number, role, a glance at its fighter, its level and its shield (its element, what it holds and held whole; none for a foe without one), type, rank, faction, phase (1 to 3), alert state (0 idle, 1 suspicious, 2 alert, 3 searching), and the ticks left of its Expose, its Charge and the immunity a Charge leaves, and for a companion (an officer ashore) its leader's number, its officer's given and family names' places and its post; and the name a foe stands under, if it has one (an event's great foe's); the fight's events since the screen's snapshot (each its kind, how the blow was struck, who struck whom, how much it did, its stroke, whether it was a crit and the element it carried); the shots in flight with the ticks each has flown, and each ball that stopped since the screen's snapshot as its last segment with the point it left its gun; in a dungeon's room its cache: where it stands, the way it faces, and whether it is open; in an Abyss run the revives its company has left (-1 in any other room); and at sea every ship near the player (as "The sea" cuts it): its player, position, heading and pace, 0 at rest; every hostile ship near them (the Grey Tithe's, sailing or in a clash): its number, position, heading, faction, rank and hull (0 the Sloop to 3 the Frigate; a reader that knows none reads the Sloop); each player's fight as the naval crate's numbers; each traffic id the room has taken off its route (`taken`) and each friendly ship it keeps at sea that the player's ship keeps in sight, as a hostile ship is kept (`friendlies`: its traffic id, position, heading and hull), none when there are none; and each player off the helm on a ship sent, as a player whose fighter is only their body on its deck, in its frame, with the number of their last step taken; in a fleet every ship with its hull, a captain's with its faction and rank, the balls aloft (each where and when it left its gun, its launch and its radius), the fight's events since the last snapshot, and the fight's clock; and on land every spell: its number, kind (1 Tempest's orb to 9 Vanish's veil, 10 a Duskraven's bolt), caster and Art, where it is and where it heads, the foe it seeks, the ticks it has lasted and its whole life, and how far it reaches; and in a zone's room its public event (`public_event`, left out of one built on a base while it stands as the base's counted on: [[Public Events]], "The wire") |

**Plates.** On land each player's plate, what others read over their head ([[Interface]], "Players"), crosses as a table
of its own: their number, their username (none for a guest), their level, and whether a menu is open on their screen, as
their last input said. Every plate goes in the welcome, and a plate that changed goes in every snapshot until a later
one is shown, as a dress does, the newest of each player's alone (`plates.rs`, `take_plate_changes`). At sea no plate
crosses: a deck draws none, and the sea names no one.

**Each player's own snapshot.** On land a snapshot is written for each player. Their own fighter crosses whole, as
they predict from it; everyone else's numbers, and every foe's, cross packed: each in thousandths, a whole number
zigzagged into a varint, x and y measured from the room's middle (the snapshot says where), so a whole number crosses
exactly and any other within half a thousandth (`pack.rs`). The room keeps two seconds of what its snapshots held
(`sent.rs`), and a player's next holds only what changed since the one their screen last showed (the tick their
input names): the players and foes that changed, each as only its numbers that changed with a bit for each, their
own fighter likewise but whole, and those gone. The fight's events, dresses changed and balls stopped since that
tick go each time until a later one is shown, so a snapshot lost on the way costs nothing the next does not carry.
A player whose screen is further behind is sent everything. A foe's packed numbers end with its companion's four (0
for a foe). An island's room measures from its middle, floored to whole metres; a course's from the world's middle. A
deck boarded at sea sends each boarder their own snapshot inside the sea's: their fighter whole, the rest packed, and
all of it each tick, since the sea's snapshot is not built on another. At sea, each player is sent their own fight
alone. An input may carry the inputs before it, which the room takes when it has not had them (`read_inputs`); a
boarder's input on a deck is taken alone (`read_input`).

A fight at sea crosses as the naval crate's numbers (`naval::wire`). Orders, sixteen: the helm's steer (-1 port to 1
starboard), a tap for a burst (1 or 0, acting once) and climb; whether a look is laid, its bearing off its bow
(degrees) and range (metres); whether it has a ray, and the ray's eye (east, south, up) and the way it looks, so a look
on the captain lays on it (the eye within 100 m of the player's ship, else the ray lays nothing, [[Naval Combat]]); the fire, the brace, and a load (0 none, else 1 and its place among round, grape, chain and
heated). The view: the clock and its end (0 on, 1 sunk, 2 gone); each ship, the player's then the captain's, 29 numbers
(its own 8, its pose's 4, hull, canvas and men with their most, its state, its fires, each side's seconds left and
progress, its load and brace, its burst's share still to run and its recharge's share done, and its hull: 0 the Sloop,
1 the Schooner, 2 the Brig, 3 the Frigate); the
captain's mode, whether it is hostile (not of the players' side) and its sides run out; any other captains in the fight, a count and each one's
faction, rank, 29 numbers, mode, hostility and sides run out; the balls aloft, a count and four each; the lay, 0 or 1
and its side, elevation, reach, landing zone's radius, whether on target, and a count of sixteen each: the gun's
launch (six), then where its ball stops (whether it does, its time, point, whether in the water, and whether and
where it strikes the ship); and the events, a count and each one's kind and numbers (a ram, the tenth kind: the ship
struck, by whom, the point and the hull it took). The message carries the other captains in a field of their own
(`naval::wire::parted`), out of the view, so a page that knows one captain reads the view whole; a page that knows them
puts them back in their place, and reads a fight from a room that sends none as a fight without them.

The server reads an input or a course only after FlatBuffers' verifier passes its bytes, so bytes that are not one,
controls that are not 7 numbers, or a course's numbers that are not pairs, are refused. The browser reads a message
the room sent, and takes one it cannot read as nothing; a captain an older room sends with no faction or rank reads as
a Major of the Grey Tithe. The browser's messages never carry a number wrapped: one that names something past what its
field holds (an input's or orders' number, the arms, a foe's type, a load, a call) is refused as it is written (a
`RangeError`), and one the room takes within a range (a frame, the tick seen, a rank, the rudder, a rung, a look) is
held within it.

Looks and dresses are each player's own word, passed on and decided nothing about, but for the gear they show: the
room keeps in a dress's armour and hands only the looks the page could draw the pieces worn in on the dress's body:
each piece's own content's, written or faction's set or metal, the prologue's own armour's steel, or the one the page
falls to where the forge does not draw it (`looks::shown`; [[Gear]], "Looks"; a light in the left hand is no piece,
and stays), drops any other from what others see, puts the dye and barding the character wears and the coat of the
horse it wears into it, none for a start piece, and
keeps a faction's colour or a dye only on the layers its pieces worn and dyes kept allow, so no page can show another
a piece it does not wear or keep ([[Gear]], "Cosmetics"). It makes a dress again when the browser sends one or after
the player's gear is sent. A look goes out with the tick that
takes its input, a dress once each time it changes, and every dress to whoever joins. The room refuses a move name
that is not lowercase letters, digits and underscores or is over 40 bytes, and a dress over 4 KB. A dress that does
not read, not an object with an outfit, is dropped from its input, which is taken all the same, and others go on
seeing the last one that did. A browser takes
another player's dress only when it has a dress's shape, and their move only where the forge draws it for that
figure; otherwise it shows the move their body is in.

| Gear | The room, to one player alone, whenever theirs changes | Their XP, level, Prestige and Defense; their Aurem, fragments, Essence, Fruit of Dagon and each island's resource; every item they hold (its number, kind, rarity, level, name, island resource, XP and most, nodes bought and chosen, where it is, its Attack, Defense and Prestige, each column of its nodes with its traits, the XP that unlocks it and its cost, so the browser draws them without the rules, a weapon's element, and a ware's price); in a social space the day's wares; their Vestiges, and the drops lying for them (a Vestige, an Ammo box or an Ammo crate, where it lies, where it was thrown from and the ticks it still flies); the resource nodes they have spent; on a sea island, the wrecks they have scavenged there (`scavenged`); whether they stand where a Vestige opens (the Mage's counter, or the stall); the answer to their last ask; their fighter's trim, which their browser puts back on the fighter a snapshot gives before it predicts them; the arms their gear lets them take up, which their browser predicts them with, bare hands for any other; how far they are to their next level and their next Fruit of Dagon; the emblems they keep, the one they wear, and in a social space the Tailor's of the day; the Art they wear, each Art's Core, and how far their Anima and each Tenet have charged; and the Ranged loadout's ammunition (the shots left and the capacity of the one worn, the share of a full capacity kept), the Ammo crates carried and, in a social space, the Weaponsmith's price for one; where they stand with the factions (the pledge, each faction's reputation and packages waiting) and each Art's level, XP and fragments owned; the cosmetics they keep and wear and, in a social space, those the Tailor and the Tack sell that day; their Shapes, and while Shape is in their social space his place and wares; in a social space every faction's wares ([[Factions]]); the clock's day the room's word is of (each beginning at 09:00 UTC), which a smith's ware and a bounty's ask are asked by; in a patrol or an Elite Dungeon's node, its dungeons' entrances, each where it stands, the ground's height there, its model's yaw and which model it is; whether they have finished the prologue; their day's and week's record as kept (the day it is for and the tiers of the dungeon of the day cleared then, the week it is for, the week's two cleared and the Abyss boon), sent raw for the page to judge against its own day and week; and the day's six bounties on the board as they stand for them (each one's words, target, count, whether held and whether turned in, none held from another day), each one's pool (on land, at sea or in dungeons) and name, and what each pays them at their level |

## The host

A Cloudflare Worker, in `server/` ([[The Server's Shell Is in server]]), sends `/room/<name>` to one Durable Object for
each room's name. The object keeps its room in WebAssembly: the room and protocol crates behind the `room-wasm` door,
so every decision is Rust and the shell only carries bytes and time.

- The name says which room it is, opened when the first player joins: `sea` is the sea, round the layout's
  continents, and `sea--elite` or `sea--abyss` the sea at a harder difficulty (`seaRoom`); `node-<id>` is that
  node's room, from its baked file, and `node-<id>--elite` or `--abyss` the same
  node at a voyage's harder difficulty, a room of its own; `node-<patrol>--dungeon-0`, `-1` or `-2` is one of a
  patrol's dungeons, one room shared at Normal, opened from the patrol's baked file; `fleet-<name>` a fleet's place
  on the open sea; `test-<name>` is the Test Ground's course, `content/testground/course.json`, which the client
  reads too, with its stall and resource nodes laid out. Any other name answers 404 (`TEST_GROUND`), so no misspelt
  room opens a Test Ground. A node with no baked file answers 404, as does a dungeon
  whose node is no patrol. Any other spelling of a node's room is no room, but for the tiers' old names: `--rough`
  and `--storm` are read as `--elite` and `--abyss` (`canonicalRoom`), so a page that still builds them joins its
  room and loads again. A name is 64 characters at most.
- **Runs** (`roomNames.ts`): a name ending `--run-<instance>`, eight lowercase letters or digits, is a private room,
  a run ([[Activities]]): `node-<patrol>--elite--dungeon-<n>--run-<i>` or `--abyss--` a patrol's dungeon at Elite or
  Abyss, `node-<Elite Dungeon>--run-<i>` an Elite Dungeon, `node-<Elite Dungeon>--elite--run-<i>` or `--abyss--`
  the week's two, and `node-<Elite Dungeon>--elite--playlist-<foes' level>--run-<i>` or `--abyss--` a playlist's run
  (`nodeRoom`'s `playlist`, which `runAsk` hands the room module as the ask's `playlist`; [[Activities]], "The
  Playlist"). The week's run the Playlist launches is marked `--sea` before its instance
  (`node-<Elite Dungeon>--abyss--sea--run-<i>`): it opens as the week's run, and `startedAtSea` reads it and a
  playlist's run as started at sea. A sea island's dungeon is `sea-dungeon-<continent>-<style>-<seed, 8 hex digits>`, shared at
  Normal, with `--elite--run-<i>` or `--abyss--run-<i>` after it a run (`seaDungeonRoom`). No name opens a shared
  Elite or Abyss dungeon, a private Normal one, or a run without its whole instance. A run and a sea island's
  dungeon (on its sea's word, "The sea") open from their name: `runAsk` makes the ask the room module's `open_run` takes, at the minute the first
  player joins, and a patrol's dungeon's run is given its patrol's node file too, so it keeps the patrol's lock. One
  no rule lays, or whose patrol's file is missing, answers 404.
- **A playlist's run is the server's**: its first character is given only to an account the server found or launched
  it for within a day, or one of that account's company, (`launched(account, room)`, `found_runs`), so its Elite Dungeon is always the server's draw
  ([[A Playlist's Launch Is Drawn by the Server]]); any other first is let go untouched, closed with 4003 and "Start
  this run from the Playlist.". Then it keeps to its company as any run does.
- **A run keeps to its company** (`Keeper.forCompany`): a character is given to the first to come, then only to one
  it let in before, one in the company of someone it let in, or one it was found for with them by Find a Company
  (`companions(account, room)`, [[Accounts]]), for as long as the run lives, so a member back after every other
  dropped finds it theirs still; any other is let go untouched, and the socket closed with 4003 and "This run is another company's.". It keeps no one unkept: a token that is no session,
  or no token five seconds after the join (a claim's own waits), closes with 4003 and "Sign in to enter this run.",
  and a claim or a company the accounts never gave, each asked again after a claim's waits, closes with 1013 and
  "Something went wrong. Try again.", which the page joins again on; a kept character the room cannot read closes
  with 4003 and those words, since joining again would find it the same. A run holds four accounts (`RUN_MOST`, a
  company's most), judged as each signs in: a fifth account is sent away with 4003 and "This run is full.", so the
  page takes them back as from a shut gate, saying why, while a member signing in again on a new socket is kept and
  their old socket let go. Its sockets are held to twice that, eight, signed in or not (`socketsMost`), so those
  that never sign in are not without end in their five seconds. An emptied run's room stays as its company left it
  for `RUN_LINGER_MS`, a minute, through a dropped connection, and is then forgotten: the next to come opens a fresh
  run.
- The baked files are the Worker's static assets, bound as `NODES`, so a node's room reads only its own file and the
  Worker's own bundle does not grow with the world. Every request goes to the Worker first, which serves no file to a
  browser.
- A WebSocket joins the room and is welcomed with the player's number; in a patrol's room, `?entrance=<number>` on
  its address stands them before that entrance's door, and an entrance it does not have is an ordinary join. They
  stay there only once the room keeps their character as come out of that entrance's dungeon or its run: one whose
  character came from anywhere else, who sends no token within five seconds or who plays unkept is stood at the next
  spawn (`outOfDoor`). Each
  binary message is one of their inputs, at sea their course, or in a fleet their ship's orders. A course too soon after the last is dropped and a course
  the sea will not sail is refused; any other input refused, a message over 8 KB, or more than 240 messages in a
  second (a browser sends 60), closes the socket, since that browser is not keeping to the messages. Its player
  leaves at once, no snapshot is sent to a socket that is closing, and whatever it had already sent is passed over
  unread.
- A kept player is named in the room by their account's username, which the claim answers (`Room::name_player`, through
  `room_name`), for their plate; a guest, or a player who plays unkept, has no name.
- A browser's one text message is its session's token. In a node's room, a dungeon's, an island's and at sea the
  player's character is claimed with it from the [[Accounts]], saved as it changes and let go when they leave. As a
  player leaves, the host first has the room send every Vestige still lying for them to their mail (`mailLying`, at sea
  from the captain's deck they stand on; [[Gear]], "The mail"), then reads their character for its last save, then lets
  the room take them out, so the save keeps what they left lying. Not yet so: a player whose socket a second sign-in
  replaces, and every player of a room a deploy restarts or a fault stops, leave without that last save. A socket there
  that sends no token within five seconds of the join (a claim's own waits, `TOKEN_WAIT_MS`), or whose token is no
  session, is closed with 4003 and "Sign in to play online." (in a run, "Sign in to enter this run."), so sockets that
  never sign in cannot hold a room's places; every page of the game sends one, a guest's included. Nor can one address
  fill them in those five seconds: a room holds eight of its sockets unsigned at most (`UNSIGNED_FROM_ONE`, an IPv6
  address by its /64 as the accounts count it, `addressKey`), and a ninth closes with 1013, which the page joins again
  on. While the accounts do
  not answer a claim, or the look before it, the player plays on unkept, and a look unanswered claims nothing. The Test
  Ground's rooms and a fleet's keep nothing and take anyone. A character the room's gate shuts ([[Activities]]) is let
  go untouched, and the socket closed with 4003 and the gate's reason. Every room that keeps characters judges one on a
  look before it claims it, so one turned away stays with the room that plays it. A save keeps the keys a room does not
  know, at its top, in its materials, Arts, allegiance and cosmetics, in its day's activity and its story, and in each
  item and Vestige, so a room that knows fewer fields carries the newer ones through; a room built before this keeping
  drops them, so a rollback to one loses them. A new value of a kind the room knows (a slot, a rarity) reads as a broken
  save, which is left untouched, and a list longer than the room's Arts or factions is cut to them. At sea the room also
  tells the accounts the player is there and the water their ship is in (`room_water`, by the chart's waters,
  `sea_waters.rs`), again every 30 seconds and as soon as the water changes, and that they left, for the Roster and
  the chat ([[Chat]]), each word after the last so the newest is the one kept. The token again, from a player who took
  a username since they joined, names them anew (`Keeper.rename`, at most every 5 s); any other text message closes the
  socket. The page sends it when its account changes.
- **Where a character comes from** ([[The Server Is the Authority Over Everything]]): each claim says which room held
  the character before ([[Accounts]], "Moving between rooms"), and a node's room, its dungeons' and its runs' judge by
  it alone how it arrives (`arrival.ts`), never by the page, on a look before the claim, so a character turned away
  stays with the room that plays it. Overlook's social space, where every session begins and
  where a new character first stands, takes anyone. Any other node's room takes a character that rejoins it; that
  lands from the sea at the room's seas (a social space's from any), the ship the sea kept in it (`ship_at`) lying
  within the landfall's 30 km of the node's island's coast, and 2 km more, since the ship heaves to a moment after
  the page offers it; that comes through a gate from a node whose gate leads there, at the same seas (the bake's
  `gates`); or that comes out of the node's own dungeon or run, at the seas it went in at. A dungeon's room or a run
  takes one from its node's room at its seas, and an Elite Dungeon's run (at Normal, or the week's at its own tier)
  from its node at any seas. A run started at sea (`startedAtSea`: a playlist's, or the week's marked `--sea`) takes
  one from the sea alone, as the Playlist beside a port launches it, and never leads out to its node or by its door,
  so no run carries a player across the sea onto an island. A character that came by none of these ways may still join one of its company who plays
  in the room, as the Roster's "Go to them" does (`companions`). Any other is let go untouched, and the socket closed with 4003 and "You cannot reach
  this place from where you were.", so the page takes the player back to their ship, saying so. A player unkept is
  not judged, as they keep nothing. The sea, its islands and their dungeons keep their own rules ("The sea").
- Sockets are the object's own: the room lives only in its memory, so a socket never outlasts it, and a browser whose
  room is gone learns so by its socket closing, and joins again.
- A full room closes the socket saying so (1013, "the room is full"), and so does one past its sockets, 64, the
  sea's guard, or a run's eight: the socket is taken only to be closed, since a page never reads a refused upgrade's
  status. A locked node's room takes no one, at any seas: the room answers every join with none and says why
  (`refusal`), and the host closes the socket with 4003 and those words, "<name> is locked". A landing, a gate and a
  company's join all come in as a join, so none gets in. Should the room's WebAssembly ever trap, every socket is
  closed and the object starts over.
- While anyone is in, a timer ticks the room in step with the clock, catching up whole ticks it was late for, and
  sends every player their own snapshot after each tick (taken once, `room_snapshot_prepare`, then cut for each,
  `room_snapshot_for`), and their own gear when it changed; a socket closing as it is sent to is passed over, so the rest
  still get the tick. When the last player leaves it stops, and the room goes with the object.
- Each second, and before its first tick, the host gives the room the Unix minute; the rules read the day and the week
  from it (`gear::clock`).

## The browser's side

- `RoomConnection` joins a room, keeps its welcome's node, sends its session's token once welcomed when the page holds
  one ([[Accounts]]), and sends each tick's controls, numbered, as the player
  plays, with a respawn when asked; at sea it sends the ship's course.
- **Joining again.** When a room's socket closes, for a deploy or a dropped network, `RoomConnection` joins the room
  again by itself: after 1 s, then 2, 4 and 8 s between tries, 15 s at most, and 1 s again once a join holds. The page
  says "Reconnecting…" meanwhile, and nothing is sent until the new socket's welcome. A rejoin is a new join: a new
  number, inputs numbered from 1 again, the player standing where the room puts them, their dress sent again and what
  their hands hold kept, and every other figure drawn on from where the new room has it, though its clock starts again.
  The [[Test Ground]], the [[Game]]'s node rooms and sea, and a fleet each follow it so; at sea, and in a fleet, the
  ship puts to sea again where it lies. A room that sends the player away for not keeping to the messages (1008, 1009),
  whose gate shuts to their character or whose node is locked (4003), or whose character another of their sockets took,
  in that room or another (4001), is not joined again, and the page says why: on foot, "The room was lost: your
  character joined another room". A 4001 on a socket the page already let go of, a rejoin's old socket the room had not
  seen close, changes nothing.
- **Whole snapshots.** `SnapshotKeeper` holds four seconds of the snapshots it made whole, lays each new one over
  the one it names (players and foes changed, their changed numbers over theirs, those gone taken out) and hands on
  each event and stopped ball once; one older than the last, or built on one no longer held, is passed over. Each
  socket keeps its own, so a rejoin starts afresh.
- **Inputs that survive a loss.** On a link that may lose a message, each input carries up to the 8 before it
  (`RoomLink.resend`); a WebSocket loses none, so it carries none. An input carrying more is refused, and the server
  sends its socket away (1008). A browser's message is read under tight verifier limits (a few tables deep, the
  tables nine inputs need, twice a message's bytes), so one table pointed at again and again cannot stall a room.
- **Lag and loss.** `RoomConnection` measures its link (`LinkMeasure`): the time from an input sent to the snapshot
  that shows it taken, smoothed as TCP smooths its round trip, how much it strays, and the share of snapshots passed
  over.
- `Prediction` keeps the inputs the room has not taken. On each snapshot the player's body is set to the room's word
  with those inputs stepped on top by the same rules, on the same ground: for a node's room, `standOn` cuts the rect the
  welcome names from the landmass open in the land's worker and stands the movement rules and the fight's on it, with
  the city's boxes ([[Land]], [[Movement]]). While the room agrees, that is the body already shown, to the bit; where it
  knows better, the body moves to it. A body the room says is dead stays where the room saw it.
- The [[Test Ground]] joins its room, `test-<name>`, when its address carries `?room=`, and shows every other player
  where the room last saw them.
- In a fleet, `FleetSession` sends each tick's orders, numbered, as the page's clock owes them, and keeps its ship as
  the room last gave it with its orders it has not taken stepped on top through `room-wasm` (`fleet_predict`), and
  its look's lay laid among the ships it sees (`fleet_lay`). The [[World Editor]] sails in a fleet when its address
  carries `?room=`: a fleet's name on the deployed rooms, or a local server's address for its `fleet-editor`.

## Running it

- **Deployed** as the Worker `overlook-rooms`: a room is `wss://overlook-rooms.mackcothran.workers.dev/room/<name>`. CI
  deploys it after a merge into `main`, once the same commit has passed the check, and publishes the page only once the
  rooms have deployed or had nothing to ([[The Rooms Deploy When Their Code Changes]],
  [[The Page Publishes Only After the Rooms Deploy]]): the `rooms` workflow, with the repository's `CLOUDFLARE_TOKEN`
  secret, only while that commit is still `main`'s head, and only when what the rooms are built from differs from the
  commit they were last deployed from: the crates of `room-wasm` and of the bake, `server/` and the page's files it imports, the schema's
  maker and its list, the content they read, the toolchain, the locks and the deploy's scripts, and the workflow (`ROOMS_CODE` in
  `rooms.yml`; `server/roomsDeploy.test.ts` fails when it misses a crate, or a file those crates or their build scripts build in). A merge of notes alone deploys nothing. Each deploy is recorded as a deployment to the `rooms`
  environment, which the next run compares with; with none found, it deploys. Without the secret it warns and deploys
  nothing, and when the rooms had something to deploy the page is not published either. Run by hand from `main`, it
  deploys whatever changed or not, but only a commit whose own CI check passed (a check run named `check` that
  succeeded): on any other the run ends red and deploys nothing
  ([[The Audit's Leftovers Are Fixed as Claude Suggested]]).
  `npm run server:deploy` deploys whatever changed or not from a machine that holds the token itself.
  The same workflow deploys the [[Accounts]] first, since the rooms' service binding names their Worker; should that
  fail, the rooms still deploy, beside the accounts last deployed.
- **Locally**, `npm run server` runs the rooms on Cloudflare's own runtime, at `ws://127.0.0.1:8787/room/<name>`.
- **In the page**, the Test Ground and the [[Game]] played alone run the same room in its own WebAssembly, ticked by
  the page: the Test Ground's course, a node's room on the window and boxes the page cut, and the sea.

Measured on the deployed rooms with two browsers in one room: 60.0 ticks a second; snapshots 16.2 ms apart at the
median, 59 ms at the 99th in a hundred and 84 ms at the most; the room taking a player's input about 4 ticks after it
was sent; and every snapshot of a player matching that player's inputs replayed by the movement rules, to the bit.

Played on the local runtime with two headless pages of the [[Test Ground]] in one room, foes of both factions and a
Boss fighting them and each other (tested live, locally): both pages held the same foes, health, phases and
alertness at every room tick they both kept, about 900 a run, and showed the same plates and boss bar. The room's
word on each page's own fighter matched what the page had shown for that input for about 98% of inputs; the rest
were blows that landed, deaths and stands again, and ticks the room stood a page still once its inputs fell a view's
lag behind, as a headless page's slow frames do. Stopped mid-fight and started again, the runtime had both pages say
"Reconnecting…" and join again by themselves, within one wait of its coming back.

The same two pages in a patrol node's room, nine of its eleven foes walking their beats each tick, and on the course
with a swordsman climbing the ledge after one page's player and fighting both, held the same foes to the centimetre,
with the same levels, health, alertness and actions, at all of the 2,582 and 2,997 room ticks they both kept (tested
live, locally). On the course, each page swinging some 45 times, the room's word on its own fighter matched for 98%
of inputs. The rest were blows that landed, stands again, and ticks the room stood a page still for its slow frames,
which set a swing under way on by those ticks; the lock changed only where the room knew of a blow. Played offline
at a steady 60 inputs a second with 2 to 8 ticks of lag each way, the same fight matched for 91 to 98% of inputs and
set no swing on: every difference came within 2 s of a blow by or on the player, a death or a stand again.

## Limits

- Each deploy starts every room afresh: whoever is in one is dropped and joins again by themselves as a new player,
  where the room stands them; their place, a fight and its foes are lost. A deployed node's window can lag the edits
  files until the next merge.
- A room bakes its navmesh as it opens: 0.1 to 0.2 s of WebAssembly for the [[Test Ground]]'s course, its links
  among it (tested offline, on a busy machine). The
  account's Workers Paid plan gives a Durable Object 30 s of CPU an event.
- Any page can join a room, under any name; a player is known only by the session their page gives ([[Accounts]]),
  and a kept character is let into a node's room only by a way that leads there ("The host").
- A character kept before the rooms said where it came from was held nowhere: its first room is Overlook's social
  space, the sea, or one of its company's.
- A landing is judged by the island the ship lies off, not by the side of it the page shows, so a player may land at
  any node of an island they have sailed to.
- A full sea of sockets each asking for the costliest course it may holds about a third of the sea's time: 40
  snapshots a second against 57, with 63 such sockets on the local runtime (tested offline).
- A node's room with its garrison and one player running and swinging sends a snapshot of 0.30 to 0.73 KB a tick,
  0.34 KB at the median over the 31 nodes that take players, and 0.04 to 0.13 KB as the WebSocket deflates it (its
  window reaching back over the snapshots before), 0.06 KB at the median, about 4 KB a second; 0.3% of snapshots
  (the first whole ones after a join) are larger than a datagram's 1,100 bytes (tested offline,
  `node tools/wireSizes.mjs`). A snapshot's fields the sea and the fleet added before these hold 10 to 30 bytes of its table's layout.
- A player's view may lag 24 ticks at most; a screen further behind is judged as it stands. A player could hold a
  claimed lag at the most to gain up to 24 ticks of reaction; nothing checks it.
- Arrows and bolts are not judged as their shooter saw: they fly in the room's time.
- A fleet's sea knows no coast: where a ship is put to sea is the player's word, anywhere in the world's frame, and
  the World Editor asks for open water 15 m deep before it joins. A fleet's lay is judged at the room's tick, not as
  the player's screen showed the ships (a ball's flight is long beside the lag).
- Players do not harm one another.
- On a boarded deck each boarder's snapshot is sent whole every tick, not as what changed (the sea's page reads it
  without a keeper), and a boarder's input is read alone, without the inputs it carries from before.
- A dress travels with a player's inputs, which flow only while they play: until then, others see a plain figure.
- A player who sends nothing waits a view's lag, then stands still where they were until their inputs come. The
  section judges them all the same, so the warning's count runs on.
- Bodies pass through each other; foes of one side keep apart by steering.
- The browser does not predict the section: it shows a warning, a death or a respawn when the room's snapshot says so.
- The [[Test Ground]] joins a Test Ground room by name; given a whole address it joins any room, a node's too, but sends
  no token, so a room that keeps characters sends it away. It predicts on its own course and never asks to respawn; the
  [[Game]] does both, and fights there. A server's node room takes no ask for a foe; only a room a page plays alone is
  told to (`take_foe_asks`).
- A dungeon's room bakes its navmesh over the dungeon's whole rectangle: two to five blocks laid in a chain that never
  crosses itself (an Elite Dungeon's four or five), so up to five blocks one way. Each of the 27 patrols lays all three
  entrances; a dungeon's room opens for its number whether or not its patrol's land found room for its entrance. A
  patrol's room takes `?entrance=` only from a character that came out of that entrance's dungeon; a player who
  plays unkept stands there for up to five seconds, until the host stands them at a spawn. Movement has no ceilings;
  a dungeon's are never reached, as nothing in it can be climbed.
- **A course a page plays alone** may be asked six things more, which no server ever asks and no message carries
  (`course.rs`, through the door's `room_stand_foe`, `room_clear_foes`, `room_set_spawn`, `room_put_player`,
  `room_stand_block` and `room_take_block`): a foe of the roster stood where the page puts it, on the top of the block
  under it, at the level asked, posted there (a Boss stood so calls no one in its phases); every foe sent away at once,
  and every blow a foe struck that has not landed with them; where the next respawn stands the player, a checkpoint;
  the player stood somewhere at once, keeping their health, as when they fall into the sea and are brought back; a
  block stood on the course after it opened, as a way closing; and a block it holds taken from it, as a way opening.
  The door keeps its own course for prediction in step with both. The foes' navmesh is not baked again for either. The
  [[Prologue]]'s wreck is played so.
- A node's room bakes its foes' navmesh over a 70 m square of its land and its layout's boxes in it, never its whole
  section or its city's boxes; a foe that chases a player off it walks straight. A node's room opens in 0.15 to
  0.34 s of WebAssembly, garrison and beats and all, 0.17 s at the median over the 90 garrisoned nodes (tested
  offline, on an idle machine).
- A node's room with one player and every group but a Boss's or a Miniboss's walking its beat ticks in 0.02 to 0.12 ms
  of WebAssembly at the median and in 0.65 ms at most at the 99th in a hundred, and its WebAssembly holds about 25 MB,
  the same after an hour open (tested offline).
- Inputs that catch up several steps in one tick are judged where the last leaves the body, so a body can step out
  and back within one tick unwarned.
- A ship that leaves the sea room leaves the sea. One unkept is its session's (`unkept:` and the token's SHA-256,
  never the token, through `room_own`), so it comes back where the sea last had it; the sea remembers 1,024 such at
  most. A page with no session at all is no one the sea knows, and puts in at a port city's roadstead, as a new
  player does.
- The sea judges a course against the continents' coasts and the coasts of the islands the player is told of (within
  20 km of where the course starts, or found), as the page bends its voyages round those alone: a long course may pass
  through an island farther off. Its anchorage still lands no one who does not lie at it.
