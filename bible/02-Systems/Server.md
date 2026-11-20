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
  - client/src/network/localRoom.ts#LocalRoom
  - client/src/combat/fighting.ts#Fighting
  - crates/room/src/players.rs#SLACK_TICKS
  - crates/room/src/players.rs#WAITING_LIMIT
  - crates/room/src/sea.rs#Sea
  - crates/room/src/sea.rs#PACES
  - crates/room/src/fleet.rs#Fleet
  - crates/room/src/fleet.rs#CAPTAINS_MOST
  - crates/protocol/src/fleet.rs#read_orders
  - crates/protocol/src/fleet.rs#fleet_snapshot_bytes
  - crates/room-wasm/src/fleet_door.rs#predict
  - crates/room/src/pirates.rs#Pirates
  - crates/naval/src/wire.rs#view_numbers
  - crates/naval/src/wire.rs#parted
  - crates/bake/src/lib.rs#nodes_of
  - crates/bake/src/lib.rs#MARGIN_M
  - crates/protocol/messages.fbs
  - crates/protocol/src/lib.rs#read_input
  - crates/protocol/src/lib.rs#read_course
  - crates/protocol/src/lib.rs#snapshot_bytes
  - crates/room-wasm/src/lib.rs#room_input
  - crates/room-wasm/src/lib.rs#open_node
  - crates/room-wasm/src/dungeon_door.rs#open_dungeon
  - crates/room-wasm/src/dungeon_door.rs#room_join_at
  - server/roomNames.ts#nodeRoom
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
  - client/src/rules/nodeGround.ts#standOnNode
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
- **Joining:** a player gets a number no one else in the room has had. In a node's room they stand on the ground at
  the node's spawns in turn, the first player at the first spawn, the next at the next; elsewhere at the room's spawn,
  on the top of the block under it (or the ground where none stands), and a respawn stands them there too.
  A patrol's room may instead stand a player 1.5 m before one of its entrances' doors, facing away from it, as they
  come out of that entrance's dungeon. A room holds 16 players; past that, it turns the next away.
- **Inputs:** each player numbers their inputs 1, 2, 3 and so on, and one out of order is refused, as is one with a
  number in it that is not a number. An input is one tick's intent, the controls ([[Movement]]) and the fight's
  buttons ([[Combat]]), with what the player's hands hold and the room tick their screen last showed. It steps that
  player's fighter once by combat's player tick, on the room's ground, among the fighters as that screen showed them,
  exactly as the browser that predicted it did, so a prediction can only differ where the server knows more
  ([[Clients Predict With the Shared Rules]]). What the hands hold is taken up only at rest, never in the middle of a
  swing, a guard, a draw or a reload.
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
  stands in kept); a node's over a 70 m square of its land, its first spawn 15 m inside the square's edge toward the
  middle of its section's ring, where its garrison stands; a dungeon's over the whole dungeon, kept to the floor its
  way in stands on ([[Navmesh]]). The room tells each foe the noises made and its allies' shouts, and keeps the
  fight's heat, fed where blows are settled.
- **Foes of different factions** fight each other: a foe's swing, telegraphed blow or shot on a foe of another side
  is judged at once, as a player's blow on a foe is.
