//! Every network message between a browser and a room, as the one schema (`messages.fbs`) defines them: the Rust
//! flatc makes from it, and the server's side of reading and writing them. A body and controls cross as the movement
//! crate's numbers, in its order.
#![allow(unsafe_code, reason = "the code flatc makes reads a message's bytes in place, once the verifier passes them")]

use combat::floats::{FIGHTER_FLOATS, INTENT_FLOATS};
use combat::trim::TRIM_FLOATS;

/// A fighter's numbers in a snapshot: all of them but its trim.
pub const UNTRIMMED_FLOATS: usize = FIGHTER_FLOATS - TRIM_FLOATS;
use combat::Intent;
use movement::floats::CONTROLS_FLOATS;
use movement::{Body, Controls};
use naval::fight::Orders;
use naval::wire::{orders_from, orders_numbers};
use room::{CLEAR_FOES, Cast, Input, Plate, PlayerId, SHIELD_SHIFT, Shown, SpawnAsk, Standing};

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

/// The protocol's version: the schema's hash, which a room's welcome carries.
pub const PROTOCOL: u32 = include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../generated/messages/rust/version.rs"));

mod bounty_wire;
pub mod encounter_wire;
pub mod fleet;
pub mod gear_wire;
mod item_wire;
pub mod land;
mod lore_wire;
mod mail_wire;
pub mod pack;
pub mod plates_wire;
mod quest_wire;
mod sea_snapshot;
pub mod ship_wire;
pub use sea_snapshot::{IsleSeen, SeaHarbour, sea_snapshot_bytes};
mod public_wire;
mod standing_wire;

pub use land::{Snapshot, snapshot_bytes};

/// The fight's numbers an input carries after its controls: the stroke held, guard, dodge, shoot, pitch, aim, the
/// aim's mark (x, y, z, none as NaN), and a drink asked.
const COMBAT_NUMBERS: usize = INTENT_FLOATS - CONTROLS_FLOATS;
/// The fight's numbers of an input that carries none: nothing held, no mark, and no drink.
const NO_FIGHT: [f64; COMBAT_NUMBERS] = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, f64::NAN, f64::NAN, f64::NAN, 0.0];

/// The most earlier inputs one input carries that the room reads: more than a short loss is a link to rejoin.
const EARLIER_MOST: usize = 8;

/// How far the verifier reads a browser's message before it refuses it. A message is at most 8 KB, but a table may be
/// pointed at again and again, so the verifier's own walk is held to what a true message needs: a few tables deep,
/// each input and its ask, and twice a message's bytes in all.
const FROM_A_BROWSER: flatbuffers::VerifierOptions = flatbuffers::VerifierOptions {
    max_depth: 8,
    max_tables: 8 * (EARLIER_MOST + 1),
    max_apparent_size: 16 * 1024,
    ignore_missing_null_terminator: false,
};

/// A message from a browser read as `T`, once the verifier, held to `FROM_A_BROWSER`, has passed it.
pub(crate) fn from_a_browser<'bytes, T>(bytes: &'bytes [u8]) -> Result<T::Inner, String>
where
    T: 'bytes + flatbuffers::Follow<'bytes> + flatbuffers::Verifiable,
{
    flatbuffers::root_with_opts::<T>(&FROM_A_BROWSER, bytes).map_err(|error| error.to_string())
}

/// The input an input's bytes hold: its number, its intent, what the player's figure shows, their dress when it
/// changed, what their hands hold, the tick their screen showed, a foe asked for (a type and a rank) or every foe sent
/// away, and whether they ask to respawn; or why they do not read. The bytes come from a player's machine, so the
/// verifier passes them first. An input with no fight's numbers asks for nothing in the fight.
pub fn read_input(bytes: &[u8]) -> Result<Input, String> {
    input_of(&from_a_browser::<messages::Input>(bytes)?)
}

