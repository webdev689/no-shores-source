//! Stages F and G: the city's wall along its footprint where the land holds it, with towers and gatehouses; its
//! harbour's quay and piers along the shore; and the retaining walls between its terraces and the ground round them.

use crate::footprint::{Footprint, RAYS, Stop};
use crate::grid::{CELL_M, Grid, SIDE_CELLS, index};
use crate::landmarks::{ahead, column, turn_toward};
use crate::ruins;
use crate::solids::{Material, Shape, Solid};
use crate::terraces::Footing;
use land::ground::Ground;

/// The wall's height and thickness, its longest piece, and a tower every so many pieces, metres.
pub const WALL_HEIGHT_M: f64 = 16.0;
pub const WALL_THICK_M: f64 = 6.0;
const PIECE_M: f64 = 30.0;
const PIECES_PER_TOWER: usize = 6;
/// How far a wall's foot is sunk into the ground, so a slope never shows under it, metres.
const SINK_M: f64 = 2.0;
/// Below this difference a terrace meets the ground without a wall, metres.
const LEAST_RETAIN_M: f64 = 0.3;
/// A raised terrace's parapet over its edge, metres.
const PARAPET_M: f64 = 1.0;
/// A ruined wall is breached at one piece in this many; a breach's heap stands this high, metres; and a broken
/// pier keeps this share of its length from the shore.
const BREACH_EVERY: usize = 3;
const HEAP_M: f64 = 4.5;
const BROKEN_PIER_KEPT: f64 = 0.4;

fn ray_end(footprint: &Footprint, ray: usize) -> [f64; 2] {
    let at = footprint.rays[ray % RAYS];
    ahead(footprint.centre, at.direction, at.reach)
}

/// The wall round the city: a piece every 30 m or less between each pair of rays the land holds, its foot on the
/// ground, a round tower every sixth piece and a gatehouse on each gate's ray. A ruined city's wall is breached at
/// one piece in three and at every gate, each breach's stones heaped below it, and its towers stand half as high,
/// roofless.
#[must_use]
pub fn city_wall(ground: &Ground, footprint: &Footprint, gates: &[usize], ruined: bool) -> Vec<Solid> {
    let mut solids = Vec::new();
    let mut pieces = 0;
    for ray in 0..RAYS {
        let (here, next) = (footprint.rays[ray], footprint.rays[(ray + 1) % RAYS]);
        if matches!(here.stop, Stop::Shore | Stop::Lake) || matches!(next.stop, Stop::Shore | Stop::Lake) {
            continue;
        }
        let (from, to) = (ray_end(footprint, ray), ray_end(footprint, ray + 1));
        let (east, south) = (to[0] - from[0], to[1] - from[1]);
        let length = (east * east + south * south).sqrt();
        if length < 1.0 {
            continue;
        }
        let along = [east / length, south / length];
        let count = (length / PIECE_M).ceil().max(1.0) as usize;
        for piece in 0..count {
            let middle = ahead(from, along, (piece as f64 + 0.5) * length / count as f64);
            let foot = ground.height_at(middle[0], middle[1]) - SINK_M;
            let size = [WALL_THICK_M, length / count as f64 + 0.5, WALL_HEIGHT_M + SINK_M];
            if ruined && pieces % BREACH_EVERY == 1 {
                let fallen = [WALL_THICK_M * 2.5, size[1], HEAP_M];
                solids.push(ruins::heap([middle[0], middle[1], foot + SINK_M], fallen, turn_toward(along)));
            } else {
                solids.push(
                    Solid::upright(Shape::Block, [middle[0], middle[1], foot], size, Material::Stone)
                        .turned(turn_toward(along)),
                );
            }
            pieces += 1;
            if pieces % PIECES_PER_TOWER == 0 {
                let base = ground.height_at(middle[0], middle[1]) - SINK_M;
                let height = WALL_HEIGHT_M + 8.0 + SINK_M;
                if ruined {
                    solids.push(column(middle, base, 16.0, height / 2.0, 1.0, Material::Stone));
                } else {
                    solids.push(column(middle, base, 16.0, height, 1.0, Material::Stone));
                    solids.push(column(middle, base + height, 19.0, 9.0, 0.0, Material::Roof));
                }
            }
        }
    }
    for &gate in gates {
        let at = ray_end(footprint, gate);
        let outward = footprint.rays[gate].direction;
        let across = [-outward[1], outward[0]];
        let foot = ground.height_at(at[0], at[1]) - SINK_M;
        let height = WALL_HEIGHT_M + 12.0 + SINK_M;
        for side in [-1.0, 1.0] {
            let tower = ahead(at, across, side * 14.0);
            if ruined {
                solids.push(column(tower, foot, 14.0, height / 2.0, 1.0, Material::Stone));
            } else {
                solids.push(column(tower, foot, 14.0, height, 1.0, Material::Stone));
                solids.push(column(tower, foot + height, 17.0, 10.0, 0.0, Material::Roof));
            }
        }
        if ruined {
            solids.push(ruins::heap(
                [at[0], at[1], foot + SINK_M],
                [16.0, WALL_THICK_M * 2.5, HEAP_M],
                turn_toward(across),
            ));
            continue;
        }
        let arch = Solid::upright(
            Shape::Arch { opening: 0.6 },
            [at[0], at[1], foot],
            [16.0, 10.0, WALL_HEIGHT_M + 4.0 + SINK_M],
            Material::Trim,
        );
        solids.push(arch.turned(turn_toward(across)));
    }
    solids
}

