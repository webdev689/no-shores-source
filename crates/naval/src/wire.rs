//! A fight's orders and what it shows, as numbers in a fixed order: the sea room's messages carry them, so a fight
//! crosses as a body does (crates/protocol), and the browser reads them back into its view of the fight
//! (client/src/network/seaFight.ts). The Server note in the bible lists the order.

use crate::arms::Side;
use crate::ballistics::{flight, launch_velocity};
use crate::captain::Mode;
use crate::captain::course::velocity_of;
use crate::damage::{State, Zone};
use crate::fight::{Aim, End, Event, Fight, Orders, Refusal, Vessel};
use crate::guns::Shot;
use crate::shots::ShotEvent;
use sailing::ship::Helm;

pub const ORDERS: usize = 9;
pub const VESSEL_NUMBERS: usize = 26;
/// The farthest a look may lay, metres: past every gun's reach.
const MOST_RANGE_M: f64 = 1e5;

/// Each event's kind and how many numbers follow it: muzzle (ship, point, launch), hit (ship struck, by, zone,
/// point), splash and land (point), run-out (side), state (ship, state), refused (why, side, seconds left), no-sail
/// (wrecked), load (shot).
pub const EVENT_NUMBERS: [usize; 9] = [7, 6, 3, 3, 1, 2, 3, 1, 1];

/// Orders from their numbers, or why they are not orders. They come from a player's machine.
pub fn orders_from(numbers: &[f64]) -> Result<Orders, String> {
    let numbers: [f64; ORDERS] =
        numbers.try_into().map_err(|_| format!("orders are {ORDERS} numbers, not {}", numbers.len()))?;
    if numbers.iter().any(|number| !number.is_finite()) {
        return Err("orders are finite numbers".into());
    }
    let [steer, crab, climb, laid, bearing_deg, range_m, fire, brace, load] = numbers;
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
        Some(Aim { bearing_deg, range_m })
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
    let [laid, bearing, range] = orders.aim.map_or([0.0, 0.0, 0.0], |aim| [1.0, aim.bearing_deg, aim.range_m]);
    let load = orders.load.map_or(0.0, |shot| shot_number(shot) + 1.0);
    let Helm { steer, crab, climb } = orders.helm;
    vec![steer, flag(crab), f64::from(climb), laid, bearing, range, flag(orders.fire), flag(orders.brace), load]
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
            [vec![1.0, shooter as f64], point(at), point(launch)].concat()
        }
        Event::Shot(ShotEvent::Hit { shooter, target, zone, point: at, .. }) => {
            let zone = match zone {
                Zone::Hull => 0.0,
                Zone::Holed => 1.0,
                Zone::Rig => 2.0,
            };
            [vec![2.0, target as f64, shooter as f64, zone], point(at)].concat()
        }
        Event::Shot(ShotEvent::Splash { point: at, .. }) => [vec![3.0], point(at)].concat(),
        Event::Shot(ShotEvent::Land { point: at, .. }) => [vec![4.0], point(at)].concat(),
        Event::Shot(ShotEvent::Gone { .. }) => return None,
        Event::RunOut { side } => vec![5.0, side_number(side)],
        Event::State { ship, state } => vec![6.0, ship as f64, state_number(state)],
        Event::Refused(refusal) => match refusal {
            Refusal::NoGuns => vec![7.0, 0.0, 0.0, 0.0],
            Refusal::Silent => vec![7.0, 1.0, 0.0, 0.0],
            Refusal::Braced => vec![7.0, 2.0, 0.0, 0.0],
            Refusal::Reloading { side, left } => vec![7.0, 3.0, side_number(side), left],
        },
        Event::NoSail { wrecked } => vec![8.0, f64::from(u8::from(wrecked))],
        Event::Load { shot } => vec![9.0, shot_number(shot)],
    })
}

/// The fight as the browser shows it, after a tick whose events are `events`, its lay the look `aim` holds.
#[must_use]
pub fn view_numbers(fight: &Fight, events: &[Event], aim: Option<&Aim>) -> Vec<f64> {
    let over = match fight.over {
        None => 0.0,
        Some(End::Sunk) => 1.0,
        Some(End::Gone) => 2.0,
    };
    let mut numbers = vec![fight.clock, over];
    numbers.extend(vessel_numbers(&fight.player));
    numbers.extend(vessel_numbers(&fight.captain));
    let mode = match fight.her.mode {
        Mode::Cruise => 0.0,
        Mode::Engage => 1.0,
        Mode::Flee => 2.0,
        Mode::Struck => 3.0,
        Mode::Sinking => 4.0,
    };
    let run_out = |side: Side| f64::from(u8::from(fight.her.run.out(side).is_some()));
    numbers.extend([mode, f64::from(u8::from(fight.her.hostile())), run_out(Side::Port), run_out(Side::Starboard)]);
    let balls: Vec<&_> = fight.balls.iter().filter(|ball| ball.fired).collect();
    numbers.push(balls.len() as f64);
    for ball in balls {
        let at = flight(ball.start, ball.launch, fight.clock - ball.born);
        numbers.extend([at[0], at[1], at[2], ball.gun.radius_m]);
    }
    match aim.and_then(|aim| fight.laid(aim)) {
        None => numbers.push(0.0),
        Some(laid) => {
            let way = velocity_of(&fight.player.ship);
            let launch = launch_velocity(laid.dir, laid.elevation, laid.gun.speed, [way[0], way[1], 0.0]);
            let on_target = f64::from(u8::from(fight.on_target(&laid)));
            numbers.extend([1.0, side_number(laid.side), laid.elevation, laid.reach, on_target]);
            numbers.push(laid.mouths.len() as f64);
            for mouth in &laid.mouths {
                numbers.extend(mouth.iter().chain(launch.iter()));
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
