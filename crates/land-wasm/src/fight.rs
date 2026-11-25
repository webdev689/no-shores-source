//! A fight over the open landmass: the player's ship (the Sloop unless the begin request names its hull) and one
//! hostile captain in its rank's hull, or the captains the request sets upon it (the naval crate's `Fight`). It stays here between calls, as the open landmass does; a
//! request begins one, steps it, or ends it. Requests and answers are JSON: the fight's own numbers never cross, so a
//! request carries only the player's orders.

use super::OPEN;
use super::sail::{MOST_WAY, helm_from, ship_from, ticks_from};
use land::exact::fingerprint;
use land::sea::Swell;
use naval::arms::Side;
use naval::ballistics::flight;
use naval::captain::Mode;
use naval::damage::{SINK_SECONDS, State, Zone, founder};
use naval::fight::{Aim, CAPTAIN, Command, End, Event, Fight, Orders, PLAYER, Part, Piece, Refusal, Sailor, Vessel};
use naval::guns::Shot;
use naval::ranks::{Commission, Rank};
use naval::shots::ShotEvent;
use sailing::ship::{SAILS_SET, Ship};
use sailing::waters::{LandWaters, Waters, sail_wind, sea_wind_at};
use sailing::{HullKind, TICK_SECONDS};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::f64::consts::TAU;

thread_local! {
    static FIGHT: RefCell<Option<Fight>> = const { RefCell::new(None) };
}

/// The farthest a look may lay, metres: past every gun's reach.
const MOST_RANGE_M: f64 = 1e5;

/// Ends the fight, if one is on: the captain is gone and its balls with it.
pub fn end_fight() {
    FIGHT.with(|fight| *fight.borrow_mut() = None);
}

fn number(value: &Value, name: &str) -> Result<f64, String> {
    value.as_f64().filter(|number| number.is_finite()).ok_or_else(|| format!("{name} is a finite number"))
}

fn side_name(side: Side) -> &'static str {
    side.name()
}

fn state_name(state: State) -> &'static str {
    match state {
        State::Afloat => "afloat",
        State::Struck => "struck",
        State::Sinking => "sinking",
        State::Sunk => "sunk",
    }
}

fn zone_name(zone: Zone) -> &'static str {
    match zone {
        Zone::Hull => "hull",
        Zone::Holed => "holed",
        Zone::Rig => "rig",
    }
}

fn mode_name(mode: Mode) -> &'static str {
    match mode {
        Mode::Cruise => "cruise",
        Mode::Engage => "engage",
        Mode::Flee => "flee",
        Mode::Struck => "struck",
        Mode::Sinking => "sinking",
    }
}

fn vessel_json(vessel: &Vessel) -> Value {
    let (damage, guns) = (&vessel.damage, &vessel.guns);
    json!({
        "hull_kind": vessel.hull.number(),
        "ship": vessel.ship.to_floats(),
        "pose": vessel.pose.to_floats(),
        "hull": damage.hull, "max_hull": damage.max_hull,
        "sail": damage.sail, "max_sail": damage.max_sail,
        "crew": damage.crew, "max_crew": damage.max_crew,
        "state": state_name(damage.state),
        "fires": damage.fires(),
        "guns": {
            "left": [guns.left(Side::Port), guns.left(Side::Starboard)],
            "progress": [guns.progress(Side::Port), guns.progress(Side::Starboard)],
            "load": guns.load.name(),
            "braced": guns.braced,
        },
        "boost": vessel.boost.shares(),
    })
}

/// A piece of what floats by its look's name.
fn piece_name(piece: Piece) -> &'static str {
    match piece {
        Piece::Crate => "crate",
        Piece::Barrel => "barrel",
        Piece::Chest => "chest",
    }
}

/// A tick's events as the page reads them: a ball's hit carries where on the ship it struck, in the ship's own frame,
/// and the part it struck, from the hit the fight tells just before it.
fn events_json(events: &[Event]) -> Vec<Value> {
    let mut told = Vec::new();
    let mut struck = None;
    for event in events {
        if let Event::Hit { ship, at, part } = *event {
            struck = Some((ship, at, part));
        }
        let Some(mut shown) = event_json(event) else { continue };
        // The struck ship's torn rig and state may be told between the two: the hit waits for its ball's.
        if let Event::Shot(ShotEvent::Hit { target, .. }) = event
            && let Some((_, at, part)) = struck.take_if(|(ship, ..)| ship == target)
        {
            let part = match part {
                Part::Hull => "hull",
                Part::Sail => "sail",
                Part::Rig => "rig",
            };
            shown["at"] = json!(at);
            shown["part"] = json!(part);
        }
        told.push(shown);
    }
    told
}

