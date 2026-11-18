//! A fight's orders and what it shows, as numbers in a fixed order: the sea room's messages carry them, so a fight
//! crosses as a body does (crates/protocol), and the browser reads them back into its view of the fight
//! (client/src/network/seaFight.ts).

use crate::arms::Side;
use crate::ballistics::flight;
use crate::captain::{Captain, Mode};
use crate::damage::{State, Zone};
use crate::fight::{Aim, CAPTAIN, End, Event, Fight, Orders, PLAYER, Refusal, Sailor, Vessel};
use crate::guns::Shot;
use crate::shots::ShotEvent;
use crate::shots::Stop;
use sailing::ship::Helm;
use sailing::waters::Waters;

pub const ORDERS: usize = 16;
pub const VESSEL_NUMBERS: usize = 26;
pub const STOP_NUMBERS: usize = 10;
/// The farthest a look may lay, metres: past every gun's reach.
const MOST_RANGE_M: f64 = 1e5;

/// Each event's kind and how many numbers follow it: muzzle (ship, point, launch), hit (ship struck, by, zone,
/// point), splash and land (point), run-out (side), state (ship, state), refused (why, side, seconds left), no-sail
/// (wrecked), load (shot), ram (ship struck, by, point, hull dealt).
pub const EVENT_NUMBERS: [usize; 10] = [7, 6, 3, 3, 1, 2, 3, 1, 1, 6];

/// Orders from their numbers, or why they are not orders. They come from a player's machine.
pub fn orders_from(numbers: &[f64]) -> Result<Orders, String> {
    let numbers: [f64; ORDERS] =
        numbers.try_into().map_err(|_| format!("orders are {ORDERS} numbers, not {}", numbers.len()))?;
    if numbers.iter().any(|number| !number.is_finite()) {
        return Err("orders are finite numbers".into());
    }
    let [steer, crab, climb, laid, bearing_deg, range_m, rayed, eye @ .., fire, brace, load] = numbers;
    let [eye_x, eye_y, eye_z, east, south, up] = eye;
    let flag = |value: f64, name: &str| match value {
        0.0 => Ok(false),
        1.0 => Ok(true),
        _ => Err(format!("{name} is 0 or 1")),
    };
    if !(-1.0..=1.0).contains(&steer) || ![-1.0, 0.0, 1.0].contains(&climb) {
        return Err("the helm steers from -1 to 1 and climbs -1, 0 or 1".into());
    }
    let aim = if flag(laid, "a look")? {
        if !(-180.0..=180.0).contains(&bearing_deg) || !(0.0..=MOST_RANGE_M).contains(&range_m) {
            return Err("a look bears within 180 degrees of her bow and lays within 100 km".into());
        }
        let ray = flag(rayed, "a ray")?.then_some([[eye_x, eye_y, eye_z], [east, south, up]]);
        Some(Aim { bearing_deg, range_m, ray })
    } else {
        None
    };
    let load = match load {
        0.0 => None,
        _ => Some(
            Shot::CYCLE
                .into_iter()
                .zip(1u8..)
                .find(|&(_, number)| f64::from(number) == load)
                .map(|(shot, _)| shot)
                .ok_or("a load is 0 or one of the four shots")?,
        ),
    };
    let helm = Helm { steer, crab: flag(crab, "the crab")?, climb: climb as i8 };
    Ok(Orders { helm, aim, fire: flag(fire, "the fire")?, brace: flag(brace, "the brace")?, load })
}

fn shot_number(shot: Shot) -> f64 {
    Shot::CYCLE.iter().position(|each| *each == shot).map_or(0.0, |at| at as f64)
}

