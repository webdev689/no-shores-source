//! Links: where the movement rules carry a body between two floors that no step joins. Up a block's side, a body
//! walks into it and vaults, mantles or climbs it; off a block's edge, it walks on and drops. Each is tried by
//! stepping a body by the rules themselves, with the controls a foe crosses with, so a link is laid only where the
//! rules carry a body across, and it costs the time that takes.

use crate::collider::Collider;
use crate::compact::CompactField;
use crate::reach::REACH_LEVEL;
use movement::blocks::ground_at;
use movement::{Block, Body, Controls, Mode, TICK_SECONDS, TUNING, Terrain, standing, step_body};

/// How far apart links are tried along a block's side, and how far in from each end of the side the last stands, so
/// a body crossing there has the side's whole width beside it.
const SPACING: f64 = 1.0;
const END_MARGIN: f64 = 0.5;
/// A body walked up to a side stands this far past its radius from it; one about to drop, this far in from the edge.
const TOUCH_GAP: f64 = 0.05;
const EDGE_IN: f64 = 0.05;
/// Across, a body stands still this many ticks and must stay on its feet.
const STEADY_TICKS: u32 = 6;
/// A link's end is found on the floor within this many cells of where the rules set a body down.
const NEAR_CELLS: i64 = 2;

/// A walker within a run's tick of a link's start crosses it: no tick carries it past the start unseen.
pub const LINK_REACH: f64 = TUNING.run * TICK_SECONDS;

/// A link between two floors no step joins: where a walker starts across and where the rules set it down (x east,
/// y south, z up, metres); the bearing it faces across, square to a block's side; whether it presses jump to go over
/// (else it walks into the side and climbs it, or walks off the edge); and its cost, the metres a walk covers in the
/// time crossing takes.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Link {
    pub from: [f64; 3],
    pub to: [f64; 3],
    pub bearing: f64,
    pub jump: bool,
    pub cost: f64,
    /// A metre along the bearing, east and south: one axis is exactly 0.
    along: [f64; 2],
}

impl Link {
    /// The point a metre on from `point` along the link's bearing, exactly along its axis: a walker heading there
    /// walks square into the side, or off the edge.
    #[must_use]
    pub fn ahead_of(&self, point: [f64; 3]) -> [f64; 3] {
        [point[0] + self.along[0], point[1] + self.along[1], point[2]]
    }
}

/// One side of a block: the way out of it (a unit along one axis), where it stands across that axis, and how far it
/// runs along the other.
struct Side {
    out: [f64; 2],
    across: f64,
    low: f64,
    high: f64,
}

impl Side {
    /// The point `along` the side and `out` metres outside it (inside, for less than 0).
    fn at(&self, along: f64, out: f64) -> (f64, f64) {
        if self.out[0] == 0.0 {
            (along, self.across + self.out[1] * out)
        } else {
            (self.across + self.out[0] * out, along)
        }
    }

    /// Where links are tried along it: its middle, and every SPACING either way as far as END_MARGIN from its ends.
    fn stops(&self) -> impl Iterator<Item = f64> {
        let (middle, half) = ((self.low + self.high) / 2.0, (self.high - self.low) / 2.0);
        let each_way = if half < END_MARGIN { -1 } else { ((half - END_MARGIN) / SPACING).floor() as i64 };
        (-each_way..=each_way).map(move |step| middle + step as f64 * SPACING)
    }
}

/// A block's sides, north, east, south and west.
fn sides(block: &Block) -> [Side; 4] {
    let (along_x, along_y) = ((block.min_x, block.max_x), (block.min_y, block.max_y));
    [
        Side { out: [0.0, -1.0], across: block.min_y, low: along_x.0, high: along_x.1 },
        Side { out: [1.0, 0.0], across: block.max_x, low: along_y.0, high: along_y.1 },
        Side { out: [0.0, 1.0], across: block.max_y, low: along_x.0, high: along_x.1 },
        Side { out: [-1.0, 0.0], across: block.min_x, low: along_y.0, high: along_y.1 },
    ]
}

