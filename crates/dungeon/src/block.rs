//! One block's layout, as DFO's Forge lays it: 16 by 16 cells of 3.2 m, rock but where rooms are carved by a seeded
//! split of the square and joined, to each other and to the block's edge openings, by the cheapest ways through the
//! rock. The outer ring stays rock but where an opening passes, so a block closes its own edges.

use crate::lane::Lane;
use crate::{CORRIDOR_HEIGHT_M, Cell, SIDES, Shape, Side, Style};

/// Cells to a block's side.
pub const BLOCK_CELLS: usize = 16;
const AREA: usize = BLOCK_CELLS * BLOCK_CELLS;
/// An opening's cell along its side, clear of the corners.
pub(crate) const OPENING_FIRST: usize = 2;
pub(crate) const OPENING_LAST: usize = 13;
/// The share of extra ways past the spanning tree, and a split's smallest part in cells.
const LOOPS: f64 = 0.3;
const LEAST_PART: usize = 5;
/// Tries at a sound layout before a block takes its simplest form, and the step between their seeds.
const TRIES: u32 = 16;
const TRY_STEP: u32 = 0x9e37_79b1;
/// The simplest form's ceiling heights, the Forge's own default whatever the style.
const SIMPLEST_HEIGHTS: (f64, f64) = (3.2, 5.6);

/// A way through a block's edge: its side and its cell along it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Opening {
    pub side: Side,
    pub cell: usize,
}

/// A room of a block: its rectangle in the block's cells, its ceiling's height and its shape.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct BlockRoom {
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub depth: usize,
    pub height: f64,
    pub shape: Shape,
}

/// A block's cells (a room's by its number in `rooms`), each open cell's ceiling height, its rooms and its openings.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct BlockLayout {
    pub cells: Vec<Cell>,
    pub ceilings: Vec<f64>,
    pub rooms: Vec<BlockRoom>,
    pub openings: Vec<Opening>,
}

const fn at(x: usize, y: usize) -> usize {
    y * BLOCK_CELLS + x
}

const fn on_rim(x: usize, y: usize) -> bool {
    x == 0 || y == 0 || x == BLOCK_CELLS - 1 || y == BLOCK_CELLS - 1
}

/// The cell beside (x, y) on `side`, if it is in the block.
fn beside(x: usize, y: usize, side: Side) -> Option<(usize, usize)> {
    let (dx, dy) = side.step();
    let (next_x, next_y) = (x.checked_add_signed(dx)?, y.checked_add_signed(dy)?);
    (next_x < BLOCK_CELLS && next_y < BLOCK_CELLS).then_some((next_x, next_y))
}

/// The rim cell an opening passes through.
pub(crate) fn opening_cell(opening: Opening) -> (usize, usize) {
    let last = BLOCK_CELLS - 1;
    match opening.side {
        Side::East => (last, opening.cell),
        Side::South => (opening.cell, last),
        Side::West => (0, opening.cell),
        Side::North => (opening.cell, 0),
    }
}

/// A rectangle of cells.
#[derive(Clone, Copy, Debug)]
struct Part {
    x: usize,
    y: usize,
    width: usize,
    depth: usize,
}

/// Splits the square inside the rim into parts no smaller than LEAST_PART, the largest first, until `want` stand.
fn split(lane: &mut Lane, want: usize) -> Vec<Part> {
    let mut parts = vec![Part { x: 1, y: 1, width: BLOCK_CELLS - 2, depth: BLOCK_CELLS - 2 }];
    let mut tries = 0;
    while parts.len() < want && tries < want * 8 {
        tries += 1;
        parts.sort_by_key(|part| core::cmp::Reverse(part.width * part.depth));
        let part = parts[0];
        let across = if part.width == part.depth { lane.chance(0.5) } else { part.width > part.depth };
        let length = if across { part.width } else { part.depth };
        if length < LEAST_PART * 2 {
            break;
        }
        let cut = LEAST_PART + lane.below(length - LEAST_PART * 2 + 1);
        parts.remove(0);
        if across {
            parts.push(Part { width: cut, ..part });
            parts.push(Part { x: part.x + cut, width: part.width - cut, ..part });
        } else {
            parts.push(Part { depth: cut, ..part });
            parts.push(Part { y: part.y + cut, depth: part.depth - cut, ..part });
        }
    }
    parts.sort_by_key(|part| (part.y, part.x));
    parts
}

/// Whether a room's shape takes the cell (x, y) of its rectangle: a rectangle all of it; an L leaves a corner quarter
/// rock.
fn takes(shape: Shape, ell: (usize, usize, bool, bool), width: usize, depth: usize, x: usize, y: usize) -> bool {
    let (cut_width, cut_depth, right, far) = ell;
    match shape {
        Shape::Rectangle => true,
        Shape::Ell => {
            let in_columns = if right { x >= width - cut_width } else { x < cut_width };
            let in_rows = if far { y >= depth - cut_depth } else { y < cut_depth };
            !(in_columns && in_rows)
        }
    }
}

impl BlockLayout {
    fn empty() -> Self {
        Self { cells: vec![Cell::Rock; AREA], ceilings: vec![0.0; AREA], rooms: Vec::new(), openings: Vec::new() }
    }

