//! A fight over the open landmass: the player's Sloop and one pirate captain's, or the captains a begin request sets
//! upon her (the naval crate's `Fight`). It stays here between calls, as the open landmass does; a request begins
//! one, steps it, or ends it. Requests and answers
//! are JSON: the fight's own numbers never cross, so a request carries only the player's orders.

use super::OPEN;
use super::sail::{MOST_WAY, helm_from, ship_from, ticks_from};
use land::exact::fingerprint;
use land::sea::Swell;
use naval::arms::Side;
use naval::ballistics::flight;
use naval::captain::Mode;
use naval::damage::{SINK_SECONDS, State, Zone, founder};
use naval::fight::{Aim, CAPTAIN, Command, End, Event, Fight, Orders, PLAYER, Refusal, Sailor, Vessel};
use naval::guns::Shot;
use naval::ranks::{Commission, Rank};
use naval::shots::ShotEvent;
use sailing::TICK_SECONDS;
use sailing::ship::{SAILS_SET, Ship};
use sailing::waters::{LandWaters, Waters, steady_wind};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::f64::consts::TAU;

thread_local! {
    static FIGHT: RefCell<Option<Fight>> = const { RefCell::new(None) };
}

/// The farthest a look may lay, metres: past every gun's reach.
const MOST_RANGE_M: f64 = 1e5;

/// Ends the fight, if one is on: the captain is gone and her balls with her.
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
        State::Wrecked => "wrecked",
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
    })
}

fn event_json(event: &Event) -> Option<Value> {
    // The editor's fight has one player, so what happens to her ship goes without its number.
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
        Event::NoSail { wrecked, .. } => json!({ "kind": "no-sail", "wrecked": wrecked }),
        Event::Load { shot, .. } => json!({ "kind": "load", "shot": shot.name() }),
        Event::Gone { .. } => return None,
        Event::Ram { ship, by, point, dealt } => {
            json!({ "kind": "ram", "ship": ship, "by": by, "point": point, "dealt": dealt })
        }
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
        "on_target": shown.on_target,
    })
}

/// The editor's fight's two ships: her Sloop and the captain's, with the captain's command.
fn the_two(fight: &Fight) -> Result<(&Vessel, &Vessel, &Command), String> {
    let player = fight.vessel(PLAYER).ok_or("the fight has no player's ship")?;
    let captain = fight.vessel(CAPTAIN).ok_or("the fight has no captain")?;
    let Sailor::Captain(command) = &captain.sailor else { return Err("a captain sails the captain's ship".into()) };
    Ok((player, captain, command))
}

/// A captain's Sloop as the browser shows her: her hurts, her commission, her mind, her sides run out, and what her
/// hurts and her going down do to her pose (settled metres, trim, list), for a drawing on a swell of its own.
fn captain_json(vessel: &Vessel, command: &Command) -> Value {
    let her = &command.her;
    let mut captain = vessel_json(vessel);
    let (settled, trim, list) = founder(&vessel.damage, her.seed, command.under);
    captain["founder"] = json!([settled, trim, list]);
    // A drawing that lets go of the fight while she goes down carries her on under from these: how she will lie
    // once sunk, and in how many seconds.
    if vessel.damage.state == State::Sinking {
        let mut gone = vessel.damage.clone();
        gone.state = State::Sunk;
        let (settled, trim, list) = founder(&gone, her.seed, command.under);
        captain["sunk_founder"] = json!([settled, trim, list]);
        captain["sinks_in"] = json!((SINK_SECONDS - vessel.damage.sink_t).max(0.0));
    }
    captain["name"] = json!(her.build.name);
    captain["faction"] = json!(her.commission.faction);
    captain["rank"] = json!(her.commission.rank.number());
    captain["mode"] = json!(mode_name(her.mode));
    captain["hostile"] = json!(her.hostile_to(PLAYER));
    captain["run_out"] = json!(
        Side::BOTH.iter().filter(|side| her.run.out(**side).is_some()).map(|side| side.name()).collect::<Vec<_>>()
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
        "events": events.iter().filter_map(event_json).collect::<Vec<_>>(),
        "over": over_name(fight),
        "fingerprint": format!("{:016x}", fingerprint(fight.numbers())),
    })
}

/// A captain as the fight enlists her: her Sloop, her commission and her seed.
type Enlisted = (Ship, Commission, u32);

/// The captains a begin request sets at sea, each checked: where she is, her heading (radians) and her commission,
/// her temper drawn from the fight's seed and her place in the list. None given: the plain fight's one captain.
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
        // A captain given her way comes on under sail at it, as she was seen coming; else she lies at rest.
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
    let captains = captains_of(&request, seed)?;
    OPEN.with(|open| {
        let open = open.borrow();
        let landmass = open.as_ref().ok_or("no landmass is open")?;
        let swell = Swell::default();
        let waters = LandWaters { ground: &landmass.surface, swell: &swell };
        let fight = match &captains {
            Some(captains) => Fight::ambush(ship, captains, seed, &waters, time)?,
            None => Fight::begin(ship, seed, &waters, time)?,
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

/// The orders a step request holds, each checked.
fn orders_of(request: &Value) -> Result<(Orders, f64, u32), String> {
    let helm = &request["helm"];
    let crab = if helm["crab"].as_bool().ok_or("the helm crabs or not")? { 1.0 } else { 0.0 };
    let helm = helm_from(number(&helm["steer"], "the rudder")?, crab, number(&helm["climb"], "the climb")?)?;
    let aim = match &request["aim"] {
        Value::Null => None,
        aim => {
            let bearing_deg = number(&aim["bearing"], "the look's bearing")?;
            let range_m = number(&aim["range"], "the look's range")?;
            if !(-180.0..=180.0).contains(&bearing_deg) || !(0.0..=MOST_RANGE_M).contains(&range_m) {
                return Err("a look bears within 180 degrees of her bow and lays within 100 km".into());
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
    let (time, ticks) = ticks_from(number(&request["time"], "the time")?, number(&request["ticks"], "the ticks")?)?;
    Ok((Orders { helm, aim, fire, brace, load }, time, ticks))
}

fn step(request: &[u8]) -> Result<Value, String> {
    let request: Value =
        serde_json::from_slice(request).map_err(|error| format!("a fight request is JSON: {error}"))?;
    let (orders, time, ticks) = orders_of(&request)?;
    OPEN.with(|open| {
        let open = open.borrow();
        let landmass = open.as_ref().ok_or("no landmass is open")?;
        let swell = Swell::default();
        let waters = LandWaters { ground: &landmass.surface, swell: &swell };
        let wind = steady_wind(&swell);
        FIGHT.with(|slot| {
            let mut slot = slot.borrow_mut();
            let fight = slot.as_mut().ok_or("no fight is on")?;
            let mut events = Vec::new();
            for tick in 0..ticks {
                // A fight over is stepped no more.
                if over_name(fight).is_some() {
                    break;
                }
                // A climb, a load and a release are presses: they act on the first tick alone.
                let now = if tick == 0 {
                    orders
                } else {
                    Orders { helm: sailing::ship::Helm { climb: 0, ..orders.helm }, fire: false, load: None, ..orders }
                };
                events.extend(fight.step(&[(PLAYER, now)], &waters, wind, time + f64::from(tick) * TICK_SECONDS));
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
