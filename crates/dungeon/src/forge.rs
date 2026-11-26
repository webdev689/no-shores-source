//! A whole dungeon laid from its seed: two to five blocks in a chain from the way in's, each one to three storeys deep
//! (`descent.rs`), each block storey laid to its plan (`block.rs`) and copied into the grid, its flights and its
//! gallery with it; then the way in, the end on the deepest storey of the last block, the main way between them, the
//! vaults off it, and everything the rooms stand.

use crate::block::{BLOCK_CELLS, BlockLayout};
use crate::descent::{BlockPlan, Gallery, plan_blocks, storey_counts};
use crate::lane::Lane;
use crate::styles::Style;
use crate::{
    BLOCKS, CELL_M, CORRIDOR_HEIGHT_M, Cell, Dungeon, FLIGHT_CEILING_M, SIDES, STOREYS_MOST, Side, Stair, WallDoor,
    storey_floor,
};

/// The share of dungeons whose last block is laid in the style below.
const DEEPER_SHARE: f64 = 0.5;
/// A gallery's balustrade: how far it reaches into the gallery from the open air's edge, and how high it stands (m).
pub const BALUSTRADE_DEEP_M: f64 = 0.25;
pub const BALUSTRADE_M: f64 = 1.0;
/// The vaults a dungeon of up to VAULT_BLOCKS blocks holds, and one more past them.
const VAULT_BLOCKS: usize = 3;

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

impl Dungeon {
    /// The dungeon a seed lays in a style: how many blocks drawn on its own lane, two to five alike, and whether its
    /// last is laid in the style below on another.
    #[must_use]
    pub fn forge(seed: u32, style: Style) -> Self {
        Self::forge_within(seed, style, BLOCKS)
    }

    /// The dungeon a seed lays in a style, its block count drawn within `blocks`, fewest and most, each as likely, on
    /// its size lane, as deep as STOREYS_MOST storeys.
    #[must_use]
    pub fn forge_within(seed: u32, style: Style, blocks: (usize, usize)) -> Self {
        Self::forge_storeys(seed, style, blocks, STOREYS_MOST)
    }

