//! A whole dungeon: two to five blocks in a chain from the way in's, each next one beside the one before and sharing
//! one doorway with it, so the way runs from a beginning through a middle to an end; in about half of them the last
//! block is laid in the style below the first. With it, what the rooms and the Game read: the way in's exit door, the
//! return portal in the end room, each room's walk from the way in, purpose, name and ceiling, and what a body runs
//! into beside the rock, the doorways' jambs, the great rooms' pillars, the props and the fixtures.

use crate::block::{BLOCK_CELLS, BlockLayout, Ends, OPENING_FIRST, OPENING_LAST, Opening};
use crate::fixtures::Fixture;
use crate::lane::Lane;
use crate::purposes::Purpose;
use crate::shapes::{Ceiling, Shape, ceiling};
use crate::styles::Style;
use crate::torches::Torch;
use crate::{CELL_M, Cell, SIDES, Side};

/// Blocks a dungeon grows to, fewest and most, each count as likely; and the share of dungeons whose last block is
/// laid in the style below.
pub const BLOCKS: (usize, usize) = (2, 5);
const DEEPER_SHARE: f64 = 0.5;
/// A doorway's frame: the opening's half width, the jambs' depth into the corridor, and the lintel's underside (m).
pub const DOORWAY_HALF_M: f64 = 0.9;
pub const JAMB_DEPTH_M: f64 = 0.3;
pub const LINTEL_M: f64 = 2.8;
/// A pillar's half width, and the room that stands them: at least this many cells each way.
pub const PILLAR_HALF_M: f64 = 0.35;
const PILLAR_ROOM_CELLS: usize = 4;
/// The exit door's width and height, how far off its wall it stands, and how far past its cell's middle, away from it,
/// a body arrives (m), as the Forge stands a body in front of its exit door.
pub const EXIT_WIDTH_M: f64 = 1.4;
pub const EXIT_HEIGHT_M: f64 = 2.4;
const EXIT_OFF_WALL_M: f64 = 0.02;
const ARRIVE_PAST_MIDDLE_M: f64 = 0.4;

/// A room: its rectangle in the dungeon's cells, its cells and those of them no side of which meets a corridor (row
/// by row), the rock standing inside it, its ceiling's height and form, its shape, how many cells' walk it lies from
/// the way in, its look (by its number among the dungeon's), and its purpose and name.
#[derive(Clone, Debug, PartialEq)]
pub struct Room {
    pub x: usize,
    pub y: usize,
    pub width: usize,
    pub depth: usize,
    pub cells: Vec<usize>,
    pub quiet: Vec<usize>,
    pub stones: Vec<usize>,
    pub height: f64,
    pub ceiling: Ceiling,
    pub shape: Shape,
    pub walk: u32,
    pub look: usize,
    pub purpose: &'static Purpose,
    pub name: String,
}

/// A door on a wall of a room: the room's cell it stands at, the side of that cell its wall is on, and the room. The
/// way in's exit door is one, and the return portal on the end room's far wall another.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WallDoor {
    pub cell: usize,
    pub side: Side,
    pub room: usize,
}

/// A doorway where a room's cell meets a corridor on `side`, framed up to the lower of the two ceilings.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    pub cell: usize,
    pub side: Side,
    pub height: f64,
}

/// A dungeon as the Forge lays it, in its own frame: x east and y south from its north-west corner, its floor at 0 m.
#[derive(Clone, Debug, PartialEq)]
pub struct Dungeon {
    /// The first block's style, which names the dungeon.
    pub style: Style,
    /// The looks its parts wear, the first block's first: its style, and the style below where its last block is.
    pub looks: Vec<Style>,
    /// The blocks' squares, the way in's first, each its column and row of blocks, and each block's look.
    pub squares: Vec<(usize, usize)>,
    pub block_looks: Vec<usize>,
    pub columns: usize,
    pub rows: usize,
    pub cells: Vec<Cell>,
    /// Each open cell's ceiling, 0 for rock.
    pub ceilings: Vec<f64>,
    pub rooms: Vec<Room>,
    pub way_in: WallDoor,
    /// The end room: the last the way reaches in the last block.
    pub end: usize,
    /// The return portal: on the wall of the end room farthest from the way in, it takes a player back out.
    pub portal: WallDoor,
    pub torches: Vec<Torch>,
    pub frames: Vec<Frame>,
    /// Each pillar's middle, (x, y), and its top.
    pub pillars: Vec<[f64; 3]>,
    /// The props its rooms are furnished with, and the lights that are not torches (`furnish`, `fixtures`).
    pub props: Vec<crate::Prop>,
    pub fixtures: Vec<Fixture>,
}

