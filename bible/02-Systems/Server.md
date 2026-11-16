---
type: system
status: live
code:
  - crates/room/src/lib.rs#Room
  - crates/room/src/judging.rs#Event
  - crates/room/src/players.rs#VIEW_LAG
  - client/src/network/localRoom.ts#LocalRoom
  - client/src/combat/fighting.ts#Fighting
  - crates/room/src/lib.rs#SLACK_TICKS
  - crates/room/src/lib.rs#WAITING_LIMIT
  - crates/protocol/messages.fbs
  - crates/protocol/src/lib.rs#read_input
  - crates/protocol/src/lib.rs#snapshot_bytes
  - crates/room-wasm/src/lib.rs#room_input
  - server/worker.ts#RoomHost
  - server/roomDoor.ts#startRoomDoor
  - server/wrangler.jsonc
  - client/src/network/messages.ts#readFromRoom
  - client/src/network/roomConnection.ts#RoomConnection
  - client/src/network/prediction.ts#Prediction
---
# Server

The authority every player's game answers to ([[Server-Authoritative Multiplayer]]), on Cloudflare
([[Servers on Cloudflare]]). Each shared space is one room. Built so far: the room, its messages, its Cloudflare
host, and the browser's side; the [[Test Ground]] plays in a room. It is deployed on Cloudflare.

## The room

- **One shared space:** its course, its clock in ticks and its players. It has no network and no clock of its own:
  its host hands it each player's inputs, ticks it 60 times a second, and sends out what it sees.
- **Joining:** a player gets a number no one else in the room has had, and stands at the room's spawn.
- **Inputs:** each player numbers their inputs 1, 2, 3 and so on, and one out of order is refused. An input is one
  tick's intent, the controls ([[Movement]]) and the fight's buttons ([[Combat]]), with what the player's hands hold
  and the room tick their screen last showed. It steps that player's fighter once by combat's player tick, among the
  fighters as that screen showed them, exactly as the browser that predicted it did, so a prediction can only differ
  where the server knows more ([[Clients Predict With the Shared Rules]]).