    /// The dungeon a seed lays in a style within `blocks`, no block deeper than `most` storeys (1 to STOREYS_MOST):
    /// at 1, every block one storey.
    #[must_use]
    pub fn forge_storeys(seed: u32, style: Style, blocks: (usize, usize), most: usize) -> Self {
        let count = Lane::named(&format!("size:{seed}")).int(blocks.0, blocks.1);
        let deeper = Lane::named(&format!("deeper:{seed}")).chance(DEEPER_SHARE);
        let grown = grow(&mut Lane::named(&format!("squares:{seed}")), count);
        let (west, north) =
            grown.iter().fold((0, 0), |(west, north), &(column, row)| (west.min(column), north.min(row)));
        let squares: Vec<(usize, usize)> =
            grown.iter().map(|&(column, row)| (column.abs_diff(west), row.abs_diff(north))).collect();
        let columns = (squares.iter().map(|square| square.0).max().unwrap_or(0) + 1) * BLOCK_CELLS;
        let rows = (squares.iter().map(|square| square.1).max().unwrap_or(0) + 1) * BLOCK_CELLS;
        let looks = if deeper { vec![style, style.style_below()] } else { vec![style] };
        let block_looks: Vec<usize> =
            (0..count).map(|number| if deeper && number + 1 == count { 1 } else { 0 }).collect();
        let block_storeys = storey_counts(seed, count, most.clamp(1, STOREYS_MOST));
        let styles: Vec<Style> = block_looks.iter().map(|&look| looks[look]).collect();
        let plans = plan_blocks(seed, &squares, &block_storeys, &styles);
        let storeys = block_storeys.iter().copied().max().unwrap_or(1);
        let plane = columns * rows;
        let door = WallDoor { cell: 0, side: Side::North, room: 0 };
        let mut dungeon = Self {
            style,
            looks,
            squares: squares.clone(),
            block_looks: block_looks.clone(),
            block_storeys: block_storeys.clone(),
            columns,
            rows,
            storeys,
            cells: vec![Cell::Rock; storeys * plane],
            ceilings: vec![0.0; storeys * plane],
            stairs: Vec::new(),
            rooms: Vec::new(),
            way_in: door,
            end: 0,
            portal: door,
            main_way: Vec::new(),
            vaults: Vec::new(),
            chest_rooms: Vec::new(),
            torches: Vec::new(),
            frames: Vec::new(),
            pillars: Vec::new(),
            balustrades: Vec::new(),
            props: Vec::new(),
            fixtures: Vec::new(),
            landmarks: Vec::new(),
        };
        let layouts: Vec<Vec<BlockLayout>> = plans
            .iter()
            .enumerate()
            .map(|(number, plan)| {
                (0..plan.storeys.len())
                    .map(|storey| {
                        let name = if storey == 0 {
                            format!("block:{seed}:{number}")
                        } else {
                            format!("block:{seed}:{number}:{storey}")
                        };
                        let way_in = number == 0 && storey == 0;
                        BlockLayout::sound(crate::lane::named(&name), &plan.storeys[storey], &styles[number], way_in)
                    })
                    .collect()
            })
            .collect();
        // Each block storey's rooms, by their numbers in the dungeon.
        let mut owned: Vec<Vec<core::ops::Range<usize>>> = Vec::new();
        for (number, storeys) in layouts.iter().enumerate() {
            let mut own = Vec::new();
            for (storey, layout) in storeys.iter().enumerate() {
                let first = dungeon.rooms.len();
                dungeon.lay(squares[number], storey, layout, block_looks[number]);
                own.push(first..dungeon.rooms.len());
            }
            dungeon.lay_plan(squares[number], &plans[number]);
            owned.push(own);
        }
        dungeon.pillars = (0..dungeon.rooms.len()).flat_map(|room| dungeon.pillars_of(room)).collect();
        if let Some((x, y, side)) = layouts[0][0].exit_spot() {
            let cell = dungeon.cell_of(squares[0], 0, x, y);
            dungeon.way_in = WallDoor { cell, side, room: dungeon.room_at(cell).unwrap_or(0) };
        }
        let steps = dungeon.walk();
        let deepest = owned.last().and_then(|storeys| storeys.last()).cloned().unwrap_or(0..0);
        dungeon.end = deepest
            .filter(|&room| dungeon.rooms[room].walk != u32::MAX)
            .max_by_key(|&room| (dungeon.rooms[room].walk, core::cmp::Reverse(room)))
            .unwrap_or(0);
        dungeon.main_way = dungeon.main_way_of(&steps);
        dungeon.portal = dungeon.portal_spot(&steps);
        // The portal's torches first: the rooms' keep clear of them.
        dungeon.flank_portal();
        for (number, storeys) in layouts.iter().enumerate() {
            for (storey, layout) in storeys.iter().enumerate() {
                dungeon.light(squares[number], storey, layout);
            }
        }
        dungeon.vaults = dungeon.vaults_of();
        dungeon.name_rooms(seed);
        dungeon.place_landmarks(seed);
        dungeon.give_names();
        dungeon.chest_rooms = owned.iter().flatten().filter_map(|rooms| dungeon.dead_end_needing(rooms)).collect();
        dungeon.furnish(seed, &steps);
        dungeon.frame();
        dungeon
    }

    /// Copies a block's flights into the grid, on both their storeys, and its gallery's open air with its balustrade.
    fn lay_plan(&mut self, square: (usize, usize), plan: &BlockPlan) {
        for flight in &plan.flights {
            let (Some(cells), Some((top, bottom))) = (flight.cells(), flight.landings()) else { continue };
            let number = u16::try_from(self.stairs.len()).unwrap_or(u16::MAX);
            let plane_of = |(x, y): (usize, usize)| self.cell_of(square, 0, x, y);
            let stair =
                Stair { upper: flight.upper, cells: cells.map(plane_of), top: plane_of(top), bottom: plane_of(bottom) };
            let plane = self.plane();
            for storey in [flight.upper, flight.upper + 1] {
                for cell in stair.cells {
                    self.cells[storey * plane + cell] = Cell::Stair(number);
                    self.ceilings[storey * plane + cell] = FLIGHT_CEILING_M;
                }
            }
            self.stairs.push(stair);
        }
        for (storey, planned) in plan.storeys.iter().enumerate() {
            if let Some(gallery) = &planned.gallery {
                self.lay_gallery(square, storey, gallery);
            }
        }
    }

