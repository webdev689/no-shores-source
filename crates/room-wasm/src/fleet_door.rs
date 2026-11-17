//! A fleet room's side of the door, for a browser predicting its own ship: her ship stepped by the helms the room
//! has not taken yet, as the room would step them; and her look's lay among the ships she sees, as the room would
//! lay it. Both run the naval crate on the room's open sea, in little-endian 64-bit numbers.

use land::sea::Swell;
use naval::fight::{Aim, Hurts, sail_hurt};
use naval::guns::Shot;
use naval::laying::{Sighted, preview};
use naval::shots::Flag;
use sailing::SLOOP;
use sailing::floats::{HELM_FLOATS, POSE_FLOATS, SHIP_FLOATS};
use sailing::pose::{Pose, pose_of};
use sailing::ship::{Helm, Ship};
use sailing::waters::{OpenSea, steady_wind};
use std::sync::OnceLock;

/// The room's swell: the world's.
fn swell() -> &'static Swell {
    static SWELL: OnceLock<Swell> = OnceLock::new();
    SWELL.get_or_init(Swell::default)
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

/// A helm's numbers, checked as the room checks them: a rudder within its throw, a crab or none, a rung at most.
fn helm_of(numbers: &[f64]) -> Option<Helm> {
    let [steer, crab, climb] = numbers[..] else { return None };
    let fits = (-1.0..=1.0).contains(&steer) && (crab == 0.0 || crab == 1.0) && [-1.0, 0.0, 1.0].contains(&climb);
    fits.then_some(Helm { steer, crab: crab == 1.0, climb: climb as i8 })
}

/// Her ship stepped by each helm in turn, as the fleet room steps a player's ship: from her ship's numbers, whether
/// she is a wreck, her sail and her whole sail, the room's time for her pose, then three numbers a helm. Answers her
/// ship's numbers and her pose at that time; none for numbers that are not that.
#[must_use]
pub fn predict(numbers: &[f64]) -> Vec<f64> {
    let (Some(ship), Some(rest)) = (numbers.get(..SHIP_FLOATS).and_then(ship_of), numbers.get(SHIP_FLOATS..)) else {
        return Vec::new();
    };
    let Some((&[wrecked, sail, max_sail, time], helms)) = rest.split_first_chunk::<4>() else { return Vec::new() };
    if !numbers.iter().all(|number| number.is_finite()) || !helms.len().is_multiple_of(HELM_FLOATS) {
        return Vec::new();
    }
    let Some(helms) = helms.chunks_exact(HELM_FLOATS).map(helm_of).collect::<Option<Vec<Helm>>>() else {
        return Vec::new();
    };
    let hurts = Hurts::from_numbers(wrecked != 0.0, sail, max_sail);
    let waters = OpenSea { swell: swell() };
    let wind = steady_wind(swell());
    // Out on the open sea a ship's step does not hang on the hour: only her pose does.
    let ship = helms.iter().fold(ship, |ship, helm| sail_hurt(&ship, *helm, hurts, &waters, wind, time).0);
    let pose = pose_of(&ship, &SLOOP, &waters, time);
    ship.to_floats().into_iter().chain(pose.to_floats()).collect()
}

/// The numbers of one other ship in a lay's request: her number, flag (0 a player's, 1 a pirate's), ship, pose and
/// whether she floats.
const OTHER_FLOATS: usize = 3 + SHIP_FLOATS + POSE_FLOATS;

fn sighted_of(numbers: &[f64]) -> Option<Sighted> {
    let (&[id, flag], rest) = numbers.split_first_chunk::<2>()?;
    let ship = ship_of(rest.get(..SHIP_FLOATS)?)?;
    let pose = pose_from(rest.get(SHIP_FLOATS..SHIP_FLOATS + POSE_FLOATS)?)?;
    let afloat = *rest.get(SHIP_FLOATS + POSE_FLOATS)? != 0.0;
    let id = (id >= 0.0 && id <= f64::from(u32::MAX) && id == id.trunc()).then_some(id as u32)?;
    let flag = if flag == 0.0 { Flag::Player } else { Flag::Pirate };
    Some(Sighted { id, flag, ship, pose, afloat })
}

/// Her look's lay as the fleet room would lay it: from her own ship as `sighted_of` reads one, her load (1 round to
/// 4 heated), her look's bearing and range, 1 and its ray's six numbers or 0 and six of anything, the room's time,
/// then every other ship she sees. Answers 0 for no side bearing; else 1, her side (0 port, 1 starboard), the
/// elevation, the reach, the landing zone's radius, 1 if on target, and for each gun its launch's six numbers and
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
    let waters = OpenSea { swell: swell() };
    let Some(shown) = preview(&own, load, &aim, &ships, (&waters, time)) else { return Some(vec![0.0]) };
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