/// The inputs an input's bytes hold, oldest first: those it carries from before it, then itself.
pub fn read_inputs(bytes: &[u8]) -> Result<Vec<Input>, String> {
    let input = from_a_browser::<messages::Input>(bytes)?;
    let earlier = input.earlier().map(|earlier| earlier.iter().collect::<Vec<_>>()).unwrap_or_default();
    if earlier.len() > EARLIER_MOST {
        return Err(format!("{} earlier inputs, more than {EARLIER_MOST}", earlier.len()));
    }
    earlier.iter().chain(std::iter::once(&input)).map(input_of).collect()
}

fn input_of(input: &messages::Input<'_>) -> Result<Input, String> {
    let controls: Vec<f64> = input.controls().map(|controls| controls.iter().collect()).unwrap_or_default();
    if controls.len() != CONTROLS_FLOATS {
        return Err(format!("controls are {CONTROLS_FLOATS} numbers, not {}", controls.len()));
    }
    let combat: Vec<f64> = input.combat().map(|combat| combat.iter().collect()).unwrap_or_else(|| NO_FIGHT.to_vec());
    if combat.len() != COMBAT_NUMBERS {
        return Err(format!("the fight's numbers are {COMBAT_NUMBERS}, not {}", combat.len()));
    }
    let numbers: Vec<f64> = controls.into_iter().chain(combat).collect();
    let intent = Intent::from_floats(numbers.as_slice().try_into().map_err(|_| "an intent's numbers".to_owned())?);
    let anim = input.anim().unwrap_or_default().to_owned();
    let shown = Shown { anim, frame: input.frame(), facing: input.facing() };
    let dress = input.dress().map(str::to_owned);
    let (spawn, shield) = (input.spawn(), input.spawn() >> SHIELD_SHIFT);
    let spawn = match (spawn, input.spawn_type()) {
        (CLEAR_FOES, _) => Some(SpawnAsk::Clear),
        (role, 0) => SpawnAsk::by_role(role & ((1 << SHIELD_SHIFT) - 1), shield),
        (_, foe_type) => Some(SpawnAsk::Foe { foe_type, rank: input.spawn_rank(), shield }),
    };
    let (sequence, arms, seen, respawn) = (input.sequence(), input.arms(), input.seen(), input.respawn());
    let ask = input.ask().and_then(|ask| gear_wire::asked_of(&ask));
    let spawn_level = input.spawn_level();
    let (cast, menu) = (cast_of(input), input.menu());
    Ok(Input { sequence, intent, shown, dress, arms, seen, spawn, respawn, ask, spawn_level, cast, menu })
}

/// The cast an input carries, if it carries one: its aim only when it is three numbers, every one a number.
fn cast_of(input: &messages::Input<'_>) -> Option<Cast> {
    let aim: Option<Vec<f64>> = input.cast_aim().map(|aim| aim.iter().collect());
    let aim =
        aim.and_then(|aim| <[f64; 3]>::try_from(aim).ok()).filter(|aim| aim.iter().all(|number| number.is_finite()));
    (input.cast() > 0).then_some(Cast { spell: input.cast(), aim })
}

/// An input as its bytes: what a browser sends, written from Rust for tests.
#[must_use]
pub fn input_bytes(input: &Input) -> Vec<u8> {
    inputs_bytes(input, &[])
}

/// An input carrying `earlier` inputs before it, as its bytes: what a browser sends over a link that loses messages.
#[must_use]
pub fn inputs_bytes(input: &Input, earlier: &[Input]) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let before: Vec<_> = earlier.iter().map(|each| input_offset(&mut builder, each, None)).collect();
    let before = (!before.is_empty()).then(|| builder.create_vector(&before));
    let written = input_offset(&mut builder, input, before);
    builder.finish(written, None);
    builder.finished_data().to_vec()
}

type Inputs<'built> =
    flatbuffers::WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::Input<'built>>>>;

