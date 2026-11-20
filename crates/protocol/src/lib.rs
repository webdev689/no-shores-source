//! Every network message between a browser and a room, as the one schema (`messages.fbs`) defines them: the Rust
//! flatc makes from it, and the server's side of reading and writing them. A body and controls cross as the movement
//! crate's numbers, in its order.
#![allow(unsafe_code, reason = "the code flatc makes reads a message's bytes in place, once the verifier passes them")]

use combat::floats::{FIGHTER_FLOATS, INTENT_FLOATS};
use combat::shots::Line;
use combat::trim::TRIM_FLOATS;

/// A fighter's numbers in a snapshot: all of them but its trim.
pub const UNTRIMMED_FLOATS: usize = FIGHTER_FLOATS - TRIM_FLOATS;
use combat::{Intent, Shot, Status};
use movement::floats::CONTROLS_FLOATS;
use movement::{Body, Controls};
use naval::fight::Orders;
use naval::ranks::Commission;
use naval::wire::{orders_from, orders_numbers};
use room::pirates::Pirate;
use room::sea::Ship;
use room::{
    CLEAR_FOES, Cast, Event, FoeSeen, Input, PlayerId, SHIELD_SHIFT, Seen, Shown, SpawnAsk, SpellSeen, Standing,
};

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

pub mod fleet;
pub mod gear_wire;
mod standing_wire;

/// The fight's numbers an input carries after its controls: the stroke held, guard, dodge, shoot, pitch, aim, and the
/// aim's mark (x, y, z, none as NaN).
const COMBAT_NUMBERS: usize = INTENT_FLOATS - CONTROLS_FLOATS;
/// The fight's numbers of an input that carries none: nothing held, and no mark.
const NO_FIGHT: [f64; COMBAT_NUMBERS] = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, f64::NAN, f64::NAN, f64::NAN];

