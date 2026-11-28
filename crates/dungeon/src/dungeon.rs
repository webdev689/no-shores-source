//! A whole dungeon (laid by `forge.rs`): two to five blocks in a chain from the way in's, each one to three storeys
//! deep, so the way runs from a beginning through a middle to an end; in about half of them the last block is laid in
//! the style below the first. With it, what the rooms and the Game read: the way in's exit door, the return portal in
//! the end room, each room's walk from the way in, purpose, name and ceiling, its landmarks, and what a body runs into
//! beside the rock, the doorways' jambs, the great rooms' pillars, the props, the fixtures and the landmarks.

use crate::block::{BLOCK_CELLS, BlockLayout};
use crate::fixtures::Fixture;
use crate::landmarks::Placed;
use crate::purposes::Purpose;
use crate::shapes::{Ceiling, Shape, ceiling};
use crate::styles::Style;
use crate::torches::Torch;
use crate::{CELL_M, Cell, SIDES, Side};

/// Blocks a dungeon grows to, fewest and most, each count as likely; and the share of dungeons whose last block is
/// laid in the style below.
pub const BLOCKS: (usize, usize) = (2, 5);
/// Blocks an Elite Dungeon grows to: four or five, longer than a patrol's.
pub const ELITE_BLOCKS: (usize, usize) = (4, 5);
/// A doorway's frame: the opening's half width, the jambs' depth into the corridor, and the lintel's underside (m).
pub const DOORWAY_HALF_M: f64 = 0.8;
pub const JAMB_DEPTH_M: f64 = 0.3;
pub const LINTEL_M: f64 = 2.8;
/// A pillar's half width, and the room that stands them: at least this many cells each way.
pub const PILLAR_HALF_M: f64 = 0.35;
/// The way in's storey's floor, metres up: storey 0's.
pub const FLOOR_M: f64 = 0.0;
const PILLAR_ROOM_CELLS: usize = 4;
/// The exit door's width and height, how far off its wall it stands, and how far past its cell's middle, away from it,
/// a body arrives (m), as the Forge stands a body in front of its exit door.
pub const EXIT_WIDTH_M: f64 = 1.4;
pub const EXIT_HEIGHT_M: f64 = 2.4;
const EXIT_OFF_WALL_M: f64 = 0.02;
const ARRIVE_PAST_MIDDLE_M: f64 = 0.4;

/// A room: its rectangle in the dungeon's cells, its cells and those of them no side of which meets a corridor (row
/// by row), the rock standing inside it, its ceiling's height and form, its shape, how many cells' walk it lies from
/// the way in, its look (by its number among the dungeon's), its purpose, and its role and name: its purpose's, or
/// its landmark's where one stands in it.
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
    /// The storey it stands on, 0 the way in's.
    pub storey: usize,
    pub purpose: &'static Purpose,
    pub role: &'static str,
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

/// A dungeon as the Forge lays it, in its own frame: x east and y south from its north-west corner, its top storey's
/// floor at 0 m.
#[derive(Clone, Debug, PartialEq)]
pub struct Dungeon {
    /// The first block's style, which names the dungeon.
    pub style: Style,
    /// The looks its parts wear, the first block's first: its style, and the style below where its last block is.
    pub looks: Vec<Style>,
    /// The blocks' squares, the way in's first, each its column and row of blocks, and each block's look.
    pub squares: Vec<(usize, usize)>,
    pub block_looks: Vec<usize>,
    /// How many storeys each block holds, from storey 0 down.
    pub block_storeys: Vec<usize>,
    pub columns: usize,
    pub rows: usize,
    /// Its storeys, at least 1; `cells` and `ceilings` hold a plane of `columns` by `rows` for each, storey by storey.
    pub storeys: usize,
    pub cells: Vec<Cell>,
    /// Each open cell's ceiling over its own floor, 0 for rock.
    pub ceilings: Vec<f64>,
    /// The flights of stairs between storeys.
    pub stairs: Vec<crate::Stair>,
    pub rooms: Vec<Room>,
    pub way_in: WallDoor,
    /// The end room: the last the way reaches in the last block.
    pub end: usize,
    /// The return portal: on the wall of the end room farthest from the way in, it takes a player back out.
    pub portal: WallDoor,
    /// The main way: the walk's cells from the way in's to the end room's nearest.
    pub main_way: Vec<usize>,
    /// The rooms that are vaults, off the main way, and the dead ends whose chest stands in them first.
    pub vaults: Vec<usize>,
    pub chest_rooms: Vec<usize>,
    pub torches: Vec<Torch>,
    pub frames: Vec<Frame>,
    /// Each pillar's middle, (x, y), and its top, absolute.
    pub pillars: Vec<[f64; 3]>,
    /// A gallery's balustrade, each (min x, min y, max x, max y, bottom, top): a block a body climbs and drops from.
    pub balustrades: Vec<[f64; 6]>,
    /// The props its rooms are furnished with, and the lights that are not torches (`furnish`, `fixtures`).
    pub props: Vec<crate::Prop>,
    pub fixtures: Vec<Fixture>,
    /// The set pieces its rooms are remembered by (`landmarks`).
    pub landmarks: Vec<Placed>,
}

