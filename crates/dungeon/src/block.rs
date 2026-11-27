//! One storey of one block, as DFO's Forge lays it: 16 by 16 cells of 3.2 m, rock but where rooms are carved by a
//! seeded split of the square, round the flights and the landings its plan laid first, and joined by the cheapest ways
//! through the rock (`ways.rs`). The outer ring stays rock but where an opening passes, so a block closes its own
//! edges.

use crate::descent::{At, StoreyPlan};
use crate::lane::Lane;
use crate::shapes::{Shape, outline};
use crate::styles::{Form, Style};
use crate::{CORRIDOR_HEIGHT_M, Cell, SIDES, Side};

/// Cells to a block's side.
pub const BLOCK_CELLS: usize = 16;
pub(crate) const AREA: usize = BLOCK_CELLS * BLOCK_CELLS;
/// An opening's cell along its side, clear of the corners.
pub(crate) const OPENING_FIRST: usize = 2;
pub(crate) const OPENING_LAST: usize = 13;
/// A split's smallest part, in cells, and how many spots a room tries in its part, clear of its plan's cells.
const LEAST_PART: usize = 5;
const SPOTS: usize = 8;
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

/// A block storey's cells (a room's by its number in `rooms`), each open cell's ceiling height, the cells no room or
/// way takes (`blocked`), its rooms, its openings, the cells its ways join (`nodes`), and its rooms in the order the
/// way in's door is sought in.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct BlockLayout {
    pub cells: Vec<Cell>,
    pub ceilings: Vec<f64>,
    pub blocked: Vec<bool>,
    pub rooms: Vec<BlockRoom>,
    pub openings: Vec<Opening>,
    pub nodes: Vec<At>,
    pub order: Vec<usize>,
}

pub(crate) const fn at(x: usize, y: usize) -> usize {
    y * BLOCK_CELLS + x
}

pub(crate) const fn on_rim(x: usize, y: usize) -> bool {
    x == 0 || y == 0 || x == BLOCK_CELLS - 1 || y == BLOCK_CELLS - 1
}