fn event_json(event: &Event) -> Option<Value> {
    // The editor's fight has one player, so what happens to their ship goes without its number.
    Some(match *event {
        Event::Shot(ShotEvent::Muzzle { shooter, point, launch }) => {
            json!({ "kind": "muzzle", "ship": shooter, "point": point, "launch": launch })
        }
        Event::Shot(ShotEvent::Hit { shooter, target, zone, point, .. }) => {
            json!({ "kind": "hit", "ship": target, "by": shooter, "zone": zone_name(zone), "point": point })
        }
        Event::Shot(ShotEvent::Splash { point, .. }) => json!({ "kind": "splash", "point": point }),
        Event::Shot(ShotEvent::Land { point, .. }) => json!({ "kind": "land", "point": point }),
        Event::Shot(ShotEvent::Gone { .. }) => return None,
        Event::RunOut { side, .. } => json!({ "kind": "run-out", "side": side_name(side) }),
        Event::State { ship, state } => json!({ "kind": "state", "ship": ship, "state": state_name(state) }),
        Event::Refused { refusal: Refusal::NoGuns, .. } => json!({ "kind": "refused", "why": "no-guns" }),
        Event::Refused { refusal: Refusal::Silent, .. } => json!({ "kind": "refused", "why": "silent" }),
        Event::Refused { refusal: Refusal::Braced, .. } => json!({ "kind": "refused", "why": "braced" }),
        Event::Refused { refusal: Refusal::Reloading { side, left }, .. } => {
            json!({ "kind": "refused", "why": "reloading", "side": side_name(side), "left": left })
        }
        Event::NoSail { .. } => json!({ "kind": "no-sail" }),
        Event::Load { shot, .. } => json!({ "kind": "load", "shot": shot.name() }),
        Event::Gone { .. } => return None,
        Event::Ram { ship, by, point, dealt } => {
            json!({ "kind": "ram", "ship": ship, "by": by, "point": point, "dealt": dealt })
        }
        Event::SailLost { ship, sail } => json!({ "kind": "SailLost", "ship": ship, "sail": sail }),
        Event::MastFell { ship, mast } => json!({ "kind": "MastFell", "ship": ship, "mast": mast }),
        Event::Struck { ship } => json!({ "kind": "Struck", "ship": ship }),
        Event::Sinking { ship } => json!({ "kind": "Sinking", "ship": ship }),
        Event::Boarding { ship } => json!({ "kind": "Boarding", "ship": ship }),
        Event::Flotsam { id, at, kind } => {
            json!({ "kind": "Flotsam", "id": id, "at": at, "kind_of": piece_name(kind) })
        }
        Event::Gathered { id, by } => json!({ "kind": "Gathered", "id": id, "by": by }),
        // A ball's own splash and hit are told with its shot's (`events_json`).
        Event::Splash { .. } | Event::Hit { .. } => return None,
    })
}

/// The lay the player's look holds (the naval crate's `Preview`), or no side.
fn lay_json(fight: &Fight, aim: Option<&Aim>, waters: &impl Waters, time: f64) -> Value {
    let Some(shown) = aim.and_then(|aim| fight.preview(PLAYER, aim, waters, time)) else {
        return Value::Null;
    };
    json!({
        "side": side_name(shown.lay.side),
        "launches": shown.launches,
        "elevation": shown.lay.elevation,
        "reach": shown.lay.reach,
        "ends": shown.ends.iter().map(|end| end.map(|stop| json!({
            "time": stop.time, "point": stop.point, "water": stop.water, "strike": stop.strike,
        }))).collect::<Vec<_>>(),
        "radius": shown.radius,
        "spread": shown.spread,
        "on_target": shown.on_target,
    })
}

/// The editor's fight's two ships: the player's and the captain's, with the captain's command.
fn the_two(fight: &Fight) -> Result<(&Vessel, &Vessel, &Command), String> {
    let player = fight.vessel(PLAYER).ok_or("the fight has no player's ship")?;
    let captain = fight.vessel(CAPTAIN).ok_or("the fight has no captain")?;
    let Sailor::Captain(command) = &captain.sailor else { return Err("a captain sails the captain's ship".into()) };
    Ok((player, captain, command))
}