- **Foes:** a player may ask for a foe (the [[Test Ground]]'s panel), one with each input; the room stands it 5 m
  along the player's aim, which follows their look, on its navmesh, facing them, and holds at most twelve.
  Each tick every foe thinks over the room as it stands and steps by the same rules ([[Foes]]), routing on a
  [[Navmesh]] the room bakes from its course when it opens.
- **Blows, as each defender saw them:** a player's blow on a foe is judged at once against the foe as the player's
  screen showed it, up to 24 ticks back. A blow on a player (a foe's swing, a telegraphed blow, a shot) waits until the
  player's inputs show they had seen it land, 24 ticks at most, and is judged against the player as they stood then:
  whether it reached them, their guard, their parry window, their dodge. What the verdict does is done to everyone as
  they are now. A telegraphed blow that finds no one overreaches its foe once every player near it has been judged.
- **Shots** fly a tick at a time and strike the first body of the other side on their line.
- **The dead** stand again at the spawn, whole, after four seconds; a dead foe is gone after ten.
- **The clock:** an input waits for the room's next tick. A player's inputs step their body no more often than the
  ticks since they joined, plus a slack of 6 ticks for the network's jitter, so no one moves faster than real time.
  More than 30 waiting inputs are refused.
- **What it sees:** every player's fighter and the number of their last input it took, every foe, the shots in
  flight, and what happened in the fight since it was last asked: hits, blocks, parries, guard breaks, dodges,
  staggers, deaths, players standing again, feints, foes arriving. The same on every machine.

## Messages

Every message is defined once, in `crates/protocol/messages.fbs`, and `flatc` makes the Rust and the TypeScript for
it ([[Messages Are FlatBuffers]]). A body and controls cross as the movement crate's numbers, in its order: a body's
22 and the controls' 7, the same as through the browser's WebAssembly door.

| Message | From | Holds |
|---|---|---|
| Input | A browser | Its number, one tick's controls and the fight's buttons, the look of the player's figure on their own screen (its move, frame and facing), their dress when it changed, what their hands hold, the room tick their screen showed, and a foe asked for |
| Joined | The room | The joining player's number, and every dress in the room |
| Snapshot | The room | The room's tick; every player: their number, their body, their whole fighter, the number of their last input taken and the look that came with it; the dresses that changed since the last snapshot; every foe: its number, kind and a glance at its fighter; the fight's events since the last snapshot; and the shots in flight |

The server reads an input only after FlatBuffers' verifier passes its bytes, so bytes that are not an input, or
controls that are not 7 numbers, are refused. The browser reads a message the room sent, and takes one it cannot read
as nothing.

Looks and dresses are each player's own word, passed on and decided nothing about: a look goes out with the tick that
takes its input, a dress once each time it changes, and every dress to whoever joins. The room refuses a move name
that is not lowercase letters, digits and underscores or is over 40 bytes, and a dress over 4 KB. A browser takes
another player's dress only when it has a dress's shape, and their move only where the forge draws it for that
figure; otherwise it shows the move their body is in.

## The host

A Cloudflare Worker, in `server/` ([[The Server's Shell Is in server]]), sends `/room/<name>` to one Durable Object for
each room's name. The object keeps its room in WebAssembly: the room and protocol crates behind the `room-wasm` door,
so every decision is Rust and the shell only carries bytes and time.

- A WebSocket joins the room and is welcomed with the player's number; each binary message is one of their inputs.
  An input refused for any reason but a flood closes the socket, since that browser is not keeping to the messages.
- While anyone is in, a timer ticks the room in step with the clock, catching up whole ticks it was late for, and
  sends every player the snapshot after each tick. When the last player leaves it stops, and the room goes with the
  object.
- The course is the Test Ground's, `content/testground/course.json`, which the client reads too.

## The browser's side

- `RoomConnection` joins a room and sends each tick's controls, numbered, as the player plays.
- `Prediction` keeps the inputs the room has not taken. On each snapshot the player's body is set to the room's word
  with those inputs stepped on top by the same rules: while the room agrees, that is the body already shown, to the
  bit; where it knows better, the body moves to it.
- The [[Test Ground]] joins a room when its address carries `?room=`, and shows every other player where the room
  last saw them.

## Running it

- **Deployed** as the Worker `overlook-rooms`: a room is `wss://overlook-rooms.mackcothran.workers.dev/room/<name>`.
  `npm run server:deploy` deploys it, with the owner's yes each time ([[Ask Before Deploying]]); CI does not.
- **Locally**, `npm run server` runs the rooms on Cloudflare's own runtime, at `ws://127.0.0.1:8787/room/<name>`.
- **In the page**, the Test Ground played alone runs the same room in its own WebAssembly, ticked by the page.

Measured on the deployed rooms with two browsers in one room: 60.0 ticks a second; snapshots 16.2 ms apart at the
median, 59 ms at the 99th in a hundred and 84 ms at the most; the room taking a player's input about 4 ticks after it
was sent; and every snapshot of a player matching that player's inputs replayed by the movement rules, to the bit.

## Limits

- Deploys are by hand, with the owner's yes; the rooms' code can lag `main` until the next deploy.
- A room bakes its navmesh as it opens: 0.3 to 0.7 s of work for the [[Test Ground]]'s course (tested offline). The
  account's Workers Paid plan gives a Durable Object 30 s of CPU an event.
- Any page can join a room, under any name; no one signs in.
- A snapshot sends every player's whole fighter and look and every foe's glance every tick: fine for a few players and
  foes, heavy for many.
- A player's view may lag 24 ticks at most; a screen further behind is judged as it stands. A player could claim the
  most lag to gain a little reaction time; nothing checks it.
- Players do not harm one another.
- A dress travels with a player's inputs, which flow only while they play: until then, others see a plain figure.
- A player who sends nothing stands still in time: their body waits, mid-jump if need be, until their inputs come.
- Every player joins at the same spot, and bodies pass through each other; foes keep apart by steering.
