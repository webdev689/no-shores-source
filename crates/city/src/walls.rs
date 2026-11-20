//! Stages F and G: the city's wall along its footprint where the land holds it, with towers and gatehouses; its
//! harbour's quay and piers along the shore; and the retaining walls between its terraces and the ground round them,
//! cut where a ramp crosses.

use crate::footprint::{Footprint, RAYS, Stop};
use crate::grid::{CELL_M, Grid, SIDE_CELLS, index};
use crate::landmarks::{ahead, column, turn_toward};
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
/// The quay's top and the piers' over the sea, one level so a pier's root runs onto the quay, and their feet, metres.
pub const QUAY_TOP_M: f64 = 3.0;
const QUAY_FOOT_M: f64 = -4.0;
const PIER_FOOT_M: f64 = -5.0;
/// A pier's width, metres.
pub const PIER_M: f64 = 10.0;

fn ray_end(footprint: &Footprint, ray: usize) -> [f64; 2] {
    let at = footprint.rays[ray % RAYS];
    ahead(footprint.centre, at.direction, at.reach)
}

/// The wall round the city: a piece every 30 m or less between each pair of rays the land holds, its foot on the
/// ground, a round tower every sixth piece and a gatehouse on each gate's ray.
#[must_use]
pub fn city_wall(ground: &Ground, footprint: &Footprint, gates: &[usize]) -> Vec<Solid> {
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
            let each = length / count as f64 + 0.5;
            // Footed on the lowest ground along it, and as much taller as the ground rises, so on a slope its
            // underside never stands off the ground for a body to walk under, and its top keeps its height.
            let (low, high) = lowest_and_highest(
                ground,
                &[ahead(middle, along, -each / 2.0), middle, ahead(middle, along, each / 2.0)],
            );
            let size = [WALL_THICK_M, each, WALL_HEIGHT_M + SINK_M + (high - low)];
            solids.push(
                Solid::upright(Shape::Block, [middle[0], middle[1], low - SINK_M], size, Material::Stone)
                    .turned(turn_toward(along)),
            );
            pieces += 1;
            if pieces % PIECES_PER_TOWER == 0 {
                let (low, high) = lowest_and_highest(ground, &round(middle, 8.0));
                let tall = WALL_HEIGHT_M + 8.0 + SINK_M + (high - low);
                solids.push(column(middle, low - SINK_M, 16.0, tall, 1.0, Material::Stone));
                solids.push(column(middle, low - SINK_M + tall, 19.0, 9.0, 0.0, Material::Roof));
            }
        }
    }
    for &gate in gates {
        let at = ray_end(footprint, gate);
        let outward = footprint.rays[gate].direction;
        let across = [-outward[1], outward[0]];
        // The gatehouse and its towers on the lowest ground under them, as the wall's pieces are.
        let spots: Vec<[f64; 2]> =
            [-1.0, 1.0].iter().flat_map(|&side| round(ahead(at, across, side * 14.0), 7.0)).collect();
        let (low, high) = lowest_and_highest(ground, &spots);
        let foot = low - SINK_M;
        for side in [-1.0, 1.0] {
            let tower = ahead(at, across, side * 14.0);
            let tall = WALL_HEIGHT_M + 12.0 + SINK_M + (high - low);
            solids.push(column(tower, foot, 14.0, tall, 1.0, Material::Stone));
            solids.push(column(tower, foot + tall, 17.0, 10.0, 0.0, Material::Roof));
        }
        let arch = Solid::upright(
            Shape::Arch { opening: 0.6 },
            [at[0], at[1], foot],
            [16.0, 10.0, WALL_HEIGHT_M + 4.0 + SINK_M + (high - low)],
            Material::Trim,
        );
        solids.push(arch.turned(turn_toward(across)));
    }
    solids
}

/// The lowest and the highest the ground stands at a few points.
fn lowest_and_highest(ground: &Ground, points: &[[f64; 2]]) -> (f64, f64) {
    points
        .iter()
        .map(|&[x, y]| ground.height_at(x, y))
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), each| (low.min(each), high.max(each)))
}

/// A round foot's middle and four points on its edge, `reach` metres out.
fn round(middle: [f64; 2], reach: f64) -> [[f64; 2]; 5] {
    [
        middle,
        [middle[0] + reach, middle[1]],
        [middle[0] - reach, middle[1]],
        [middle[0], middle[1] + reach],
        [middle[0], middle[1] - reach],
    ]
}