impl Dungeon {
    /// A cell's look, by its number among `looks`: its block's; None for rock.
    #[must_use]
    pub fn look_at(&self, cell: usize) -> Option<usize> {
        if self.cells.get(cell).is_none_or(|&kind| kind == Cell::Rock) {
            return None;
        }
        let at = cell % self.plane();
        let square = ((at % self.columns) / BLOCK_CELLS, (at / self.columns) / BLOCK_CELLS);
        let block = self.squares.iter().position(|&found| found == square)?;
        self.block_looks.get(block).copied()
    }

    /// The whole grid's cell for a block's cell (x, y) on a storey.
    pub(crate) fn cell_of(&self, square: (usize, usize), storey: usize, x: usize, y: usize) -> usize {
        storey * self.plane() + (square.1 * BLOCK_CELLS + y) * self.columns + square.0 * BLOCK_CELLS + x
    }

    /// The room a cell is, if it is one.
    #[must_use]
    pub fn room_at(&self, cell: usize) -> Option<usize> {
        match self.cells.get(cell) {
            Some(&Cell::Room(number)) => Some(usize::from(number)),
            _ => None,
        }
    }

    /// The cell beside a cell on its storey, if it is in the grid.
    #[must_use]
    pub fn beside(&self, cell: usize, side: Side) -> Option<usize> {
        let (dx, dy) = side.step();
        let (storey, at) = (cell / self.plane(), cell % self.plane());
        let x = (at % self.columns).checked_add_signed(dx)?;
        let y = (at / self.columns).checked_add_signed(dy)?;
        (x < self.columns && y < self.rows).then_some(storey * self.plane() + y * self.columns + x)
    }

    /// Whether the cell beside on `side` is rock, or past the grid.
    pub(crate) fn rock_beside(&self, cell: usize, side: Side) -> bool {
        self.beside(cell, side).is_none_or(|next| self.cells[next] == Cell::Rock)
    }

    /// A cell's middle, (x, y) in metres, whatever its storey.
    #[must_use]
    pub fn centre(&self, cell: usize) -> [f64; 2] {
        let at = cell % self.plane();
        [((at % self.columns) as f64 + 0.5) * CELL_M, ((at / self.columns) as f64 + 0.5) * CELL_M]
    }

    /// A cell's middle on its floor, (x, y, z) in metres.
    #[must_use]
    pub fn standing_point(&self, cell: usize) -> [f64; 3] {
        let [x, y] = self.centre(cell);
        [x, y, self.floor_of(cell)]
    }