    /// Carves a room into each part, a cell of rock kept on every side of it.
    fn carve_rooms(&mut self, lane: &mut Lane, style: &Style) {
        let (fewest, most) = style.rooms;
        let want = lane.int(fewest, most);
        for part in split(lane, want).into_iter().take(want) {
            let (smallest, largest) = style.room_cells;
            let (widest, deepest) = (largest.min(part.width - 2), largest.min(part.depth - 2));
            if widest < 2 || deepest < 2 {
                continue;
            }
            let width = lane.int(smallest.min(widest), widest);
            let depth = lane.int(smallest.min(deepest), deepest);
            let x = part.x + 1 + lane.below(part.width - width - 1);
            let y = part.y + 1 + lane.below(part.depth - depth - 1);
            let (lowest, highest) = style.heights;
            let steps = ((lowest + lane.draw() * (highest - lowest)) / 0.4 + 0.5).floor();
            let height = steps * 0.4;
            let mixed = style.ells && width >= 4 && depth >= 4 && lane.chance(0.4);
            let shape = if mixed { Shape::Ell } else { Shape::Rectangle };
            let ell =
                if mixed { (width / 2, depth / 2, lane.chance(0.5), lane.chance(0.5)) } else { (0, 0, false, false) };
            let number = u16::try_from(self.rooms.len()).unwrap_or(u16::MAX);
            self.rooms.push(BlockRoom { x, y, width, depth, height, shape });
            for row in y..y + depth {
                for column in x..x + width {
                    if takes(shape, ell, width, depth, column - x, row - y) {
                        self.cells[at(column, row)] = Cell::Room(number);
                        self.ceilings[at(column, row)] = height;
                    }
                }
            }
        }
    }

    /// The cheapest way between two cells, through rock, rooms and corridors but never the rim (but `rim`'s cells and
    /// the goal); its cells, or None. Rock costs more than an open cell, so ways reuse ways.
    fn route(&self, from: (usize, usize), to: (usize, usize), rim: &[(usize, usize)]) -> Option<Vec<(usize, usize)>> {
        let cost = |index: usize| match self.cells[index] {
            Cell::Rock => 3.0,
            Cell::Room(_) => 2.0,
            Cell::Corridor => 1.0,
        };
        let (start, goal) = (at(from.0, from.1), at(to.0, to.1));
        let guess =
            |index: usize| (index % BLOCK_CELLS).abs_diff(to.0) as f64 + (index / BLOCK_CELLS).abs_diff(to.1) as f64;
        let mut distance = vec![f64::INFINITY; AREA];
        let mut previous: Vec<Option<usize>> = vec![None; AREA];
        distance[start] = 0.0;
        let mut open = vec![start];
        while !open.is_empty() {
            let mut best = 0;
            for candidate in 1..open.len() {
                if distance[open[candidate]] + guess(open[candidate]) < distance[open[best]] + guess(open[best]) {
                    best = candidate;
                }
            }
            let index = open.remove(best);
            if index == goal {
                break;
            }
            for side in SIDES {
                let Some((x, y)) = beside(index % BLOCK_CELLS, index / BLOCK_CELLS, side) else { continue };
                let next = at(x, y);
                if on_rim(x, y) && !rim.contains(&(x, y)) && next != goal {
                    continue;
                }
                let through = distance[index] + cost(next);
                if through < distance[next] {
                    distance[next] = through;
                    previous[next] = Some(index);
                    if !open.contains(&next) {
                        open.push(next);
                    }
                }
            }
        }
        if !distance[goal].is_finite() {
            return None;
        }
        let mut path = vec![to];
        let mut index = goal;
        while let Some(before) = previous[index] {
            path.push((before % BLOCK_CELLS, before / BLOCK_CELLS));
            index = before;
        }
        path.reverse();
        Some(path)
    }

    /// Carves a way's rock into corridor.
    fn carve(&mut self, path: &[(usize, usize)]) {
        for &(x, y) in path {
            if self.cells[at(x, y)] == Cell::Rock {
                self.cells[at(x, y)] = Cell::Corridor;
                self.ceilings[at(x, y)] = CORRIDOR_HEIGHT_M;
            }
        }
    }

    /// A room's cells, row by row.
    pub(crate) fn room_cells(&self, number: usize) -> Vec<(usize, usize)> {
        let room = self.rooms[number];
        let own = Cell::Room(u16::try_from(number).unwrap_or(u16::MAX));
        (room.y..room.y + room.depth)
            .flat_map(|y| (room.x..room.x + room.width).map(move |x| (x, y)))
            .filter(|&(x, y)| self.cells[at(x, y)] == own)
            .collect()
    }

