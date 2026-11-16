//! A ship sailed over the open landmass. The request is little-endian 64-bit numbers: a ship, her helm, the world's
//! time at her first tick, and how many ticks to step. The answer is a header (`{}`, or `{ "error" }`) and then her
//! numbers after the last tick and her pose then, as 64-bit numbers too. The Sloop sails in the steady wind.

use super::{OPEN, error_view, view_bytes};
use land::sea::Swell;
use sailing::floats::{HELM_FLOATS, SHIP_FLOATS};
use sailing::pose::pose_of;
use sailing::ship::{Helm, SAILS_SET, Ship, step_ship};
use sailing::waters::{LandWaters, steady_wind};
use sailing::{SLOOP, TICK_SECONDS};
use serde_json::json;
use std::f64::consts::TAU;

/// A ship, her helm, the time and the ticks.
pub const REQUEST_FLOATS: usize = SHIP_FLOATS + HELM_FLOATS + 2;
/// The most ticks one request may step: a second's.
pub const MOST_TICKS: f64 = 60.0;
/// What no ship's numbers pass: a place a million kilometres out; a way (or her canvas's share of it) of 10 m/s, twice
/// what any rig makes in the strongest sea wind; a swing of 45 degrees a second, twice her oars'; a world time past
/// 30 years, where the swell's phases lose their bits.
const MOST_PLACE_M: f64 = 1e9;
const MOST_WAY: f64 = 10.0;
const MOST_TURN_DEG: f64 = 45.0;
const MOST_TIME_S: f64 = 1e9;

fn is_whole(number: f64) -> bool {
    number == number.trunc()
}

/// The request's ship, helm, time and ticks, each number checked: finite, a place, heading, way and swing a ship
/// could have, a whole rung on the ladder, a whole climb of one at most, a rudder within its throw, a time within the
/// world's, and a whole number of ticks up to a second's.
fn read(request: &[u8]) -> Result<(Ship, Helm, f64, u32), String> {
    let numbers: Vec<f64> =
        request.chunks_exact(8).map(|chunk| f64::from_le_bytes(chunk.try_into().unwrap_or_default())).collect();
    let [x, y, heading, ahead, abeam, turn, sail_way, rung, steer, crab, climb, time, ticks] = numbers[..] else {
        return Err(format!("a sail request is {REQUEST_FLOATS} numbers"));
    };
    if request.len() != REQUEST_FLOATS * 8 || !numbers.iter().all(|number| number.is_finite()) {
        return Err(format!("a sail request is {REQUEST_FLOATS} finite numbers"));
    }
    let placed = x.abs() <= MOST_PLACE_M && y.abs() <= MOST_PLACE_M && (0.0..TAU).contains(&heading);
    let moving = ahead.abs() <= MOST_WAY && abeam.abs() <= MOST_WAY && turn.abs() <= MOST_TURN_DEG;
    if !placed || !moving || !(0.0..=MOST_WAY).contains(&sail_way) {
        return Err("her place, heading, way or swing is none a ship could have".into());
    }
    if !is_whole(rung) || !(-1.0..=f64::from(SAILS_SET)).contains(&rung) {
        return Err("her rung is a whole number from -1 to 2".into());
    }
    if !(-1.0..=1.0).contains(&steer) || !(crab == 0.0 || crab == 1.0) || ![-1.0, 0.0, 1.0].contains(&climb) {
        return Err("her helm steers from -1 to 1, crabs or not, and climbs one rung at most".into());
    }
    if !is_whole(ticks) || !(0.0..=MOST_TICKS).contains(&ticks) {
        return Err(format!("a request steps a whole number of ticks, up to {MOST_TICKS}"));
    }
    if time.abs() > MOST_TIME_S {
        return Err("the time is past the world's".into());
    }
    let ship = Ship { x, y, heading, ahead, abeam, turn, sail_way, rung: rung as i8 };
    Ok((ship, Helm { steer, crab: crab == 1.0, climb: climb as i8 }, time, ticks as u32))
}

/// Steps the ship the request holds over the open landmass and answers her and her pose.
#[must_use]
pub fn sail_bytes(request: &[u8]) -> Vec<u8> {
    let sailed = read(request).and_then(|(ship, helm, time, ticks)| {
        OPEN.with(|open| {
            let open = open.borrow();
            let landmass = open.as_ref().ok_or("no landmass is open")?;
            let swell = Swell::default();
            let waters = LandWaters { ground: &landmass.surface, swell: &swell };
            let wind = steady_wind(&swell);
            let mut ship = ship;
            for tick in 0..ticks {
                // A rung's climb is a press: it acts on the first tick alone.
                let helm = if tick == 0 { helm } else { Helm { climb: 0, ..helm } };
                let now = time + f64::from(tick) * TICK_SECONDS;
                ship = step_ship(&ship, &helm, &SLOOP, wind, &waters, now, TICK_SECONDS);
            }
            let pose = pose_of(&ship, &SLOOP, &waters, time + f64::from(ticks) * TICK_SECONDS);
            Ok(ship.to_floats().into_iter().chain(pose.to_floats()).collect::<Vec<f64>>())
        })
    });
    match sailed {
        Ok(numbers) => {
            let mut bytes = view_bytes(&json!({}), None);
            numbers.iter().for_each(|number| bytes.extend_from_slice(&number.to_le_bytes()));
            bytes
        }
        Err(error) => error_view(&error),
    }
}
