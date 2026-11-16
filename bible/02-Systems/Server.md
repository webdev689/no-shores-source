---
type: system
status: live
code:
  - crates/room/src/lib.rs#Room
  - crates/room/src/lib.rs#Floor
  - crates/room/src/lib.rs#SLACK_TICKS
  - crates/room/src/lib.rs#WAITING_LIMIT
  - crates/room/src/sea.rs#Sea
  - crates/room/src/sea.rs#PACES
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
- **Inputs:** each player numbers their inputs 1, 2, 3 and so on, and one out of order is refused. An input is one
  tick's controls ([[Movement]]) and steps that player's body once, exactly as the browser that predicted it did, so
  a prediction can only differ where the server knows more ([[Clients Predict With the Shared Rules]]).
- **The clock:** an input waits for the room's next tick. A player's inputs step their body no more often than the
  ticks since they joined, plus a slack of 6 ticks for the network's jitter, so no one moves faster than real time.
  More than 30 waiting inputs are refused.
- **The section:** after each tick a node's room judges every body against the node's section ([[Reach]]): inside,
  warned with a count, or dead. A dead body is still: its inputs are taken without moving it. An input that asks to
  respawn, once the section allows it, stands the body on the ground at the spawn nearest where it died. A room with
  no section never judges.
- **What it sees:** every player's body, where they stand with the section, and the number of their last input it
  took, in the order of their numbers, the same on every machine.

## The sea

The room named `sea` holds every player's ship. A player sets their ship's course: the world points it sails through
in turn, to the nearest metre, and its pace, one of DFO's steps, 5, 10, 20, 30, 40, 60 or 100 times a ship's 12 m/s.
A ship not yet at sea puts to sea at the course's first point; one at sea starts the course from where it is, to the
nearest metre, so the legs it sails are the legs judged. A course with no points brings a ship to rest. A player sets
one course a tick; a second in the same tick is dropped, as a flood of inputs is.

- Each tick, each ship sails its pace's distance along its course, turning onto each leg as it comes to it, and comes
  to rest at the course's end. Its heading is the bearing of the leg it sails, clockwise from north.
- A course is refused whole when any point lies on a continent, or any leg, from where the ship is on, crosses or
  touches a continent's coast in the layout ([[World Map]]). The coasts are judged in whole metres, in integer
  arithmetic. A pace off the steps, a point outside the world's frame, and a course of more than 64 points are refused.
- Ships move by + - * / and square root; the heading is the pure-Rust arctangent ([[Agree to the Bit]]).

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
| Input | A browser, on land | Its number, one tick's controls, the look of the player's figure on their own screen (its move, frame and facing), their dress when it changed, and whether they ask to respawn |
| Course | A browser, at sea | The points its ship sails through, x then y, and its pace |
| Joined | The room | The joining player's number, every dress in the room, and in a node's room the node's id and its window's rect (west, north, east, south), so the browser cuts the same window |
| Snapshot | The room | The room's tick; every player: their number, their body, the number of their last input taken, the look that came with it, and their standing (0 inside, 1 warned with the ticks left, 2 dead with the ticks since); the dresses that changed since the last snapshot; and at sea every ship: its player, position, heading and pace, 0 at rest |

The server reads an input or a course only after FlatBuffers' verifier passes its bytes, so bytes that are not one,
controls that are not 7 numbers, or a course's numbers that are not pairs, are refused. The browser reads a message
the room sent, and takes one it cannot read as nothing.

Looks and dresses are each player's own word, passed on and decided nothing about: a look goes out with the tick that
takes its input, a dress once each time it changes, and every dress to whoever joins. The room refuses a move name
that is not lowercase letters, digits and underscores or is over 40 bytes, and a dress over 4 KB. A browser takes
another player's dress only when it has a dress's shape, and their move only where the forge draws it for that
figure; otherwise it shows the move their body is in.

## The host

A Cloudflare Worker, in `server/` ([[The Server's Shell Is in server]]), sends `/room/<name>` to one Durable Object for
each room's name. The object keeps its room in WebAssembly: the room and protocol crates behind the `room-wasm` door,
so every decision is Rust and the shell only carries bytes and time.

- The name says which room it is, opened when the first player joins: `sea` is the sea, round the layout's
  continents; `node-<id>` is that node's room, from its baked file; any other name is the Test Ground's course,
  `content/testground/course.json`, which the client reads too. A node with no baked file answers 404.
- The baked files are the Worker's static assets, bound as `NODES`, so a node's room reads only its own file and the
  Worker's own bundle does not grow with the world. Every request goes to the Worker first, which serves no file to a
  browser.
- A WebSocket joins the room and is welcomed with the player's number; each binary message is one of their inputs,
  or at sea their course. A flood is dropped and a course the sea will not sail is refused; anything else refused
  closes the socket, since that browser is not keeping to the messages.
- While anyone is in, a timer ticks the room in step with the clock, catching up whole ticks it was late for, and
  sends every player the snapshot after each tick. When the last player leaves it stops, and the room goes with the
  object.

## The browser's side

- `RoomConnection` joins a room, keeps its welcome's node, and sends each tick's controls, numbered, as the player
  plays, with a respawn when asked; at sea it sends the ship's course.
- `Prediction` keeps the inputs the room has not taken. On each snapshot the player's body is set to the room's word
  with those inputs stepped on top by the same rules, on the same ground: for a node's room, `standOnNode` cuts the
  rect the welcome names from the landmass open in the land's door and stands the movement rules on it, with the
  city's boxes ([[Land]], [[Movement]]). While the room agrees, that is the body already shown, to the bit; where it
  knows better, the body moves to it. A body the room says is dead stays where the room saw it.
- The [[Test Ground]] joins a room when its address carries `?room=`, and shows every other player where the room
  last saw them.

## Running it

- **Deployed** as the Worker `overlook-rooms`: a room is `wss://overlook-rooms.mackcothran.workers.dev/room/<name>`.
  `npm run server:deploy` deploys it, with the owner's yes each time ([[Ask Before Deploying]]); CI does not.
- **Locally**, `npm run server` runs the rooms on Cloudflare's own runtime, at `ws://127.0.0.1:8787/room/<name>`.

Measured on the deployed rooms with two browsers in one room: 60.0 ticks a second; snapshots 16.2 ms apart at the
median, 59 ms at the 99th in a hundred and 84 ms at the most; the room taking a player's input about 4 ticks after it
was sent; and every snapshot of a player matching that player's inputs replayed by the movement rules, to the bit.

## Limits

- Deploys are by hand, with the owner's yes; the rooms' code can lag `main` until the next deploy, and a deployed
  node's window can lag the edits files until then.
- Any page can join a room, under any name; no one signs in.
- A snapshot sends every player's whole body and look every tick: fine for a few players, heavy for many.
- A dress travels with a player's inputs, which flow only while they play: until then, others see a plain figure.
- A player who sends nothing stands still in time: their body waits, mid-jump if need be, until their inputs come.
  The section judges them all the same, so the warning's count runs on.
- Bodies pass through each other.
- The browser does not predict the section: it shows a warning, a death or a respawn when the room's snapshot says so.
- The [[Test Ground]] joins any room by name, a node's too, but predicts on its own course and never asks to respawn;
  the [[Game]] does both.
- Inputs that catch up several steps in one tick are judged where the last leaves the body, so a body can step out
  and back within one tick unwarned.
- Where a ship puts to sea is the player's word, any point of open sea; the sea room does not yet know which port
  they left from. A ship that leaves the sea room leaves the sea.
- The sea judges a course against the continents' outlines only; isles are not placed yet.
