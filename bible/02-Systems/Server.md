---
type: system
status: planned
code:
  - crates/room/src/lib.rs#Room
  - crates/room/src/lib.rs#SLACK_TICKS
  - crates/room/src/lib.rs#WAITING_LIMIT
  - crates/protocol/messages.fbs
  - crates/protocol/src/lib.rs#read_input
  - crates/protocol/src/lib.rs#snapshot_bytes
  - client/src/network/messages.ts#readFromRoom
---
# Server

The authority every player's game answers to ([[Server-Authoritative Multiplayer]]), run on Cloudflare
([[Servers on Cloudflare]]). Each shared space is one room. Built so far: the room, the server's core, which no host
runs yet, and its messages.

## The room

- **One shared space:** its course, its clock in ticks and its players. It has no network and no clock of its own:
  its host hands it each player's inputs, ticks it 60 times a second, and sends out what it sees.
- **Joining:** a player gets a number no one else in the room has had, and stands at the room's spawn.
- **Inputs:** each player numbers their inputs 1, 2, 3 and so on, and one out of order is refused. An input is one
  tick's controls ([[Movement]]) and steps that player's body once, exactly as the browser that predicted it did, so
  a prediction can only differ where the server knows more ([[Clients Predict With the Shared Rules]]).
- **The clock:** an input waits for the room's next tick. A player's inputs step their body no more often than the
  ticks since they joined, plus a slack of 6 ticks for the network's jitter, so no one moves faster than real time.
  More than 30 waiting inputs are refused.
- **What it sees:** every player's body and the number of their last input it took, in the order of their numbers,
  the same on every machine.

## Messages

Every message is defined once, in `crates/protocol/messages.fbs`, and `flatc` makes the Rust and the TypeScript for
it ([[Messages Are FlatBuffers]]). A body and controls cross as the movement crate's numbers, in its order: a body's
22 and the controls' 7, the same as through the browser's WebAssembly door.

| Message | From | Holds |
|---|---|---|
| Input | A browser | Its number and one tick's controls |
| Joined | The room | The joining player's number |
| Snapshot | The room | The room's tick, and every player: their number, their body, and the number of their last input taken |

The server reads an input only after FlatBuffers' verifier passes its bytes, so bytes that are not an input, or
controls that are not 7 numbers, are refused. The browser reads a message the room sent, and takes one it cannot read
as nothing.

## Limits

- No host yet: the Cloudflare shell, and the browsers' connection to it, come next.
- A snapshot sends every player's whole body every tick: fine for a few players, heavy for many.
- A player who sends nothing stands still in time: their body waits, mid-jump if need be, until their inputs come.
- Every player joins at the same spot, and bodies pass through each other.