- **A patrol** (a patrol node's room) fights its garrison alone ([[Enemies]]). Its island's resource stands at twelve
  spots laid out from the node's name, the same every time, 60 m apart; a third of them hold a node at once, the next
  third every three minutes, and each player may gather each node once while it stands. Its three dungeons'
  entrances are laid out from the node's id too, the same every time and drawn apart from the spots, so the spots
  stand where they always did: inside the ring and 60 m inside its edge, 60 m from every spawn, 40 m from every spot
  and 300 m from one another, on dry ground (above the sea, out of a river or a lake) whose height varies by 3 m at
  most across the 12 m round it; fewer when fewer fit. Each is the entrance model its dungeon's seed draws, turned so
  its door faces the middle of the ring. A kill, in any node, pays by the room's seas ([[Gear]], "Where foes
  stand").
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
- **Gear** ([[Gear]]): each player holds their gear while they are in the room, the starting kit as they join (in a
  node's room, their own kept character once their session is given, [[Accounts]]), and
  only what it puts in their hands (or a torch beside a one-handed weapon): any other arms asked for are bare hands.
  Every blow is made with its power: a player's on a foe by the Attack of the hand that struck and their levels (an
  arrow's or a bolt's by the Attack and perks it was loosed with), a foe's on a player by the player's Defense and
  their levels. A foe's kill pays every player whose blow landed on it in its last ten seconds and could harm it, each their own XP and Aurem and perhaps a Vestige, which lies where the foe fell for them
  alone for two minutes and is picked up by walking within 1.5 m.
- **Asks:** an input may carry an ask of the player's gear, answered in turn with it, and the answer kept to send
  them. A social space's room serves each of its asks within 4 m of that ask's counter, which its node
  file names: a Vestige opened at the Reader's, the vault at a vault's, a ware at its own vendor's, an emblem at the Tailor's; the Test Ground's
  course serves them all within 4 m of its stall. A resource node is gathered within 2.5 m by a player alive, and is
  spent for them until the nodes' turn passes; a kept character's is spent for its account, however often its player
  rejoins. One whose resource the player holds the most of is left standing, and a body dead past the edge gathers
  nothing. A room answers one player's asks five times a second at most, in the order asked, holding four for their
  turn and letting go of any past those; and sends their gear five times a second at most, so each answer reaches
  them before the next is made and a page that asks without end cannot flood its socket or slow the room. A change to
  how they fight (their trim, or the arms their gear allows) is sent at once, and before the snapshot, so their
  browser predicts them by it from that snapshot on. Only the Test Ground's room hands out gear to try the loop
  with.
- **The dead** stand again, whole, after four seconds, at the spawn nearest where they fell (in a dungeon, at its way
  in, facing into the room), and the foes leave them be for three more unless they strike first; a dead foe is gone
  after ten.
- **The clock:** an input waits for the room's next tick. A player's inputs step their body no more often than the
  ticks since they joined, plus a slack of 6 ticks for the network's jitter, and a tick takes at most 3, so no one
  moves faster than real time and one catching up after a stall replays no faster than three times over.
- **A player whose inputs stop** is stepped standing still once they fall a view's lag (24 ticks) behind, so nothing
  they were doing (a dodge's safe stretch, a parry window) outlasts its time, and time away is never banked to spend as
  speed; a body the section killed lies where it fell, but its ticks count the same. Past 30 waiting inputs, the oldest
  is let go as though taken, so a burst after a stall never breaks the order. The room tick a player says their screen
  showed moves on at most 4 ticks an input, so they cannot pick the moment they are judged at. A dress change is taken
  at most once a second.
- **The section:** after each player's inputs a node's room judges their body against the node's section ([[Reach]]):
  inside, warned with a count, or dead. A body dead past the section is still: its inputs are taken without moving it.
  An input that asks to respawn, once the section allows it, stands the body on the ground at the spawn nearest where
  it died. A room with no section never judges.
- **What it sees:** every player's fighter, where they stand with the section, and the number of their last input it
  took; every foe; the shots in flight, each with the ticks it has flown, and every gun's ball that stopped since it
  was last asked as its last segment, to where it stopped, with the point it left its gun, so every screen ends its
  tracer there however many ticks the room ran first; and what happened in the fight since it was last asked (a
  swing's blows with their stroke): hits, blocks, parries, guard breaks, dodges, staggers, deaths, players standing
  again, feints, foes arriving. The same on every machine.

## The sea

The room named `sea` holds every player's ship. A player sets their ship's course: the world points it sails through
in turn, to the nearest metre, and its pace, one of DFO's steps, 5, 10, 20, 30, 40, 60 or 100 times a ship's 12 m/s.
A ship not yet at sea puts to sea at the course's first point; one at sea starts the course from where it is, to the
nearest metre, so the legs it sails are the legs judged. A course with no points brings a ship to rest, turned to its
facing when it holds one: the helm turned while she lies still. A player sets one course, facings among them, each half
second, and one sooner is dropped: judging a course against the coasts takes up to a few
milliseconds, which no player may ask for every tick. The browser keeps its latest course and sends it once the sea
will take it, by the room's own tick.

- Each tick, each ship sails its pace's distance along its course, turning onto each leg as it comes to it, and comes
  to rest at the course's end. Its heading is the bearing of the leg it sails, clockwise from north.
- A course is refused whole when any point lies on a continent, or any leg, from where the ship is on, crosses or
  touches a continent's coast in the layout ([[World Map]]). The coasts are judged in whole metres, in integer
  arithmetic. A pace off the steps, a point outside the world's frame, and a course of more than 64 points are refused.
- Ships move by + - * / and square root; the heading is the pure-Rust arctangent ([[Agree to the Bit]]).
- Pirates and the Grey Tithe's ships sail among the players', each with her faction and rank, and a bold one that
  meets a player fights them in the room, by the player's orders ([[Naval Combat]], "At sea"). One that meets a ship
  of another faction fights her with no player (`clash.rs`): the room steps that fight each tick, the snapshot shows
  its ships among the others at sea where the fight has them, and a player who comes within 750 m joins it. The sea's
  snapshot and a fight's view carry each captain's faction and rank. While a player fights, the room takes their
  orders and no course, and their ship is where the fight has her, at rest on the room's word. A ship sails at her
  pace held down as a pirate comes near, and the snapshot's pace for her is the one she sailed at. The sea opens on a
  seed for its pirates, from the runtime's random numbers (`room_open_sea`'s third number).
- **Off the helm.** A player at sea and out of a fight may leave the helm: their body stands behind her wheel on her
  deck, facing her bow, and walks it by the movement crate on the deck's grid, in her own frame ([[Sailing]], "Her
  deck"). Their steps are taken as a land room takes inputs: numbered 1, 2, 3 and so on from the helm left, refused
  out of order or with controls that are not numbers or ask past a whole pace; never more than the ticks since they
  left the helm and 6 of slack, and 3 a tick at most to catch up; past 30 waiting the oldest is let go as taken. One
  whose steps stop coming is stood out a tick at a time once a view's lag (24 ticks) behind, as on land.
- **Her helmsman** keeps her course meanwhile: under way she sails on, at rest she stays. A course is refused but one
  that holds her heading straight on, at her pace (one point, within 0.01 radians of it): the page's course straight
  on, set again as she nears its end, so she sails on. They take the helm again within 0.8 m of the spot behind her
  wheel, standing, judged where their steps leave them once the steps the clock allows by then are taken; a bold
  pirate that meets them calls them to it at once.
- Playing alone, the [[Game]] runs this same room in the page (`LocalRoom.openSea`).

## A fleet

A room named `fleet-<name>` is a place at sea at true scale, on the open sea under the world's swell ([[Sailing]]),
where each player sails her own Sloop by her helm and fights, and captains called into the room, of a faction and a
rank each, fight whom they choose, all in one fight ([[Naval Combat]]).

- **Putting to sea.** A player joins with no ship at sea. The first of her orders that says where puts her Sloop to
  sea there, at that heading, anywhere in the world's frame; after that only her helm moves her.
- **Orders** are taken as a land room takes inputs: numbered 1, 2, 3 and so on, refused out of order or with a number
  that is not one (a rudder past its throw, a rung of more than one, a look past its half circle or the guns' 100 km);
  one a tick, never more than the ticks since she joined and 6 of slack, 3 a tick at most to catch up, and none in a
  tick after one that fires, since the fight judges a release by her brace and her ship after all her orders of the
  tick; past 30 waiting, the oldest let go as though taken. Each order taken steps her ship once, so late ones catch
  her up and a browser's prediction of her is her orders stepped in turn. A player whose orders stop lies as she was,
  riding the swell, until she falls a view's lag (24 ticks) behind; then she stands, a tick at a time, from the moment
  she joins (her helm too once she is at sea), so time spent before putting to sea is not banked to catch up on.
- **Captains.** An order may call a captain onto the ring round the player's ship, while the room holds fewer than
  four, or send every captain off. A captain who sinks, or lies past every ship she may fight (each player's, and
  each afloat captain's of another faction) and is not fighting, leaves the room.
- **What it sees:** every ship (her helm's numbers and pose, hull, sail and men, state and fires, guns and load, a
  captain's mode, target and sides run out, and a player's last order taken), the balls aloft, what happened in the
  fight since it was last asked, and the fight's clock.
- A room holds 16 players. Its chances are drawn from one seed, so one room fights the same fight for the same orders.
  A room on land the servers host is given two seeds of its own, random and never sent: one its loot is drawn from,
  and one its foes' choices are, so what a player sees of the foes tells them nothing of the loot. A node's garrison
  is drawn, as the room opens, from its id alone, so it stands the same on every machine.

## The bake

A whole continent takes 104 to 230 MB to generate, more than a room's 128 MB. So `npm run bake` (`crates/bake`) cuts
each node's ground at build time: it generates every continent with its edits, settles its city on it, and writes
`generated/nodes/<node id>.json` for every node, the drawn ones and each city's social space, and an index of them,
`generated/nodes/index.json`. It reads the RMB index in `content/world/rmb/index.json` when there is one; with none,
a city has the same pads and walls.

A node's file holds its id, kind, name and continent; its section's ring and spawns; the rect its window covers (the
ring's bounds and 100 m past them, beyond the 60 m where a body dies); the exact window of the ground over that rect,
city terraces included; the boxes of the city a body runs into there; and, for a social space, the counters that
serve a player's gear (the Reader's, the vaults', the Quartermaster's, the Armsmith's and the Tailor's). The bake takes about 8 s for the nine
continents' 99 nodes, a few at a time, and writes about 0.44 MB in all, 145 KB compressed. `server`, `server:bundle`
and `server:deploy` run it first. It fails, writing nothing, when two nodes of the world share an id, when one is
called `index`, or when an id is too long for its rooms' longest name, `node-<id>--abyss--dungeon-2`, of at most 64
characters.

## Messages

Every message is defined once, in `crates/protocol/messages.fbs`, and `flatc` makes the Rust and the TypeScript for
it ([[Messages Are FlatBuffers]]). A body and controls cross as the movement crate's numbers, in its order: a body's
22 and the controls' 7, the same as through the browser's WebAssembly door. A table gains fields only at its end, so
an older reader skips them.

| Message | From | Holds |
|---|---|---|
| Input | A browser, on land | Its number, one tick's controls and the fight's buttons (with a ranged weapon's aim and the point an aimed shot is laid on), the look of the player's figure on their own screen (its move, frame and facing), their dress when it changed, what their hands hold, the room tick their screen showed, a foe asked for (0 none, 255 every foe sent away) with its type and rank (a page from before the roster asks by role alone, 1 to 5, taken as the pirates' type in that role, a Major), its level and the element of its shield, whether they ask to respawn, an ask of their gear: what, and the item or Vestige, slot, node, rarity, level, count, kind or named item it names, and a spell cast that tick (1 Tempest to 9 Vanish) with where it is aimed (Dusk Daggers' ring while held and as it is let go) |
| Course | A browser, at sea | The points its ship sails through, x then y, and its pace, or no points and the one heading she faces at rest; in a fight, her orders instead, in the naval crate's numbers (`naval::wire`); off the helm, a step of the walk on deck instead, its controls and its number; or the helm left (1) or taken again (2) |
| Orders | A browser, in a fleet | Its number; the helm (rudder, crab, a rung); while aiming, the look's bearing and range, then its ray (2 or 8 numbers); the fire and the brace; a load to take; where she puts to sea (3 numbers, heeded once); and a captain called (with her faction and rank; 0 for both is the pirates' Major) or every one sent off |
| Joined | The room | The joining player's number, every dress in the room, in a node's room the node's id and its window's rect (west, north, east, south), so the browser cuts the same window (none in a dungeon's room, which stands on no land), and the protocol's version: the schema's hash, so a page built from another schema loads again, once |
| Snapshot | The room | The room's tick; every player: their number, their fighter without its gear's trim (its first 22 numbers their body, its statuses' ticks left after its action's numbers, a Veiled player's among them), the number of their last input taken, the look that came with it, and their standing (0 inside, 1 warned with the ticks left, 2 dead with the ticks since); the dresses that changed since the last snapshot; every foe: its number, role, a glance at its fighter, its level and its shield (its element, what it holds and held whole; none for a foe without one), type, rank, faction, phase (1 to 3), alert state (0 idle, 1 suspicious, 2 alert, 3 searching), and the ticks left of its Expose, its Charge and the immunity a Charge leaves; the fight's events since the last snapshot (each its kind, how the blow was struck, who struck whom, how much it did, its stroke, whether it was a crit and the element it carried); the shots in flight with the ticks each has flown, and each ball that stopped since the last snapshot as its last segment with the point it left its gun; in a dungeon's room its cache: where it stands, the way it faces, and whether it is open; and at sea every ship: its player, position, heading and pace, 0 at rest; every other ship (a pirate's or the Grey Tithe's, sailing or in a fight among captains): her number, position, heading, faction and rank; each player's fight as the naval crate's numbers; and each player off the helm, as a player whose fighter is only their body on her deck, in her frame, with the number of their last step taken; in a fleet every ship, a captain's with her faction and rank, the balls aloft (each where and when it left its gun, its launch and its radius), the fight's events since the last snapshot, and the fight's clock; and on land every spell: its number, kind (1 Tempest's orb to 9 Vanish's veil, 10 a Duskraven's bolt), caster and Art, where it is and where it heads, the foe it seeks, the ticks it has lasted and its whole life, and how far it reaches |

A fight at sea crosses as the naval crate's numbers (`naval::wire`). Orders, sixteen: the helm's steer (-1 port to 1
starboard), crab and climb; whether a look is laid, its bearing off her bow (degrees) and range (metres); whether it
has a ray, and the ray's eye (east, south, up) and the way it looks, so a look on her lays on her; the fire, the
brace, and a load (0 none, else 1 and its place among round, grape, chain and heated). The view: the clock and its
end (0 on, 1 sunk, 2 gone); each ship, the player's then the captain's, 26 numbers (her own 8, her pose's 4, hull,
canvas and men with their most, her state, her fires, each side's seconds left and progress, her load and brace); the
captain's mode, whether she is hostile and her sides run out; any other captains in the fight, a count and each one's
faction, rank, 26 numbers, mode, hostility and sides run out; the balls aloft, a count and four each; the lay, 0 or 1
and its side, elevation, reach, landing zone's radius, whether on target, and a count of sixteen each: the gun's
launch (six), then where its ball stops (whether it does, its time, point, whether in the water, and whether and
where it strikes her); and the events, a count and each one's kind and numbers (a ram, the tenth kind: the ship
struck, by whom, the point and the hull it took). The message carries the other captains in a field of their own
(`naval::wire::parted`), out of the view, so a page that knows one captain reads the view whole; a page that knows them
puts them back in their place, and reads a fight from a room that sends none as a fight without them.

The server reads an input or a course only after FlatBuffers' verifier passes its bytes, so bytes that are not one,
controls that are not 7 numbers, or a course's numbers that are not pairs, are refused. The browser reads a message
the room sent, and takes one it cannot read as nothing; a captain an older room sends with no faction or rank reads as
a Major of the pirates. The browser's messages never carry a number wrapped: one that names something past what its
field holds (an input's or orders' number, the arms, a foe's type, a load, a call) is refused as it is written (a
`RangeError`), and one the room takes within a range (a frame, the tick seen, a rank, the rudder, a rung, a look) is
held within it.

Looks and dresses are each player's own word, passed on and decided nothing about: a look goes out with the tick that
takes its input, a dress once each time it changes, and every dress to whoever joins. The room refuses a move name
that is not lowercase letters, digits and underscores or is over 40 bytes, and a dress over 4 KB. A browser takes
another player's dress only when it has a dress's shape, and their move only where the forge draws it for that
figure; otherwise it shows the move their body is in.

| Gear | The room, to one player alone, whenever theirs changes | Their XP, level, Prestige and Defense; their Aurem, fragments, Essence, Fruit of Dagon and each island's resource; every item they hold (its number, kind, rarity, level, name, island resource, XP and most, nodes bought and chosen, where it is, its Attack, Defense and Prestige, each column of its nodes with its traits, the XP that unlocks it and its cost, so the browser draws them without the rules, a weapon's element, and a ware's price); in a social space the day's wares; their Vestiges, and the drops lying for them (a Vestige, an Ammo box or an Ammo crate, where it lies, where it was thrown from and the ticks it still flies); the resource nodes they have spent; whether they stand where a Vestige opens (the Reader's counter, or the stall); the answer to their last ask; their fighter's trim, which their browser puts back on the fighter a snapshot gives before it predicts them; the arms their gear lets them take up, which their browser predicts them with, bare hands for any other; how far they are to their next level and their next Fruit of Dagon; the emblems they keep, the one they wear, and in a social space the Tailor's of the day; the Art they wear, each Art's Core, and how far their Anima and each Tenet have charged; and the Ranged loadout's ammunition (the shots left and the capacity of the one worn, the share of a full capacity kept), the Ammo crates carried and, in a social space, the Quartermaster's price for one; in a patrol, its dungeons' entrances, each where it stands, the ground's height there, its model's yaw and which model it is; and whether they have finished the prologue |

## The host

A Cloudflare Worker, in `server/` ([[The Server's Shell Is in server]]), sends `/room/<name>` to one Durable Object for
each room's name. The object keeps its room in WebAssembly: the room and protocol crates behind the `room-wasm` door,
so every decision is Rust and the shell only carries bytes and time.

- The name says which room it is, opened when the first player joins: `sea` is the sea, round the layout's
  continents; `node-<id>` is that node's room, from its baked file, and `node-<id>--elite` or `--abyss` the same
  node at a voyage's harder difficulty, a room of its own; `--dungeon-0`, `-1` or `-2` after either is one of a
  patrol's dungeons at that difficulty, opened from the patrol's baked file; `fleet-<name>` a fleet's place on the
  open sea;
  any other name is the Test Ground's course,
  `content/testground/course.json`, which the client reads too, with its stall and resource nodes laid out. A node with no baked file answers 404, as does a dungeon whose node is no patrol. Any other spelling of a node's room is no room, but for the tiers' old names: `--rough` and `--storm` are read as `--elite` and `--abyss` (`canonicalRoom`), so a page that still builds them joins its room and loads again. A name is 64 characters at most.
- The baked files are the Worker's static assets, bound as `NODES`, so a node's room reads only its own file and the
  Worker's own bundle does not grow with the world. Every request goes to the Worker first, which serves no file to a
  browser.
- A WebSocket joins the room and is welcomed with the player's number; in a patrol's room, `?entrance=<number>` on
  its address stands them before that entrance's door, and an entrance it does not have is an ordinary join. Each
  binary message is one of their inputs, at sea their course, or in a fleet their ship's orders. A course too soon after the last is dropped and a course
  the sea will not sail is refused; any other input refused, a message over 8 KB, or more than 240 messages in a
  second (a browser sends 60), closes the socket, since that browser is not keeping to the messages. Its player
  leaves at once, no snapshot is sent to a socket that is closing, and whatever it had already sent is passed over
  unread.
- A browser's one text message is its session's token. In a node's room the player's character is claimed with it
  from the [[Accounts]], saved as it changes and let go when they leave. A character the node's gate shuts
  ([[Activities]]) is let go untouched, and the socket closed with 4003 and the gate's reason. At sea, where no
  character is kept, the room tells the accounts the player is there, again every 30 seconds, and that they left, for
  the Roster. A second text message, or any other, closes the socket.
- Sockets are the object's own: the room lives only in its memory, so a socket never outlasts it, and a browser whose
  room is gone learns so by its socket closing, and joins again.
- A full room closes the socket saying so; past 64 sockets, the sea's guard, a join is turned away (503). Should the
  room's WebAssembly ever trap, every socket is closed and the object starts over.
- While anyone is in, a timer ticks the room in step with the clock, catching up whole ticks it was late for, and
  sends every player the snapshot after each tick, and their own gear when it changed; a socket closing as it is sent to is passed over, so the rest
  still get the tick. When the last player leaves it stops, and the room goes with the object.
- Each second, and before its first tick, the host gives the room the Unix minute; the rules read the day and the week
  from it (`gear::clock`).

## The browser's side

- `RoomConnection` joins a room, keeps its welcome's node, sends its session's token once welcomed when the page holds
  one ([[Accounts]]), and sends each tick's controls, numbered, as the player
  plays, with a respawn when asked; at sea it sends the ship's course.
- **Joining again.** When a room's socket closes, for a deploy or a dropped network, `RoomConnection` joins the room
  again by itself: after 1 s, then 2, 4 and 8 s between tries, 15 s at most, and 1 s again once a join holds. The
  page says "Reconnecting…" meanwhile, and nothing is sent. A rejoin is a new join: a new number, inputs numbered from
  1 again, the player standing where the room puts them, their dress sent again and what their hands hold kept, and
every other figure drawn on from where the new room has it, though its clock starts again. The
  [[Test Ground]], the [[Game]]'s node rooms and sea, and a fleet each follow it so; at sea, and in a fleet, the ship
  puts to sea again where she lies. A room that sends the player away for not keeping to the messages (1008, 1009),
  or whose gate shuts to their character (4003), is not joined again, and the page says why.
- `Prediction` keeps the inputs the room has not taken. On each snapshot the player's body is set to the room's word
  with those inputs stepped on top by the same rules, on the same ground: for a node's room, `standOnNode` cuts the
  rect the welcome names from the landmass open in the land's door and stands the movement rules on it, with the
  city's boxes ([[Land]], [[Movement]]). While the room agrees, that is the body already shown, to the bit; where it
  knows better, the body moves to it. A body the room says is dead stays where the room saw it.
- The [[Test Ground]] joins a room when its address carries `?room=`, and shows every other player where the room
  last saw them.
- In a fleet, `FleetSession` sends each tick's orders, numbered, as the page's clock owes them, and keeps her ship as
  the room last gave it with her orders it has not taken stepped on top through `room-wasm` (`fleet_predict`), and
  her look's lay laid among the ships she sees (`fleet_lay`). The [[World Editor]] sails in a fleet when its address
  carries `?room=`: a fleet's name on the deployed rooms, or a local server's address for its `fleet-editor`.

## Running it

- **Deployed** as the Worker `overlook-rooms`: a room is `wss://overlook-rooms.mackcothran.workers.dev/room/<name>`. CI
  deploys it after a merge into `main`, once the same commit has passed the check, as it publishes the page
  ([[The Rooms Deploy When Their Code Changes]]): the `rooms` workflow, with the repository's `CLOUDFLARE_TOKEN` secret,
  only while that commit is still `main`'s head, and only when what the rooms are built from differs from the commit
  they were last deployed from: the crates of `room-wasm` and of the bake, `server/`, the schema's maker, the content
  they read, the toolchain, the locks and the deploy's scripts, and the workflow (`ROOMS_CODE` in `rooms.yml`). A merge
  of notes alone deploys nothing. Each deploy is recorded as a deployment to the `rooms` environment, which the next run
  compares with; with none found, it deploys. Without the secret it warns and deploys nothing. Run by hand from `main`,
  it deploys whatever changed or not, and `npm run server:deploy` does the same from a machine that holds the token
  itself.
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
- Any page can join a room, under any name; a player is known only by the session their page gives ([[Accounts]]).
- A full sea of sockets each asking for the costliest course it may holds about a third of the sea's time: 40
  snapshots a second against 57, with 63 such sockets on the local runtime (tested offline).
- A snapshot sends every player's whole fighter and look and every foe's glance every tick. The runtime deflates it
  on the wire (WebSocket compression, on from the rooms' compatibility date), its window reaching back over the
  snapshots before, so what stands still costs next to nothing and a foe walking its beat costs most: a node's room
  with its garrison and one player sends 1.8 to 4.7 KB a tick, 3.5 KB at the median over the 90 garrisoned nodes,
  and 0.05 to 0.53 KB deflated, 0.35 KB at the median, about 21 KB a second (tested offline; 0.20 to 0.36 KB on the
  local runtime, over four nodes).
- A player's view may lag 24 ticks at most; a screen further behind is judged as it stands. A player could hold a
  claimed lag at the most to gain up to 24 ticks of reaction; nothing checks it.
- Arrows and bolts are not judged as their shooter saw: they fly in the room's time.
- Riding is the browser's word: the room takes `mounted` as it is sent.
- A fleet's sea knows no coast: where a ship is put to sea is the player's word, anywhere in the world's frame, and
  the World Editor asks for open water 15 m deep before it joins. A fleet's lay is judged at the room's tick, not as
  the player's screen showed the ships (a ball's flight is long beside the lag).
- Players do not harm one another.
- A dress travels with a player's inputs, which flow only while they play: until then, others see a plain figure.
- A player who sends nothing waits a view's lag, then stands still where they were until their inputs come. The
  section judges them all the same, so the warning's count runs on.
- Bodies pass through each other; foes of one side keep apart by steering.
- The browser does not predict the section: it shows a warning, a death or a respawn when the room's snapshot says so.
- The [[Test Ground]] joins any room by name, a node's too, but predicts on its own course and never asks to respawn;
  the [[Game]] does both, and fights there. A server's node room takes no ask for a foe; only a room a page plays alone
  is told to (`take_foe_asks`).
- A dungeon's room bakes its navmesh over the dungeon's whole rectangle, up to three blocks by three. Of the 81
  dungeons, the slowest opens in 0.16 s of WebAssembly, and the largest takes 32.8 MB of its memory against 18.5 MB
  for a patrol's own room (tested offline). Each of the 27 patrols lays all three entrances; a dungeon's room opens for its number whether or not its
  patrol's land found room for its entrance. A patrol's room takes `?entrance=` at the joiner's word,
  so a player may come back at any of its three entrances, as `?at=` lands a player at any node. Movement has no ceilings; a
  dungeon's are never reached, as nothing in it can be climbed.
- **A course a page plays alone** may be asked six things more, which no server ever asks and no message carries
  (`course.rs`, through the door's `room_stand_foe`, `room_clear_foes`, `room_set_spawn`, `room_put_player`,
  `room_stand_block` and `room_take_block`): a foe of the roster stood where the page puts it, on the top of the block
  under it, at the level asked, posted there (a Boss stood so calls no one in its phases); every foe sent away at once,
  and every blow a foe struck that has not landed with them; where the next respawn stands the player, a checkpoint;
  the player stood somewhere at once, keeping their health, as when they fall into the sea and are brought back; a
  block stood on the course after it opened, as a way closing; and a block it holds taken from it, as a way opening.
  The door keeps its own course for prediction in step with both. The foes' navmesh is not baked again for either. The
  [[Prologue]]'s wreck is played so.
- A node's room bakes its foes' navmesh over a 70 m square of its land, never its whole section or its city's boxes;
  a foe that chases a player off it walks straight. A node's room opens in 0.10 to 0.23 s of WebAssembly, garrison
  and beats and all, 0.11 s at the median over the 90 garrisoned nodes (tested offline, on a busy machine).
- A node's room with one player and every group but a Boss's or a Miniboss's walking its beat ticks in 0.02 to 0.12 ms
  of WebAssembly at the median and in 0.65 ms at most at the 99th in a hundred, and its WebAssembly holds about 25 MB,
  the same after an hour open (tested offline).
- Inputs that catch up several steps in one tick are judged where the last leaves the body, so a body can step out
  and back within one tick unwarned.
- Where a ship puts to sea is the player's word, any point of open sea; the sea room does not yet know which port
  they left from. A ship that leaves the sea room leaves the sea.
- The sea judges a course against the continents' outlines only; isles are not placed yet.