/// A captain's ship as the browser shows it: its hurts, its commission, its mind, its sides run out, and what its
/// hurts and its going down do to its pose (settled metres, trim, list), for a drawing on a swell of its own.
fn captain_json(vessel: &Vessel, command: &Command) -> Value {
    let mind = &command.mind;
    let mut captain = vessel_json(vessel);
    let (settled, trim, list) = founder(&vessel.damage, mind.seed, command.under);
    captain["founder"] = json!([settled, trim, list]);
    // A drawing that lets go of the fight while it goes down carries it on under from these: how it will lie
    // once sunk, and in how many seconds.
    if vessel.damage.state == State::Sinking {
        let mut gone = vessel.damage.clone();
        gone.state = State::Sunk;
        let (settled, trim, list) = founder(&gone, mind.seed, command.under);
        captain["sunk_founder"] = json!([settled, trim, list]);
        captain["sinks_in"] = json!((SINK_SECONDS - vessel.damage.sink_t).max(0.0));
    }
    captain["name"] = json!(mind.build.name);
    captain["faction"] = json!(mind.commission.faction);
    captain["rank"] = json!(mind.commission.rank.number());
    captain["mode"] = json!(mode_name(mind.mode));
    captain["hostile"] = json!(mind.hostile_to(PLAYER));
    captain["run_out"] = json!(
        Side::BOTH.iter().filter(|side| mind.run.out(**side).is_some()).map(|side| side.name()).collect::<Vec<_>>()
    );
    captain
}

/// How the fight is over, if it is: an ambush beaten, or its last captain sunk or gone.
fn over_name(fight: &Fight) -> Option<&'static str> {
    if fight.beaten() {
        return Some("beaten");
    }
    fight.over().map(|end| match end {
        End::Sunk => "sunk",
        End::Gone => "gone",
    })
}

/// The fight as the browser shows it, its lay over `waters` at `time`: every captain after the first goes in
/// `others`, by number, as the sea room's wire carries them.
fn view(fight: &Fight, events: &[Event], aim: Option<&Aim>, waters: &impl Waters, time: f64) -> Value {
    let Ok((player, captain_ship, command)) = the_two(fight) else {
        return json!({ "error": "the fight has lost its ships" });
    };
    let others: Vec<Value> = fight
        .ships
        .range(CAPTAIN + 1..)
        .filter_map(|(_, vessel)| vessel.command().map(|command| captain_json(vessel, command)))
        .collect();
    let balls: Vec<[f64; 4]> = fight
        .balls
        .iter()
        .filter(|ball| ball.fired)
        .map(|ball| {
            let at = flight(ball.start, ball.launch, fight.clock - ball.born);
            [at[0], at[1], at[2], ball.gun.radius_m]
        })
        .collect();
    json!({
        "clock": fight.clock,
        "player": vessel_json(player),
        "captain": captain_json(captain_ship, command),
        "others": others,
        "balls": balls,
        "lay": lay_json(fight, aim, waters, time),
        "events": events_json(events),
        "over": over_name(fight),
        "fingerprint": format!("{:016x}", fingerprint(fight.numbers())),
    })
}

/// A captain as the fight enlists it: its ship, its commission and its seed.
type Enlisted = (Ship, Commission, u32);

/// The captains a begin request sets at sea, each checked: where it is, its heading (radians) and its commission,
/// its temper drawn from the fight's seed and its place in the list. None given: the plain fight's one captain.
fn captains_of(request: &Value, seed: u32) -> Result<Option<Vec<Enlisted>>, String> {
    let Some(captains) = request.get("captains").filter(|captains| !captains.is_null()) else { return Ok(None) };
    let captains =
        captains.as_array().filter(|captains| !captains.is_empty()).ok_or("a fight's captains are a list")?;
    let captain = |(at, captain): (usize, &Value)| {
        let x = number(&captain["x"], "a captain's x")?;
        let y = number(&captain["y"], "a captain's y")?;
        let heading = number(&captain["heading"], "a captain's heading")?.rem_euclid(TAU);
        // A heading a hair under none wraps to a whole turn: the ship's own heading stays in [0, 2π).
        let heading = if heading < TAU { heading } else { 0.0 };
        let whole = |name: &str| captain[name].as_u64().and_then(|value| u8::try_from(value).ok());
        let rank = whole("rank").and_then(Rank::numbered).ok_or("a captain's rank is 1 to 5")?;
        let commission = whole("faction")
            .and_then(|faction| Commission::of(faction, rank))
            .ok_or("a captain's faction is one whose captains sail")?;
        // A captain given its way comes on under sail at it, as it was seen coming; else it lies at rest.
        let way = match &captain["way"] {
            Value::Null => 0.0,
            way => number(way, "a captain's way")?,
        };
        if !(0.0..=MOST_WAY).contains(&way) {
            return Err("a captain's way is none a ship could have".into());
        }
        let rung = if way > 0.0 { SAILS_SET } else { 0 };
        let ship = Ship { x, y, heading, ahead: way, abeam: 0.0, turn: 0.0, sail_way: way, rung };
        Ok((ship, commission, seed.wrapping_add(u32::try_from(at).unwrap_or(0)).wrapping_add(1)))
    };
    captains.iter().enumerate().map(captain).collect::<Result<_, String>>().map(Some)
}

