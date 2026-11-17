//! Every network message between a browser and a room, as the one schema (`messages.fbs`) defines them: the Rust
//! flatc makes from it, and the server's side of reading and writing them. A body and controls cross as the movement
//! crate's numbers, in its order. See the Server note in the bible.
#![allow(unsafe_code, reason = "the code flatc makes reads a message's bytes in place, once the verifier passes them")]

use combat::floats::INTENT_FLOATS;
use combat::{Intent, Shot};
use movement::Body;
use movement::floats::CONTROLS_FLOATS;
use room::sea::Ship;
use room::{Event, FoeSeen, Input, PlayerId, Seen, Shown, Standing};

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

pub mod fleet;

/// The fight's numbers an input carries after its controls: the stroke held, guard, dodge, shoot, pitch.
const COMBAT_NUMBERS: usize = INTENT_FLOATS - CONTROLS_FLOATS;

/// The input an input's bytes hold: its number, its intent, what the player's figure shows, their dress when it
/// changed, what their hands hold, the tick their screen showed, a foe asked for, and whether they ask to respawn; or
/// why they do not read. The bytes come from a player's machine, so the verifier passes them first. An input with no
/// fight's numbers asks for nothing in the fight.
pub fn read_input(bytes: &[u8]) -> Result<Input, String> {
    let input = flatbuffers::root::<messages::Input>(bytes).map_err(|error| error.to_string())?;
    let controls: Vec<f64> = input.controls().map(|controls| controls.iter().collect()).unwrap_or_default();
    if controls.len() != CONTROLS_FLOATS {
        return Err(format!("controls are {CONTROLS_FLOATS} numbers, not {}", controls.len()));
    }
    let combat: Vec<f64> =
        input.combat().map(|combat| combat.iter().collect()).unwrap_or_else(|| vec![0.0; COMBAT_NUMBERS]);
    if combat.len() != COMBAT_NUMBERS {
        return Err(format!("the fight's numbers are {COMBAT_NUMBERS}, not {}", combat.len()));
    }
    let numbers: Vec<f64> = controls.into_iter().chain(combat).collect();
    let intent = Intent::from_floats(numbers.as_slice().try_into().map_err(|_| "an intent's numbers".to_owned())?);
    let anim = input.anim().unwrap_or_default().to_owned();
    let shown = Shown { anim, frame: input.frame(), facing: input.facing() };
    let dress = input.dress().map(str::to_owned);
    let spawn = Some(input.spawn()).filter(|kind| *kind != 0);
    let (sequence, arms, seen, respawn) = (input.sequence(), input.arms(), input.seen(), input.respawn());
    Ok(Input { sequence, intent, shown, dress, arms, seen, spawn, respawn })
}

/// An input as its bytes: what a browser sends, written from Rust for tests.
#[must_use]
pub fn input_bytes(input: &Input) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let numbers = input.intent.to_floats();
    let (controls, combat) = numbers.split_at(CONTROLS_FLOATS);
    let controls = Some(builder.create_vector(controls));
    let combat = Some(builder.create_vector(combat));
    let anim = Some(builder.create_string(&input.shown.anim));
    let dress = input.dress.as_ref().map(|dress| builder.create_string(dress));
    let args = messages::InputArgs {
        sequence: input.sequence,
        controls,
        anim,
        frame: input.shown.frame,
        facing: input.shown.facing,
        dress,
        combat,
        arms: input.arms,
        seen: input.seen,
        spawn: input.spawn.unwrap_or_default(),
        respawn: input.respawn,
    };
    let message = messages::Input::create(&mut builder, &args);
    builder.finish(message, None);
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

/// Everything a snapshot carries after a room's tick.
#[derive(Clone, Copy, Debug)]
pub struct Snapshot<'snapshot> {
    pub tick: u64,
    pub players: &'snapshot [Seen],
    pub dressed: &'snapshot [(PlayerId, &'snapshot str)],
    pub foes: &'snapshot [FoeSeen],
    pub events: &'snapshot [Event],
    pub shots: &'snapshot [Shot],
}

/// Every player as the room saw them after its tick, the dresses that changed since the last snapshot, every foe,
/// what happened in the fight since, and the shots in flight.
#[must_use]
pub fn snapshot_bytes(snapshot: &Snapshot<'_>) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let seen: Vec<_> = snapshot
        .players
        .iter()
        .map(|seen| {
            let fighter = Some(builder.create_vector(&seen.fighter.to_floats()));
            let anim = Some(builder.create_string(&seen.shown.anim));
            let (frame, facing) = (seen.shown.frame, seen.shown.facing);
            let (standing, standing_ticks) = standing_parts(seen.standing);
            let (player, acknowledged) = (seen.player, seen.acknowledged);
            let args =
                messages::SeenArgs { player, acknowledged, anim, frame, facing, fighter, standing, standing_ticks };
            messages::Seen::create(&mut builder, &args)
        })
        .collect();
    let players = Some(builder.create_vector(&seen));
    let dressed = Some(dressed_vector(&mut builder, snapshot.dressed));
    let foes: Vec<_> = snapshot
        .foes
        .iter()
        .map(|foe| {
            let glance = Some(builder.create_vector(&foe.fighter.glance()));
            messages::Foe::create(&mut builder, &messages::FoeArgs { id: foe.foe, kind: foe.kind, glance })
        })
        .collect();
    let foes = Some(builder.create_vector(&foes));
    let events: Vec<_> = snapshot
        .events
        .iter()
        .map(|event| {
            let args = messages::EventArgs {
                tick: event.tick,
                kind: event.kind as u8,
                how: event.how.map_or(0, |how| how as u8),
                striker: event.striker,
                defender: event.defender,
                amount: event.amount,
            };
            messages::Event::create(&mut builder, &args)
        })
        .collect();
    let events = Some(builder.create_vector(&events));
    let shots: Vec<_> = snapshot
        .shots
        .iter()
        .map(|shot| {
            let at = Some(builder.create_vector(&shot.at));
            let velocity = Some(builder.create_vector(&shot.velocity));
            let age = u16::try_from(shot.age).unwrap_or(u16::MAX);
            let args = messages::FlyingArgs { owner: shot.owner, ranged: shot.ranged as u8, at, velocity, age };
            messages::Flying::create(&mut builder, &args)
        })
        .collect();
    let shots = Some(builder.create_vector(&shots));
    let tick = snapshot.tick;
    let args =
        messages::SnapshotArgs { tick, players, dressed, foes, events, shots, ..messages::SnapshotArgs::default() };
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
    let args = messages::SnapshotArgs { tick, ships, ..messages::SnapshotArgs::default() };
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