/// The squares of the blocks, in a chain: the first at the start, each next one beside the one before, drawn from
/// the free squares round it, so the way runs from block to block.
fn grow(lane: &mut Lane, count: usize) -> Vec<(isize, isize)> {
    let mut squares = vec![(0, 0)];
    while squares.len() < count {
        let (column, row) = squares[squares.len() - 1];
        let free: Vec<(isize, isize)> = SIDES
            .into_iter()
            .map(|side| (column + side.step().0, row + side.step().1))
            .filter(|next| !squares.contains(next))
            .collect();
        squares.push(free[lane.below(free.len())]);
    }
    squares
}

/// Each block's way in and way on: a block and the next in the chain share one doorway, a cell along their edge; two
/// blocks side by side that are not next in the chain share none.
fn contracts(seed: u32, squares: &[(usize, usize)]) -> Vec<Ends> {
    let mut ends = vec![Ends::default(); squares.len()];
    for first in 1..squares.len() {
        let (before, after) = (squares[first - 1], squares[first]);
        let Some(side) = SIDES.into_iter().find(|side| {
            let (dx, dy) = side.step();
            (before.0.wrapping_add_signed(dx), before.1.wrapping_add_signed(dy)) == after
        }) else {
            continue;
        };
        let cell = Lane::named(&format!("edge:{seed}:{first}")).int(OPENING_FIRST, OPENING_LAST);
        ends[first - 1].exit = Some(Opening { side, cell });
        ends[first].entry = Some(Opening { side: side.opposite(), cell });
    }
    ends
}

impl Dungeon {
    /// The dungeon a seed lays in a style: how many blocks drawn on its own lane, two to five alike, and whether its
    /// last is laid in the style below on another.
    #[must_use]
    pub fn forge(seed: u32, style: Style) -> Self {
        let count = Lane::named(&format!("size:{seed}")).int(BLOCKS.0, BLOCKS.1);
        let deeper = Lane::named(&format!("deeper:{seed}")).chance(DEEPER_SHARE);
        let grown = grow(&mut Lane::named(&format!("squares:{seed}")), count);
        let (west, north) =
            grown.iter().fold((0, 0), |(west, north), &(column, row)| (west.min(column), north.min(row)));
        let squares: Vec<(usize, usize)> =
            grown.iter().map(|&(column, row)| (column.abs_diff(west), row.abs_diff(north))).collect();
        let columns = (squares.iter().map(|square| square.0).max().unwrap_or(0) + 1) * BLOCK_CELLS;
        let rows = (squares.iter().map(|square| square.1).max().unwrap_or(0) + 1) * BLOCK_CELLS;
        let openings = contracts(seed, &squares);
        let looks = if deeper { vec![style, style.style_below()] } else { vec![style] };
        let block_looks: Vec<usize> =
            (0..count).map(|number| if deeper && number + 1 == count { 1 } else { 0 }).collect();
        let mut dungeon = Self {
            style,
            looks,
            squares: squares.clone(),
            block_looks: block_looks.clone(),
            columns,
            rows,
            cells: vec![Cell::Rock; columns * rows],
            ceilings: vec![0.0; columns * rows],
            rooms: Vec::new(),
            way_in: WallDoor { cell: 0, side: Side::North, room: 0 },
            end: 0,
            portal: WallDoor { cell: 0, side: Side::North, room: 0 },
            torches: Vec::new(),
            frames: Vec::new(),
            pillars: Vec::new(),
            props: Vec::new(),
            fixtures: Vec::new(),
        };
        let blocks: Vec<BlockLayout> = openings
            .iter()
            .enumerate()
            .map(|(number, &own)| {
                let block_style = dungeon.looks[block_looks[number]];
                BlockLayout::sound(
                    crate::lane::named(&format!("block:{seed}:{number}")),
                    own,
                    &block_style,
                    number == 0,
                )
            })
            .collect();
        for (number, block) in blocks.iter().enumerate() {
            dungeon.lay(squares[number], block, block_looks[number]);
        }
        if let Some((x, y, side)) = blocks[0].exit_spot() {
            let cell = dungeon.cell_of(squares[0], x, y);
            dungeon.way_in = WallDoor { cell, side, room: dungeon.room_at(cell).unwrap_or(0) };
        }
        let last = blocks.len() - 1;
        let first_of_last: usize = blocks[..last].iter().map(|block| block.rooms.len()).sum();
        dungeon.end = first_of_last + blocks[last].order.last().copied().unwrap_or(0);
        let steps = dungeon.walk();
        dungeon.portal = dungeon.portal_spot(&steps);
        for (number, block) in blocks.iter().enumerate() {
            dungeon.light(squares[number], block);
        }
        dungeon.flank_portal();
        dungeon.name_rooms(seed);
        dungeon.furnish(seed, &steps);
        dungeon.frame();
        dungeon
    }

