---
type: system
status: live
code:
  - crates/room/src/lib.rs#Room
  - crates/room/src/lib.rs#Floor
  - crates/room/src/judging.rs#Event
  - crates/room/src/players.rs#VIEW_LAG
  - client/src/network/localRoom.ts#LocalRoom
  - client/src/combat/fighting.ts#Fighting
  - crates/room/src/lib.rs#SLACK_TICKS
  - crates/room/src/lib.rs#WAITING_LIMIT
  - crates/room/src/sea.rs#Sea
  - crates/room/src/sea.rs#PACES
  - crates/room/src/fleet.rs#Fleet
  - crates/room/src/fleet.rs#CAPTAINS_MOST
  - crates/protocol/src/fleet.rs#read_orders
  - crates/protocol/src/fleet.rs#fleet_snapshot_bytes
  - crates/room-wasm/src/fleet_door.rs#predict
  - crates/room/src/pirates.rs#Pirates
  - crates/naval/src/wire.rs#view_numbers
  - crates/bake/src/lib.rs#nodes_of
  - crates/bake/src/lib.rs#MARGIN_M
  - crates/protocol/messages.fbs
  - crates/protocol/src/lib.rs#read_input
  - crates/protocol/src/lib.rs#read_course
  - crates/protocol/src/lib.rs#snapshot_bytes
  - crates/room-wasm/src/lib.rs#room_input
  - crates/room-wasm/src/lib.rs#open_node
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
  body runs into ([[Movement]]). Any other room stands them on its course of blocks on open ground at 0 m.
- **Joining:** a player gets a number no one else in the room has had. In a node's room they stand on the ground at
  the node's spawns in turn, the first player at the first spawn, the next at the next; elsewhere at the room's spawn.
  A room holds 16 players; past that, it turns the next away.
- **Inputs:** each player numbers their inputs 1, 2, 3 and so on, and one out of order is refused, as is one with a
  number in it that is not a number. An input is one tick's intent, the controls ([[Movement]]) and the fight's
  buttons ([[Combat]]), with what the player's hands hold and the room tick their screen last showed. It steps that
  player's fighter once by combat's player tick, on the room's ground, among the fighters as that screen showed them,
  exactly as the browser that predicted it did, so a prediction can only differ where the server knows more
  ([[Clients Predict With the Shared Rules]]). What the hands hold is taken up only at rest, never in the middle of a
  swing, a guard, a draw or a reload.