fn input_offset<'built>(
    builder: &mut flatbuffers::FlatBufferBuilder<'built>,
    input: &Input,
    earlier: Option<Inputs<'built>>,
) -> flatbuffers::WIPOffset<messages::Input<'built>> {
    let numbers = input.intent.to_floats();
    let (controls, combat) = numbers.split_at(CONTROLS_FLOATS);
    let controls = Some(builder.create_vector(controls));
    let combat = Some(builder.create_vector(combat));
    let anim = Some(builder.create_string(&input.shown.anim));
    let dress = input.dress.as_ref().map(|dress| builder.create_string(dress));
    let ask = input.ask.as_ref().map(|asked| gear_wire::ask_offset(builder, asked));
    let cast_aim = input.cast.and_then(|cast| cast.aim).map(|aim| builder.create_vector(&aim));
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
        spawn: match input.spawn {
            Some(SpawnAsk::Clear) => CLEAR_FOES,
            Some(SpawnAsk::Foe { shield, .. }) => shield << SHIELD_SHIFT,
            None => 0,
        },
        respawn: input.respawn,
        ask,
        spawn_level: input.spawn_level,
        spawn_type: match input.spawn {
            Some(SpawnAsk::Foe { foe_type, .. }) => foe_type,
            _ => 0,
        },
        spawn_rank: match input.spawn {
            Some(SpawnAsk::Foe { rank, .. }) => rank,
            _ => 0,
        },
        cast: input.cast.map_or(0, |cast| cast.spell),
        cast_aim,
        earlier,
        menu: input.menu,
    };
    messages::Input::create(builder, &args)
}

/// The course a course's bytes hold: its points, x then y, and its pace; or why they do not read. The bytes come from
/// a player's machine, so the verifier passes them first.
pub fn read_course(bytes: &[u8]) -> Result<(Vec<[f64; 2]>, u16), String> {
    let course = from_a_browser::<messages::Course>(bytes)?;
    let numbers: Vec<f64> = course.points().map(|points| points.iter().collect()).unwrap_or_default();
    if !numbers.len().is_multiple_of(2) {
        return Err(format!("a course's points are pairs, not {} numbers", numbers.len()));
    }
    Ok((numbers.chunks_exact(2).map(|pair| [pair[0], pair[1]]).collect(), course.pace()))
}

/// What a ship's message asks of the sea room: a course; in a fight, its orders; off the helm, a numbered step of the
/// player's walk on its deck; or the helm left or taken again; or the hostile ship it chases.
#[derive(Clone, Debug, PartialEq)]
pub enum SeaInput {
    Course(Vec<[f64; 2]>, u16),
    /// A course into other waters, travelled by the held map.
    Travel(Vec<[f64; 2]>, u16),
    /// No points and one heading: the ship comes to rest turned to it.
    Face(f64),
    Orders(Orders),
    Walk(u32, Controls),
    LeaveHelm,
    TakeHelm,
    /// The hostile ship it chases, by that ship's number, or none.
    Chase(Option<u32>),
    /// Its repair by a port city.
    Repair,
    /// To board a captain who struck.
    Board,
    /// To leave its deck once its crew has fallen.
    LeaveDeck,
}

/// What a message to the sea room asks, or why it does not read: the helm when it asks for it, a step when it carries
/// one, orders when it carries them, else a course. The bytes come from a player's machine, so the verifier passes
/// them first.
pub fn read_sea_input(bytes: &[u8]) -> Result<SeaInput, String> {
    let course = from_a_browser::<messages::Course>(bytes)?;
    match course.ask() {
        0 => {}
        1 => return Ok(SeaInput::Repair),
        2 => return Ok(SeaInput::Board),
        3 => return Ok(SeaInput::LeaveDeck),
        other => return Err(format!("an ask is a repair (1), a boarding (2) or leaving a deck (3), not {other}")),
    }
    match course.helm() {
        0 => {}
        1 => return Ok(SeaInput::LeaveHelm),
        2 => return Ok(SeaInput::TakeHelm),
        3 => return Ok(SeaInput::Chase(Some(course.chase()).filter(|&ship| ship != 0))),
        other => return Err(format!("the helm is left (1) or taken (2), or a chase (3), not {other}")),
    }
    if let Some(walk) = course.walk() {
        let numbers: Vec<f64> = walk.iter().collect();
        let controls: [f64; CONTROLS_FLOATS] = numbers
            .as_slice()
            .try_into()
            .map_err(|_| format!("a step's controls are {CONTROLS_FLOATS} numbers, not {}", numbers.len()))?;
        return Ok(SeaInput::Walk(course.walk_sequence(), Controls::from_floats(&controls)));
    }
    if let Some(orders) = course.orders() {
        return orders_from(&orders.iter().collect::<Vec<_>>()).map(SeaInput::Orders);
    }
    if let Some(facing) = course.facing() {
        let numbers: Vec<f64> = facing.iter().collect();
        return match (numbers.as_slice(), course.points().map_or(0, |points| points.len())) {
            (&[heading], 0) => Ok(SeaInput::Face(heading)),
            (_, 0) => Err(format!("a ship faces one heading, not {} numbers", numbers.len())),
            _ => Err("a course's legs turn it: a facing comes with no points".to_owned()),
        };
    }
    let travel = course.travel();
    read_course(bytes)
        .map(|(points, pace)| if travel { SeaInput::Travel(points, pace) } else { SeaInput::Course(points, pace) })
}

