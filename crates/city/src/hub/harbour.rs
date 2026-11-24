//! The harbour below the hub, as the Tower looked down on the Hangar where ships landed: the city's switchback on the
//! platform's wall and the harbour avenue's ramps run down to the quay and the pier, where two ships lie moored at
//! their posts. The way is sealed at its head (`walks`), so all of it is seen from the hub and none of it walked.

use super::{Laid, stand_at};
use crate::grid::Grid;
use crate::ramps::Ramp;
use crate::social::Social;
use crate::solids::{Material, Shape, Solid};
use crate::walls::{PIER_M, QUAY_TOP_M};

/// How far in from the pier's end its head is, metres.
const PIER_HEAD_IN_M: f64 = 6.0;
/// Ships moored either side of the pier: how far their middles lie from its middle line, and how far out along it
/// from its root, as shares of its length, metres.
const MOORED_OFF_M: f64 = 10.5;
const MOORED_ALONG: [f64; 2] = [0.45, 0.72];
/// How far in from the pier's edge a moored ship's mooring posts stand, metres.
const POSTS_IN_M: f64 = 0.8;

/// What the harbour is laid from: the city's grid, the harbour avenue's cells, every ramp, the works (the pier among
/// them), and the piers' roots on the quay.
#[derive(Debug)]
pub struct Harboured<'a> {
    pub grid: &'a Grid,
    pub avenue: &'a [(usize, usize)],
    pub ramps: &'a [Ramp],
    pub works: &'a [Solid],
    pub roots: &'a [[f64; 2]],
}

fn holds([west, north, east, south]: [f64; 4], [x, y]: [f64; 2]) -> bool {
    x >= west && x <= east && y >= north && y <= south
}

/// Moors two ships at the pier the harbour avenue's flight comes down to, with their mooring posts: the pier rooted
/// nearest the flight's foot on the quay.
pub fn harbour(social: &mut Social, way: &Harboured<'_>) {
    let cells: Vec<[f64; 4]> = way.avenue.iter().map(|&(column, row)| way.grid.bounds(column, row)).collect();
    let in_avenue = |ramp: &&Ramp| ramp.line.iter().any(|&[x, y, _]| cells.iter().any(|&cell| holds(cell, [x, y])));
    let flight = way.ramps.iter().filter(in_avenue).find(|ramp| (ramp.line[1][2] - QUAY_TOP_M).abs() < 0.01);
    let Some([_, foot]) = flight.map(|flight| flight.line) else { return };
    let foot = [foot[0], foot[1]];
    let nearest = |one: &[f64; 2], two: &[f64; 2]| distance(*one, foot).total_cmp(&distance(*two, foot));
    let Some(root) = way.roots.iter().copied().min_by(nearest) else { return };
    let Some(pier) = pier_at(way.works, root) else { return };
    let head = pier_head(pier, root);
    social.moorings = moorings(root, head);
    let mut laid = Laid::default();
    for (at, facing) in mooring_posts(root, head) {
        laid.piece(stand_at("bollards", "front", at, QUAY_TOP_M, facing));
    }
    social.solids.extend(laid.solids);
}

/// A ship either side of the pier, her bow toward the sea along it, the two staggered so both read from the quay.
fn moorings(root: [f64; 2], head: [f64; 2]) -> Vec<[f64; 3]> {
    let out = [head[0] - root[0], head[1] - root[1]];
    let length = libm::hypot(out[0], out[1]).max(1e-9);
    let (along, across) = ([out[0] / length, out[1] / length], [-out[1] / length, out[0] / length]);
    let bearing = libm::atan2(along[0], -along[1]);
    [(-1.0, MOORED_ALONG[0]), (1.0, MOORED_ALONG[1])]
        .into_iter()
        .map(|(side, share)| {
            let x = root[0] + along[0] * length * share + across[0] * side * MOORED_OFF_M;
            let y = root[1] + along[1] * length * share + across[1] * side * MOORED_OFF_M;
            [x, y, bearing]
        })
        .collect()
}

/// The mooring posts on the pier's edge beside each moored ship, their ropes out toward her: where each stands and the
/// way it faces.
fn mooring_posts(root: [f64; 2], head: [f64; 2]) -> Vec<([f64; 2], [f64; 2])> {
    let out = [head[0] - root[0], head[1] - root[1]];
    let length = libm::hypot(out[0], out[1]).max(1e-9);
    let (along, across) = ([out[0] / length, out[1] / length], [-out[1] / length, out[0] / length]);
    let from_middle = PIER_M / 2.0 - POSTS_IN_M;
    [(-1.0, MOORED_ALONG[0]), (1.0, MOORED_ALONG[1])]
        .into_iter()
        .map(|(side, share)| {
            let x = root[0] + along[0] * length * share + across[0] * side * from_middle;
            let y = root[1] + along[1] * length * share + across[1] * side * from_middle;
            ([x, y], [across[0] * side, across[1] * side])
        })
        .collect()
}

fn distance(one: [f64; 2], two: [f64; 2]) -> f64 {
    libm::hypot(one[0] - two[0], one[1] - two[1])
}

/// The pier rooted nearest `root`: the timber block of the works whose footprint holds it, or comes nearest.
fn pier_at(works: &[Solid], root: [f64; 2]) -> Option<&Solid> {
    let piers = works.iter().filter(|solid| solid.material == Material::Timber && solid.shape == Shape::Block);
    piers.min_by(|one, two| distance([one.at[0], one.at[1]], root).total_cmp(&distance([two.at[0], two.at[1]], root)))
}

/// The pier's head: on its middle line, `PIER_HEAD_IN_M` in from its end farther from its root.
fn pier_head(pier: &Solid, root: [f64; 2]) -> [f64; 2] {
    let reach = pier.size[1] / 2.0 - PIER_HEAD_IN_M;
    let ends = [pier.place([0.0, reach, 0.0]), pier.place([0.0, -reach, 0.0])];
    let [x, y, _] = if distance([ends[0][0], ends[0][1]], root) > distance([ends[1][0], ends[1][1]], root) {
        ends[0]
    } else {
        ends[1]
    };
    [x, y]
}
