//! A fleet room's side of the door, for a browser predicting its own ship: the ship stepped by the helms the room
//! has not taken yet, as the room would step them; and the ship's look's lay among the ships it sees, as the room would
//! lay it. Both run the naval crate on the room's open sea, in little-endian 64-bit numbers.

use land::sea::Swell;
use naval::fight::{Aim, Hurts, sail_hurt};
use naval::guns::Shot;
use naval::laying::{Sighted, preview};
use naval::shots::Flag;
use room::fleet::FLEET_AT;
use room::sea_weather::open_sea_at;
use sailing::HullKind;
use sailing::floats::{HELM_FLOATS, POSE_FLOATS, SHIP_FLOATS};
use sailing::pose::{Pose, pose_of};
use sailing::ship::{Helm, Ship};
use sailing::waters::OpenSea;
use std::cell::RefCell;

thread_local! {
    /// The fleet room's swell and wind as the browser predicts by them: the weather at its place when it opened.
    static WEATHER: RefCell<(Swell, [f64; 2])> = RefCell::new(open_sea_at(FLEET_AT, 0.0));
}

/// Sets the world time the fleet room opened at, seconds since the Unix epoch, for the predictions: its weather is
/// the room's (`Fleet::set_world_start`).
pub fn set_world_start(seconds: f64) {
    WEATHER.with(|weather| *weather.borrow_mut() = open_sea_at(FLEET_AT, seconds));
}

fn with_weather<T>(use_weather: impl FnOnce(&Swell, [f64; 2]) -> T) -> T {
    WEATHER.with(|weather| {
        let weather = weather.borrow();
        use_weather(&weather.0, weather.1)
    })
}

fn ship_of(numbers: &[f64]) -> Option<Ship> {
    let [x, y, heading, ahead, abeam, turn, sail_way, rung] = numbers[..] else { return None };
    let rung = (rung == rung.trunc() && (-1.0..=2.0).contains(&rung)).then_some(rung as i8)?;
    Some(Ship { x, y, heading, ahead, abeam, turn, sail_way, rung })
}

fn pose_from(numbers: &[f64]) -> Option<Pose> {
    let [heave, pitch, roll, aground] = numbers[..] else { return None };
    Some(Pose { heave, pitch, roll, aground: aground != 0.0 })
}

/// A helm's numbers, checked as the room checks them: a rudder within its throw and a rung at most.
fn helm_of(numbers: &[f64]) -> Option<Helm> {
    let [steer, climb] = numbers[..] else { return None };
    let fits = (-1.0..=1.0).contains(&steer) && [-1.0, 0.0, 1.0].contains(&climb);
    fits.then_some(Helm { steer, climb: climb as i8 })
}

/// The player's ship stepped by each helm in turn, as the fleet room steps it: from the ship's numbers, whether
/// it is a wreck, its sail and its whole sail, the room's time for its pose, the room's world time at its first tick
/// (which the wind needs not: the room's wind is the one it opened in), then two numbers a helm. Answers the ship's
/// numbers and its pose at that time; none for numbers that are not that.
#[must_use]
pub fn predict(numbers: &[f64]) -> Vec<f64> {
    let (Some(ship), Some(rest)) = (numbers.get(..SHIP_FLOATS).and_then(ship_of), numbers.get(SHIP_FLOATS..)) else {
        return Vec::new();
    };
    let Some((&[wrecked, sail, max_sail, time, _epoch], helms)) = rest.split_first_chunk::<5>() else {
        return Vec::new();
    };
    if !numbers.iter().all(|number| number.is_finite()) || !helms.len().is_multiple_of(HELM_FLOATS) {
        return Vec::new();
    }
    let Some(helms) = helms.chunks_exact(HELM_FLOATS).map(helm_of).collect::<Option<Vec<Helm>>>() else {
        return Vec::new();
    };
    let hurts = Hurts::from_numbers(wrecked != 0.0, sail, max_sail);
    with_weather(|swell, wind| {
        let waters = OpenSea { swell };
        // Out on the open sea a ship's step does not hang on the hour: only its pose does.
        // A player sails the Sloop.
        let hull = HullKind::Sloop.hull();
        let ship = helms.iter().fold(ship, |ship, helm| sail_hurt(&ship, hull, *helm, hurts, &waters, wind, time).0);
        let pose = pose_of(&ship, hull, &waters, time);
        ship.to_floats().into_iter().chain(pose.to_floats()).collect()
    })
}

/// The numbers of one other ship in a lay's request: its number, flag (0 a player's, else its faction's number), hull
/// (0 the Sloop to 3 the Frigate, as the snapshot numbers it), ship, pose and whether it floats.
const OTHER_FLOATS: usize = 4 + SHIP_FLOATS + POSE_FLOATS;