fn begin(request: &[u8]) -> Result<Value, String> {
    let request: Value =
        serde_json::from_slice(request).map_err(|error| format!("a fight request is JSON: {error}"))?;
    // Every element a number: one that is not is refused, not dropped.
    let numbers: Vec<f64> = request["ship"]
        .as_array()
        .ok_or("a fight's ship is a list of numbers")?
        .iter()
        .map(|value| value.as_f64().ok_or("a fight's ship is a list of numbers"))
        .collect::<Result<_, _>>()?;
    let ship = ship_from(&numbers)?;
    let seed = request["seed"]
        .as_u64()
        .and_then(|seed| u32::try_from(seed).ok())
        .ok_or("a fight's seed is a whole number under 2^32")?;
    let (time, _) = ticks_from(number(&request["time"], "the time")?, 0.0)?;
    // The captain's rank, a Major's unless asked: it sails that rank's hull.
    let rank = match &request["rank"] {
        Value::Null => Rank::Major,
        asked => asked
            .as_u64()
            .and_then(|number| u8::try_from(number).ok())
            .and_then(Rank::numbered)
            .ok_or("a fight's rank is a whole number from 1 to 5")?,
    };
    let commission = Commission { rank, ..Commission::default() };
    // The player's hull, the Sloop unless asked (0 the Sloop to 3 the Frigate).
    let hull = match &request["hull"] {
        Value::Null => HullKind::Sloop,
        asked => asked
            .as_u64()
            .and_then(|number| u8::try_from(number).ok())
            .and_then(HullKind::numbered)
            .ok_or("a fight's hull is a whole number from 0 to 3")?,
    };
    let captains = captains_of(&request, seed)?;
    OPEN.with(|open| {
        let open = open.borrow();
        let landmass = open.as_ref().ok_or("no landmass is open")?;
        let swell = Swell::default();
        let waters = LandWaters { ground: &landmass.surface, swell: &swell };
        let fight = match &captains {
            Some(captains) => Fight::ambush_in((ship, hull), captains, seed, &waters, time)?,
            None => Fight::begin_in((ship, hull), commission, seed, &waters, time)?,
        };
        let answer = view(&fight, &[], None, &waters, time);
        FIGHT.with(|slot| *slot.borrow_mut() = Some(fight));
        Ok(answer)
    })
}

/// A look's ray: six finite numbers, the aim eye (east, south, up) and then the way it looks.
fn ray_of(ray: &Value) -> Result<[[f64; 3]; 2], String> {
    const REFUSED: &str = "a look's ray is six finite numbers: its eye, then its way";
    let numbers = ray.as_array().filter(|numbers| numbers.len() == 6).ok_or(REFUSED)?;
    let number = |at: usize| numbers[at].as_f64().filter(|number| number.is_finite()).ok_or(REFUSED);
    Ok([[number(0)?, number(1)?, number(2)?], [number(3)?, number(4)?, number(5)?]])
}

/// The most a told wind may blow, m/s: a hurricane's.
const MOST_WIND_M_S: f64 = 60.0;

/// The weather's wind a step is told to sail in (m/s, east and south), or none to sail in the world's own.
fn told_wind(wind: &Value) -> Result<Option<[f64; 2]>, String> {
    const REFUSED: &str = "a told wind is two finite numbers, metres a second east and south, within 60";
    if wind.is_null() {
        return Ok(None);
    }
    let parts = wind.as_array().filter(|parts| parts.len() == 2).ok_or(REFUSED)?;
    let part = |at: usize| parts[at].as_f64().filter(|part| part.is_finite()).ok_or(REFUSED);
    let told = [part(0)?, part(1)?];
    if told[0] * told[0] + told[1] * told[1] > MOST_WIND_M_S * MOST_WIND_M_S {
        return Err(REFUSED.into());
    }
    Ok(Some(told))
}

