//! A fleet room's messages: a player's orders read and written, and the snapshot of every ship, the balls aloft and
//! what happened in the fight, as `messages.fbs` defines them.

use super::messages;
use naval::arms::Side;
use naval::captain::Mode;
use naval::damage::{State, Zone};
use naval::fight::{Aim, End, Event, Fight, Orders, Refusal};
use naval::guns::Shot;
use naval::ranks::{Commission, PIRATES, Rank};
use naval::shots::{ShipId, ShotEvent};
use room::fleet::{Call, Input, Levels};
use sailing::ship::Helm;

/// A load as the messages number it: 0 none, then the cycle's order from 1.
#[must_use]
pub fn load_code(shot: Option<Shot>) -> u8 {
    shot.and_then(|shot| Shot::CYCLE.iter().position(|each| *each == shot)).map_or(0, |at| at as u8 + 1)
}

fn load_of(code: u8) -> Result<Option<Shot>, String> {
    match code {
        0 => Ok(None),
        code => Shot::CYCLE.get(usize::from(code) - 1).copied().map(Some).ok_or(format!("no load is numbered {code}")),
    }
}

/// The calls as the messages number them.
pub const CALL_CAPTAIN: u8 = 1;
pub const CALL_SEND_OFF: u8 = 255;

/// The faction and rank a call names: 0 for either is a Major of the pirates' part of it; any other number must name
/// a faction whose captains sail, or a rank.
fn commission_of(faction: u8, rank: u8) -> Result<Commission, String> {
    let rank =
        if rank == 0 { Rank::Major } else { Rank::numbered(rank).ok_or(format!("no rank is numbered {rank}"))? };
    let faction = if faction == 0 { PIRATES } else { faction };
    Commission::of(faction, rank).ok_or(format!("no captain sails for faction {faction}"))
}

/// A level a call names: 0 for none, else 1 to the highest a ship or a captain reaches.
fn level_of(level: u8) -> Result<u8, String> {
    if level <= gear::power::LEVEL_MOST { Ok(level) } else { Err(format!("no level is {level}")) }
}

/// The orders an orders' bytes hold, or why they do not read: a look of 0, 2 or 8 numbers, a load the cycle
/// numbers, three numbers or none to put to sea, a call the messages number, of a faction and rank they number. The
/// bytes come from a player's machine, so the verifier passes them first; the room checks the numbers.
pub fn read_orders(bytes: &[u8]) -> Result<Input, String> {
    let orders = crate::from_a_browser::<messages::Orders>(bytes)?;
    let helm = Helm { steer: orders.steer(), crab: orders.crab(), climb: orders.climb() };
    let look: Vec<f64> = orders.aim().map(|aim| aim.iter().collect()).unwrap_or_default();
    let aim = match look[..] {
        [] => None,
        [bearing_deg, range_m] => Some(Aim { bearing_deg, range_m, ray: None }),
        [bearing_deg, range_m, eye_x, eye_y, eye_z, east, south, up] => {
            Some(Aim { bearing_deg, range_m, ray: Some([[eye_x, eye_y, eye_z], [east, south, up]]) })
        }
        _ => return Err(format!("a look is 2 or 8 numbers, not {}", look.len())),
    };
    let put: Vec<f64> = orders.put_to_sea().map(|put| put.iter().collect()).unwrap_or_default();
    let put_to_sea = match put[..] {
        [] => None,
        [x, y, heading] => Some([x, y, heading]),
        _ => return Err(format!("putting to sea is 3 numbers, not {}", put.len())),
    };
    let call = match orders.call() {
        0 => Call::None,
        CALL_CAPTAIN => {
            let levels = Levels { captain: level_of(orders.call_level())?, ship: level_of(orders.ship_level())? };
            Call::Captain(commission_of(orders.call_faction(), orders.call_rank())?, levels)
        }
        CALL_SEND_OFF => Call::SendOff,
        other => return Err(format!("no call is numbered {other}")),
    };
    let load = load_of(orders.load())?;
    let fire_orders = Orders { helm, aim, fire: orders.fire(), brace: orders.brace(), load };
    Ok(Input { sequence: orders.sequence(), orders: fire_orders, put_to_sea, call })
}

