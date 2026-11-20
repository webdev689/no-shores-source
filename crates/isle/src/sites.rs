//! Where an island's places stand, drawn from its seed over its shape before its ground is laid: the beach landed on
//! and the anchorage off it, the dungeon's door, an isle's landmark, guards' posts and camp, and the wrecks on its
//! shore. Each that wants level ground sets a pad in the shape.

use crate::Kind;
use crate::draws::Draws;
use crate::shape::{Pad, Quarry, Shape, bearing_of, way};
use core::f64::consts::{FRAC_PI_2, PI, TAU};

/// How far off the beach the ship anchors, past the coast on the landing's bearing, metres.
pub const ANCHORAGE_OFF_M: f64 = 45.0;
/// How far past the coast the section reaches into the shallows, metres.
pub const SHALLOWS_M: f64 = 14.0;

/// The dungeon's door: where it stands, the bearing its front faces, and the dungeon's style.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Door {
    pub at: [f64; 2],
    pub facing: f64,
    pub style: &'static str,
}

/// A wreck on the shore: the middle of its heap, where it is scavenged, and the bearing its hull lies along.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Wreck {
    pub at: [f64; 2],
    pub lies: f64,
}

/// Every place of an island.
#[derive(Clone, Debug, PartialEq)]
pub struct Sites {
    pub spawns: Vec<[f64; 2]>,
    /// The bearing a player landed faces: inland, away from the anchorage.
    pub facing: f64,
    pub anchorage: [f64; 2],
    pub door: Door,
    /// An isle's landmark: where it stands and the bearing its front faces.
    pub landmark: Option<([f64; 2], f64)>,
    pub guards: Vec<[f64; 2]>,
    pub camp: Option<[f64; 2]>,
    pub wrecks: Vec<Wreck>,
}

fn at(bearing: f64, off: f64) -> [f64; 2] {
    let [x, y] = way(bearing);
    [x * off, y * off]
}

fn distance(one: [f64; 2], other: [f64; 2]) -> f64 {
    let (along_x, along_y) = (one[0] - other[0], one[1] - other[1]);
    (along_x * along_x + along_y * along_y).sqrt()
}

/// The point on a bearing, walking in from the coast a metre at a time, where the ground first stands `level` high, or
/// the island's middle if it never does.
fn inland_to(shape: &Shape, cliffs: f64, bearing: f64, level: f64) -> [f64; 2] {
    let edge = shape.edge(bearing);
    let mut off = edge;
    while off > 0.0 {
        let point = at(bearing, off);
        if shape.height(point, cliffs) >= level {
            return point;
        }
        off -= 1.0;
    }
    [0.0, 0.0]
}

/// The beach's spawns, where a player landed stands: three along the strand facing the anchorage, a metre up.
fn spawns(shape: &Shape, cliffs: f64) -> Vec<[f64; 2]> {
    [-0.14, 0.0, 0.14].iter().map(|&off| inland_to(shape, cliffs, shape.landing + off, 0.9)).collect()
}

/// A cove's door is set into the hillside to one side of the beach, facing out to sea; an isle's by its landmark,
/// facing the landing; a quarry's in its pit's wall, facing into the pit.
fn door(shape: &mut Shape, cliffs: f64, kind: Kind, draws: &mut Draws, landmark: Option<[f64; 2]>) -> Door {
    let style = kind.dungeon();
    match (kind, shape.quarry, landmark) {
        (Kind::Quarry, Some(quarry), _) => {
            let wall = bearing_of([shape.peak[0] - quarry.at[0], shape.peak[1] - quarry.at[1]]);
            let [x, y] = at(wall, quarry.radius * 0.78);
            Door { at: [quarry.at[0] + x, quarry.at[1] + y], facing: (wall + PI).rem_euclid(TAU), style }
        }
        (Kind::Ruin, _, Some(landmark)) => {
            let toward = bearing_of([-landmark[0], -landmark[1]]) + draws.between(-0.6, 0.6);
            let [x, y] = at(toward, draws.between(16.0, 22.0));
            let point = [landmark[0] + x, landmark[1] + y];
            let level = shape.height(point, cliffs);
            shape.pads.push(Pad { at: point, radius: 4.5, level, ease: 6.0 });
            Door { at: point, facing: toward.rem_euclid(TAU), style }
        }
        _ => {
            let side = if draws.unit() < 0.5 { -1.0 } else { 1.0 };
            let bearing = shape.landing + side * draws.between(0.4, 0.7);
            let point = inland_to(shape, cliffs, bearing, (shape.height * 0.35).clamp(2.0, 4.5));
            let level = shape.height(point, cliffs);
            let apron = at(bearing, shape.edge(bearing).min(distance(point, [0.0, 0.0]) + 4.0));
            shape.pads.push(Pad { at: apron, radius: 3.5, level, ease: 5.0 });
            Door { at: point, facing: bearing.rem_euclid(TAU), style }
        }
    }
}

/// The wrecks: two or three on a cove's shore, three to five on an isle's, each on the strand where the land is low,
/// apart from each other, the door and the landing's spawns.
fn wrecks(shape: &Shape, cliffs: f64, kind: Kind, draws: &mut Draws, kept: &[[f64; 2]]) -> Vec<Wreck> {
    let wanted = if kind == Kind::Cove { 2 + draws.index(2) } else { 3 + draws.index(3) };
    let mut found: Vec<Wreck> = Vec::new();
    for _ in 0..80 {
        if found.len() >= wanted {
            break;
        }
        let bearing = draws.between(0.0, TAU);
        if shape.cliffness(bearing, cliffs) > 0.35 {
            continue;
        }
        let point = inland_to(shape, cliffs, bearing, 0.35);
        let clear = kept.iter().all(|&other| distance(point, other) > 18.0)
            && found.iter().all(|wreck| distance(point, wreck.at) > 26.0)
            && distance(point, [0.0, 0.0]) > shape.edge(bearing) * 0.6;
        if clear {
            let lies = (bearing + FRAC_PI_2 + draws.between(-0.7, 0.7)).rem_euclid(TAU);
            found.push(Wreck { at: point, lies });
        }
    }
    found
}

