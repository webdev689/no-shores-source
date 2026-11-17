//! A fight over the open landmass: the player's Sloop and one pirate captain's (the naval crate's `Fight`). It stays
//! here between calls, as the open landmass does; a request begins one, steps it, or ends it. Requests and answers
//! are JSON: the fight's own numbers never cross, so a request carries only the player's orders.

use super::OPEN;
use super::sail::{helm_from, ship_from, ticks_from};
use land::exact::fingerprint;
use land::sea::Swell;
use naval::arms::{LARGE_BOAT, PIRATE_SLOOP, Side};
use naval::ballistics::{flight, launch_velocity};
use naval::captain::Mode;
use naval::captain::course::velocity_of;
use naval::damage::{State, Zone};
use naval::fight::{Aim, CAPTAIN, End, Event, Fight, Orders, PLAYER, Refusal, Sailor, Vessel};
use naval::gunnery::zone_radius;
use naval::guns::Shot;
use naval::shots::ShotEvent;
use sailing::TICK_SECONDS;
use sailing::waters::{LandWaters, Waters, steady_wind};
use serde_json::{Value, json};
use std::cell::RefCell;

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
    })
}

/// The lay the player's look holds: each gun's unscattered launch and where it stops (or null, still aloft), the
/// landing zone's radius at their mean range on the water, and whether any would strike her; or no side.
fn lay_json(fight: &Fight, aim: Option<&Aim>, waters: &impl Waters, time: f64) -> Value {
    let Some(laid) = aim.and_then(|aim| fight.laid(PLAYER, aim)) else {
        return Value::Null;
    };
    let ends = fight.ends(PLAYER, &laid, waters, time);
    let splashes: Vec<f64> = ends
        .iter()
        .flatten()
        .filter(|stop| stop.water)
        .map(|stop| {
            let (east, south) = (stop.point[0] - laid.centre[0], stop.point[1] - laid.centre[1]);
            (east * east + south * south).sqrt()
        })
        .collect();
    let range = splashes.iter().sum::<f64>() / splashes.len().max(1) as f64;
    let way = fight.vessel(PLAYER).map_or([0.0; 2], |player| velocity_of(&player.ship));
    let launch = launch_velocity(laid.dir, laid.elevation, laid.gun.speed, [way[0], way[1], 0.0]);
    let launches: Vec<[f64; 6]> =
        laid.mouths.iter().map(|mouth| [mouth[0], mouth[1], mouth[2], launch[0], launch[1], launch[2]]).collect();
    json!({
        "side": side_name(laid.side),
        "launches": launches,
        "elevation": laid.elevation,
        "reach": laid.reach,
        "ends": ends.iter().map(|end| end.map(|stop| json!({
            "time": stop.time, "point": stop.point, "water": stop.water, "strike": stop.strike,
        }))).collect::<Vec<_>>(),
        "radius": zone_radius(&laid.gun, LARGE_BOAT.skill, range),
        "on_target": ends.iter().flatten().any(|stop| stop.strike.is_some()),
    })
}

/// The editor's fight's two ships: her Sloop and the captain's, with the captain's mind.
fn the_two(fight: &Fight) -> Result<(&Vessel, &Vessel, &naval::captain::Captain), String> {
    let player = fight.vessel(PLAYER).ok_or("the fight has no player's ship")?;
    let captain = fight.vessel(CAPTAIN).ok_or("the fight has no captain")?;
    let Sailor::Captain(command) = &captain.sailor else { return Err("a captain sails the captain's ship".into()) };
    Ok((player, captain, &command.her))
}

/// The fight as the browser shows it, its lay over `waters` at `time`.
fn view(fight: &Fight, events: &[Event], aim: Option<&Aim>, waters: &impl Waters, time: f64) -> Value {
    let Ok((player, captain_ship, her)) = the_two(fight) else {
        return json!({ "error": "the fight has lost its ships" });
    };
    let balls: Vec<[f64; 4]> = fight
        .balls
        .iter()
        .filter(|ball| ball.fired)
        .map(|ball| {
            let at = flight(ball.start, ball.launch, fight.clock - ball.born);
            [at[0], at[1], at[2], ball.gun.radius_m]
        })
        .collect();
    let mut captain = vessel_json(captain_ship);
    captain["name"] = json!(PIRATE_SLOOP.name);
    captain["mode"] = json!(mode_name(her.mode));
    captain["hostile"] = json!(her.hostile_to(PLAYER));
    captain["run_out"] = json!(
        Side::BOTH.iter().filter(|side| her.run.out(**side).is_some()).map(|side| side.name()).collect::<Vec<_>>()
    );
    json!({
        "clock": fight.clock,
        "player": vessel_json(player),
        "captain": captain,
        "balls": balls,
        "lay": lay_json(fight, aim, waters, time),
        "events": events.iter().filter_map(event_json).collect::<Vec<_>>(),
        "over": fight.over().map(|end| match end { End::Sunk => "sunk", End::Gone => "gone" }),
        "fingerprint": format!("{:016x}", fingerprint(fight.numbers())),
    })
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
    OPEN.with(|open| {
        let open = open.borrow();
        let landmass = open.as_ref().ok_or("no landmass is open")?;
        let swell = Swell::default();
        let waters = LandWaters { ground: &landmass.surface, swell: &swell };
        let fight = Fight::begin(ship, seed, &waters, time)?;
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
                if fight.over().is_some() {
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
