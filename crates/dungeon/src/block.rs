//! One block's layout, as DFO's Forge lays it: 16 by 16 cells of 3.2 m, rock but where rooms are carved by a seeded
//! split of the square and joined by the cheapest ways through the rock. The owner wants a dungeon run through, not a
//! maze, so a block's rooms are joined one after another, from its way in to its way on. The outer ring stays rock but
//! where an opening passes, so a block closes its own edges.

use crate::lane::Lane;
use crate::shapes::{Shape, outline};
use crate::styles::{Form, Style};
use crate::{CORRIDOR_HEIGHT_M, Cell, SIDES, Side};

/// Cells to a block's side.
pub const BLOCK_CELLS: usize = 16;
const AREA: usize = BLOCK_CELLS * BLOCK_CELLS;
/// An opening's cell along its side, clear of the corners.
pub(crate) const OPENING_FIRST: usize = 2;
pub(crate) const OPENING_LAST: usize = 13;
/// A split's smallest part, in cells.
const LEAST_PART: usize = 5;
/// Tries at a sound layout before a block takes its simplest form, and the step between their seeds.
const TRIES: u32 = 16;
const TRY_STEP: u32 = 0x9e37_79b1;
/// The simplest form: one room of 3 by 3 under the Forge's own default heights, whatever the style.
const SIMPLEST_FORMS: &[Form] = &[Form { shape: Shape::Rectangle, weight: 1, along: (3, 3), across: (3, 3) }];
const SIMPLEST_HEIGHTS: (f64, f64) = (3.2, 5.6);

/// A way through a block's edge: its side and its cell along it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Opening {
    pub side: Side,
    pub cell: usize,
}

/// A room of a block: its rectangle in the block's cells, its ceiling's height, its shape, and the rock standing
/// inside it.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct BlockRoom {
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub depth: usize,
    pub height: f64,
    pub shape: Shape,
    pub stones: Vec<(usize, usize)>,
}

/// A block's way in, the opening from the block before it, and its way on, the opening onto the next; the way in's
/// block has no way in and the last block no way on.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Ends {
    pub entry: Option<Opening>,
    pub exit: Option<Opening>,
}

/// A block's cells (a room's by its number in `rooms`), each open cell's ceiling height, its rooms, its openings, and
/// its rooms in the order its way runs through them.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct BlockLayout {
    pub cells: Vec<Cell>,
    pub ceilings: Vec<f64>,
    pub rooms: Vec<BlockRoom>,
    pub openings: Vec<Opening>,
    pub order: Vec<usize>,
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

/// The sides a form takes in a part, `along` east-west or north-south, or None where its least sides do not fit.
fn fitted(form: &Form, part: &Part, along_x: bool) -> Option<((usize, usize), (usize, usize))> {
    let (room_x, room_y) = (part.width - 2, part.depth - 2);
    let (room_along, room_across) = if along_x { (room_x, room_y) } else { (room_y, room_x) };
    let along = (form.along.0, form.along.1.min(room_along));
    let across = (form.across.0, form.across.1.min(room_across));
    (along.0 <= along.1 && across.0 <= across.1).then_some((along, across))
}

/// Draws a form for a part among those whose least sides fit it, by their weights, and its width and depth.
fn draw_form(lane: &mut Lane, forms: &[Form], part: &Part) -> Option<(Shape, usize, usize)> {
    let fitting: Vec<&Form> =
        forms.iter().filter(|form| fitted(form, part, true).or(fitted(form, part, false)).is_some()).collect();
    let mut pick = lane.below(fitting.iter().map(|form| form.weight).sum());
    let form = fitting.iter().find(|form| {
        let found = pick < form.weight;
        pick = pick.saturating_sub(form.weight);
        found
    })?;
    let ways: Vec<bool> = [true, false].into_iter().filter(|&along_x| fitted(form, part, along_x).is_some()).collect();
    let along_x = ways[lane.below(ways.len())];
    let (along, across) = fitted(form, part, along_x)?;
    let (length, breadth) = (lane.int(along.0, along.1), lane.int(across.0, across.1));
    Some(if along_x { (form.shape, length, breadth) } else { (form.shape, breadth, length) })
}

impl BlockLayout {
    fn empty() -> Self {
        Self {
            cells: vec![Cell::Rock; AREA],
            ceilings: vec![0.0; AREA],
            rooms: Vec::new(),
            openings: Vec::new(),
            order: Vec::new(),
        }
    }

    /// Carves a room into each part, a cell of rock kept on every side of it: a form of the style drawn among those
    /// that fit the part, its sides drawn within the form's and the part's, and its outline drawn in its rectangle.
    fn carve_rooms(&mut self, lane: &mut Lane, style: &Style) {
        let (fewest, most) = style.rooms;
        let want = lane.int(fewest, most);
        for part in split(lane, want).into_iter().take(want) {
            let Some((shape, width, depth)) = draw_form(lane, style.forms, &part) else { continue };
            let x = part.x + 1 + lane.below(part.width - width - 1);
            let y = part.y + 1 + lane.below(part.depth - depth - 1);
            let (lowest, highest) = style.heights;
            let steps = ((lowest + lane.draw() * (highest - lowest)) / 0.4 + 0.5).floor();
            let height = steps * 0.4;
            let outlined = outline(shape, width, depth, lane);
            let number = u16::try_from(self.rooms.len()).unwrap_or(u16::MAX);
            let stones = outlined.stones.iter().map(|&(stone_x, stone_y)| (x + stone_x, y + stone_y)).collect();
            self.rooms.push(BlockRoom { x, y, width, depth, height, shape, stones });
            for row in 0..depth {
                for column in 0..width {
                    if outlined.takes[row * width + column] {
                        self.cells[at(x + column, y + row)] = Cell::Room(number);
                        self.ceilings[at(x + column, y + row)] = height;
                    }
                }
            }
        }
    }