/// The bearing of a way east and south, clockwise from north, as a walker's routes measure it.
fn bearing_of(way: [f64; 2]) -> f64 {
    libm::atan2(way[0], -way[1])
}

/// The floor a body stands on at a point: the highest top over it, or the ground.
fn floor_at(blocks: &[Block], floor: &dyn Terrain, x: f64, y: f64) -> f64 {
    ground_at(blocks, floor, x, y, f64::INFINITY)
}

/// Every link the rules allow over a course's blocks, block by block, each side north to west, along it from its low
/// end: up it, then down off it. Ramps are not blocks the rules know, so no link is tried over one.
pub(crate) fn bake(colliders: &[Collider], floor: &dyn Terrain) -> Vec<Link> {
    let blocks: Vec<Block> = colliders
        .iter()
        .filter_map(|collider| if let Collider::Block(block) = collider { Some(*block) } else { None })
        .collect();
    let mut links = Vec::new();
    for block in &blocks {
        for side in sides(block) {
            for along in side.stops() {
                links.extend(up(&blocks, floor, block, &side, along));
                links.extend(down(&blocks, floor, block, &side, along));
            }
        }
    }
    links
}

/// Up a side from the floor beside it: going over with a jump, or climbing with none, whichever the rules carry a
/// body across sooner; tried from where a walker reaching the start stands nearest the side and farthest from it.
fn up(blocks: &[Block], floor: &dyn Terrain, block: &Block, side: &Side, along: f64) -> Option<Link> {
    let (x, y) = side.at(along, TUNING.radius + TOUCH_GAP);
    let z = floor_at(blocks, floor, x, y);
    if block.top - z <= TUNING.step {
        return None;
    }
    // Adding 0 folds -0 into 0, so the bearing is the one a walker's routes measure toward the side.
    let into = [-side.out[0] + 0.0, -side.out[1] + 0.0];
    let depth = if into[0] == 0.0 { block.max_y - block.min_y } else { block.max_x - block.min_x };
    let (back_x, back_y) = side.at(along, TUNING.radius + TOUCH_GAP + LINK_REACH);
    let back = [back_x, back_y, floor_at(blocks, floor, back_x, back_y)];
    let budget = budget(block.top - z);
    // Over: up onto a floor more than a step higher, or across the block to its far side.
    let over = |start: [f64; 3], end: [f64; 3]| {
        let gone = (end[0] - start[0]) * into[0] + (end[1] - start[1]) * into[1];
        end[2] > start[2] + TUNING.step || gone > depth + TUNING.radius
    };
    [true, false]
        .into_iter()
        .filter_map(|jump| {
            let (to, ticks) =
                crossed(blocks, floor, [x, y, z], into, jump, budget).filter(|(to, _)| over([x, y, z], *to))?;
            crossed(blocks, floor, back, into, jump, budget).filter(|(end, _)| over(back, *end))?;
            Some(made([x, y, z], to, into, jump, ticks))
        })
        .min_by(|one, other| one.cost.total_cmp(&other.cost))
}

/// Off the block's edge onto a floor more than a step lower, walked off from just inside it and from a run's tick
/// farther in.
fn down(blocks: &[Block], floor: &dyn Terrain, block: &Block, side: &Side, along: f64) -> Option<Link> {
    let (x, y) = side.at(along, -EDGE_IN);
    let (below_x, below_y) = side.at(along, TUNING.radius + TOUCH_GAP);
    // A taller block over the edge stands in the way; one beside it no more than a step down is walked onto.
    if floor_at(blocks, floor, x, y) != block.top
        || block.top - floor_at(blocks, floor, below_x, below_y) <= TUNING.step
    {
        return None;
    }
    let budget = budget(block.top - floor_at(blocks, floor, below_x, below_y));
    let fell = |end: [f64; 3]| end[2] < block.top - TUNING.step;
    let (to, ticks) = crossed(blocks, floor, [x, y, block.top], side.out, false, budget).filter(|(to, _)| fell(*to))?;
    let (back_x, back_y) = side.at(along, -EDGE_IN - LINK_REACH);
    crossed(blocks, floor, [back_x, back_y, block.top], side.out, false, budget).filter(|(end, _)| fell(*end))?;
    Some(made([x, y, block.top], to, side.out, false, ticks))
}