/// Orders as their bytes: what a browser sends a fleet room, written from Rust for tests.
#[must_use]
pub fn orders_bytes(input: &Input) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let look: Vec<f64> = input.orders.aim.map_or_else(Vec::new, |aim| {
        let ray = aim.ray.map_or_else(Vec::new, |ray| ray.iter().flatten().copied().collect());
        [aim.bearing_deg, aim.range_m].into_iter().chain(ray).collect()
    });
    let aim = Some(builder.create_vector(&look));
    let put = input.put_to_sea.map_or_else(Vec::new, |put| put.to_vec());
    let put_to_sea = Some(builder.create_vector(&put));
    let (call, call_faction, call_rank, levels) = match input.call {
        Call::None => (0, 0, 0, Levels::default()),
        Call::Captain(commission, levels) => (CALL_CAPTAIN, commission.faction, commission.rank.number(), levels),
        Call::SendOff => (CALL_SEND_OFF, 0, 0, Levels::default()),
    };
    let helm = input.orders.helm;
    let args = messages::OrdersArgs {
        sequence: input.sequence,
        steer: helm.steer,
        crab: helm.crab,
        climb: helm.climb,
        aim,
        fire: input.orders.fire,
        brace: input.orders.brace,
        load: load_code(input.orders.load),
        put_to_sea,
        call,
        call_faction,
        call_rank,
        call_level: levels.captain,
        ship_level: levels.ship,
    };
    let orders = messages::Orders::create(&mut builder, &args);
    builder.finish(orders, None);
    builder.finished_data().to_vec()
}

/// A state as the messages number it.
#[must_use]
pub fn state_code(state: State) -> u8 {
    match state {
        State::Afloat => 0,
        State::Struck => 1,
        State::Sinking => 2,
        State::Sunk => 3,
        State::Wrecked => 4,
    }
}

fn mode_code(mode: Mode) -> u8 {
    match mode {
        Mode::Cruise => 0,
        Mode::Engage => 1,
        Mode::Flee => 2,
        Mode::Struck => 3,
        Mode::Sinking => 4,
    }
}

fn side_code(side: Side) -> u8 {
    side.index() as u8
}

fn zone_code(zone: Zone) -> u8 {
    match zone {
        Zone::Hull => 0,
        Zone::Holed => 1,
        Zone::Rig => 2,
    }
}

/// The kinds of a fleet's events, as the messages number them.
pub const MUZZLE: u8 = 1;
pub const HIT: u8 = 2;
pub const SPLASH: u8 = 3;
pub const LAND: u8 = 4;
pub const RUN_OUT: u8 = 5;
pub const STATE: u8 = 6;
pub const REFUSED: u8 = 7;
pub const NO_SAIL: u8 = 8;
pub const LOAD: u8 = 9;
pub const GONE: u8 = 10;
pub const RAM: u8 = 11;
/// The sea's own events, for the fight's feel: where on it a ball struck (its frame's point, the part as detail), a
/// sail torn away and a mast fallen (its number as detail), its colours struck, its going down, what floats laid (its
/// number as the ship, its kind as detail, where as the point) and gathered (by whom), and players gone aboard it.
pub const STRUCK_AT: u8 = 12;
pub const SAIL_LOST: u8 = 13;
pub const MAST_FELL: u8 = 14;
pub const STRUCK: u8 = 15;
pub const SINKING: u8 = 16;
pub const FLOTSAM: u8 = 17;
pub const GATHERED: u8 = 18;
pub const BOARDING: u8 = 19;

/// An event's numbers as the messages carry them: kind, ship, who fired, detail, side, point, launch, seconds left.
type NavalParts = (u8, ShipId, ShipId, u8, u8, [f64; 3], [f64; 3], f64);

fn naval_parts(event: &Event) -> Option<NavalParts> {
    let none = [0.0; 3];
    Some(match *event {
        Event::Shot(ShotEvent::Muzzle { shooter, point, launch }) => (MUZZLE, shooter, 0, 0, 0, point, launch, 0.0),
        Event::Shot(ShotEvent::Hit { shooter, target, zone, point, .. }) => {
            (HIT, target, shooter, zone_code(zone), 0, point, none, 0.0)
        }
        Event::Shot(ShotEvent::Splash { shooter, point }) => (SPLASH, shooter, 0, 0, 0, point, none, 0.0),
        Event::Shot(ShotEvent::Land { shooter, point }) => (LAND, shooter, 0, 0, 0, point, none, 0.0),
        Event::Shot(ShotEvent::Gone { .. }) => return None,
        Event::RunOut { ship, side } => (RUN_OUT, ship, 0, side_code(side), 0, none, none, 0.0),
        Event::State { ship, state } => (STATE, ship, 0, state_code(state), 0, none, none, 0.0),
        Event::Refused { ship, refusal } => {
            let (why, side, left) = match refusal {
                Refusal::NoGuns => (0, 0, 0.0),
                Refusal::Silent => (1, 0, 0.0),
                Refusal::Braced => (2, 0, 0.0),
                Refusal::Reloading { side, left } => (3, side_code(side), left),
            };
            (REFUSED, ship, 0, why, side, none, none, left)
        }
        Event::NoSail { ship, wrecked } => (NO_SAIL, ship, 0, u8::from(wrecked), 0, none, none, 0.0),
        Event::Load { ship, shot } => (LOAD, ship, 0, load_code(Some(shot)), 0, none, none, 0.0),
        Event::Gone { ship, end } => (GONE, ship, 0, u8::from(end == End::Gone), 0, none, none, 0.0),
        Event::Ram { ship, by, point, dealt } => (RAM, ship, by, 0, 0, point, none, dealt),
        Event::Hit { ship, at, part } => (STRUCK_AT, ship, 0, part.number(), 0, at, none, 0.0),
        Event::SailLost { ship, sail } => {
            (SAIL_LOST, ship, 0, u8::try_from(sail).unwrap_or(u8::MAX), 0, none, none, 0.0)
        }
        Event::MastFell { ship, mast } => {
            (MAST_FELL, ship, 0, u8::try_from(mast).unwrap_or(u8::MAX), 0, none, none, 0.0)
        }
        Event::Struck { ship } => (STRUCK, ship, 0, 0, 0, none, none, 0.0),
        Event::Sinking { ship } => (SINKING, ship, 0, 0, 0, none, none, 0.0),
        Event::Flotsam { id, at, kind } => (FLOTSAM, id, 0, kind.number(), 0, [at[0], at[1], 0.0], none, 0.0),
        Event::Gathered { id, by } => (GATHERED, id, by, 0, 0, none, none, 0.0),
        Event::Boarding { ship } => (BOARDING, ship, 0, 0, 0, none, none, 0.0),
        // A ball's splash is told with its shot's.
        Event::Splash { .. } => return None,
    })
}

