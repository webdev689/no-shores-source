//! How a dungeon goes down, planned before any room is carved, as the Forge plans it: how many storeys each block
//! holds, the doorways blocks side by side share and on which storey, each block's flights of stairs, its great rooms,
//! and the one gallery a great room may rise into. Each block storey is then laid to its plan (`block.rs`).

use crate::block::{BLOCK_CELLS, OPENING_FIRST, OPENING_LAST, Opening, opening_cell};
use crate::lane::Lane;
use crate::styles::Style;
use crate::{FLIGHT_CELLS, SIDES, Side};

/// The storeys the way in's block holds at most, and how often a block storey is one great room, its sides fewest and
/// most (cells).
const WAY_IN_STOREYS: usize = 2;
const GREAT_SHARE: f64 = 0.12;
pub(crate) const GREAT_SIDES: (usize, usize) = (9, 12);
/// How often two blocks side by side that are not next in the chain share a doorway.
const OTHER_DOORWAY_SHARE: f64 = 0.5;

/// A block's cell (x, y).
pub(crate) type At = (usize, usize);

/// A flight of stairs in a block: its upper storey, its head cell and the way it runs down.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Flight {
    pub upper: usize,
    pub head: At,
    pub down: Side,
}

/// The cell `steps` cells from `from` along `side`, if it stays in the block.
fn along(from: At, side: Side, steps: isize) -> Option<At> {
    let (dx, dy) = side.step();
    let x = from.0.checked_add_signed(dx * steps)?;
    let y = from.1.checked_add_signed(dy * steps)?;
    (x < BLOCK_CELLS && y < BLOCK_CELLS).then_some((x, y))
}

const fn inside(cell: At) -> bool {
    cell.0 >= 1 && cell.1 >= 1 && cell.0 < BLOCK_CELLS - 1 && cell.1 < BLOCK_CELLS - 1
}

impl Flight {
    /// Its four cells, head first, or None where one leaves the block.
    pub(crate) fn cells(&self) -> Option<[At; FLIGHT_CELLS]> {
        let mut cells = [(0, 0); FLIGHT_CELLS];
        for (step, cell) in cells.iter_mut().enumerate() {
            *cell = along(self.head, self.down, step as isize)?;
        }
        Some(cells)
    }

    /// The landing before its head on its upper storey, and the one past its foot on the storey under.
    pub(crate) fn landings(&self) -> Option<(At, At)> {
        Some((along(self.head, self.down, -1)?, along(self.head, self.down, FLIGHT_CELLS as isize)?))
    }

    /// The rock beside it, both sides of each cell, on both its storeys.
    pub(crate) fn walls(&self) -> Vec<At> {
        let across = [self.down.clockwise(), self.down.clockwise().opposite()];
        self.cells()
            .into_iter()
            .flatten()
            .flat_map(|cell| across.into_iter().filter_map(move |side| along(cell, side, 1)))
            .collect()
    }
}

/// A great room's rectangle on its storey, in the block's cells.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Great {
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub depth: usize,
}

impl Great {
    pub(crate) fn cells(&self) -> impl Iterator<Item = At> + '_ {
        (self.y..self.y + self.depth).flat_map(move |y| (self.x..self.x + self.width).map(move |x| (x, y)))
    }
}

/// The gallery a storey keeps over a great room under it: its cells (a way), and the open air over the room's middle.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct Gallery {
    pub cells: Vec<At>,
    pub void: Vec<At>,
}

/// One block storey's plan: its doorways onto blocks beside, the cells no room or way takes (its block's flights and
/// the rock beside them, and a gallery's open air and the rock round it), its landings, its great room if it is one,
/// and its gallery.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct StoreyPlan {
    pub openings: Vec<Opening>,
    pub reserved: Vec<At>,
    pub landings: Vec<At>,
    pub great: Option<Great>,
    pub gallery: Option<Gallery>,
}

/// A block's plan: a plan for each of its storeys, and its flights.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct BlockPlan {
    pub storeys: Vec<StoreyPlan>,
    pub flights: Vec<Flight>,
}

