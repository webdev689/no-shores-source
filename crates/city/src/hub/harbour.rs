//! The harbour way, as the Tower's walk ran down to the Hangar where ships landed: from the Stair Yard down the city's
//! switchback on the platform's wall and the harbour avenue's ramps (`ramps`), terrace by terrace, to the flight onto
//! the quay and the pier. The hub takes in the avenue's cells, walls them where a neighbour stands level with them, and
//! keeps the Harbourmaster's office and the chandlery either side of the flight's head.

use super::{Laid, ring, stand_at};
use crate::Use;
use crate::courtyard::Frame;
use crate::grid::{Grid, SIDE_CELLS, index};
use crate::ramps::{Piece, Ramp};
use crate::social::Social;
use crate::solids::{Material, Shape, Solid};
use crate::stations::StationKind;
use crate::terraces::Footing;
use crate::walls::QUAY_TOP_M;

/// Below this a neighbour stands level with a cell of the way, and no retaining wall guards their edge, metres.
const LEVEL_WITHIN_M: f64 = 0.3;
/// A low wall along such an edge: its thickness and its height over the way.
const LOW_WALL_M: [f64; 2] = [0.8, 1.1];
/// How far either side of the flight's head the office and the chandlery stand, and back from it, metres.
const BESIDE_FLIGHT_M: [f64; 2] = [14.0, 4.0];
/// How far round the flight's foot and the pier's root the quay is walked, metres.
const QUAY_REACH_M: f64 = 6.0;
/// How far in from the pier's end its head is, metres.
const PIER_HEAD_IN_M: f64 = 6.0;

/// What the harbour way is laid from: the city's grid, cells and their uses, the harbour avenue's cells, every ramp,
/// the works (the pier among them), and the piers' roots on the quay.
#[derive(Debug)]
pub struct Harboured<'a> {
    pub grid: &'a Grid,
    pub footings: &'a [Footing],
    pub uses: &'a [Use],
    pub avenue: &'a [(usize, usize)],
    pub ramps: &'a [Ramp],
    pub works: &'a [Solid],
    pub roots: &'a [[f64; 2]],
}

fn holds([west, north, east, south]: [f64; 4], [x, y]: [f64; 2]) -> bool {
    x >= west && x <= east && y >= north && y <= south
}

/// The harbour way's ramps: every one with an end in one of the avenue's cells, in the city's order.
pub fn ramps_of<'a>(way: &Harboured<'a>) -> Vec<&'a Ramp> {
    let cells: Vec<[f64; 4]> = way.avenue.iter().map(|&(column, row)| way.grid.bounds(column, row)).collect();
    way.ramps
        .iter()
        .filter(|ramp| ramp.line.iter().any(|&[x, y, _]| cells.iter().any(|&cell| holds(cell, [x, y]))))
        .collect()
}

/// Lays the harbour way into the hub: its cells, flight, quay and pier into the ring; low walls where a neighbour
/// stands level; the office and the chandlery; Shape's places at the switchback's middle landing and the pier's head.
pub fn harbour(social: &mut Social, frame: &Frame, way: &Harboured<'_>) {
    let ramps = ramps_of(way);
    let mut rects = ring::platform_rects(frame);
    rects.extend(way.avenue.iter().map(|&(column, row)| way.grid.bounds(column, row)));
    let mut laid = Laid::default();
    let flight = ramps.iter().find(|ramp| (ramp.line[1][2] - QUAY_TOP_M).abs() < 0.01).copied();
    if let Some(flight) = flight {
        rects.push(flight.pad.bounds);
        let [top, foot] = flight.line;
        let root = way
            .roots
            .iter()
            .copied()
            .min_by(|one, two| distance(*one, [foot[0], foot[1]]).total_cmp(&distance(*two, [foot[0], foot[1]])));
        if let Some(root) = root {
            let reach = QUAY_REACH_M;
            rects.push([
                foot[0].min(root[0]) - reach,
                foot[1].min(root[1]) - reach,
                foot[0].max(root[0]) + reach,
                foot[1].max(root[1]) + reach,
            ]);
            if let Some(pier) = pier_at(way.works, root) {
                let [west, north, east, south, _, _] = pier.bounds();
                rects.push([west, north, east, south]);
                laid.spots.push(pier_head(pier, root));
            }
        }
        offices([top[0], top[1], top[2]], [foot[0] - top[0], foot[1] - top[1]], &mut laid);
    }
    let landings: Vec<&&Ramp> = ramps.iter().filter(|ramp| ramp.piece == Piece::Landing).collect();
    if let (Some(low), Some(high)) = (
        landings.iter().map(|ramp| ramp.pad.level).reduce(f64::min),
        landings.iter().map(|ramp| ramp.pad.level).reduce(f64::max),
    ) {
        let middle = f64::midpoint(low, high);
        if let Some(landing) =
            landings.iter().min_by(|one, two| (one.pad.level - middle).abs().total_cmp(&(two.pad.level - middle).abs()))
        {
            let [west, north, east, south] = landing.pad.bounds;
            laid.spots.push([f64::midpoint(west, east), f64::midpoint(north, south)]);
        }
    }
    laid.solids.extend(low_walls(way));
    social.ring = ring::outline(&rects);
    social.solids.extend(laid.solids);
    social.stations.extend(laid.stations);
    social.visitor_spots.extend(laid.spots);
}