    /// Joins the rooms and openings: a spanning tree by distance, then a share of the other pairs as loops, each by
    /// its cheapest way.
    fn join(&mut self, lane: &mut Lane) {
        let mut nodes: Vec<(usize, usize)> = (0..self.rooms.len())
            .filter_map(|number| {
                let cells = self.room_cells(number);
                cells.get(cells.len() / 2).copied()
            })
            .collect();
        let rim: Vec<(usize, usize)> = self.openings.iter().map(|&opening| opening_cell(opening)).collect();
        nodes.extend(&rim);
        if nodes.len() < 2 {
            return;
        }
        let apart = |a: (usize, usize), b: (usize, usize)| a.0.abs_diff(b.0) + a.1.abs_diff(b.1);
        let mut in_tree = vec![0];
        let mut edges: Vec<(usize, usize)> = Vec::new();
        while in_tree.len() < nodes.len() {
            let mut best: Option<(usize, usize, usize)> = None;
            for &from in &in_tree {
                for to in (0..nodes.len()).filter(|to| !in_tree.contains(to)) {
                    let length = apart(nodes[from], nodes[to]);
                    if best.is_none_or(|(_, _, shortest)| length < shortest) {
                        best = Some((from, to, length));
                    }
                }
            }
            let Some((from, to, _)) = best else { break };
            in_tree.push(to);
            edges.push((from, to));
        }
        let share = LOOPS.min(2.0 / nodes.len() as f64);
        for first in 0..nodes.len() {
            for second in first + 1..nodes.len() {
                let joined = edges.iter().any(|&edge| edge == (first, second) || edge == (second, first));
                if !joined && lane.chance(share) {
                    edges.push((first, second));
                }
            }
        }
        for (from, to) in edges {
            if let Some(path) = self.route(nodes[from], nodes[to], &rim) {
                self.carve(&path);
            }
        }
    }

    /// The layout of one try: its rooms, its openings cut through the rim, every room and opening joined.
    fn laid(seed: u32, openings: &[Opening], style: &Style) -> Self {
        let mut lane = Lane::new(seed);
        let mut block = Self::empty();
        block.carve_rooms(&mut lane, style);
        for &opening in openings {
            let (x, y) = opening_cell(opening);
            block.cells[at(x, y)] = Cell::Corridor;
            block.ceilings[at(x, y)] = CORRIDOR_HEIGHT_M;
            block.openings.push(opening);
        }
        block.join(&mut lane);
        block
    }

    /// Whether every room and opening is one walk: every open cell reached from the first.
    fn one_walk(&self) -> bool {
        let Some(first) = self.cells.iter().position(|&cell| cell != Cell::Rock) else { return false };
        let mut reached = vec![false; AREA];
        let mut todo = vec![first];
        reached[first] = true;
        while let Some(index) = todo.pop() {
            for side in SIDES {
                let Some((x, y)) = beside(index % BLOCK_CELLS, index / BLOCK_CELLS, side) else { continue };
                let next = at(x, y);
                if !reached[next] && self.cells[next] != Cell::Rock {
                    reached[next] = true;
                    todo.push(next);
                }
            }
        }
        !self.rooms.is_empty() && self.cells.iter().zip(&reached).all(|(&cell, &seen)| cell == Cell::Rock || seen)
    }

    /// A room's cells no side of which meets a corridor, row by row.
    pub(crate) fn quiet_cells(&self, number: usize) -> Vec<(usize, usize)> {
        let busy = |x: usize, y: usize| {
            SIDES
                .into_iter()
                .any(|side| beside(x, y, side).is_some_and(|(bx, by)| self.cells[at(bx, by)] == Cell::Corridor))
        };
        self.room_cells(number).into_iter().filter(|&(x, y)| !busy(x, y)).collect()
    }

    /// Where the way in's exit door stands: a room's cell with rock beside it, its quiet cells first and then the rest,
    /// each nearest its room's middle; the cell and the side the rock is on. None where no room meets rock.
    pub(crate) fn exit_spot(&self) -> Option<(usize, usize, Side)> {
        for quiet in [true, false] {
            for (number, room) in self.rooms.iter().enumerate() {
                let mut cells = if quiet { self.quiet_cells(number) } else { self.room_cells(number) };
                let off = |&(x, y): &(usize, usize)| {
                    (2 * x).abs_diff(2 * room.x + room.width - 1) + (2 * y).abs_diff(2 * room.y + room.depth - 1)
                };
                cells.sort_by_key(off);
                for (x, y) in cells {
                    for side in SIDES {
                        if beside(x, y, side).is_some_and(|(bx, by)| self.cells[at(bx, by)] == Cell::Rock) {
                            return Some((x, y, side));
                        }
                    }
                }
            }
        }
        None
    }

    /// The block's sound layout: its own seed, then sub-seeds, until one is one walk and, for the way in's block, has a
    /// place for its exit door; past TRIES, its simplest form, one small room.
    pub(crate) fn sound(seed: u32, openings: &[Opening], style: &Style, way_in: bool) -> Self {
        for attempt in 0..TRIES {
            let block = Self::laid(seed.wrapping_add(attempt.wrapping_mul(TRY_STEP)), openings, style);
            if block.one_walk() && (!way_in || block.exit_spot().is_some()) {
                return block;
            }
        }
        Self::laid(
            seed,
            openings,
            &Style { rooms: (1, 1), room_cells: (3, 3), heights: SIMPLEST_HEIGHTS, ells: false, ..*style },
        )
    }
}