    /// Whether a cell is rock standing inside a room, which no way cuts and no door stands on.
    pub(crate) fn stone(&self, cell: (usize, usize)) -> bool {
        self.rooms.iter().any(|room| room.stones.contains(&cell))
    }

    /// The cheapest way between two cells, through rock, rooms and corridors but never the rim (but `rim`'s cells and
    /// the goal) or a room's stone; its cells, or None. Rock costs more than an open cell, so ways reuse ways.
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
                if (on_rim(x, y) && !rim.contains(&(x, y)) && next != goal) || self.stone((x, y)) {
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
        let room = &self.rooms[number];
        let own = Cell::Room(u16::try_from(number).unwrap_or(u16::MAX));
        (room.y..room.y + room.depth)
            .flat_map(|y| (room.x..room.x + room.width).map(move |x| (x, y)))
            .filter(|&(x, y)| self.cells[at(x, y)] == own)
            .collect()
    }

    /// Joins the block's way through, one room after another: from its way in (the opening from the block before, or
    /// for the way in's block its first room), through each room in turn, nearest the way in and farthest from the way
    /// on first, to the opening onto the next block; each by its cheapest way. One way from room to room keeps a block
    /// a run from one end to the other rather than a maze.
    fn join(&mut self, ends: Ends) {
        let middles: Vec<(usize, usize)> = (0..self.rooms.len())
            .map(|number| {
                let cells = self.room_cells(number);
                cells.get(cells.len() / 2).copied().unwrap_or((self.rooms[number].x, self.rooms[number].y))
            })
            .collect();
        let apart = |a: (usize, usize), b: (usize, usize)| (a.0.abs_diff(b.0) + a.1.abs_diff(b.1)) as isize;
        let (entry, exit) = (ends.entry.map(opening_cell), ends.exit.map(opening_cell));
        let along =
            |cell: (usize, usize)| entry.map_or(0, |from| apart(from, cell)) - exit.map_or(0, |to| apart(to, cell));
        let mut order: Vec<usize> = (0..self.rooms.len()).collect();
        order.sort_by_key(|&number| (along(middles[number]), number));
        let stops: Vec<(usize, usize)> =
            entry.into_iter().chain(order.iter().map(|&number| middles[number])).chain(exit).collect();
        let rim: Vec<(usize, usize)> = entry.into_iter().chain(exit).collect();
        for pair in stops.windows(2) {
            if let Some(path) = self.route(pair[0], pair[1], &rim) {
                self.carve(&path);
            }
        }
        self.order = order;
    }

    /// The layout of one try: its rooms, its way in and its way on cut through the rim, and the way through it joined.
    fn laid(seed: u32, ends: Ends, style: &Style) -> Self {
        let mut lane = Lane::new(seed);
        let mut block = Self::empty();
        block.carve_rooms(&mut lane, style);
        for opening in [ends.entry, ends.exit].into_iter().flatten() {
            let (x, y) = opening_cell(opening);
            block.cells[at(x, y)] = Cell::Corridor;
            block.ceilings[at(x, y)] = CORRIDOR_HEIGHT_M;
            block.openings.push(opening);
        }
        block.join(ends);
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

    /// Where the way in's exit door stands: a room's cell with rock beside it that is no stone, the rooms in the
    /// block's order, their quiet cells first and then the rest, each nearest its room's middle; the cell and the side
    /// the rock is on. None where no room meets such rock.
    pub(crate) fn exit_spot(&self) -> Option<(usize, usize, Side)> {
        for quiet in [true, false] {
            for &number in &self.order {
                let room = &self.rooms[number];
                let mut cells = if quiet { self.quiet_cells(number) } else { self.room_cells(number) };
                let off = |&(x, y): &(usize, usize)| {
                    (2 * x).abs_diff(2 * room.x + room.width - 1) + (2 * y).abs_diff(2 * room.y + room.depth - 1)
                };
                cells.sort_by_key(off);
                for (x, y) in cells {
                    for side in SIDES {
                        let rock =
                            |(bx, by): (usize, usize)| self.cells[at(bx, by)] == Cell::Rock && !self.stone((bx, by));
                        if beside(x, y, side).is_some_and(rock) {
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
    pub(crate) fn sound(seed: u32, ends: Ends, style: &Style, way_in: bool) -> Self {
        for attempt in 0..TRIES {
            let block = Self::laid(seed.wrapping_add(attempt.wrapping_mul(TRY_STEP)), ends, style);
            if block.one_walk() && (!way_in || block.exit_spot().is_some()) {
                return block;
            }
        }
        Self::laid(seed, ends, &Style { rooms: (1, 1), forms: SIMPLEST_FORMS, heights: SIMPLEST_HEIGHTS, ..*style })
    }
}