fn sighted_of(numbers: &[f64]) -> Option<Sighted> {
    let (&[id, flag, hull], rest) = numbers.split_first_chunk::<3>()?;
    let ship = ship_of(rest.get(..SHIP_FLOATS)?)?;
    let pose = pose_from(rest.get(SHIP_FLOATS..SHIP_FLOATS + POSE_FLOATS)?)?;
    let afloat = *rest.get(SHIP_FLOATS + POSE_FLOATS)? != 0.0;
    let id = (id >= 0.0 && id <= f64::from(u32::MAX) && id == id.trunc()).then_some(id as u32)?;
    let flag = (flag >= 0.0 && flag <= f64::from(u8::MAX) && flag == flag.trunc()).then_some(flag as u8)?;
    let flag = Flag::numbered(flag);
    let hull = (hull == hull.trunc() && (0.0..=f64::from(u8::MAX)).contains(&hull)).then_some(hull as u8)?;
    let hull = HullKind::numbered(hull)?;
    // shortcut: no fallen masts are sent to the page, so its lay may meet rig a ball now passes; send them if it shows.
    Some(Sighted { id, flag, hull, ship, pose, afloat, fallen: 0 })
}

/// A player's look's lay as the fleet room would lay it: from their own ship as `sighted_of` reads one, its load
/// (1 round to 4 heated), their look's bearing and range, 1 and its ray's six numbers or 0 and six of anything, the
/// room's time, then every other ship they see. Answers 0 for no side bearing; else 1, its side (0 port, 1 starboard),
/// the elevation, the reach, the landing zone's radius, 1 if on target, and for each gun its launch's six numbers and
/// where it stops: 1, the seconds, the point, 1 in the water, and 1 and a strike's point (or 0 and three zeros); or 0
/// and eight zeros, still aloft.
#[must_use]
pub fn lay(numbers: &[f64]) -> Vec<f64> {
    lay_numbers(numbers).unwrap_or_default()
}

fn lay_numbers(numbers: &[f64]) -> Option<Vec<f64>> {
    if !numbers.iter().all(|number| number.is_finite()) {
        return None;
    }
    let own = sighted_of(numbers.get(..OTHER_FLOATS)?)?;
    let rest = numbers.get(OTHER_FLOATS..)?;
    let (&[load, bearing_deg, range_m, has_ray], rest) = rest.split_first_chunk::<4>()?;
    let (ray, rest) = rest.split_first_chunk::<6>()?;
    let (&[time], others) = rest.split_first_chunk::<1>()?;
    let load = Shot::CYCLE.get((load as usize).checked_sub(1)?).copied()?;
    let fits = (-180.0..=180.0).contains(&bearing_deg) && (0.0..=room::fleet::MOST_RANGE_M).contains(&range_m);
    if !fits || !others.len().is_multiple_of(OTHER_FLOATS) {
        return None;
    }
    let ray = (has_ray != 0.0).then_some([[ray[0], ray[1], ray[2]], [ray[3], ray[4], ray[5]]]);
    let aim = Aim { bearing_deg, range_m, ray };
    let ships: Vec<Sighted> = std::iter::once(Some(own))
        .chain(others.chunks_exact(OTHER_FLOATS).map(sighted_of))
        .collect::<Option<Vec<Sighted>>>()?;
    let shown = with_weather(|swell, _| preview(&own, load, &aim, &ships, (&OpenSea { swell }, time)));
    let Some(shown) = shown else { return Some(vec![0.0]) };
    let mut out = vec![1.0, shown.lay.side.index() as f64, shown.lay.elevation, shown.lay.reach, shown.radius];
    out.push(f64::from(u8::from(shown.on_target)));
    for (launch, end) in shown.launches.iter().zip(&shown.ends) {
        out.extend(launch);
        match end {
            Some(stop) => {
                out.extend([1.0, stop.time, stop.point[0], stop.point[1], stop.point[2]]);
                out.push(f64::from(u8::from(stop.water)));
                let strike = stop.strike.map_or([0.0; 4], |point| [1.0, point[0], point[1], point[2]]);
                out.extend(strike);
            }
            None => out.extend([0.0; 10]),
        }
    }
    Some(out)
}

/// A fleet player's ship stepped by the helms written at `address`, as `predict` reads them; answers their
/// ship's and its pose's numbers.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fleet_predict(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let numbers = crate::floats_of(unsafe { std::slice::from_raw_parts(address, length) });
    crate::hand_over(predict(&numbers).iter().flat_map(|value| value.to_le_bytes()).collect())
}

/// A fleet player's lay for the look written at `address`, as `lay` reads it; answers its numbers.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fleet_lay(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let numbers = crate::floats_of(unsafe { std::slice::from_raw_parts(address, length) });
    crate::hand_over(lay(&numbers).iter().flat_map(|value| value.to_le_bytes()).collect())
}