/// How many storeys each block holds, of at most `most`: the way in's one or two, any other one to `most`.
pub(crate) fn storey_counts(seed: u32, blocks: usize, most: usize) -> Vec<usize> {
    let mut lane = Lane::named(&format!("storeys:{seed}"));
    (0..blocks).map(|block| lane.int(1, if block == 0 { WAY_IN_STOREYS.min(most) } else { most })).collect()
}

/// The side `after` lies on from `before`, where they are side by side.
fn side_between(before: (usize, usize), after: (usize, usize)) -> Option<Side> {
    SIDES.into_iter().find(|side| {
        let (dx, dy) = side.step();
        (before.0.wrapping_add_signed(dx), before.1.wrapping_add_signed(dy)) == after
    })
}

/// The doorways blocks side by side share, each block's own as an opening on a storey: a block and the next in the
/// chain one on the deepest storey both hold, its cell drawn on the edge's lane, the way on; any two others side by side
/// one time in two, on a storey both hold.
pub(crate) fn doorways(seed: u32, squares: &[(usize, usize)], storeys: &[usize]) -> Vec<Vec<Vec<Opening>>> {
    let mut openings: Vec<Vec<Vec<Opening>>> = storeys.iter().map(|&count| vec![Vec::new(); count]).collect();
    let mut join = |first: usize, second: usize, side: Side, cell: usize, storey: usize| {
        openings[first][storey].push(Opening { side, cell });
        openings[second][storey].push(Opening { side: side.opposite(), cell });
    };
    for after in 1..squares.len() {
        let Some(side) = side_between(squares[after - 1], squares[after]) else { continue };
        let cell = Lane::named(&format!("edge:{seed}:{after}")).int(OPENING_FIRST, OPENING_LAST);
        join(after - 1, after, side, cell, storeys[after - 1].min(storeys[after]) - 1);
    }
    let mut lane = Lane::named(&format!("doorways:{seed}"));
    for first in 0..squares.len() {
        for second in first + 2..squares.len() {
            let Some(side) = side_between(squares[first], squares[second]) else { continue };
            if lane.chance(OTHER_DOORWAY_SHARE) {
                let cell = lane.int(OPENING_FIRST, OPENING_LAST);
                join(first, second, side, cell, lane.below(storeys[first].min(storeys[second])));
            }
        }
    }
    openings
}

/// Whether the cells inside the rim that are not `closed` join every one of `ends`, none of them closed.
fn joined(ends: &[At], closed: &[At]) -> bool {
    let Some(&first) = ends.first() else { return true };
    if ends.iter().any(|end| closed.contains(end)) {
        return false;
    }
    let mut reached = vec![first];
    let mut todo = vec![first];
    while let Some(cell) = todo.pop() {
        for side in SIDES {
            if let Some(next) = along(cell, side, 1)
                && inside(next)
                && !closed.contains(&next)
                && !reached.contains(&next)
            {
                reached.push(next);
                todo.push(next);
            }
        }
    }
    ends.iter().all(|end| reached.contains(end))
}

/// Shuffles a list on a lane.
fn shuffled<T>(mut items: Vec<T>, lane: &mut Lane) -> Vec<T> {
    for last in (1..items.len()).rev() {
        items.swap(last, lane.below(last + 1));
    }
    items
}

impl BlockPlan {
    /// A block's plan before its great rooms: its storeys' doorways, and a flight for each two storeys one over the
    /// other, laid before any room as the Forge lays them, each on the first of every head cell and way, shuffled, whose
    /// cells and walls are clear on every storey and whose landings are inside the rim. A flight's cells are rock on
    /// every storey of its block, so nothing stands over or under one.
    pub(crate) fn planned(seed: u32, number: usize, openings: Vec<Vec<Opening>>) -> Self {
        let mut plan = Self {
            storeys: openings.into_iter().map(|openings| StoreyPlan { openings, ..StoreyPlan::default() }).collect(),
            flights: Vec::new(),
        };
        let mut lane = Lane::named(&format!("stairs:{seed}:{number}"));
        let tries: Vec<(At, Side)> = (1..BLOCK_CELLS - 1)
            .flat_map(|y| (1..BLOCK_CELLS - 1).flat_map(move |x| SIDES.into_iter().map(move |side| ((x, y), side))))
            .collect();
        let tries = shuffled(tries, &mut lane);
        for upper in 0..plan.storeys.len().saturating_sub(1) {
            let found = tries.iter().map(|&(head, down)| Flight { upper, head, down }).find(|flight| plan.fits(flight));
            let Some(flight) = found else { continue };
            plan.add(flight);
        }
        plan
    }

