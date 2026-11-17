//! The ram's law, as DFO's: a stem meets a hull at a face (her side, or her bow or stern), and strikes it at the
//! closing way toward that face. A ram at a fighting way takes a share of the lesser of the two whole hulls, less
//! into her bow or stern, and never takes a hull under the line where she strikes: a ram brings a ship to strike, and
//! no further. The rammer pays a share back, as hard as her own room over her line lets her. Hulls that touch without
//! a ram are pushed apart: each out of the other by half the overlap, her way cut by how squarely she drove into it.

use crate::ballistics::Block;
use crate::damage::{Damage, STRUCK_AT, men, rounded};

/// The least closing way (m/s) toward the face a stem meets that rams; under it two hulls bump.
pub const RAM_SPEED: f64 = 1.6;
/// The closing way (m/s) that drives a ram home whole; past it, no more.
pub const RAM_FULL_SPEED: f64 = 8.0;
/// The most of the lesser hull one ram takes, and what a ram into her bow or stern deals of one into her side.
pub const RAM_SHARE: f64 = 0.15;
pub const RAM_GLANCE: f64 = 0.4;
/// The share of a blow a stem not built to ram takes back: the recoil, twice over.
pub const RAM_RECOIL: f64 = 0.3;
pub const BOW_RECOIL: f64 = 2.0;
/// One man taken for every this many hull points a ram deals.
pub const RAM_A_MAN: f64 = 40.0;
/// The stem strikes within this of the other's hull (metres), at the most way she had over the last moments (s).
pub const RAM_REACH: f64 = 1.2;
pub const RAM_MEMORY_S: f64 = 0.6;
/// One ram on a ship by one rammer a stretch (s).
pub const RAM_COOLDOWN_S: f64 = 3.0;

/// The face a stem meets: her side (else her bow or her stern), and its outward normal on the flat (east, south).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Contact {
    pub side: bool,
    pub normal: [f64; 2],
}

/// Where a stem at `point` meets the hull `block` (its axes her bow, her starboard and up) within `reach` of it: the
/// face it stands farthest outside of (least inside, for a stem already in her planking). None out of reach.
#[must_use]
pub fn ram_contact(block: &Block, point: [f64; 3], reach: f64) -> Option<Contact> {
    let [along, across, _] = block.local(point);
    let (out_across, out_along) = (across.abs() - block.half[1], along.abs() - block.half[0]);
    if out_across > reach || out_along > reach {
        return None;
    }
    let side = out_across >= out_along;
    let (axis, at) = if side { (block.axes[1], across) } else { (block.axes[0], along) };
    let sign = if at < 0.0 { -1.0 } else { 1.0 };
    let length = (axis[0] * axis[0] + axis[1] * axis[1]).sqrt();
    let length = if length > 0.0 { length } else { 1.0 };
    Some(Contact { side, normal: [sign * axis[0] / length, sign * axis[1] / length] })
}

/// The closing way toward a face of outward `normal`: the most, over the stem's ways (`ways`, its velocities over the
/// last moments), of its way less `hers` along it.
#[must_use]
pub fn ram_closing(ways: &[[f64; 2]], hers: [f64; 2], normal: [f64; 2]) -> f64 {
    let closing = |way: &[f64; 2]| -((way[0] - hers[0]) * normal[0] + (way[1] - hers[1]) * normal[1]);
    ways.iter().map(closing).fold(f64::NEG_INFINITY, f64::max)
}

/// A ram's blow (hull points), before her line: none under `RAM_SPEED`; else the stem's share of the lesser of the two
/// whole hulls (`mine` the rammer's, `hers` the struck ship's), by the pace and the face.
#[must_use]
pub fn ram_blow(closing: f64, side: bool, mine: f64, hers: f64) -> f64 {
    if closing.is_nan() || closing < RAM_SPEED {
        return 0.0;
    }
    let pace = (closing / RAM_FULL_SPEED).min(1.0);
    let lesser = mine.min(hers).max(0.0);
    rounded(RAM_SHARE * lesser * pace * if side { 1.0 } else { RAM_GLANCE })
}

/// A hull's line: where she strikes. A ram lands with it as its floor.
#[must_use]
pub fn ram_line(damage: &Damage) -> f64 {
    damage.max_hull * STRUCK_AT
}

/// The hull a ram may still take from her: down to her line.
#[must_use]
pub fn ram_room(damage: &Damage) -> f64 {
    (damage.hull - ram_line(damage)).max(0.0)
}

/// The whole points a ram's recoil may take from the rammer: one short of her room, so her own ram never brings her to
/// strike.
#[must_use]
pub fn recoil_room(damage: &Damage) -> f64 {
    (ram_room(damage) - 1.0).floor().max(0.0)
}

/// The share of a blow a plain stem takes back.
pub const RECOIL_SHARE: f64 = RAM_RECOIL * BOW_RECOIL;

/// A blow as hard as the rammer can pay for: its recoil (`share` of it) within her recoil `room`.
#[must_use]
pub fn ram_paid(blow: f64, room: f64, share: f64) -> f64 {
    if share > 0.0 { blow.min((room / share).floor()) } else { blow }
}

/// The whole men a ram that `dealt` hull takes, over her crew's toughness `tough` on the `roll`.
#[must_use]
pub fn ram_men(dealt: f64, roll: f64, tough: f64) -> f64 {
    men(dealt / RAM_A_MAN, roll, tough)
}

/// A hull on the flat: her middle, her forward and starboard (east, south), and her half length and half beam.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Flat {
    pub middle: [f64; 2],
    pub forward: [f64; 2],
    pub starboard: [f64; 2],
    pub half_length: f64,
    pub half_beam: f64,
}

fn dot(one: [f64; 2], other: [f64; 2]) -> f64 {
    one[0] * other[0] + one[1] * other[1]
}

/// The least push that takes `one` out of `other` on the flat (their boxes' separating axes), or none: they do not
/// overlap.
#[must_use]
pub fn overlap(one: &Flat, other: &Flat) -> Option<[f64; 2]> {
    let gap = [other.middle[0] - one.middle[0], other.middle[1] - one.middle[1]];
    let mut best: Option<([f64; 2], f64)> = None;
    for axis in [one.forward, one.starboard, other.forward, other.starboard] {
        let reach = |hull: &Flat| {
            hull.half_length * dot(hull.forward, axis).abs() + hull.half_beam * dot(hull.starboard, axis).abs()
        };
        let along = dot(gap, axis);
        let depth = reach(one) + reach(other) - along.abs();
        if depth <= 0.0 {
            return None;
        }
        if best.is_none_or(|(_, least)| depth < least) {
            let away = if along > 0.0 { -1.0 } else { 1.0 };
            best = Some(([away * axis[0] * depth, away * axis[1] * depth], depth));
        }
    }
    best.map(|(push, _)| push)
}

/// How squarely a ship heading along `forward` drove into what pushed her back by `push`: 1 head on, 0 sliding along
/// it or backing off; her way is cut by this share.
#[must_use]
pub fn driven_into(forward: [f64; 2], push: [f64; 2]) -> f64 {
    let length = (push[0] * push[0] + push[1] * push[1]).sqrt();
    let length = if length > 0.0 { length } else { 1.0 };
    (-dot(forward, push) / length).clamp(0.0, 1.0)
}

#[cfg(test)]
#[path = "ram_tests.rs"]
mod tests;