    /// A cell's look, by its number among `looks`: its block's; None for rock.
    #[must_use]
    pub fn look_at(&self, cell: usize) -> Option<usize> {
        if self.cells.get(cell).is_none_or(|&kind| kind == Cell::Rock) {
            return None;
        }
        let square = ((cell % self.columns) / BLOCK_CELLS, (cell / self.columns) / BLOCK_CELLS);
        let block = self.squares.iter().position(|&found| found == square)?;
        self.block_looks.get(block).copied()
    }

    /// The whole grid's cell for a block's cell (x, y).
    pub(crate) fn cell_of(&self, square: (usize, usize), x: usize, y: usize) -> usize {
        (square.1 * BLOCK_CELLS + y) * self.columns + square.0 * BLOCK_CELLS + x
    }

    /// The room a cell is, if it is one.
    #[must_use]
    pub fn room_at(&self, cell: usize) -> Option<usize> {
        match self.cells.get(cell) {
            Some(&Cell::Room(number)) => Some(usize::from(number)),
            _ => None,
        }
    }

    /// The cell beside a cell, if it is in the grid.
    #[must_use]
    pub fn beside(&self, cell: usize, side: Side) -> Option<usize> {
        let (dx, dy) = side.step();
        let x = (cell % self.columns).checked_add_signed(dx)?;
        let y = (cell / self.columns).checked_add_signed(dy)?;
        (x < self.columns && y < self.rows).then_some(y * self.columns + x)
    }

    /// Whether the cell beside on `side` is rock, or past the grid.
    pub(crate) fn rock_beside(&self, cell: usize, side: Side) -> bool {
        self.beside(cell, side).is_none_or(|next| self.cells[next] == Cell::Rock)
    }

    /// A cell's middle, (x, y) in metres.
    #[must_use]
    pub fn centre(&self, cell: usize) -> [f64; 2] {
        [((cell % self.columns) as f64 + 0.5) * CELL_M, ((cell / self.columns) as f64 + 0.5) * CELL_M]
    }

