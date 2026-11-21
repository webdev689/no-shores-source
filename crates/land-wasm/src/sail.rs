//! A ship sailed over the open landmass. The request is little-endian 64-bit numbers: a ship, its helm, the swell's
//! time at its first tick, how many ticks to step, the world's time then, and its hull if it names one (0 the Sloop
//! to 3 the Frigate; the Sloop without it). The answer is a header (`{}`, or `{ "error" }`) and then its numbers after
//! the last tick and its pose then, as 64-bit numbers too. It sails in the weather's wind where it is; its swell stays
//! a moderate sea's, as the editor draws it.

use super::{OPEN, error_view, view_bytes};
use land::sea::Swell;
use sailing::floats::{HELM_FLOATS, SHIP_FLOATS};
use sailing::pose::pose_of;
use sailing::ship::{Helm, SAILS_SET, Ship, step_ship};
use sailing::waters::{LandWaters, sea_wind_at};
use sailing::{HullKind, TICK_SECONDS};
use serde_json::json;
use std::f64::consts::TAU;

/// A ship, its helm, the time, the ticks and the world's time: a request without its hull.
pub const REQUEST_FLOATS: usize = SHIP_FLOATS + HELM_FLOATS + 3;
/// The most ticks one request may step: a second's.
pub const MOST_TICKS: f64 = 60.0;
/// What no ship's numbers pass: a place a million kilometres out; a way (or its canvas's share of it) of 20 m/s, past
/// the 14.4 a ship bursting in a fight makes in the strongest sea wind, as a fight hands its ship back to sailing; a
/// swing of 45 degrees a second, past its oars' 40 in a fight; a world time past 30 years, where the swell's phases
/// lose their bits.
const MOST_PLACE_M: f64 = 1e9;
pub(crate) const MOST_WAY: f64 = 20.0;
const MOST_TURN_DEG: f64 = 45.0;
const MOST_TIME_S: f64 = 1e9;

fn is_whole(number: f64) -> bool {
    number == number.trunc()
}

/// A ship's eight numbers, checked: finite, a place, heading, way and swing a ship could have, and a whole rung on the
/// ladder.
pub(crate) fn ship_from(numbers: &[f64]) -> Result<Ship, String> {
    let [x, y, heading, ahead, abeam, turn, sail_way, rung] = numbers[..] else {
        return Err(format!("a ship is {SHIP_FLOATS} numbers"));
    };
    if !numbers.iter().all(|number| number.is_finite()) {
        return Err(format!("a ship is {SHIP_FLOATS} finite numbers"));
    }
    let placed = x.abs() <= MOST_PLACE_M && y.abs() <= MOST_PLACE_M && (0.0..TAU).contains(&heading);
    let moving = ahead.abs() <= MOST_WAY && abeam.abs() <= MOST_WAY && turn.abs() <= MOST_TURN_DEG;
    if !placed || !moving || !(0.0..=MOST_WAY).contains(&sail_way) {
        return Err("its place, heading, way or swing is none a ship could have".into());
    }
    if !is_whole(rung) || !(-1.0..=f64::from(SAILS_SET)).contains(&rung) {
        return Err("its rung is a whole number from -1 to 2".into());
    }
    Ok(Ship { x, y, heading, ahead, abeam, turn, sail_way, rung: rung as i8 })
}

/// A helm's numbers, checked: a rudder within its throw, and a whole climb of one rung at most.
pub(crate) fn helm_from(steer: f64, climb: f64) -> Result<Helm, String> {
    if !(-1.0..=1.0).contains(&steer) || ![-1.0, 0.0, 1.0].contains(&climb) {
        return Err("its helm steers from -1 to 1 and climbs one rung at most".into());
    }
    Ok(Helm { steer, climb: climb as i8 })
}

/// A step's time and ticks, checked: a time within the world's, and a whole number of ticks up to a second's.
pub(crate) fn ticks_from(time: f64, ticks: f64) -> Result<(f64, u32), String> {
    if !time.is_finite() || !ticks.is_finite() || !is_whole(ticks) || !(0.0..=MOST_TICKS).contains(&ticks) {
        return Err(format!("a request steps a whole number of ticks, up to {MOST_TICKS}"));
    }
    if time.abs() > MOST_TIME_S {
        return Err("the time is past the world's".into());
    }
    Ok((time, ticks as u32))
}

/// The request's ship, helm, time, ticks, world time and hull (the Sloop's unless it names one), each number checked.
fn read(request: &[u8]) -> Result<(Ship, Helm, f64, u32, f64, HullKind), String> {
    let numbers: Vec<f64> =
        request.chunks_exact(8).map(|chunk| f64::from_le_bytes(chunk.try_into().unwrap_or_default())).collect();
    let fits = |count: usize| request.len() == count * 8 && numbers.len() == count;
    if !fits(REQUEST_FLOATS) && !fits(REQUEST_FLOATS + 1) {
        return Err(format!("a sail request is {REQUEST_FLOATS} numbers, or one more naming its hull"));
    }
    if !numbers.iter().all(|number| number.is_finite()) {
        return Err(format!("a sail request is {REQUEST_FLOATS} finite numbers"));
    }
    let Some((&[steer, climb, time, ticks, world], hull)) = numbers[SHIP_FLOATS..].split_first_chunk::<5>() else {
        return Err(format!("a sail request is {REQUEST_FLOATS} numbers"));
    };
    let hull = match hull {
        [] => HullKind::Sloop,
        [number] => Some(*number)
            .filter(|number| *number == number.trunc() && (0.0..=f64::from(u8::MAX)).contains(number))
            .and_then(|number| HullKind::numbered(number as u8))
            .ok_or("its hull is a whole number from 0 to 3")?,
        _ => return Err(format!("a sail request is {REQUEST_FLOATS} numbers")),
    };
    let ship = ship_from(&numbers[..SHIP_FLOATS])?;
    let helm = helm_from(steer, climb)?;
    let (time, ticks) = ticks_from(time, ticks)?;
    let (world, _) = ticks_from(world, 0.0)?;
    Ok((ship, helm, time, ticks, world, hull))
}

/// Steps the ship the request holds over the open landmass and answers it and its pose.
#[must_use]
pub fn sail_bytes(request: &[u8]) -> Vec<u8> {
    let sailed = read(request).and_then(|(ship, helm, time, ticks, world, hull)| {
        OPEN.with(|open| {
            let open = open.borrow();
            let landmass = open.as_ref().ok_or("no landmass is open")?;
            let swell = Swell::default();
            let waters = LandWaters { ground: &landmass.surface, swell: &swell };
            let mut ship = ship;
            for tick in 0..ticks {
                // A rung's climb is a press: it acts on the first tick alone.
                let helm = if tick == 0 { helm } else { Helm { climb: 0, ..helm } };
                let (now, world) = (time + f64::from(tick) * TICK_SECONDS, world + f64::from(tick) * TICK_SECONDS);
                ship = step_ship(
                    &ship,
                    &helm,
                    hull.hull(),
                    sea_wind_at([ship.x, ship.y], world),
                    &waters,
                    now,
                    TICK_SECONDS,
                );
            }
            let pose = pose_of(&ship, hull.hull(), &waters, time + f64::from(ticks) * TICK_SECONDS);
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
