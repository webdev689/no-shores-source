//! Every network message between a browser and a room, as the one schema (`messages.fbs`) defines them: the Rust
//! flatc makes from it, and the server's side of reading and writing them. A body and controls cross as the movement
//! crate's numbers, in its order. See the Server note in the bible.
#![allow(unsafe_code, reason = "the code flatc makes reads a message's bytes in place, once the verifier passes them")]

use movement::floats::CONTROLS_FLOATS;
use movement::{Body, Controls};
use room::{Input, PlayerId, Seen, Shown};

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

/// The input an input's bytes hold: its number, its controls, what the player's figure shows, and their dress when it
/// changed; or why they do not read. The bytes come from a player's machine, so the verifier passes them first.
pub fn read_input(bytes: &[u8]) -> Result<Input, String> {
    let input = flatbuffers::root::<messages::Input>(bytes).map_err(|error| error.to_string())?;
    let numbers: Vec<f64> = input.controls().map(|controls| controls.iter().collect()).unwrap_or_default();
    let controls: &[f64; CONTROLS_FLOATS] = numbers
        .as_slice()
        .try_into()
        .map_err(|_| format!("controls are {CONTROLS_FLOATS} numbers, not {}", numbers.len()))?;
    let anim = input.anim().unwrap_or_default().to_owned();
    let shown = Shown { anim, frame: input.frame(), facing: input.facing() };
    let dress = input.dress().map(str::to_owned);
    Ok(Input { sequence: input.sequence(), controls: Controls::from_floats(controls), shown, dress })
}

/// An input as its bytes, with `controls` as numbers: what a browser sends, written from Rust for tests.
#[must_use]
pub fn input_bytes(sequence: u32, controls: &[f64], shown: &Shown, dress: Option<&str>) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let controls = Some(builder.create_vector(controls));
    let anim = Some(builder.create_string(&shown.anim));
    let dress = dress.map(|dress| builder.create_string(dress));
    let args = messages::InputArgs { sequence, controls, anim, frame: shown.frame, facing: shown.facing, dress };
    let input = messages::Input::create(&mut builder, &args);
    builder.finish(input, None);
    builder.finished_data().to_vec()
}

/// Each player's dress as the messages carry it.
fn dressed_vector<'builder>(
    builder: &mut flatbuffers::FlatBufferBuilder<'builder>,
    dressed: &[(PlayerId, &str)],
) -> flatbuffers::WIPOffset<flatbuffers::Vector<'builder, flatbuffers::ForwardsUOffset<messages::Dressed<'builder>>>> {
    let each: Vec<_> = dressed
        .iter()
        .map(|&(player, dress)| {
            let dress = Some(builder.create_string(dress));
            messages::Dressed::create(builder, &messages::DressedArgs { player, dress })
        })
        .collect();
    builder.create_vector(&each)
}

/// The welcome to a joining player: their number, and every dress in the room so far.
#[must_use]
pub fn joined_bytes(player: u32, dressed: &[(PlayerId, &str)]) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let dressed = Some(dressed_vector(&mut builder, dressed));
    let joined = messages::Joined::create(&mut builder, &messages::JoinedArgs { player, dressed });
    let message =
        messages::FromRoom::create(&mut builder, &messages::FromRoomArgs { joined: Some(joined), snapshot: None });
    builder.finish(message, None);
    builder.finished_data().to_vec()
}

/// Every player as the room saw them after its tick `tick`, and the dresses that changed since the last snapshot.
#[must_use]
pub fn snapshot_bytes(tick: u64, players: &[Seen], dressed: &[(PlayerId, &str)]) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let seen: Vec<_> = players
        .iter()
        .map(|seen| {
            let body = Some(builder.create_vector(&seen.body.to_floats()));
            let anim = Some(builder.create_string(&seen.shown.anim));
            let (frame, facing) = (seen.shown.frame, seen.shown.facing);
            let args =
                messages::SeenArgs { player: seen.player, acknowledged: seen.acknowledged, body, anim, frame, facing };
            messages::Seen::create(&mut builder, &args)
        })
        .collect();
    let players = Some(builder.create_vector(&seen));
    let dressed = Some(dressed_vector(&mut builder, dressed));
    let snapshot = messages::Snapshot::create(&mut builder, &messages::SnapshotArgs { tick, players, dressed });
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
