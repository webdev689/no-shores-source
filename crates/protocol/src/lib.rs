//! Every network message between a browser and a room, as the one schema (`messages.fbs`) defines them: the Rust
//! flatc makes from it, and the server's side of reading and writing them. A body and controls cross as the movement
//! crate's numbers, in its order. See the Server note in the bible.
#![allow(unsafe_code, reason = "the code flatc makes reads a message's bytes in place, once the verifier passes them")]

use movement::floats::CONTROLS_FLOATS;
use movement::{Body, Controls};
use room::sea::Ship;
use room::{Input, PlayerId, Seen, Shown, Standing};

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

/// The input an input's bytes hold: its number, its controls, what the player's figure shows, their dress when it
/// changed and whether they ask to respawn; or why they do not read. The bytes come from a player's machine, so the
/// verifier passes them first.
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
    let (sequence, respawn) = (input.sequence(), input.respawn());
    Ok(Input { sequence, controls: Controls::from_floats(controls), shown, dress, respawn })
}

/// An input as its bytes, with `controls` as numbers: what a browser sends, written from Rust for tests.
#[must_use]
pub fn input_bytes(sequence: u32, controls: &[f64], shown: &Shown, dress: Option<&str>, respawn: bool) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let controls = Some(builder.create_vector(controls));
    let anim = Some(builder.create_string(&shown.anim));
    let dress = dress.map(|dress| builder.create_string(dress));
    let (frame, facing) = (shown.frame, shown.facing);
    let args = messages::InputArgs { sequence, controls, anim, frame, facing, dress, respawn };
    let input = messages::Input::create(&mut builder, &args);
    builder.finish(input, None);
    builder.finished_data().to_vec()
}

/// The course a course's bytes hold: its points, x then y, and its pace; or why they do not read. The bytes come from
/// a player's machine, so the verifier passes them first.
pub fn read_course(bytes: &[u8]) -> Result<(Vec<[f64; 2]>, u16), String> {
    let course = flatbuffers::root::<messages::Course>(bytes).map_err(|error| error.to_string())?;
    let numbers: Vec<f64> = course.points().map(|points| points.iter().collect()).unwrap_or_default();
    if !numbers.len().is_multiple_of(2) {
        return Err(format!("a course's points are pairs, not {} numbers", numbers.len()));
    }
    Ok((numbers.chunks_exact(2).map(|pair| [pair[0], pair[1]]).collect(), course.pace()))
}

/// A course as its bytes: what a browser sends the sea room, written from Rust for tests.
#[must_use]
pub fn course_bytes(points: &[[f64; 2]], pace: u16) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let numbers: Vec<f64> = points.iter().flatten().copied().collect();
    let points = Some(builder.create_vector(&numbers));
    let course = messages::Course::create(&mut builder, &messages::CourseArgs { points, pace });
    builder.finish(course, None);
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

/// The welcome to a joining player: their number, every dress in the room so far, and in a node's room its id and
/// the rect its ground is cut to (west, north, east, south).
#[must_use]
pub fn joined_bytes(player: u32, dressed: &[(PlayerId, &str)], node: Option<(&str, [f64; 4])>) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let dressed = Some(dressed_vector(&mut builder, dressed));
    let bounds = node.map(|(_, bounds)| builder.create_vector(&bounds));
    let node = node.map(|(id, _)| builder.create_string(id));
    let joined = messages::Joined::create(&mut builder, &messages::JoinedArgs { player, dressed, node, bounds });
    let message =
        messages::FromRoom::create(&mut builder, &messages::FromRoomArgs { joined: Some(joined), snapshot: None });
    builder.finish(message, None);
    builder.finished_data().to_vec()
}

/// The numbers the messages give each standing.
pub const INSIDE: u8 = 0;
pub const WARNED: u8 = 1;
pub const DEAD: u8 = 2;

/// A standing as the messages carry it: its number and its ticks, left of a warning or dead.
#[must_use]
pub fn standing_parts(standing: Standing) -> (u8, u32) {
    match standing {
        Standing::Inside => (INSIDE, 0),
        Standing::Warned { ticks_left } => (WARNED, ticks_left),
        Standing::Dead { ticks } => (DEAD, ticks),
    }
}

/// A standing from its number and ticks; a number the messages do not give reads as inside.
#[must_use]
pub fn standing_of(kind: u8, ticks: u32) -> Standing {
    match kind {
        WARNED => Standing::Warned { ticks_left: ticks },
        DEAD => Standing::Dead { ticks },
        _ => Standing::Inside,
    }
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
            let (standing, standing_ticks) = standing_parts(seen.standing);
            let (player, acknowledged) = (seen.player, seen.acknowledged);
            let args = messages::SeenArgs { player, acknowledged, body, anim, frame, facing, standing, standing_ticks };
            messages::Seen::create(&mut builder, &args)
        })
        .collect();
    let players = Some(builder.create_vector(&seen));
    let dressed = Some(dressed_vector(&mut builder, dressed));
    let args = messages::SnapshotArgs { tick, players, dressed, ships: None };
    finish_snapshot(builder, &args)
}

/// Every ship at sea after the sea room's tick `tick`.
#[must_use]
pub fn sea_snapshot_bytes(tick: u64, ships: &[(PlayerId, Ship)]) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let each: Vec<_> = ships
        .iter()
        .map(|&(player, Ship { x, y, heading, pace })| {
            messages::Ship::create(&mut builder, &messages::ShipArgs { player, x, y, heading, pace })
        })
        .collect();
    let ships = Some(builder.create_vector(&each));
    let args = messages::SnapshotArgs { tick, players: None, dressed: None, ships };
    finish_snapshot(builder, &args)
}

fn finish_snapshot<'builder>(
    mut builder: flatbuffers::FlatBufferBuilder<'builder>,
    args: &messages::SnapshotArgs<'builder>,
) -> Vec<u8> {
    let snapshot = messages::Snapshot::create(&mut builder, args);
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