/// The harbour: a quay along the shore rays' ends, and a pier out to sea from every third of them, longer at the
/// harbour's middle. A ruined harbour's piers are broken off near the shore.
#[must_use]
pub fn harbour_works(footprint: &Footprint, ruined: bool) -> Vec<Solid> {
    let shore: Vec<usize> = (0..RAYS).filter(|&ray| footprint.rays[ray].stop == Stop::Shore).collect();
    let mut solids = Vec::new();
    for pair in shore.windows(2).filter(|pair| pair[1] == pair[0] + 1) {
        let (from, to) = (ray_end(footprint, pair[0]), ray_end(footprint, pair[1]));
        let (east, south) = (to[0] - from[0], to[1] - from[1]);
        let length = (east * east + south * south).sqrt();
        if length < 1.0 {
            continue;
        }
        let middle = [(from[0] + to[0]) / 2.0, (from[1] + to[1]) / 2.0];
        let quay =
            Solid::upright(Shape::Block, [middle[0], middle[1], -4.0], [8.0, length + 4.0, 7.0], Material::Stone);
        solids.push(quay.turned(turn_toward([east / length, south / length])));
    }
    for (place, &ray) in shore.iter().enumerate().filter(|(place, _)| place % 3 == 1) {
        let direction = footprint.rays[ray].direction;
        let middle_share = 1.0 - (place as f64 / shore.len().max(1) as f64 - 0.5).abs() * 2.0;
        let length = (120.0 + 140.0 * middle_share) * if ruined { BROKEN_PIER_KEPT } else { 1.0 };
        let middle = ahead(ray_end(footprint, ray), direction, length / 2.0);
        let pier = Solid::upright(Shape::Block, [middle[0], middle[1], -5.0], [10.0, length, 7.0], Material::Timber);
        solids.push(pier.turned(turn_toward(direction)));
    }
    solids
}

/// A retaining wall on every built cell's edge whose level stands apart from the ground or terrace beyond it, from
/// the lower side's foot to the higher's, with a parapet where the cell is the higher.
#[must_use]
pub fn retaining_walls(ground: &Ground, grid: &Grid, footings: &[Footing]) -> Vec<Solid> {
    let mut solids = Vec::new();
    let level_of = |column: usize, row: usize| match footings[index(column, row)] {
        Footing::Level { level } => Some(level),
        _ => None,
    };
    for row in 0..SIDE_CELLS {
        for column in 0..SIDE_CELLS {
            let Some(level) = level_of(column, row) else { continue };
            let [west, north, east, south] = grid.bounds(column, row);
            let edges: [((isize, isize), [f64; 2], bool); 4] = [
                ((0, -1), [(west + east) / 2.0, north], true),
                ((0, 1), [(west + east) / 2.0, south], true),
                ((-1, 0), [west, (north + south) / 2.0], false),
                ((1, 0), [east, (north + south) / 2.0], false),
            ];
            for ((step_east, step_south), middle, along_x) in edges {
                let beyond = column.checked_add_signed(step_east).zip(row.checked_add_signed(step_south));
                let neighbour =
                    beyond.filter(|&(next_column, next_row)| next_column < SIDE_CELLS && next_row < SIDE_CELLS);
                let other = match neighbour.and_then(|(next_column, next_row)| level_of(next_column, next_row)) {
                    // Between two terraces the higher one builds the wall, once.
                    Some(other) if other >= level => continue,
                    Some(other) => other,
                    None => {
                        let out = [middle[0] + step_east as f64 * 3.0, middle[1] + step_south as f64 * 3.0];
                        ground.height_at(out[0], out[1])
                    }
                };
                if (level - other).abs() < LEAST_RETAIN_M {
                    continue;
                }
                let (bottom, top) =
                    (level.min(other) - SINK_M, level.max(other) + if level > other { PARAPET_M } else { 0.0 });
                let size = if along_x { [CELL_M, 1.2, top - bottom] } else { [1.2, CELL_M, top - bottom] };
                solids.push(Solid::upright(Shape::Block, [middle[0], middle[1], bottom], size, Material::Stone));
            }
        }
    }
    solids
}