/// An isle's landmark at its hill's top on a pad, or at a quarry's rim; its guards' posts by it, by the door and at a
/// camp above the beach.
fn landmark(shape: &mut Shape, cliffs: f64, kind: Kind, draws: &mut Draws) -> Option<([f64; 2], f64)> {
    match kind {
        Kind::Cove => None,
        Kind::Ruin => {
            let point = shape.peak;
            let level = shape.height(point, cliffs) - 0.4;
            shape.pads.push(Pad { at: point, radius: 15.0, level, ease: 10.0 });
            Some((point, bearing_of([-point[0], -point[1]])))
        }
        Kind::Quarry => {
            let toward = bearing_of(shape.peak) + draws.between(-0.4, 0.4);
            let [x, y] = way(toward);
            let off = shape.radius * draws.between(0.12, 0.22);
            let middle = [shape.peak[0] - x * off, shape.peak[1] - y * off];
            let radius = draws.between(22.0, 30.0);
            let depth = (shape.height * 0.5).clamp(8.0, 14.0);
            shape.quarry = Some(Quarry { at: middle, radius, depth });
            let rim = bearing_of([-middle[0], -middle[1]]) + draws.between(-1.0, 1.0);
            let [rim_x, rim_y] = way(rim);
            let crane = [middle[0] + rim_x * (radius + 6.0), middle[1] + rim_y * (radius + 6.0)];
            let level = shape.height(crane, cliffs);
            shape.pads.push(Pad { at: crane, radius: 7.0, level, ease: 6.0 });
            Some((crane, (rim + PI).rem_euclid(TAU)))
        }
    }
}

impl Sites {
    /// Every place of an island of `kind` on its shape, which takes the pads they stand on.
    #[must_use]
    pub fn new(shape: &mut Shape, cliffs: f64, kind: Kind, seed: u64) -> Self {
        let mut draws = Draws::of(seed, 3);
        let landmark = landmark(shape, cliffs, kind, &mut draws);
        let door = door(shape, cliffs, kind, &mut draws, landmark.map(|(point, _)| point));
        let spawns = spawns(shape, cliffs);
        let facing = (shape.landing + PI).rem_euclid(TAU);
        let anchorage = shape.anchorage();
        // The guards camp by what they guard, so the room's one baked square holds every post.
        let camp = landmark.map(|(point, _)| {
            let toward = bearing_of([-point[0], -point[1]])
                + draws.between(1.0, 2.2) * if draws.unit() < 0.5 { -1.0 } else { 1.0 };
            let [x, y] = way(toward);
            let point = [point[0] + x * 28.0, point[1] + y * 28.0];
            let level = shape.height(point, cliffs);
            shape.pads.push(Pad { at: point, radius: 7.0, level, ease: 6.0 });
            point
        });
        let mut guards = Vec::new();
        if let Some((point, _)) = landmark {
            guards.extend(
                [at(draws.between(0.0, TAU), 12.0), at(draws.between(0.0, TAU), 18.0)]
                    .map(|[x, y]| [point[0] + x, point[1] + y]),
            );
            guards.push(door.at);
        }
        guards.extend(camp);
        let mut kept: Vec<[f64; 2]> = spawns.clone();
        kept.push(door.at);
        kept.extend(camp);
        let wrecks = wrecks(shape, cliffs, kind, &mut draws, &kept);
        Sites { spawns, facing, anchorage, door, landmark, guards, camp, wrecks }
    }

    /// The places the dressing keeps clear, and how far round each: the beach's spawns and the way from them to the
    /// door, the door's front, the landmark's pad, the camp and each wreck.
    #[must_use]
    pub fn clear(&self, shape: &Shape) -> Vec<([f64; 2], f64)> {
        let mut clear: Vec<([f64; 2], f64)> = self.spawns.iter().map(|&spawn| (spawn, 7.0)).collect();
        let (from, to) = (self.spawns[1], self.door.at);
        let steps = (distance(from, to) / 4.0).ceil().max(1.0);
        for step in 0..=steps as usize {
            let along = step as f64 / steps;
            clear.push(([from[0] + (to[0] - from[0]) * along, from[1] + (to[1] - from[1]) * along], 2.5));
        }
        let front = way(self.door.facing);
        clear.push(([self.door.at[0] + front[0] * 4.0, self.door.at[1] + front[1] * 4.0], 5.0));
        if let Some((point, _)) = self.landmark {
            clear.push((point, if shape.quarry.is_some() { 9.0 } else { 18.0 }));
        }
        if let Some(quarry) = shape.quarry {
            clear.push((quarry.at, quarry.radius));
        }
        clear.extend(self.camp.map(|camp| (camp, 9.0)));
        clear.extend(self.wrecks.iter().map(|wreck| (wreck.at, 8.0)));
        clear
    }

    /// The section's ring: the coast on 64 bearings, out into the shallows.
    #[must_use]
    pub fn ring(shape: &Shape) -> Vec<[f64; 2]> {
        shape.ring(64, SHALLOWS_M)
    }
}