- **Foes:** a player may ask for a foe and its level (the [[Test Ground]]'s panel), one with each input; the room
  stands it 5 m along the player's aim, which follows their look, on its navmesh, facing them, and holds at most
  twelve. A foe of level 0 has none and fights by combat's own numbers; one with a level has its kind's health grown
  for it ([[Gear]]).
  Each tick every foe thinks over the room as it stands and steps by the same rules ([[Foes]]), routing on a
  [[Navmesh]] the room bakes from its blocks when it opens.
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
  Every blow is made with its power: a player's on a foe by the Attack of the hand that struck and their levels, a
  foe's on a player by the player's Defense and their levels. A foe's kill pays every player whose blow landed on it
  in its last ten seconds, each their own XP and Aurem and perhaps a Vestige, which lies where the foe fell for them
  alone for two minutes and is picked up by walking within 1.5 m.
- **Asks:** an input may carry an ask of the player's gear, answered in turn with it, and the answer kept to send
  them. A social space's room answers a social space's asks (identifying a Vestige, the vault) anywhere in it; the
  Test Ground's course within 4 m of its stall. A resource node is gathered within 2.5 m, and is spent for that player
  until they leave. Only the Test Ground's room hands out gear to try the loop with.
- **The dead** stand again, whole, after four seconds, at the spawn nearest where they fell, and the foes leave them be
  for three more unless they strike first; a dead foe is gone after ten.
- **The clock:** an input waits for the room's next tick. A player's inputs step their body no more often than the
  ticks since they joined, plus a slack of 6 ticks for the network's jitter, and a tick takes at most 3, so no one
  moves faster than real time and one catching up after a stall replays no faster than three times over.
- **A player whose inputs stop** is stepped standing still once they fall a view's lag (24 ticks) behind, so nothing
  they were doing (a dodge's safe stretch, a parry window) outlasts its time, and time away is never banked to spend
  as speed; a body the section killed lies where it fell, but its ticks count the same. Past 30 waiting inputs, the oldest is let go as though taken, so a burst after a stall never breaks the
  order. The room tick a player says their screen showed moves on at most 4 ticks an input, so they cannot pick the
  moment they are judged at. A dress change is taken at most once a second.
- **The section:** after each player's inputs a node's room judges their body against the node's section ([[Reach]]):
  inside, warned with a count, or dead. A body dead past the section is still: its inputs are taken without moving it.
  An input that asks to respawn, once the section allows it, stands the body on the ground at the spawn nearest where
  it died. A room with no section never judges.
- **What it sees:** every player's fighter, where they stand with the section, and the number of their last input it
  took; every foe; the shots in flight, each with the ticks it has flown, and every gun's ball fired since it was last
  asked as its whole line from where it left to where it stopped, so every screen draws its tracer however many ticks
  the room ran first; and what happened in the fight since it was last asked (a swing's blows with their stroke): hits,
  blocks, parries,
  guard breaks, dodges, staggers, deaths, players standing again, feints, foes arriving. The same on every machine.

## The sea

The room named `sea` holds every player's ship. A player sets their ship's course: the world points it sails through
in turn, to the nearest metre, and its pace, one of DFO's steps, 5, 10, 20, 30, 40, 60 or 100 times a ship's 12 m/s.
A ship not yet at sea puts to sea at the course's first point; one at sea starts the course from where it is, to the
nearest metre, so the legs it sails are the legs judged. A course with no points brings a ship to rest. A player sets
one course each half second, and one sooner is dropped: judging a course against the coasts takes up to a few
milliseconds, which no player may ask for every tick. The browser keeps its latest course and sends it once the sea
will take it, by the room's own tick.

- Each tick, each ship sails its pace's distance along its course, turning onto each leg as it comes to it, and comes
  to rest at the course's end. Its heading is the bearing of the leg it sails, clockwise from north.
- A course is refused whole when any point lies on a continent, or any leg, from where the ship is on, crosses or
  touches a continent's coast in the layout ([[World Map]]). The coasts are judged in whole metres, in integer
  arithmetic. A pace off the steps, a point outside the world's frame, and a course of more than 64 points are refused.
- Ships move by + - * / and square root; the heading is the pure-Rust arctangent ([[Agree to the Bit]]).
- Pirates sail among the ships, and a bold one that meets a player fights them in the room, by the player's orders
  ([[Naval Combat]], "At sea"). While a player fights, the room takes their orders and no course, and their ship is
  where the fight has her, at rest on the room's word.
- Playing alone, the [[Game]] runs this same room in the page (`LocalRoom.openSea`).

## A fleet

A room named `fleet-<name>` is a place at sea at true scale, on the open sea under the world's swell ([[Sailing]]),
where each player sails her own Sloop by her helm and fights, and pirate captains called into the room fight whom
they choose, all in one fight ([[Naval Combat]]).

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
  four, or send every captain off. A captain who sinks, or lies past every player's ship and is not fighting, leaves
  the room.
- **What it sees:** every ship (her helm's numbers and pose, hull, sail and men, state and fires, guns and load, a
  captain's mode, target and sides run out, and a player's last order taken), the balls aloft, what happened in the
  fight since it was last asked, and the fight's clock.
- A room holds 16 players. Its chances are drawn from one seed, so one room fights the same fight for the same orders.

## The bake

A whole continent takes 104 to 230 MB to generate, more than a room's 128 MB. So `npm run bake` (`crates/bake`) cuts
each node's ground at build time: it generates every continent with its edits, settles its city on it, and writes
`generated/nodes/<node id>.json` for every node, the drawn ones and each city's social space, and an index of them,
`generated/nodes/index.json`. It reads the RMB index in `content/world/rmb/index.json` when there is one; with none,
a city has the same pads and walls.

A node's file holds its id, kind, name and continent; its section's ring and spawns; the rect its window covers (the
ring's bounds and 100 m past them, beyond the 60 m where a body dies); the exact window of the ground over that rect,
city terraces included; and the boxes of the city a body runs into there. The bake takes about 8 s for the nine
continents' 99 nodes, a few at a time, and writes about 0.44 MB in all, 145 KB compressed. `server`, `server:bundle`
and `server:deploy` run it first. It fails, writing nothing, when two nodes of the world share an id, when one is
called `index`, or when an id is too long for its room's name, `node-<id>`, of at most 40 characters.

## Messages

Every message is defined once, in `crates/protocol/messages.fbs`, and `flatc` makes the Rust and the TypeScript for
it ([[Messages Are FlatBuffers]]). A body and controls cross as the movement crate's numbers, in its order: a body's
22 and the controls' 7, the same as through the browser's WebAssembly door. A table gains fields only at its end, so
an older reader skips them.

| Message | From | Holds |
|---|---|---|
| Input | A browser, on land | Its number, one tick's controls and the fight's buttons (with a ranged weapon's aim and the point an aimed shot is laid on), the look of the player's figure on their own screen (its move, frame and facing), their dress when it changed, what their hands hold, the room tick their screen showed, a foe asked for and its level, whether they ask to respawn, and an ask of their gear: what, and the item or Vestige, slot, node, rarity, level, count, kind or named item it names |
| Course | A browser, at sea | The points its ship sails through, x then y, and its pace; in a fight, her orders instead, in the naval crate's numbers (`naval::wire`) |
| Orders | A browser, in a fleet | Its number; the helm (rudder, crab, a rung); while aiming, the look's bearing and range, then its ray (2 or 8 numbers); the fire and the brace; a load to take; where she puts to sea (3 numbers, heeded once); and a captain called or every one sent off |
| Joined | The room | The joining player's number, every dress in the room, and in a node's room the node's id and its window's rect (west, north, east, south), so the browser cuts the same window |
| Snapshot | The room | The room's tick; every player: their number, their whole fighter (its first 22 numbers their body), the number of their last input taken, the look that came with it, and their standing (0 inside, 1 warned with the ticks left, 2 dead with the ticks since); the dresses that changed since the last snapshot; every foe: its number, kind, a glance at its fighter and its level; the fight's events since the last snapshot; the shots in flight with the ticks each has flown, and the balls fired since the last snapshot as their lines; and at sea every ship: its player, position, heading and pace, 0 at rest; every pirate: her number, position and heading; and each player's fight as the naval crate's numbers; in a fleet every ship, the balls aloft (each where and when it left its gun, its launch and its radius), the fight's events since the last snapshot, and the fight's clock |

A fight at sea crosses as the naval crate's numbers (`naval::wire`). Orders, sixteen: the helm's steer (-1 port to 1
starboard), crab and climb; whether a look is laid, its bearing off her bow (degrees) and range (metres); whether it
has a ray, and the ray's eye (east, south, up) and the way it looks, so a look on her lays on her; the fire, the
brace, and a load (0 none, else 1 and its place among round, grape, chain and heated). The view: the clock and its
end (0 on, 1 sunk, 2 gone); each ship, the player's then the captain's, 26 numbers (her own 8, her pose's 4, hull,
canvas and men with their most, her state, her fires, each side's seconds left and progress, her load and brace); the
captain's mode, whether she is hostile and her sides run out; the balls aloft, a count and four each; the lay, 0 or 1
and its side, elevation, reach, landing zone's radius, whether on target, and a count of sixteen each: the gun's
launch (six), then where its ball stops (whether it does, its time, point, whether in the water, and whether and
where it strikes her); and the events, a count and each one's kind and numbers (a ram, the tenth kind: the ship
struck, by whom, the point and the hull it took).

The server reads an input or a course only after FlatBuffers' verifier passes its bytes, so bytes that are not one,
controls that are not 7 numbers, or a course's numbers that are not pairs, are refused. The browser reads a message
the room sent, and takes one it cannot read as nothing.

Looks and dresses are each player's own word, passed on and decided nothing about: a look goes out with the tick that
takes its input, a dress once each time it changes, and every dress to whoever joins. The room refuses a move name
that is not lowercase letters, digits and underscores or is over 40 bytes, and a dress over 4 KB. A browser takes
another player's dress only when it has a dress's shape, and their move only where the forge draws it for that
figure; otherwise it shows the move their body is in.

| Gear | The room, to one player alone, whenever theirs changes | Their XP, level, Prestige and Defense; their Aurem, fragments, Essence, Fruit of Dagon and each island's resource; every item they hold (its number, kind, rarity, level, name, island resource, XP and most, nodes bought and chosen, where it is, its Attack, Defense and Prestige, and each column of its nodes with its traits, the XP that unlocks it and its cost, so the browser draws them without the rules); their Vestiges and those lying for them; the resource nodes they have spent; whether they stand where a social space's asks are answered; and the answer to their last ask |

## The host

A Cloudflare Worker, in `server/` ([[The Server's Shell Is in server]]), sends `/room/<name>` to one Durable Object for
each room's name. The object keeps its room in WebAssembly: the room and protocol crates behind the `room-wasm` door,
so every decision is Rust and the shell only carries bytes and time.

- The name says which room it is, opened when the first player joins: `sea` is the sea, round the layout's
  continents; `node-<id>` is that node's room, from its baked file; `fleet-<name>` a fleet's place on the open sea;
  any other name is the Test Ground's course,
  `content/testground/course.json`, which the client reads too, with its stall and resource nodes laid out. A node with no baked file answers 404.
- The baked files are the Worker's static assets, bound as `NODES`, so a node's room reads only its own file and the
  Worker's own bundle does not grow with the world. Every request goes to the Worker first, which serves no file to a
  browser.
- A WebSocket joins the room and is welcomed with the player's number; each binary message is one of their inputs,
  at sea their course, or in a fleet their ship's orders. A course too soon after the last is dropped and a course
  the sea will not sail is refused; any other input refused, a message over 8 KB, or more than 240 messages in a
  second (a browser sends 60), closes the socket, since that browser is not keeping to the messages. Its player
  leaves at once, no snapshot is sent to a socket that is closing, and whatever it had already sent is passed over
  unread.
- A browser's one text message is its session's token. In a node's room the player's character is claimed with it
  from the [[Accounts]], saved as it changes and let go when they leave; a second text message, or any other, closes
  the socket.
- Sockets are the object's own: the room lives only in its memory, so a socket never outlasts it, and a browser whose
  room is gone learns so by its socket closing.
- A full room closes the socket saying so; past 64 sockets, the sea's guard, a join is turned away (503). Should the
  room's WebAssembly ever trap, every socket is closed and the object starts over.
- While anyone is in, a timer ticks the room in step with the clock, catching up whole ticks it was late for, and
  sends every player the snapshot after each tick, and their own gear when it changed; a socket closing as it is sent to is passed over, so the rest
  still get the tick. When the last player leaves it stops, and the room goes with the object.

## The browser's side

- `RoomConnection` joins a room, keeps its welcome's node, sends its session's token once welcomed when the page holds
  one ([[Accounts]]), and sends each tick's controls, numbered, as the player
  plays, with a respawn when asked; at sea it sends the ship's course.
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

- **Deployed** as the Worker `overlook-rooms`: a room is `wss://overlook-rooms.mackcothran.workers.dev/room/<name>`.
  CI deploys it after each merge into `main`, once the same commit has passed the check, as it publishes the page
  ([[The Rooms Deploy on Each Merge]]): the `rooms` workflow, with the repository's `CLOUDFLARE_TOKEN` secret, and
  only while that commit is still `main`'s head. Without the secret it warns and deploys nothing. It runs by hand
  from `main` too, and `npm run server:deploy` does the same from a machine that holds the token itself. The same
  workflow deploys the [[Accounts]] first, since the rooms' service binding names their Worker; should that fail, the
  rooms still deploy, beside the accounts last deployed.
- **Locally**, `npm run server` runs the rooms on Cloudflare's own runtime, at `ws://127.0.0.1:8787/room/<name>`.
- **In the page**, the Test Ground played alone runs the same room in its own WebAssembly, ticked by the page.

Measured on the deployed rooms with two browsers in one room: 60.0 ticks a second; snapshots 16.2 ms apart at the
median, 59 ms at the 99th in a hundred and 84 ms at the most; the room taking a player's input about 4 ticks after it
was sent; and every snapshot of a player matching that player's inputs replayed by the movement rules, to the bit.

## Limits

- Each deploy starts every room afresh: whoever is in one is dropped, as when any room is lost, and joins again only by
  coming back to it. A deployed node's window can lag the edits files until the next merge.
- A room bakes its navmesh as it opens: 0.3 to 0.7 s of work for the [[Test Ground]]'s course (tested offline). The
  account's Workers Paid plan gives a Durable Object 30 s of CPU an event.
- Any page can join a room, under any name; a player is known only by the session their page gives ([[Accounts]]).
- A full sea of sockets each asking for the costliest course it may holds about a third of the sea's time: 40
  snapshots a second against 57, with 63 such sockets on the local runtime (tested offline).
- A snapshot sends every player's whole fighter and look and every foe's glance every tick: fine for a few players and
  foes, heavy for many.
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
- Bodies pass through each other; foes keep apart by steering.
- The browser does not predict the section: it shows a warning, a death or a respawn when the room's snapshot says so.
- The [[Test Ground]] joins any room by name, a node's too, but predicts on its own course and never asks to respawn;
  the [[Game]] does both, and asks for no foe and swings no blow.
- A node's room bakes its foes' navmesh over its boxes on open ground at 0 m, not on its window of the land.
- Inputs that catch up several steps in one tick are judged where the last leaves the body, so a body can step out
  and back within one tick unwarned.
- Where a ship puts to sea is the player's word, any point of open sea; the sea room does not yet know which port
  they left from. A ship that leaves the sea room leaves the sea.
- The sea judges a course against the continents' outlines only; isles are not placed yet.