    /// Copies a block's cells, ceilings and rooms into the grid, its rooms numbered after those laid before and
    /// wearing its look, with its great rooms' pillars.
    fn lay(&mut self, square: (usize, usize), block: &BlockLayout, look: usize) {
        let first = self.rooms.len();
        for y in 0..BLOCK_CELLS {
            for x in 0..BLOCK_CELLS {
                let cell = self.cell_of(square, x, y);
                let local = y * BLOCK_CELLS + x;
                self.cells[cell] = match block.cells[local] {
                    Cell::Room(number) => Cell::Room(u16::try_from(first + usize::from(number)).unwrap_or(u16::MAX)),
                    other => other,
                };
                self.ceilings[cell] = block.ceilings[local];
            }
        }
        for (number, room) in block.rooms.iter().enumerate() {
            let own = |(x, y): (usize, usize)| self.cell_of(square, x, y);
            let cells = block.room_cells(number).into_iter().map(own).collect();
            let quiet = block.quiet_cells(number).into_iter().map(own).collect();
            let stones = room.stones.iter().map(|&stone| own(stone)).collect();
            let (x, y) = (square.0 * BLOCK_CELLS + room.x, square.1 * BLOCK_CELLS + room.y);
            let style = self.looks[look];
            let placed = Room {
                x,
                y,
                width: room.width,
                depth: room.depth,
                cells,
                quiet,
                stones,
                height: room.height,
                ceiling: ceiling(room.shape, room.width, room.depth, style.roof),
                shape: room.shape,
                walk: 0,
                look,
                // Each room's own purpose and name are given once the walk is known (`name_rooms`).
                purpose: &style.purposes.way_in,
                name: String::new(),
            };
            self.pillars.extend(self.pillars_of(&placed, first + number));
            self.rooms.push(placed);
        }
    }

    /// The corners a room's pillars stand on: every second inner corner of a hewn room (no cave) at least
    /// PILLAR_ROOM_CELLS each way, all four cells round it the room's own; each corner and the room's ceiling.
    fn pillars_of(&self, room: &Room, number: usize) -> Vec<[f64; 3]> {
        if room.width < PILLAR_ROOM_CELLS || room.depth < PILLAR_ROOM_CELLS || room.shape == Shape::Cave {
            return Vec::new();
        }
        let own = |x: usize, y: usize| self.room_at(y * self.columns + x) == Some(number);
        let mut corners = Vec::new();
        for y in (room.y + 2..room.y + room.depth - 1).step_by(2) {
            for x in (room.x + 2..room.x + room.width - 1).step_by(2) {
                if own(x, y) && own(x - 1, y) && own(x, y - 1) && own(x - 1, y - 1) {
                    corners.push([x as f64 * CELL_M, y as f64 * CELL_M, room.height]);
                }
            }
        }
        corners
    }

    /// Frames every doorway: a room's cell beside a corridor, up to the lower of their ceilings.
    fn frame(&mut self) {
        for cell in 0..self.cells.len() {
            if self.room_at(cell).is_none() {
                continue;
            }
            for side in SIDES {
                let Some(next) = self.beside(cell, side) else { continue };
                if self.cells[next] == Cell::Corridor {
                    self.frames.push(Frame { cell, side, height: self.ceilings[cell].min(self.ceilings[next]) });
                }
            }
        }
    }

    /// Each room's walk from the way in: the fewest cells crossed to reach any of its cells; and each cell's.
    pub(crate) fn walk(&mut self) -> Vec<u32> {
        let steps = self.steps();
        for room in &mut self.rooms {
            room.walk = room.cells.iter().map(|&cell| steps[cell]).min().unwrap_or(u32::MAX);
        }
        steps
    }

    /// Each cell's walk from the way in, u32::MAX for one never reached.
    fn steps(&self) -> Vec<u32> {
        let mut steps = vec![u32::MAX; self.cells.len()];
        let mut todo = std::collections::VecDeque::from([self.way_in.cell]);
        steps[self.way_in.cell] = 0;
        while let Some(cell) = todo.pop_front() {
            for side in SIDES {
                let Some(next) = self.beside(cell, side) else { continue };
                if self.cells[next] != Cell::Rock && steps[next] == u32::MAX {
                    steps[next] = steps[cell] + 1;
                    todo.push_back(next);
                }
            }
        }
        steps
    }

    /// Where the return portal stands: on a wall of the end room that is no stone, at its cell farthest from the way
    /// in by walk (its quiet cells first), the first such wall; on the way in's own wall only where the end room has
    /// no other.
    fn portal_spot(&self, steps: &[u32]) -> WallDoor {
        let room = self.end();
        let found = &self.rooms[room];
        for cells in [&found.quiet, &found.cells] {
            let mut deepest = cells.clone();
            deepest.sort_by_key(|&cell| (core::cmp::Reverse(steps[cell]), cell));
            for cell in deepest {
                let door = (self.way_in.cell, self.way_in.side);
                let wall = |side: Side| {
                    let stone = self.beside(cell, side).is_some_and(|next| found.stones.contains(&next));
                    self.rock_beside(cell, side) && !stone && (cell, side) != door
                };
                if let Some(side) = SIDES.into_iter().find(|&side| wall(side)) {
                    return WallDoor { cell, side, room };
                }
            }
        }
        WallDoor { room, ..self.way_in }
    }