    /// Every opening's rim cell and the cell inside it, on any storey.
    fn opening_cells(&self) -> Vec<At> {
        let inner = |opening: &Opening| {
            let (x, y) = opening_cell(*opening);
            along((x, y), opening.side.opposite(), 1).unwrap_or((x, y))
        };
        self.storeys
            .iter()
            .flat_map(|storey| storey.openings.iter().flat_map(move |opening| [opening_cell(*opening), inner(opening)]))
            .collect()
    }

    /// Whether a flight's cells and walls are clear of every storey's flights, walls, landings and openings, and its
    /// cells and landings inside the rim.
    fn fits(&self, flight: &Flight) -> bool {
        let (Some(cells), Some((top, bottom))) = (flight.cells(), flight.landings()) else { return false };
        let reserved: Vec<At> = self.storeys.iter().flat_map(|storey| storey.reserved.iter().copied()).collect();
        let taken: Vec<At> = self
            .storeys
            .iter()
            .flat_map(|storey| storey.landings.iter().copied())
            .chain(self.opening_cells())
            .chain(reserved.iter().copied())
            .collect();
        let clear = cells.into_iter().chain([top, bottom]).all(inside)
            && cells.into_iter().chain(flight.walls()).all(|cell| !taken.contains(&cell))
            && [top, bottom].iter().all(|landing| !reserved.contains(landing));
        let mut kept: Vec<At> = cells.into_iter().chain(flight.walls()).collect();
        kept.extend(reserved);
        clear
            && (0..self.storeys.len()).all(|storey| {
                let mut ends = self.ends(storey);
                ends.extend((storey == flight.upper).then_some(top));
                ends.extend((storey == flight.upper + 1).then_some(bottom));
                joined(&ends, &kept)
            })
    }

    /// The cells a storey's ways must reach: the cell inside each of its openings, and its landings.
    fn ends(&self, storey: usize) -> Vec<At> {
        let plan = &self.storeys[storey];
        let inner =
            plan.openings.iter().filter_map(|opening| along(opening_cell(*opening), opening.side.opposite(), 1));
        inner.chain(plan.landings.iter().copied()).collect()
    }

    /// Takes a flight: its cells and walls rock on every storey, its landings ways on its two storeys.
    fn add(&mut self, flight: Flight) {
        let (Some(cells), Some((top, bottom))) = (flight.cells(), flight.landings()) else { return };
        for storey in &mut self.storeys {
            storey.reserved.extend(cells.into_iter().chain(flight.walls()));
        }
        self.storeys[flight.upper].landings.push(top);
        self.storeys[flight.upper + 1].landings.push(bottom);
        self.flights.push(flight);
    }

    /// Now and then a storey of the block is one great room, in every style but the cells: a rectangle of nine to twelve
    /// cells each way, drawn, inside the rim with rock round it, on the first spot clear of its storey's flights and
    /// landings; or nine each way where the drawn sides find none.
    pub(crate) fn plan_great(&mut self, seed: u32, number: usize, style: &Style) {
        if style.key == "cells" {
            return;
        }
        let mut lane = Lane::named(&format!("great:{seed}:{number}"));
        for storey in 0..self.storeys.len() {
            if !lane.chance(GREAT_SHARE) {
                continue;
            }
            let drawn = (lane.int(GREAT_SIDES.0, GREAT_SIDES.1), lane.int(GREAT_SIDES.0, GREAT_SIDES.1));
            let order = lane.below(BLOCK_CELLS * BLOCK_CELLS);
            // A spot that leaves the storey over it free to keep a gallery first.
            let sides = [drawn, (GREAT_SIDES.0, GREAT_SIDES.0)];
            let found = [true, false].into_iter().find_map(|under_free| {
                sides.into_iter().find_map(|(width, depth)| self.great_spot(storey, width, depth, order, under_free))
            });
            self.storeys[storey].great = found;
        }
    }