/// Orders as their numbers: what a browser sends, written from Rust for tests.
#[must_use]
pub fn orders_numbers(orders: &Orders) -> Vec<f64> {
    let flag = |on: bool| f64::from(u8::from(on));
    let mut numbers = vec![orders.helm.steer, flag(orders.helm.crab), f64::from(orders.helm.climb)];
    match orders.aim {
        None => numbers.extend([0.0; 10]),
        Some(aim) => {
            numbers.extend([1.0, aim.bearing_deg, aim.range_m, flag(aim.ray.is_some())]);
            numbers.extend(aim.ray.unwrap_or_default().as_flattened());
        }
    }
    let load = orders.load.map_or(0.0, |shot| shot_number(shot) + 1.0);
    numbers.extend([flag(orders.fire), flag(orders.brace), load]);
    numbers
}

fn side_number(side: Side) -> f64 {
    if side == Side::Port { 0.0 } else { 1.0 }
}

fn state_number(state: State) -> f64 {
    match state {
        State::Afloat => 0.0,
        State::Struck => 1.0,
        State::Sinking => 2.0,
        State::Sunk => 3.0,
        State::Wrecked => 4.0,
    }
}

fn vessel_numbers(vessel: &Vessel) -> Vec<f64> {
    let (damage, guns) = (&vessel.damage, &vessel.guns);
    let mut numbers = vessel.ship.to_floats().to_vec();
    numbers.extend(vessel.pose.to_floats());
    numbers.extend([damage.hull, damage.max_hull, damage.sail, damage.max_sail, damage.crew, damage.max_crew]);
    numbers.extend([state_number(damage.state), damage.fires() as f64]);
    numbers.extend([guns.left(Side::Port), guns.left(Side::Starboard)]);
    numbers.extend([guns.progress(Side::Port), guns.progress(Side::Starboard)]);
    numbers.extend([shot_number(guns.load), f64::from(u8::from(guns.braced))]);
    numbers
}

fn event_numbers(event: &Event) -> Option<Vec<f64>> {
    let point = |at: [f64; 3]| at.to_vec();
    Some(match *event {
        Event::Shot(ShotEvent::Muzzle { shooter, point: at, launch }) => {
            [vec![1.0, f64::from(shooter)], point(at), point(launch)].concat()
        }
        Event::Shot(ShotEvent::Hit { shooter, target, zone, point: at, .. }) => {
            let zone = match zone {
                Zone::Hull => 0.0,
                Zone::Holed => 1.0,
                Zone::Rig => 2.0,
            };
            [vec![2.0, f64::from(target), f64::from(shooter), zone], point(at)].concat()
        }
        Event::Shot(ShotEvent::Splash { point: at, .. }) => [vec![3.0], point(at)].concat(),
        Event::Shot(ShotEvent::Land { point: at, .. }) => [vec![4.0], point(at)].concat(),
        Event::Shot(ShotEvent::Gone { .. }) => return None,
        Event::RunOut { side, .. } => vec![5.0, side_number(side)],
        Event::State { ship, state } => vec![6.0, f64::from(ship), state_number(state)],
        Event::Refused { refusal, .. } => match refusal {
            Refusal::NoGuns => vec![7.0, 0.0, 0.0, 0.0],
            Refusal::Silent => vec![7.0, 1.0, 0.0, 0.0],
            Refusal::Braced => vec![7.0, 2.0, 0.0, 0.0],
            Refusal::Reloading { side, left } => vec![7.0, 3.0, side_number(side), left],
        },
        Event::NoSail { wrecked, .. } => vec![8.0, f64::from(u8::from(wrecked))],
        Event::Load { shot, .. } => vec![9.0, shot_number(shot)],
        Event::Ram { ship, by, point: at, dealt } => {
            [vec![10.0, f64::from(ship), f64::from(by)], point(at), vec![dealt]].concat()
        }
        Event::Gone { .. } => return None,
    })
}

