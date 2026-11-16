//! Every network message between a browser and a room, as the one schema (`messages.fbs`) defines them: the Rust
//! flatc makes from it, and the server's side of reading and writing them. A body and controls cross as the movement
//! crate's numbers, in its order. See the Server note in the bible.
#![allow(unsafe_code, reason = "the code flatc makes reads a message's bytes in place, once the verifier passes them")]

use movement::floats::CONTROLS_FLOATS;
use movement::{Body, Controls};
use room::Seen;

/// The code flatc makes from the schema, into `generated/`, which git leaves out (`npm run schema`).
#[allow(
    clippy::all,
    clippy::pedantic,
    clippy::min_ident_chars,
    clippy::unwrap_used,
    missing_debug_implementations,
    reason = "made by flatc, not written here"
)]
pub mod wire {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../generated/messages/rust/messages_generated.rs"));
}

use wire::overlook::wire as messages;

/// The number and the controls an input's bytes hold, or why they do not read. The bytes come from a player's
/// machine, so the verifier passes them before anything is read.
pub fn read_input(bytes: &[u8]) -> Result<(u32, Controls), String> {
    let input = flatbuffers::root::<messages::Input>(bytes).map_err(|error| error.to_string())?;
    let numbers: Vec<f64> = input.controls().map(|controls| controls.iter().collect()).unwrap_or_default();
    let controls: &[f64; CONTROLS_FLOATS] = numbers
        .as_slice()
        .try_into()
        .map_err(|_| format!("controls are {CONTROLS_FLOATS} numbers, not {}", numbers.len()))?;
    Ok((input.sequence(), Controls::from_floats(controls)))
}

/// The welcome to a joining player: their number.
#[must_use]
pub fn joined_bytes(player: u32) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let joined = messages::Joined::create(&mut builder, &messages::JoinedArgs { player });
    let message =
        messages::FromRoom::create(&mut builder, &messages::FromRoomArgs { joined: Some(joined), snapshot: None });
    builder.finish(message, None);
    builder.finished_data().to_vec()
}

/// Every player as the room saw them after its tick `tick`.
#[must_use]
pub fn snapshot_bytes(tick: u64, players: &[Seen]) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let seen: Vec<_> = players
        .iter()
        .map(|seen| {
            let body = Some(builder.create_vector(&seen.body.to_floats()));
            let args = messages::SeenArgs { player: seen.player, acknowledged: seen.acknowledged, body };
            messages::Seen::create(&mut builder, &args)
        })
        .collect();
    let players = Some(builder.create_vector(&seen));
    let snapshot = messages::Snapshot::create(&mut builder, &messages::SnapshotArgs { tick, players });
    let message =
        messages::FromRoom::create(&mut builder, &messages::FromRoomArgs { joined: None, snapshot: Some(snapshot) });
    builder.finish(message, None);
    builder.finished_data().to_vec()
}

/// A body from a snapshot's 22 numbers, or nothing when they are not 22.
#[must_use]
pub fn body_of(numbers: &[f64]) -> Option<Body> {
    numbers.try_into().ok().map(Body::from_floats)
}

#[cfg(test)]
#[path = "protocol_tests.rs"]
mod protocol_tests;