    /// The first spot for a great room on a storey, from a drawn spot round the rest, clear of its taken cells, and
    /// where `under_free` of the landings on the storey over it.
    fn great_spot(&self, storey: usize, width: usize, depth: usize, order: usize, under_free: bool) -> Option<Great> {
        let plan = &self.storeys[storey];
        let over: &[At] = match storey.checked_sub(1) {
            Some(over) if under_free => &self.storeys[over].landings,
            _ => &[],
        };
        let (spots_x, spots_y) = (BLOCK_CELLS - 4 - width, BLOCK_CELLS - 4 - depth);
        let count = (spots_x + 1) * (spots_y + 1);
        (0..count).map(|nth| (nth + order) % count).find_map(|nth| {
            let great = Great { x: 2 + nth % (spots_x + 1), y: 2 + nth / (spots_x + 1), width, depth };
            let clear = great
                .cells()
                .all(|cell| !plan.reserved.contains(&cell) && !plan.landings.contains(&cell) && !over.contains(&cell));
            clear.then_some(great)
        })
    }

    /// The gallery the storey over a great room keeps, where nothing of that storey stands over the room: two to four
    /// of the room's sides one after another round it, drawn, a cell wide, and open air over the rest; the rock round
    /// the open air on the sides with no gallery is kept, so no room or way opens onto it. None where it does not fit.
    pub(crate) fn plan_gallery(&mut self, storey: usize, lane: &mut Lane) -> bool {
        let Some(great) = self.storeys.get(storey).and_then(|plan| plan.great) else { return false };
        let Some(over) = storey.checked_sub(1) else { return false };
        let above = &self.storeys[over];
        if great.cells().any(|cell| above.reserved.contains(&cell) || above.landings.contains(&cell)) {
            return false;
        }
        let (count, first) = (lane.int(2, 4), lane.below(SIDES.len()));
        let sides: Vec<Side> = (0..count).map(|nth| SIDES[(first + nth) % SIDES.len()]).collect();
        let edge = |(x, y): At, side: Side| match side {
            Side::North => y == great.y,
            Side::South => y == great.y + great.depth - 1,
            Side::West => x == great.x,
            Side::East => x == great.x + great.width - 1,
        };
        let (cells, void): (Vec<At>, Vec<At>) =
            great.cells().partition(|&cell| sides.iter().any(|&side| edge(cell, side)));
        let kept: Vec<At> = void
            .iter()
            .flat_map(|&cell| SIDES.into_iter().filter_map(move |side| along(cell, side, 1)))
            .filter(|cell| !great.cells().any(|own| own == *cell))
            .collect();
        let mut ends = self.ends(over);
        ends.extend(cells.first().copied());
        let mut closed: Vec<At> = above.reserved.clone();
        closed.extend(void.iter().copied().chain(kept.iter().copied()));
        if !joined(&ends, &closed) {
            return false;
        }
        let above = &mut self.storeys[over];
        above.reserved.extend(void.iter().copied().chain(kept));
        above.gallery = Some(Gallery { cells, void });
        true
    }
}

/// Every block's plan: its storeys' doorways, its flights and its great rooms; and, where a great room stands under
/// another storey, the first of them that fits rising into a gallery.
pub(crate) fn plan_blocks(
    seed: u32,
    squares: &[(usize, usize)],
    storeys: &[usize],
    styles: &[Style],
) -> Vec<BlockPlan> {
    let mut plans: Vec<BlockPlan> = doorways(seed, squares, storeys)
        .into_iter()
        .enumerate()
        .map(|(number, openings)| {
            let mut plan = BlockPlan::planned(seed, number, openings);
            plan.plan_great(seed, number, &styles[number]);
            plan
        })
        .collect();
    let lower = |plan: &BlockPlan| plan.storeys.iter().skip(1).any(|storey| storey.great.is_some());
    let mut lane = Lane::named(&format!("gallery:{seed}"));
    if plans.iter().any(lower) {
        'blocks: for (number, plan) in plans.iter_mut().enumerate() {
            // The way in's storey keeps its rooms, one of which holds the way in.
            for storey in if number == 0 { 2 } else { 1 }..plan.storeys.len() {
                if plan.plan_gallery(storey, &mut lane) {
                    break 'blocks;
                }
            }
        }
    }
    plans
}