    /// The end: the last room the way reaches in the last block, where the Reeve and the return portal stand.
    #[must_use]
    pub const fn end(&self) -> usize {
        self.end
    }

    /// Where a body arrives and comes back after death: before the exit door, (x, y), and the way it faces, away from
    /// the door into its room.
    #[must_use]
    pub fn arrival(&self) -> ([f64; 2], [f64; 2]) {
        let [x, y] = self.centre(self.way_in.cell);
        let [dx, dy] = self.way_in.side.unit();
        ([x - dx * ARRIVE_PAST_MIDDLE_M, y - dy * ARRIVE_PAST_MIDDLE_M], [-dx, -dy])
    }

    /// The exit door's middle at its foot, (x, y), on its wall.
    #[must_use]
    pub fn exit_door(&self) -> [f64; 2] {
        self.on_wall(self.way_in)
    }

    /// The return portal's middle at its foot, (x, y), on its wall: as wide and as high as the exit door.
    #[must_use]
    pub fn portal_door(&self) -> [f64; 2] {
        self.on_wall(self.portal)
    }

    /// A wall door's middle at its foot, (x, y), just off its wall.
    fn on_wall(&self, door: WallDoor) -> [f64; 2] {
        let [x, y] = self.centre(door.cell);
        let [dx, dy] = door.side.unit();
        let off = CELL_M / 2.0 - EXIT_OFF_WALL_M;
        [x + dx * off, y + dy * off]
    }

    /// The floor as movement stands bodies on it: each cell's height, 0 m for an open cell and none for rock, row by
    /// row from the north-west, in cells of CELL_M.
    #[must_use]
    pub fn heights(&self) -> Vec<Option<f64>> {
        self.cells.iter().map(|&cell| (cell != Cell::Rock).then_some(0.0)).collect()
    }

    /// What a body runs into beside the rock, each (min x, min y, max x, max y, top): every doorway's two jambs, up
    /// to its ceiling, then every pillar, then every prop's solid (a hanging has none), then every fixture's.
    #[must_use]
    pub fn boxes(&self) -> Vec<[f64; 5]> {
        let half = CELL_M / 2.0;
        let mut boxes = Vec::with_capacity(self.frames.len() * 2 + self.pillars.len());
        for frame in &self.frames {
            let [x, y] = self.centre(frame.cell);
            let [dx, dy] = frame.side.unit();
            let (edge_x, edge_y) = (x + dx * half, y + dy * half);
            let (across_x, across_y) = (-dy, dx);
            for (from, to) in [(-half, -DOORWAY_HALF_M), (DOORWAY_HALF_M, half)] {
                let corners =
                    [(from, 0.0), (to, 0.0), (from, JAMB_DEPTH_M), (to, JAMB_DEPTH_M)].map(|(along, deep)| {
                        (edge_x + across_x * along + dx * deep, edge_y + across_y * along + dy * deep)
                    });
                let (min_x, max_x) = corners
                    .iter()
                    .fold((f64::MAX, f64::MIN), |(low, high), point| (low.min(point.0), high.max(point.0)));
                let (min_y, max_y) = corners
                    .iter()
                    .fold((f64::MAX, f64::MIN), |(low, high), point| (low.min(point.1), high.max(point.1)));
                boxes.push([min_x, min_y, max_x, max_y, frame.height]);
            }
        }
        for &[x, y, top] in &self.pillars {
            boxes.push([x - PILLAR_HALF_M, y - PILLAR_HALF_M, x + PILLAR_HALF_M, y + PILLAR_HALF_M, top]);
        }
        boxes.extend(self.props.iter().filter_map(|prop| prop.solid));
        boxes.extend(self.fixtures.iter().filter_map(|fixture| fixture.solid));
        boxes
    }
}