/// The harbour: a quay along the shore rays' ends, and a pier out to sea from every third of them, longer at the
/// harbour's middle.
#[must_use]
pub fn harbour_works(footprint: &Footprint) -> Vec<Solid> {
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
        let size = [8.0, length + 4.0, QUAY_TOP_M - QUAY_FOOT_M];
        let quay = Solid::upright(Shape::Block, [middle[0], middle[1], QUAY_FOOT_M], size, Material::Stone);
        solids.push(quay.turned(turn_toward([east / length, south / length])));
    }
    for (place, ray) in pier_rays(footprint) {
        let direction = footprint.rays[ray].direction;
        let middle_share = 1.0 - (place as f64 / shore.len().max(1) as f64 - 0.5).abs() * 2.0;
        let length = 120.0 + 140.0 * middle_share;
        let middle = ahead(ray_end(footprint, ray), direction, length / 2.0);
        let size = [PIER_M, length, QUAY_TOP_M - PIER_FOOT_M];
        let pier = Solid::upright(Shape::Block, [middle[0], middle[1], PIER_FOOT_M], size, Material::Timber);
        solids.push(pier.turned(turn_toward(direction)));
    }
    solids
}

/// The shore's rays a pier runs out from (every third), each with its place among the shore's rays.
fn pier_rays(footprint: &Footprint) -> Vec<(usize, usize)> {
    let shore = (0..RAYS).filter(|&ray| footprint.rays[ray].stop == Stop::Shore);
    shore.enumerate().filter(|(place, _)| place % 3 == 1).collect()
}

/// Points every metre along the quay's middle, between each pair of shore rays it joins.
#[must_use]
pub fn quay_points(footprint: &Footprint) -> Vec<[f64; 2]> {
    let shore: Vec<usize> = (0..RAYS).filter(|&ray| footprint.rays[ray].stop == Stop::Shore).collect();
    let mut points = Vec::new();
    for pair in shore.windows(2).filter(|pair| pair[1] == pair[0] + 1) {
        let (from, to) = (ray_end(footprint, pair[0]), ray_end(footprint, pair[1]));
        let length = ((to[0] - from[0]) * (to[0] - from[0]) + (to[1] - from[1]) * (to[1] - from[1])).sqrt();
        let count = length.ceil() as usize;
        points.extend((0..=count).map(|step| {
            let share = step as f64 / count.max(1) as f64;
            [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share]
        }));
    }
    points
}

/// Where each pier meets the quay: on the quay's line along the shore.
#[must_use]
pub fn pier_roots(footprint: &Footprint) -> Vec<[f64; 2]> {
    pier_rays(footprint).into_iter().map(|(_, ray)| ray_end(footprint, ray)).collect()
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

/// A cut in a terrace's retaining wall where a ramp crosses it: the wall on the cell edge whose middle is `middle`
/// (running north and south when `north_south`) is taken down over `span` (world metres along it, the lower first) to
/// `top`, or wholly where `top` is None.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Cut {
    pub middle: [f64; 2],
    pub north_south: bool,
    pub span: [f64; 2],
    pub top: Option<f64>,
}

/// The walls with every cut made: a wall on a cut's edge is split round its span, the part within it lowered to the
/// cut's top or left out. Walls off every cut's edge are kept as they are.
#[must_use]
pub fn cut(walls: Vec<Solid>, cuts: &[Cut]) -> Vec<Solid> {
    let mut walls = walls;
    for cut in cuts {
        let (along, across) = if cut.north_south { (1, 0) } else { (0, 1) };
        let mut kept = Vec::with_capacity(walls.len() + 2);
        for wall in walls {
            let on_edge = wall.turn == 0.0
                && wall.lean == 0.0
                && wall.size[across] < 2.0
                && (wall.at[across] - cut.middle[across]).abs() < 1e-6
                && (wall.at[along] - cut.middle[along]).abs() < CELL_M / 2.0;
            let (from, to) = (wall.at[along] - wall.size[along] / 2.0, wall.at[along] + wall.size[along] / 2.0);
            if !on_edge || to <= cut.span[0] || from >= cut.span[1] {
                kept.push(wall);
                continue;
            }
            let piece = |start: f64, end: f64, top: f64| {
                let mut piece = wall;
                piece.at[along] = (start + end) / 2.0;
                piece.size[along] = end - start;
                piece.size[2] = top - wall.at[2];
                piece
            };
            let top = wall.at[2] + wall.size[2];
            if from < cut.span[0] {
                kept.push(piece(from, cut.span[0], top));
            }
            if let Some(lowered) = cut.top.filter(|&lowered| lowered > wall.at[2]) {
                kept.push(piece(cut.span[0].max(from), cut.span[1].min(to), lowered.min(top)));
            }
            if to > cut.span[1] {
                kept.push(piece(cut.span[1], to, top));
            }
        }
        walls = kept;
    }
    walls
}