/// Where a gun's ball stops, `STOP_NUMBERS`: whether it does (0 still aloft, else 1), seconds after it left its gun,
/// its point, whether in the water, and whether it strikes her (0 or 1) and where.
fn stop_numbers(stop: Option<&Stop>) -> [f64; STOP_NUMBERS] {
    let Some(stop) = stop else { return [0.0; STOP_NUMBERS] };
    let ([x, y, z], [strike_x, strike_y, strike_z]) = (stop.point, stop.strike.unwrap_or_default());
    let (water, struck) = (f64::from(u8::from(stop.water)), f64::from(u8::from(stop.strike.is_some())));
    [1.0, stop.time, x, y, z, water, struck, strike_x, strike_y, strike_z]
}

/// A captain's mind as the browser shows it: her mode, whether she is hostile to the player, and her sides run out.
fn captain_numbers(her: &Captain) -> [f64; 4] {
    let mode = match her.mode {
        Mode::Cruise => 0.0,
        Mode::Engage => 1.0,
        Mode::Flee => 2.0,
        Mode::Struck => 3.0,
        Mode::Sinking => 4.0,
    };
    let run_out = |side: Side| f64::from(u8::from(her.run.out(side).is_some()));
    [mode, f64::from(u8::from(her.hostile_to(PLAYER))), run_out(Side::Port), run_out(Side::Starboard)]
}

/// The fight as the browser shows it, after a tick whose events are `events`, its lay the look `aim` holds over
/// `waters` at `time`: a fight of the player's Sloop and `CAPTAIN`'s (`Fight::meet`), then any other captains still
/// in it, each with her faction and rank; none for a fight without both.
#[must_use]
pub fn view_numbers(fight: &Fight, events: &[Event], aim: Option<&Aim>, waters: &impl Waters, time: f64) -> Vec<f64> {
    let (Some(player), Some(captain)) = (fight.vessel(PLAYER), fight.vessel(CAPTAIN)) else { return Vec::new() };
    let Sailor::Captain(command) = &captain.sailor else { return Vec::new() };
    let over = match fight.over() {
        None => 0.0,
        Some(End::Sunk) => 1.0,
        Some(End::Gone) => 2.0,
    };
    let mut numbers = vec![fight.clock, over];
    numbers.extend(vessel_numbers(player));
    numbers.extend(vessel_numbers(captain));
    numbers.extend(captain_numbers(&command.her));
    let others: Vec<(&Vessel, &Captain)> = fight
        .ships
        .iter()
        .filter(|(id, vessel)| **id != CAPTAIN && vessel.in_fight())
        .filter_map(|(_, vessel)| vessel.command().map(|command| (vessel, &command.her)))
        .collect();
    numbers.push(others.len() as f64);
    for (vessel, her) in others {
        numbers.extend([f64::from(her.commission.faction), f64::from(her.commission.rank.number())]);
        numbers.extend(vessel_numbers(vessel));
        numbers.extend(captain_numbers(her));
    }
    let balls: Vec<&_> = fight.balls.iter().filter(|ball| ball.fired).collect();
    numbers.push(balls.len() as f64);
    for ball in balls {
        let at = flight(ball.start, ball.launch, fight.clock - ball.born);
        numbers.extend([at[0], at[1], at[2], ball.gun.radius_m]);
    }
    match aim.and_then(|aim| fight.preview(PLAYER, aim, waters, time)) {
        None => numbers.push(0.0),
        Some(shown) => {
            let on_target = f64::from(u8::from(shown.on_target));
            let lay = &shown.lay;
            numbers.extend([1.0, side_number(lay.side), lay.elevation, lay.reach, shown.radius, on_target]);
            numbers.push(shown.launches.len() as f64);
            for (launch, stop) in shown.launches.iter().zip(&shown.ends) {
                numbers.extend(launch);
                numbers.extend(stop_numbers(stop.as_ref()));
            }
        }
    }
    let shown: Vec<Vec<f64>> = events.iter().filter_map(event_numbers).collect();
    numbers.push(shown.len() as f64);
    numbers.extend(shown.into_iter().flatten());
    numbers
}

#[cfg(test)]
#[path = "wire_tests.rs"]
mod tests;