/// Orders as their bytes: what a browser sends the sea room in a fight, written from Rust for tests.
#[must_use]
pub fn orders_bytes(orders: &Orders) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let orders = Some(builder.create_vector(&orders_numbers(orders)));
    let args = messages::CourseArgs { orders, ..messages::CourseArgs::default() };
    let course = messages::Course::create(&mut builder, &args);
    builder.finish(course, None);
    builder.finished_data().to_vec()
}

/// A step of a walk on deck as its bytes: what a browser sends the sea room off the helm, written from Rust for tests.
#[must_use]
pub fn walk_bytes(sequence: u32, controls: &Controls) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let walk = Some(builder.create_vector(&controls.to_floats()));
    let args = messages::CourseArgs { walk, walk_sequence: sequence, ..messages::CourseArgs::default() };
    let course = messages::Course::create(&mut builder, &args);
    builder.finish(course, None);
    builder.finished_data().to_vec()
}

/// The helm left (`leave`) or taken again as its bytes, written from Rust for tests.
#[must_use]
pub fn helm_bytes(leave: bool) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let args = messages::CourseArgs { helm: if leave { 1 } else { 2 }, ..messages::CourseArgs::default() };
    let course = messages::Course::create(&mut builder, &args);
    builder.finish(course, None);
    builder.finished_data().to_vec()
}

/// A chase of the hostile ship numbered `ship` (0 none), as its bytes, written from Rust for tests.
#[must_use]
pub fn chase_bytes(ship: u32) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let course =
        messages::Course::create(&mut builder, &messages::CourseArgs { helm: 3, chase: ship, ..Default::default() });
    builder.finish(course, None);
    builder.finished_data().to_vec()
}

/// An ask at sea as its bytes (1 a repair, 2 a boarding), written from Rust for tests.
#[must_use]
pub fn ask_bytes(ask: u8) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let course =
        messages::Course::create(&mut builder, &messages::CourseArgs { ask, ..messages::CourseArgs::default() });
    builder.finish(course, None);
    builder.finished_data().to_vec()
}

/// A ship at rest turned to a heading, as its bytes, written from Rust for tests.
#[must_use]
pub fn face_bytes(heading: f64) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let facing = Some(builder.create_vector(&[heading]));
    let args = messages::CourseArgs { facing, ..messages::CourseArgs::default() };
    let course = messages::Course::create(&mut builder, &args);
    builder.finish(course, None);
    builder.finished_data().to_vec()
}

/// A course as its bytes: what a browser sends the sea room, written from Rust for tests.
#[must_use]
pub fn course_bytes(points: &[[f64; 2]], pace: u16) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let numbers: Vec<f64> = points.iter().flatten().copied().collect();
    let points = Some(builder.create_vector(&numbers));
    let course = messages::Course::create(
        &mut builder,
        &messages::CourseArgs { points, pace, ..messages::CourseArgs::default() },
    );
    builder.finish(course, None);
    builder.finished_data().to_vec()
}

