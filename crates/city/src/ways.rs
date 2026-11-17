//! Stage B, World 2.0's ways in: gates where the wall meets the best ground inland, the harbour where the shore is
//! nearest, and an avenue from each to the landmark, found over the cells as its main roads are, cheapest where the
//! terraces step least.

use crate::footprint::{Footprint, RAYS, Stop, slope_at};
use crate::grid::{CELL_M, Grid, REACH_CELLS, SIDE_CELLS, index, neighbours};
use crate::terraces::Footing;
use land::exact::rand01;
use land::ground::Ground;
use std::cmp::Reverse;
use std::collections::BinaryHeap;

/// The most gates a city's wall has, and the fewest rays between two.
pub const GATES: usize = 5;
const GATE_SPACING: usize = RAYS / (GATES + 1);

/// The gates' rays, best first: long reach, gentle ground at the wall, never on the shore, spaced round the wall.
#[must_use]
pub fn gate_rays(ground: &Ground, footprint: &Footprint, seed: u32) -> Vec<usize> {
    let radius = footprint.rays.iter().map(|ray| ray.reach).fold(1.0, f64::max);
    let score = |ray: usize| {
        let at = footprint.rays[ray];
        let end = [footprint.centre[0] + at.direction[0] * at.reach, footprint.centre[1] + at.direction[1] * at.reach];
        at.reach / radius - 2.0 * slope_at(ground, end[0], end[1]) + 0.3 * rand01(seed, &[2, ray as i64])
            - if at.stop == Stop::Steep { 0.5 } else { 0.0 }
    };
    let mut order: Vec<usize> =
        (0..RAYS).filter(|&ray| matches!(footprint.rays[ray].stop, Stop::Reach | Stop::Steep)).collect();
    order.sort_by(|&first, &second| score(second).total_cmp(&score(first)).then(first.cmp(&second)));
    let mut gates: Vec<usize> = Vec::new();
    for ray in order {
        let apart = gates.iter().all(|&gate| {
            let gap = ray.abs_diff(gate);
            gap.min(RAYS - gap) >= GATE_SPACING
        });
        if apart && gates.len() < GATES {
            gates.push(ray);
        }
    }
    gates
}

/// The harbour: where the nearest shore stops a ray, or None for a city with no shore.
#[must_use]
pub fn harbour(footprint: &Footprint) -> Option<[f64; 2]> {
    let ray = footprint
        .rays
        .iter()
        .filter(|ray| ray.stop == Stop::Shore)
        .min_by(|first, second| first.reach.total_cmp(&second.reach))?;
    Some([footprint.centre[0] + ray.direction[0] * ray.reach, footprint.centre[1] + ray.direction[1] * ray.reach])
}

/// The built cell nearest a point, if any is within three cells.
#[must_use]
pub fn built_cell_near(grid: &Grid, footings: &[Footing], point: [f64; 2]) -> Option<(usize, usize)> {
    let mut best: Option<(f64, (usize, usize))> = None;
    for row in 0..SIDE_CELLS {
        for column in 0..SIDE_CELLS {
            if !matches!(footings[index(column, row)], Footing::Level { .. }) {
                continue;
            }
            let centre = grid.centre(column, row);
            let (east, south) = (centre[0] - point[0], centre[1] - point[1]);
            let distance = east * east + south * south;
            if distance <= (3.0 * CELL_M) * (3.0 * CELL_M) && best.is_none_or(|(nearest, _)| distance < nearest) {
                best = Some((distance, (column, row)));
            }
        }
    }
    best.map(|(_, cell)| cell)
}

/// An avenue's cells from `start` to the middle cell, cheapest where the terraces step least; only built cells are
/// crossed. None when no way joins them.
#[must_use]
pub fn avenue(footings: &[Footing], start: (usize, usize)) -> Option<Vec<(usize, usize)>> {
    let goal = (REACH_CELLS, REACH_CELLS);
    let level = |cell: (usize, usize)| match footings[index(cell.0, cell.1)] {
        Footing::Level { level } => Some(level),
        _ => None,
    };
    level(start)?;
    let mut cost = vec![u64::MAX; SIDE_CELLS * SIDE_CELLS];
    let mut came = vec![usize::MAX; SIDE_CELLS * SIDE_CELLS];
    let mut open = BinaryHeap::new();
    cost[index(start.0, start.1)] = 0;
    open.push(Reverse((0_u64, index(start.0, start.1))));
    while let Some(Reverse((spent, at))) = open.pop() {
        if spent > cost[at] {
            continue;
        }
        let cell = (at % SIDE_CELLS, at / SIDE_CELLS);
        if cell == goal {
            let mut path = vec![cell];
            let mut back = at;
            while came[back] != usize::MAX {
                back = came[back];
                path.push((back % SIDE_CELLS, back / SIDE_CELLS));
            }
            path.reverse();
            return Some(path);
        }
        let here = level(cell).unwrap_or(0.0);
        for next in neighbours(cell.0, cell.1) {
            // The middle cell is the landmark's: reached whatever its footing.
            let Some(there) = level(next).or((next == goal).then_some(here)) else { continue };
            let rise = (there - here) / CELL_M;
            let step = 1000 + (40_000.0 * rise * rise) as u64;
            let total = spent + step;
            let next_at = index(next.0, next.1);
            if total < cost[next_at] {
                cost[next_at] = total;
                came[next_at] = at;
                open.push(Reverse((total, next_at)));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat() -> Vec<Footing> {
        vec![Footing::Level { level: 10.0 }; SIDE_CELLS * SIDE_CELLS]
    }

    #[test]
    fn an_avenue_runs_straight_over_flat_ground() {
        let path = avenue(&flat(), (REACH_CELLS, REACH_CELLS - 6)).unwrap();
        assert_eq!(path.len(), 7);
        assert_eq!(*path.last().unwrap(), (REACH_CELLS, REACH_CELLS));
    }

    #[test]
    fn an_avenue_goes_round_unbuilt_ground() {
        let mut footings = flat();
        for column in REACH_CELLS - 3..=REACH_CELLS + 3 {
            footings[index(column, REACH_CELLS - 3)] = Footing::Steep;
        }
        let path = avenue(&footings, (REACH_CELLS, REACH_CELLS - 6)).unwrap();
        assert!(path.iter().all(|&(column, row)| matches!(footings[index(column, row)], Footing::Level { .. })));
        assert!(path.len() > 7);
    }

    #[test]
    fn no_avenue_crosses_a_wall_of_shore() {
        let mut footings = flat();
        for column in 0..SIDE_CELLS {
            footings[index(column, REACH_CELLS - 3)] = Footing::Shore;
        }
        assert!(avenue(&footings, (REACH_CELLS, REACH_CELLS - 6)).is_none());
    }
}