/// The input an input's bytes hold: its number, its intent, what the player's figure shows, their dress when it
/// changed, what their hands hold, the tick their screen showed, a foe asked for (a type and a rank) or every foe sent
/// away, and whether they ask to respawn; or why they do not read. The bytes come from a player's machine, so the
/// verifier passes them first. An input with no fight's numbers asks for nothing in the fight.
pub fn read_input(bytes: &[u8]) -> Result<Input, String> {
    let input = flatbuffers::root::<messages::Input>(bytes).map_err(|error| error.to_string())?;
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
    Ok(Input { sequence, intent, shown, dress, arms, seen, spawn, respawn, ask, spawn_level, cast: cast_of(&input) })
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
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let numbers = input.intent.to_floats();
    let (controls, combat) = numbers.split_at(CONTROLS_FLOATS);
    let controls = Some(builder.create_vector(controls));
    let combat = Some(builder.create_vector(combat));
    let anim = Some(builder.create_string(&input.shown.anim));
    let dress = input.dress.as_ref().map(|dress| builder.create_string(dress));
    let ask = input.ask.as_ref().map(|asked| gear_wire::ask_offset(&mut builder, asked));
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

/// What a ship's message asks of the sea room: a course; in a fight, her orders; off the helm, a numbered step of the
/// player's walk on her deck; or the helm left or taken again.
#[derive(Clone, Debug, PartialEq)]
pub enum SeaInput {
    Course(Vec<[f64; 2]>, u16),
    /// No points and one heading: she comes to rest turned to it.
    Face(f64),
    Orders(Orders),
    Walk(u32, Controls),
    LeaveHelm,
    TakeHelm,
}

/// What a message to the sea room asks, or why it does not read: the helm when it asks for it, a step when it carries
/// one, orders when it carries them, else a course. The bytes come from a player's machine, so the verifier passes
/// them first.
pub fn read_sea_input(bytes: &[u8]) -> Result<SeaInput, String> {
    let course = flatbuffers::root::<messages::Course>(bytes).map_err(|error| error.to_string())?;
    match course.helm() {
        0 => {}
        1 => return Ok(SeaInput::LeaveHelm),
        2 => return Ok(SeaInput::TakeHelm),
        other => return Err(format!("the helm is left (1) or taken (2), not {other}")),
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
            _ => Err("a course's legs turn her: a facing comes with no points".to_owned()),
        };
    }
    read_course(bytes).map(|(points, pace)| SeaInput::Course(points, pace))
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

/// The welcome to a joining player: their number, every dress in the room so far, in a node's room its id and the
/// rect its ground is cut to (west, north, east, south), and the world time at the room's first tick.
#[must_use]
pub fn joined_bytes(player: u32, dressed: &[(PlayerId, &str)], node: Option<(&str, [f64; 4])>, epoch: f64) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let dressed = Some(dressed_vector(&mut builder, dressed));
    let bounds = node.map(|(_, bounds)| builder.create_vector(&bounds));
    let node = node.map(|(id, _)| builder.create_string(id));
    let joined = messages::Joined::create(
        &mut builder,
        &messages::JoinedArgs { player, dressed, node, bounds, protocol: PROTOCOL, epoch },
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
    /// The balls that stopped since the last snapshot, each sent among the shots as its last segment and its muzzle.
    pub lines: &'snapshot [Line],
    pub spells: &'snapshot [SpellSeen],
    /// A dungeon's cache as `Room::cache` gives it; empty, and left out of the bytes, in any other room.
    pub cache: &'snapshot [f64],
    /// In an Abyss run, the revives its company has left (`Room::revives`); none in any other room.
    pub revives: Option<u8>,
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
            // Each fighter goes without its trim, which only its own player needs and has in their gear.
            let floats = seen.fighter.to_floats();
            let fighter = Some(builder.create_vector(&floats[..UNTRIMMED_FLOATS]));
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
            let (shield, statuses) = (foe.shield, foe.fighter.statuses);
            let args = messages::FoeArgs {
                id: foe.foe,
                kind: foe.kind,
                glance,
                type_: foe.foe_type,
                rank: foe.rank,
                faction: foe.faction,
                phase: foe.phase,
                alert: foe.alert,
                level: foe.level,
                shield_element: shield.map_or(0, |shield| shield.element as u8),
                shield: shield.map_or(0.0, |shield| shield.left),
                shield_most: shield.map_or(0.0, |shield| shield.most),
                expose: statuses.left(Status::Expose),
                charge: statuses.left(Status::Charge),
                charge_immune: statuses.charge_immune,
            };
            messages::Foe::create(&mut builder, &args)
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
                stroke: event.stroke.map_or(0, |stroke| stroke as u8),
                crit: event.crit,
                element: event.element,
            };
            messages::Event::create(&mut builder, &args)
        })
        .collect();
    let events = Some(builder.create_vector(&events));
    let flying = snapshot.shots.iter().map(|shot| (shot, None));
    let stopped = snapshot.lines.iter().map(|line| (&line.last, Some(line.muzzle)));
    let shots: Vec<_> = flying
        .chain(stopped)
        .map(|(shot, muzzle)| {
            let at = Some(builder.create_vector(&shot.at));
            let velocity = Some(builder.create_vector(&shot.velocity));
            let muzzle = muzzle.map(|muzzle| builder.create_vector(&muzzle));
            let age = u16::try_from(shot.age).unwrap_or(u16::MAX);
            let (owner, ranged) = (shot.owner, shot.ranged as u8);
            let args = messages::FlyingArgs { owner, ranged, at, velocity, age, muzzle };
            messages::Flying::create(&mut builder, &args)
        })
        .collect();
    let shots = Some(builder.create_vector(&shots));
    // Left out when there are none, so a snapshot carries no more than it needs.
    let spells = (!snapshot.spells.is_empty()).then(|| spells_vector(&mut builder, snapshot.spells));
    let tick = snapshot.tick;
    let cache = (!snapshot.cache.is_empty()).then(|| builder.create_vector(snapshot.cache));
    let revives = snapshot.revives.map_or(-1, |left| i8::try_from(left).unwrap_or(i8::MAX));
    let args = messages::SnapshotArgs {
        tick,
        players,
        dressed,
        foes,
        events,
        shots,
        spells,
        cache,
        revives,
        ..messages::SnapshotArgs::default()
    };
    finish_snapshot(builder, &args)
}