/// A course to travel by as its bytes: what a browser sends the sea room from the held map, written from Rust for tests.
#[must_use]
pub fn travel_bytes(points: &[[f64; 2]], pace: u16) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let numbers: Vec<f64> = points.iter().flatten().copied().collect();
    let points = Some(builder.create_vector(&numbers));
    let args = messages::CourseArgs { points, pace, travel: true, ..messages::CourseArgs::default() };
    let course = messages::Course::create(&mut builder, &args);
    builder.finish(course, None);
    builder.finished_data().to_vec()
}

/// Each player's dress as the messages carry it.
pub(crate) fn dressed_vector<'builder>(
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

/// Everyone in a room as a joining player is welcomed with it: each player's dress and plate so far.
#[derive(Clone, Copy, Debug, Default)]
pub struct Present<'room> {
    pub dressed: &'room [(PlayerId, &'room str)],
    pub plates: &'room [(PlayerId, Plate)],
}

/// The welcome to a joining player: their number, everyone's dress and plate so far, in a node's room its id and the
/// rect its ground is cut to (west, north, east, south), and the world time at the room's first tick.
#[must_use]
pub fn joined_bytes(player: u32, present: Present<'_>, node: Option<(&str, [f64; 4])>, epoch: f64) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let dressed = Some(dressed_vector(&mut builder, present.dressed));
    let plates = Some(plates_wire::plates_vector(&mut builder, present.plates));
    let bounds = node.map(|(_, bounds)| builder.create_vector(&bounds));
    let node = node.map(|(id, _)| builder.create_string(id));
    let joined = messages::Joined::create(
        &mut builder,
        &messages::JoinedArgs { player, dressed, node, bounds, protocol: PROTOCOL, epoch, plates },
    );
    let message = messages::FromRoom::create(
        &mut builder,
        &messages::FromRoomArgs { joined: Some(joined), ..Default::default() },
    );
    builder.finish(message, None);
    builder.finished_data().to_vec()
}

/// The numbers the messages give each standing.
pub const INSIDE: u8 = 0;
pub const WARNED: u8 = 1;
/// Dead by straying past the section's edge.
pub const DEAD: u8 = 2;
/// Dead by a fall in a social space.
pub const FELL: u8 = 3;

/// A standing as the messages carry it: its number and its ticks, left of a warning or dead.
#[must_use]
pub fn standing_parts(standing: Standing) -> (u8, u32) {
    match standing {
        Standing::Inside => (INSIDE, 0),
        Standing::Warned { ticks_left } => (WARNED, ticks_left),
        Standing::Dead { ticks, fell } => (if fell { FELL } else { DEAD }, ticks),
    }
}

/// A standing from its number and ticks; a number the messages do not give reads as inside.
#[must_use]
pub fn standing_of(kind: u8, ticks: u32) -> Standing {
    match kind {
        WARNED => Standing::Warned { ticks_left: ticks },
        DEAD => Standing::Dead { ticks, fell: false },
        FELL => Standing::Dead { ticks, fell: true },
        _ => Standing::Inside,
    }
}

pub(crate) fn finish_snapshot<'builder>(
    mut builder: flatbuffers::FlatBufferBuilder<'builder>,
    args: &messages::SnapshotArgs<'builder>,
) -> Vec<u8> {
    let snapshot = messages::Snapshot::create(&mut builder, args);
    let message = messages::FromRoom::create(
        &mut builder,
        &messages::FromRoomArgs { snapshot: Some(snapshot), ..Default::default() },
    );
    builder.finish(message, None);
    builder.finished_data().to_vec()
}

/// A body from a snapshot's 24 numbers, a rider's boost's two clocks last, or nothing when they are not 24.
#[must_use]
pub fn body_of(numbers: &[f64]) -> Option<Body> {
    numbers.try_into().ok().map(Body::from_floats)
}

#[cfg(test)]
#[path = "encounter_wire_tests.rs"]
mod encounter_wire_tests;
#[cfg(test)]
#[path = "protocol_tests.rs"]
mod protocol_tests;
#[cfg(test)]
#[path = "public_wire_tests.rs"]
mod public_wire_tests;