fn distance(one: [f64; 2], two: [f64; 2]) -> f64 {
    (one[0] - two[0]).hypot(one[1] - two[1])
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

/// The Harbourmaster's office and the chandlery either side of the flight's head, facing each other across it, with
/// crates and lamp posts by them.
fn offices(top: [f64; 3], down: [f64; 2], laid: &mut Laid) {
    let length = down[0].hypot(down[1]).max(1e-9);
    let seaward = [down[0] / length, down[1] / length];
    let across = [-seaward[1], seaward[0]];
    let [beside, back] = BESIDE_FLIGHT_M;
    let at = |side: f64, behind: f64| {
        [top[0] + across[0] * side - seaward[0] * behind, top[1] + across[1] * side - seaward[1] * behind]
    };
    let toward = |side: f64| [across[0] * -side.signum(), across[1] * -side.signum()];
    let office = stand_at("stall-harbourmaster", "counter", at(-beside, back), top[2], toward(-beside));
    laid.stall(StationKind::Harbourmaster, office);
    let chandlery = stand_at("stall-chandler", "counter", at(beside, back), top[2], toward(beside));
    laid.stall(StationKind::Chandler, chandlery);
    laid.piece(stand_at("crates-barrels", "front", at(-beside, back + 9.0), top[2], seaward));
    for side in [-1.0, 1.0] {
        laid.piece(stand_at("lamp-post", "front", at(side * 8.0, 1.5), top[2], seaward));
    }
}

/// A low wall along every edge of the way's cells where the neighbour is no cell of the way and stands level with it,
/// so nothing guards the edge (a retaining wall stands where they stand apart).
fn low_walls(way: &Harboured<'_>) -> Vec<Solid> {
    let mut walls = Vec::new();
    let level_of = |column: usize, row: usize| match way.footings[index(column, row)] {
        Footing::Level { level } => Some(level),
        _ => None,
    };
    for &(column, row) in way.avenue {
        let Some(level) = level_of(column, row) else { continue };
        let [west, north, east, south] = way.grid.bounds(column, row);
        let sides: [((isize, isize), [f64; 2], [f64; 2]); 4] = [
            ((0, -1), [west, north], [east, north]),
            ((1, 0), [east, north], [east, south]),
            ((0, 1), [west, south], [east, south]),
            ((-1, 0), [west, north], [west, south]),
        ];
        for ((step_column, step_row), from, to) in sides {
            let (Some(next_column), Some(next_row)) =
                (column.checked_add_signed(step_column), row.checked_add_signed(step_row))
            else {
                continue;
            };
            if next_column >= SIDE_CELLS || next_row >= SIDE_CELLS || way.avenue.contains(&(next_column, next_row)) {
                continue;
            }
            if way.uses[index(next_column, next_row)] == Use::Landmark {
                continue;
            }
            let Some(beyond) = level_of(next_column, next_row) else { continue };
            if (beyond - level).abs() >= LEVEL_WITHIN_M {
                continue;
            }
            let [thick, high] = LOW_WALL_M;
            let middle = [f64::midpoint(from[0], to[0]), f64::midpoint(from[1], to[1])];
            let size = [(to[0] - from[0]).abs().max(thick), (to[1] - from[1]).abs().max(thick), high + 0.5];
            walls.push(Solid::upright(Shape::Block, [middle[0], middle[1], level - 0.5], size, Material::Stone));
        }
    }
    walls
}