/// The cell beside (x, y) on `side`, if it is in the block.
pub(crate) fn beside(x: usize, y: usize, side: Side) -> Option<(usize, usize)> {
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
    /// The storey before its rooms: rock, but its plan's openings, landings and gallery, which are ways, and the cells
    /// it keeps from every room and way.
    fn empty(plan: &StoreyPlan) -> Self {
        let mut block = Self {
            cells: vec![Cell::Rock; AREA],
            ceilings: vec![0.0; AREA],
            blocked: vec![false; AREA],
            rooms: Vec::new(),
            openings: plan.openings.clone(),
            nodes: Vec::new(),
            order: Vec::new(),
        };
        for &(x, y) in &plan.reserved {
            block.blocked[at(x, y)] = true;
        }
        let gallery = plan.gallery.iter().flat_map(|gallery| gallery.cells.iter().copied());
        let ways = plan.openings.iter().map(|&opening| opening_cell(opening)).chain(plan.landings.iter().copied());
        for (x, y) in ways.chain(gallery) {
            block.cells[at(x, y)] = Cell::Corridor;
            block.ceilings[at(x, y)] = CORRIDOR_HEIGHT_M;
        }
        block
    }

    /// Whether a room of this outline may stand with its north-west corner at (x, y): every cell it takes rock that no
    /// plan keeps.
    fn clear(&self, x: usize, y: usize, width: usize, takes: &[bool]) -> bool {
        takes.iter().enumerate().filter(|&(_, &taken)| taken).all(|(index, _)| {
            let cell = at(x + index % width, y + index / width);
            self.cells[cell] == Cell::Rock && !self.blocked[cell]
        })
    }

    /// Carves a room of a shape at a spot, its height drawn in the style's.
    fn carve_room(
        &mut self,
        lane: &mut Lane,
        style: &Style,
        room: (usize, usize, Shape, usize, usize),
        takes: &[bool],
    ) {
        let (x, y, shape, width, depth) = room;
        let (lowest, highest) = style.heights;
        let steps = ((lowest + lane.draw() * (highest - lowest)) / 0.4 + 0.5).floor();
        let height = steps * 0.4;
        let number = u16::try_from(self.rooms.len()).unwrap_or(u16::MAX);
        self.rooms.push(BlockRoom { x, y, width, depth, height, shape, stones: Vec::new() });
        for row in 0..depth {
            for column in 0..width {
                if takes[row * width + column] {
                    self.cells[at(x + column, y + row)] = Cell::Room(number);
                    self.ceilings[at(x + column, y + row)] = height;
                }
            }
        }
    }

    /// Carves a room into each part, a cell of rock kept on every side of it: a form of the style drawn among those
    /// that fit the part, its sides drawn within the form's and the part's, its outline drawn in its rectangle, on the
    /// first of a few drawn spots in its part that its plan's cells leave clear. A storey that is a great room is that
    /// one room: a cave in the caverns, else a hall whose pillars stand.
    fn carve_rooms(&mut self, lane: &mut Lane, style: &Style, plan: &StoreyPlan) {
        if let Some(great) = plan.great {
            let shape = if style.key == "caverns" { Shape::Cave } else { Shape::Rectangle };
            let outlined = outline(shape, great.width, great.depth, lane);
            if self.clear(great.x, great.y, great.width, &outlined.takes) {
                self.carve_room(lane, style, (great.x, great.y, shape, great.width, great.depth), &outlined.takes);
                let stones = outlined.stones.iter().map(|&(x, y)| (great.x + x, great.y + y)).collect();
                self.rooms[0].stones = stones;
                return;
            }
        }
        let (fewest, most) = style.rooms;
        let want = lane.int(fewest, most);
        for part in split(lane, want).into_iter().take(want) {
            let Some((shape, width, depth)) = draw_form(lane, style.forms, &part) else { continue };
            let outlined = outline(shape, width, depth, lane);
            let spot = (0..SPOTS)
                .map(|_| {
                    (part.x + 1 + lane.below(part.width - width - 1), part.y + 1 + lane.below(part.depth - depth - 1))
                })
                .find(|&(x, y)| self.clear(x, y, width, &outlined.takes));
            let Some((x, y)) = spot else { continue };
            self.carve_room(lane, style, (x, y, shape, width, depth), &outlined.takes);
            let last = self.rooms.len() - 1;
            self.rooms[last].stones =
                outlined.stones.iter().map(|&(stone_x, stone_y)| (x + stone_x, y + stone_y)).collect();
        }
    }

    /// Whether a cell is rock standing inside a room, which no way cuts and no door stands on.
    pub(crate) fn stone(&self, cell: (usize, usize)) -> bool {
        self.rooms.iter().any(|room| room.stones.contains(&cell))
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

    /// The layout of one try: its plan's ways, its rooms, and its ways joined (`ways.rs`).
    fn laid(seed: u32, plan: &StoreyPlan, style: &Style) -> Self {
        let mut lane = Lane::new(seed);
        let mut block = Self::empty(plan);
        block.carve_rooms(&mut lane, style, plan);
        block.join(&mut lane, plan);
        block
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
                        let rock = |(bx, by): (usize, usize)| {
                            let index = at(bx, by);
                            self.cells[index] == Cell::Rock && !self.blocked[index] && !self.stone((bx, by))
                        };
                        if beside(x, y, side).is_some_and(rock) {
                            return Some((x, y, side));
                        }
                    }
                }
            }
        }
        None
    }

    /// The block storey's sound layout: its own seed, then sub-seeds, until one is one walk with a room (or its
    /// gallery), one dead end at most and, for the way in's storey, a place for its exit door; past TRIES, its simplest
    /// form, one small room.
    pub(crate) fn sound(seed: u32, plan: &StoreyPlan, style: &Style, way_in: bool) -> Self {
        let roomed = |block: &Self| !block.rooms.is_empty() || plan.gallery.is_some();
        for attempt in 0..TRIES {
            let block = Self::laid(seed.wrapping_add(attempt.wrapping_mul(TRY_STEP)), plan, style);
            let sound = block.one_walk() && roomed(&block) && block.dead_ends() <= 1;
            if sound && (!way_in || block.exit_spot().is_some()) {
                return block;
            }
        }
        let simplest = Style { rooms: (1, 1), forms: SIMPLEST_FORMS, heights: SIMPLEST_HEIGHTS, ..*style };
        let plain = StoreyPlan { great: None, ..plan.clone() };
        (0..TRIES)
            .map(|attempt| Self::laid(seed.wrapping_add(attempt.wrapping_mul(TRY_STEP)), &plain, &simplest))
            .find(|block| block.one_walk() && roomed(block) && (!way_in || block.exit_spot().is_some()))
            .unwrap_or_else(|| Self::laid(seed, &plain, &simplest))
    }
}