    /// A gallery's open air over the great room under it, and a balustrade along every edge of the gallery it meets.
    fn lay_gallery(&mut self, square: (usize, usize), storey: usize, gallery: &Gallery) {
        // Open air only over the great room's floor: over a cave's bitten edge or its stones the rock stays.
        for &(x, y) in &gallery.void {
            let cell = self.cell_of(square, storey, x, y);
            if self.room_at(cell + self.plane()).is_some() {
                self.cells[cell] = Cell::Void;
                self.ceilings[cell] = CORRIDOR_HEIGHT_M;
            }
        }
        let floor = storey_floor(storey);
        for &(x, y) in &gallery.cells {
            let cell = self.cell_of(square, storey, x, y);
            let [middle_x, middle_y] = self.centre(cell);
            for side in SIDES {
                if self.beside(cell, side).is_none_or(|next| self.cells[next] != Cell::Void) {
                    continue;
                }
                let [dx, dy] = side.unit();
                let half = CELL_M / 2.0;
                let (edge_x, edge_y) = (middle_x + dx * half, middle_y + dy * half);
                let (inner_x, inner_y) = (edge_x - dx * BALUSTRADE_DEEP_M, edge_y - dy * BALUSTRADE_DEEP_M);
                let (min_x, max_x) = if dx == 0.0 {
                    (middle_x - half, middle_x + half)
                } else {
                    (edge_x.min(inner_x), edge_x.max(inner_x))
                };
                let (min_y, max_y) = if dy == 0.0 {
                    (middle_y - half, middle_y + half)
                } else {
                    (edge_y.min(inner_y), edge_y.max(inner_y))
                };
                self.balustrades.push([min_x, min_y, max_x, max_y, floor, floor + BALUSTRADE_M]);
            }
        }
    }

    /// The main way: the walk from the way in's cell to the end room's nearest cell, each step to the lowest-numbered
    /// cell one step nearer the way in; its cells from the way in.
    fn main_way_of(&self, steps: &[u32]) -> Vec<usize> {
        let nearest =
            self.rooms.get(self.end).and_then(|end| end.cells.iter().copied().min_by_key(|&cell| (steps[cell], cell)));
        let Some(mut cell) = nearest.filter(|&cell| steps[cell] != u32::MAX) else { return Vec::new() };
        let mut way = vec![cell];
        while steps[cell] > 0 {
            let Some(before) = self.walk_from(cell).filter(|&next| steps[next] + 1 == steps[cell]).min() else { break };
            cell = before;
            way.push(cell);
        }
        way.reverse();
        way
    }

    /// How many doorways a room has: its cells' sides that meet a corridor.
    #[must_use]
    pub fn doorways_of(&self, room: usize) -> usize {
        let corridor = |next: usize| self.cells[next] == Cell::Corridor;
        self.rooms[room]
            .cells
            .iter()
            .map(|&cell| SIDES.into_iter().filter(|&side| self.beside(cell, side).is_some_and(corridor)).count())
            .sum()
    }

    /// Whether a room is a dead end: one doorway alone.
    #[must_use]
    pub fn dead_end(&self, room: usize) -> bool {
        self.doorways_of(room) == 1
    }

    /// The vaults: one in a dungeon of up to VAULT_BLOCKS blocks, two in a longer one, each a room off the main way
    /// but the way in's and the end, on the deepest storey it can, a dead end first, then the farthest along the walk.
    fn vaults_of(&self) -> Vec<usize> {
        let want = if self.squares.len() > VAULT_BLOCKS { 2 } else { 1 };
        let on_way = |room: usize| self.rooms[room].cells.iter().any(|cell| self.main_way.contains(cell));
        let mut off: Vec<usize> = (0..self.rooms.len())
            .filter(|&room| room != self.way_in.room && room != self.end && !on_way(room))
            .filter(|&room| self.rooms[room].walk != u32::MAX)
            .collect();
        off.sort_by_key(|&room| {
            let found = &self.rooms[room];
            (core::cmp::Reverse(found.storey), !self.dead_end(room), core::cmp::Reverse(found.walk), room)
        });
        off.truncate(want);
        off
    }

    /// A block storey's dead end that holds nothing else, which its chest stands in: none where its one dead end is
    /// the way in's room, the end, a vault or a landmark's room.
    fn dead_end_needing(&self, rooms: &core::ops::Range<usize>) -> Option<usize> {
        rooms.clone().find(|&room| {
            self.dead_end(room)
                && room != self.way_in.room
                && room != self.end
                && !self.vaults.contains(&room)
                && !self.landmarks.iter().any(|placed| placed.room == room)
        })
    }
}