/// What a step request holds, each part checked: the orders, the time and ticks, the world's time, and any told wind.
struct Step {
    orders: Orders,
    time: f64,
    ticks: u32,
    world: f64,
    wind: Option<[f64; 2]>,
}

/// The orders a step request holds, each checked.
fn orders_of(request: &Value) -> Result<Step, String> {
    let helm = &request["helm"];
    let helm = helm_from(number(&helm["steer"], "the rudder")?, number(&helm["climb"], "the climb")?)?;
    let aim = match &request["aim"] {
        Value::Null => None,
        aim => {
            let bearing_deg = number(&aim["bearing"], "the look's bearing")?;
            let range_m = number(&aim["range"], "the look's range")?;
            if !(-180.0..=180.0).contains(&bearing_deg) || !(0.0..=MOST_RANGE_M).contains(&range_m) {
                return Err("a look bears within 180 degrees of its bow and lays within 100 km".into());
            }
            let ray = match &aim["ray"] {
                Value::Null => None,
                ray => Some(ray_of(ray)?),
            };
            Some(Aim { bearing_deg, range_m, ray })
        }
    };
    let load = match &request["load"] {
        Value::Null => None,
        load => Some(load.as_str().and_then(Shot::named).ok_or("a load is round, grape, chain or heated")?),
    };
    let fire = request["fire"].as_bool().ok_or("the fire is given or not")?;
    let brace = request["brace"].as_bool().ok_or("the brace is held or not")?;
    let boost = request["boost"].as_bool().ok_or("the boost is tapped or not")?;
    let (time, ticks) = ticks_from(number(&request["time"], "the time")?, number(&request["ticks"], "the ticks")?)?;
    let (world, _) = ticks_from(number(&request["world"], "the world's time")?, 0.0)?;
    let wind = told_wind(&request["wind"])?;
    Ok(Step { orders: Orders { helm, aim, fire, brace, load, boost }, time, ticks, world, wind })
}

fn step(request: &[u8]) -> Result<Value, String> {
    let request: Value =
        serde_json::from_slice(request).map_err(|error| format!("a fight request is JSON: {error}"))?;
    let Step { orders, time, ticks, world, wind } = orders_of(&request)?;
    OPEN.with(|open| {
        let open = open.borrow();
        let landmass = open.as_ref().ok_or("no landmass is open")?;
        let swell = Swell::default();
        let waters = LandWaters { ground: &landmass.surface, swell: &swell };
        FIGHT.with(|slot| {
            let mut slot = slot.borrow_mut();
            let fight = slot.as_mut().ok_or("no fight is on")?;
            let mut events = Vec::new();
            for tick in 0..ticks {
                // A fight over is stepped no more.
                if over_name(fight).is_some() {
                    break;
                }
                // A climb, a load, a release and a burst are presses: they act on the first tick alone.
                let now = if tick == 0 {
                    orders
                } else {
                    let helm = sailing::ship::Helm { climb: 0, ..orders.helm };
                    Orders { helm, fire: false, load: None, boost: false, ..orders }
                };
                // A story tells the wind its own weather blows; else the ships sail in the world's.
                let wind_at =
                    |at| wind.map_or_else(|| sea_wind_at(at, world + f64::from(tick) * TICK_SECONDS), sail_wind);
                events.extend(fight.step(&[(PLAYER, now)], &waters, &wind_at, time + f64::from(tick) * TICK_SECONDS));
            }
            Ok(view(fight, &events, orders.aim.as_ref(), &waters, time + f64::from(ticks) * TICK_SECONDS))
        })
    })
}

/// Begins a fight round the request's ship, or says why not.
#[must_use]
pub fn fight_begin_json(request: &[u8]) -> String {
    begin(request).unwrap_or_else(|error| json!({ "error": error })).to_string()
}

/// Steps the fight by the request's orders and ticks, or says why not.
#[must_use]
pub fn fight_step_json(request: &[u8]) -> String {
    step(request).unwrap_or_else(|error| json!({ "error": error })).to_string()
}

#[cfg(test)]
#[path = "fight_tests.rs"]
mod tests;