/// Every spell, as the snapshot carries them.
fn spells_vector<'built>(
    builder: &mut flatbuffers::FlatBufferBuilder<'built>,
    spells: &[SpellSeen],
) -> flatbuffers::WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::Spell<'built>>>> {
    let each: Vec<_> = spells
        .iter()
        .map(|spell| {
            let at = Some(builder.create_vector(&spell.at));
            let heads = spell.heads.map(|heads| builder.create_vector(&heads));
            let args = messages::SpellArgs {
                id: spell.id,
                kind: spell.kind,
                caster: spell.caster,
                art: spell.art,
                at,
                heads,
                seeks: spell.seeks.unwrap_or(0),
                age: spell.age,
                life: spell.life,
                radius: spell.radius,
            };
            messages::Spell::create(builder, &args)
        })
        .collect();
    builder.create_vector(&each)
}

/// Everything at sea after the sea room's tick `tick`: every ship, every captain's with her faction and rank, each
/// player's fight as the naval crate's numbers (`naval::wire::view_numbers`, its other captains parted off into a field
/// of their own) with its captain's commission, and each player off the helm with the number of their last step taken
/// and their body on deck.
#[must_use]
pub fn sea_snapshot_bytes(
    tick: u64,
    ships: &[(PlayerId, Ship)],
    pirates: &[Pirate],
    fights: &[(PlayerId, Vec<f64>, Commission)],
    aboard: &[(PlayerId, u32, Body)],
) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let each: Vec<_> = aboard
        .iter()
        .map(|&(player, acknowledged, body)| {
            let fighter = Some(builder.create_vector(&body.to_floats()));
            let anim = Some(builder.create_string(""));
            let args =
                messages::SeenArgs { player, acknowledged, anim, facing: body.facing, fighter, ..Default::default() };
            messages::Seen::create(&mut builder, &args)
        })
        .collect();
    let players = Some(builder.create_vector(&each));
    let each: Vec<_> = ships
        .iter()
        .map(|&(player, Ship { x, y, heading, rate, .. })| {
            messages::Ship::create(&mut builder, &messages::ShipArgs { player, x, y, heading, pace: rate })
        })
        .collect();
    let ships = Some(builder.create_vector(&each));
    let each: Vec<_> = pirates
        .iter()
        .map(|pirate| {
            let Pirate { id, x, y, heading, .. } = *pirate;
            let Commission { faction, rank } = pirate.commission();
            let args = messages::PirateArgs { id, x, y, heading, faction, rank: rank.number() };
            messages::Pirate::create(&mut builder, &args)
        })
        .collect();
    let pirates = Some(builder.create_vector(&each));
    let each: Vec<_> = fights
        .iter()
        .map(|(player, numbers, commission)| {
            let (view, others) = naval::wire::parted(numbers);
            let (view, faction, rank) =
                (Some(builder.create_vector(&view)), commission.faction, commission.rank.number());
            let others = (!others.is_empty()).then(|| builder.create_vector(&others));
            messages::SeaFight::create(
                &mut builder,
                &messages::SeaFightArgs { player: *player, view, faction, rank, others },
            )
        })
        .collect();
    let fights = Some(builder.create_vector(&each));
    let args = messages::SnapshotArgs { tick, players, ships, pirates, fights, ..messages::SnapshotArgs::default() };
    finish_snapshot(builder, &args)
}

fn finish_snapshot<'builder>(
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

/// A body from a snapshot's 22 numbers, or nothing when they are not 22.
#[must_use]
pub fn body_of(numbers: &[f64]) -> Option<Body> {
    numbers.try_into().ok().map(Body::from_floats)
}

#[cfg(test)]
#[path = "protocol_tests.rs"]
mod protocol_tests;