/// Every ship in a fleet room after its tick `tick`, each player's ship with the number of their last orders taken
/// (`acknowledged`), the balls aloft, what happened in the fight since the last snapshot, the fight's clock, and the
/// world time the room's clock started at (`world_start`), which sets its weather.
#[must_use]
pub fn fleet_snapshot_bytes(
    (tick, world_start): (u64, f64),
    fight: &Fight,
    acknowledged: &impl Fn(ShipId) -> Option<u32>,
    happened: &[(u64, Event)],
) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let vessels: Vec<_> = fight
        .ships
        .iter()
        .map(|(&id, vessel)| {
            let (damage, guns) = (&vessel.damage, &vessel.guns);
            let ship = Some(builder.create_vector(&vessel.ship.to_floats()));
            let pose = Some(builder.create_vector(&vessel.pose.to_floats()));
            let hurts = [damage.hull, damage.max_hull, damage.sail, damage.max_sail, damage.crew, damage.max_crew];
            let hurts = Some(builder.create_vector(&hurts));
            let loading = [
                guns.left(Side::Port),
                guns.left(Side::Starboard),
                guns.progress(Side::Port),
                guns.progress(Side::Starboard),
            ];
            let guns_numbers = Some(builder.create_vector(&loading));
            let command = vessel.command();
            let run_out = command.map_or(0, |command| {
                Side::BOTH
                    .iter()
                    .filter(|side| command.mind.run.out(**side).is_some())
                    .fold(0, |sides, side| sides | (1 << side.index()))
            });
            let args = messages::VesselArgs {
                id,
                captain: command.is_some(),
                ship,
                pose,
                hurts,
                state: state_code(damage.state),
                fires: u8::try_from(damage.fires()).unwrap_or(u8::MAX),
                guns: guns_numbers,
                load: load_code(Some(guns.load)),
                braced: guns.braced,
                mode: command.map_or(0, |command| mode_code(command.mind.mode)),
                target: command.and_then(|command| command.mind.target()).unwrap_or(0),
                run_out,
                acknowledged: acknowledged(id).unwrap_or(0),
                faction: vessel.flag().number(),
                rank: command.map_or(0, |command| command.mind.commission.rank.number()),
                hull: vessel.hull.number(),
            };
            messages::Vessel::create(&mut builder, &args)
        })
        .collect();
    let vessels = Some(builder.create_vector(&vessels));
    let balls: Vec<_> = fight
        .balls
        .iter()
        .filter(|ball| ball.fired)
        .map(|ball| {
            let (start, launch) = (Some(builder.create_vector(&ball.start)), Some(builder.create_vector(&ball.launch)));
            let args =
                messages::BallArgs { shooter: ball.shooter, start, launch, born: ball.born, radius: ball.gun.radius_m };
            messages::Ball::create(&mut builder, &args)
        })
        .collect();
    let balls = Some(builder.create_vector(&balls));
    let naval: Vec<_> = happened
        .iter()
        .filter_map(|(tick, event)| naval_parts(event).map(|parts| (*tick, parts)))
        .map(|(tick, (kind, ship, by, detail, side, point, launch, left))| {
            let (point, launch) = (Some(builder.create_vector(&point)), Some(builder.create_vector(&launch)));
            let args = messages::NavalArgs { tick, kind, ship, by, detail, side, point, launch, left };
            messages::Naval::create(&mut builder, &args)
        })
        .collect();
    let naval = Some(builder.create_vector(&naval));
    let args = messages::SnapshotArgs {
        tick,
        vessels,
        balls,
        naval,
        fight_clock: fight.clock,
        world_start,
        ..messages::SnapshotArgs::default()
    };
    super::finish_snapshot(builder, &args)
}

#[cfg(test)]
#[path = "fleet_tests.rs"]
mod fleet_tests;