    /// Copies a block storey's cells, ceilings and rooms into the grid, its rooms numbered after those laid before
    /// and wearing its look.
    pub(crate) fn lay(&mut self, square: (usize, usize), storey: usize, block: &BlockLayout, look: usize) {
        let first = self.rooms.len();
        for y in 0..BLOCK_CELLS {
            for x in 0..BLOCK_CELLS {
                let cell = self.cell_of(square, storey, x, y);
                let local = y * BLOCK_CELLS + x;
                self.cells[cell] = match block.cells[local] {
                    Cell::Room(number) => Cell::Room(u16::try_from(first + usize::from(number)).unwrap_or(u16::MAX)),
                    other => other,
                };
                self.ceilings[cell] = block.ceilings[local];
            }
        }
        for (number, room) in block.rooms.iter().enumerate() {
            let own = |(x, y): (usize, usize)| self.cell_of(square, storey, x, y);
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
                storey,
                // Each room's own purpose and name are given once the walk is known (`name_rooms`).
                purpose: &style.purposes.way_in,
                role: style.purposes.way_in.role,
                name: String::new(),
            };
            self.rooms.push(placed);
        }
    }

    /// The corners a room's pillars stand on: every second inner corner of a hewn room (no cave) at least
    /// PILLAR_ROOM_CELLS each way, all four cells round it the room's own and no open air over them, since a gallery's
    /// hall rises there; each corner and the room's ceiling.
    pub(crate) fn pillars_of(&self, number: usize) -> Vec<[f64; 3]> {
        let room = &self.rooms[number];
        if room.width < PILLAR_ROOM_CELLS || room.depth < PILLAR_ROOM_CELLS || room.shape == Shape::Cave {
            return Vec::new();
        }
        let first = room.storey * self.plane();
        let open_over = |cell: usize| room.storey > 0 && self.cells[cell - self.plane()] == Cell::Void;
        let own = |x: usize, y: usize| {
            let cell = first + y * self.columns + x;
            self.room_at(cell) == Some(number) && !open_over(cell)
        };
        let top = crate::storey_floor(room.storey) + room.height;
        let mut corners = Vec::new();
        for y in (room.y + 2..room.y + room.depth - 1).step_by(2) {
            for x in (room.x + 2..room.x + room.width - 1).step_by(2) {
                if own(x, y) && own(x - 1, y) && own(x, y - 1) && own(x - 1, y - 1) {
                    corners.push([x as f64 * CELL_M, y as f64 * CELL_M, top]);
                }
            }
        }
        corners
    }

    /// Frames every doorway: a room's cell beside a corridor, up to the lower of their ceilings.
    pub(crate) fn frame(&mut self) {
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
            for next in self.walk_from(cell) {
                if steps[next] == u32::MAX {
                    steps[next] = steps[cell] + 1;
                    todo.push_back(next);
                }
            }
        }
        steps
    }

    /// Where the return portal stands: on a wall of the end room that is no stone, at the cell farthest from the way
    /// in by walk (its quiet cells first) that has the best such wall, the first of them. Best is a wall that runs on
    /// past its cell both ways, so its torches stand on it; then one whose every end is that or the room's corner,
    /// where a torch stands on the side wall; then any. On the way in's own wall only where the end room has no other.
    pub(crate) fn portal_spot(&self, steps: &[u32]) -> WallDoor {
        let room = self.end();
        let found = &self.rooms[room];
        let door = (self.way_in.cell, self.way_in.side);
        let wall = |cell: usize, side: Side| {
            let stone = self.beside(cell, side).is_some_and(|next| found.stones.contains(&next));
            self.rock_beside(cell, side) && !stone && (cell, side) != door
        };
        let runs_on = |cell: usize, side: Side, along: Side| {
            self.beside(cell, along).is_some_and(|next| self.room_at(next) == Some(room) && wall(next, side))
        };
        let cornered = |cell: usize, along: Side| self.rock_beside(cell, along) && (cell, along) != door;
        // How well a wall holds the portal's torches: 2 on it both ways, 1 on it or a corner's side wall, 0 neither.
        let holds = |cell: usize, side: Side| {
            let ends = [side.clockwise(), side.clockwise().opposite()];
            if ends.into_iter().all(|along| runs_on(cell, side, along)) {
                2
            } else if ends.into_iter().all(|along| runs_on(cell, side, along) || cornered(cell, along)) {
                1
            } else {
                0
            }
        };
        for least in [2, 1, 0] {
            for cells in [&found.quiet, &found.cells] {
                let mut deepest = cells.clone();
                deepest.sort_by_key(|&cell| (core::cmp::Reverse(steps[cell]), cell));
                for cell in deepest {
                    let fits = |&side: &Side| wall(cell, side) && holds(cell, side) >= least;
                    if let Some(side) = SIDES.into_iter().find(fits) {
                        return WallDoor { cell, side, room };
                    }
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

    /// A storey's plane as movement walls bodies in it: each cell's floor where it is open (a flight's and a Void's
    /// as well) and none for rock, row by row from the north-west, in cells of CELL_M.
    #[must_use]
    pub fn heights(&self, storey: usize) -> Vec<Option<f64>> {
        let floor = crate::storey_floor(storey);
        let plane = &self.cells[storey * self.plane()..(storey + 1) * self.plane()];
        plane.iter().map(|&cell| (cell != Cell::Rock).then_some(floor)).collect()
    }

    /// What a body runs into beside the rock, each (min x, min y, max x, max y, bottom, top), absolute: every
    /// doorway's two jambs, up to its ceiling, then every pillar, then every prop's solid (a hanging has none), then
    /// every fixture's, then every landmark's. Each stands on the floor of the storey its top is over.
    #[must_use]
    pub fn boxes(&self) -> Vec<[f64; 6]> {
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
                let floor = self.floor_of(frame.cell);
                boxes.push([min_x, min_y, max_x, max_y, floor, floor + frame.height]);
            }
        }
        let mut solids: Vec<[f64; 5]> = self
            .pillars
            .iter()
            .map(|&[x, y, top]| [x - PILLAR_HALF_M, y - PILLAR_HALF_M, x + PILLAR_HALF_M, y + PILLAR_HALF_M, top])
            .collect();
        solids.extend(self.props.iter().filter_map(|prop| prop.solid));
        solids.extend(self.fixtures.iter().filter_map(|fixture| fixture.solid));
        solids.extend(self.landmarks.iter().flat_map(|placed| placed.solids.iter().copied()));
        boxes.extend(solids.into_iter().map(|[min_x, min_y, max_x, max_y, top]| {
            [min_x, min_y, max_x, max_y, crate::storey_floor(self.storey_under(top)), top]
        }));
        boxes
    }

    /// Which of `boxes` are the doorways' jambs, and which stand loose on the floor: the props' and the fixtures' (a
    /// rock, rubble, a brazier). The rest, the pillars and the landmarks', are built into the dungeon.
    #[must_use]
    pub fn jamb_and_loose_boxes(&self) -> (core::ops::Range<usize>, core::ops::Range<usize>) {
        let (jambs, first) = (self.frames.len() * 2, self.frames.len() * 2 + self.pillars.len());
        let props = self.props.iter().filter(|prop| prop.solid.is_some()).count();
        let fixtures = self.fixtures.iter().filter(|fixture| fixture.solid.is_some()).count();
        (0..jambs, first..first + props + fixtures)
    }

    /// The storey a point at a height is in, or a solid with that top stands on: the highest floor at or under it.
    #[must_use]
    pub fn storey_under(&self, z: f64) -> usize {
        crate::storey_under(self.storeys, z)
    }
}