fn made(from: [f64; 3], to: [f64; 3], along: [f64; 2], jump: bool, ticks: u32) -> Link {
    let cost = f64::from(ticks) * TICK_SECONDS * TUNING.walk;
    Link { from, to, bearing: bearing_of(along), jump, cost, along }
}

/// The ticks a crossing may take: two seconds, and a climb's time up the whole rise.
fn budget(rise: f64) -> u32 {
    (60.0 * (2.0 + rise.abs() / TUNING.climb)).ceil() as u32
}

/// A body standing at `start` facing along `way`, stepped by the rules with a walker's controls across: walking on
/// along it, and pressing jump while it stands, if `jump`, until it leaves its feet. Answers where it stands once back
/// on them and steady, and the ticks that took; none within the budget.
fn crossed(
    blocks: &[Block],
    floor: &dyn Terrain,
    start: [f64; 3],
    way: [f64; 2],
    jump: bool,
    budget: u32,
) -> Option<([f64; 3], u32)> {
    let yaw = bearing_of(way);
    let mut body = Body { z: start[2], facing: yaw, ..standing(start[0], start[1]) };
    let mut left = false;
    for tick in 1..=budget {
        let controls = Controls { forward: 1.0, yaw, jump: jump && !left, ..Controls::default() };
        body = step_body(&body, &controls, blocks, floor, TICK_SECONDS);
        if body.mode != Mode::Ground {
            left = true;
        } else if left {
            return steady(blocks, floor, &body, yaw).then_some(([body.x, body.y, body.z], tick));
        }
    }
    None
}

/// Whether a body just set down stays on its feet, at its height, standing still a few ticks.
fn steady(blocks: &[Block], floor: &dyn Terrain, body: &Body, yaw: f64) -> bool {
    let still = Controls { yaw, ..Controls::default() };
    let mut stood = *body;
    (0..STEADY_TICKS).all(|_| {
        stood = step_body(&stood, &still, blocks, floor, TICK_SECONDS);
        stood.mode == Mode::Ground && (stood.z - body.z).abs() <= TUNING.step
    })
}

/// The walkable span nearest a point on its level, within two cells across, as (column, index): the floor a link's
/// end stands by, though the erosion trims it back from the side.
fn span_near(field: &CompactField, point: [f64; 3]) -> Option<(usize, usize)> {
    let grid = field.grid;
    let column_x = ((point[0] - grid.min_x) / grid.cell).floor() as i64;
    let column_y = ((point[1] - grid.min_y) / grid.cell).floor() as i64;
    let mut best: Option<((f64, f64), (usize, usize))> = None;
    for iy in (column_y - NEAR_CELLS).max(0)..=(column_y + NEAR_CELLS).min(grid.cells_y as i64 - 1) {
        for ix in (column_x - NEAR_CELLS).max(0)..=(column_x + NEAR_CELLS).min(grid.cells_x as i64 - 1) {
            let (ix, iy) = (ix as usize, iy as usize);
            let column = ix + iy * grid.cells_x;
            let (centre_x, centre_y) = grid.centre(ix, iy);
            let across = (centre_x - point[0]) * (centre_x - point[0]) + (centre_y - point[1]) * (centre_y - point[1]);
            for (index, span) in field.columns[column].iter().enumerate().filter(|(_, span)| span.walkable) {
                let off = (grid.height(span.floor) - point[2]).abs();
                let nearer =
                    best.is_none_or(|(kept, _)| off.total_cmp(&kept.0).then(across.total_cmp(&kept.1)).is_lt());
                if off <= REACH_LEVEL && nearer {
                    best = Some(((off, across), (column, index)));
                }
            }
        }
    }
    best.map(|(_, span)| span)
}

/// The floors each link joins, as spans, for the regions to keep what a climb reaches.
pub(crate) fn joins(field: &CompactField, links: &[Link]) -> Vec<[(usize, usize); 2]> {
    links.iter().filter_map(|link| Some([span_near(field, link.from)?, span_near(field, link.to)?])).collect()
}
