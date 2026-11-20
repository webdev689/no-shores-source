//! A dungeon's torches, as the Forge stands them: on its rooms' walls, one for every sixteen cells of a room's
//! rectangle, on every fourth corridor cell, and two either side of the return portal; never over the exit door or
//! the portal.

use crate::block::{BLOCK_CELLS, BlockLayout};
use crate::{CELL_M, Cell, Dungeon, SIDES, Side};

/// A torch's height over the floor, how far in from its wall, and how far its light reaches (m).
pub const TORCH_M: f64 = 2.1;
const TORCH_INSET_M: f64 = 0.35;
pub const TORCH_REACH_M: f64 = 8.0;
/// How far along its wall each of the portal's two torches stands from its middle: past its arch, which a style's
/// kit draws out to 1.3 m, so its bracket stands clear of it, inside its cell.
const PORTAL_TORCH_M: f64 = 1.5;

/// A torch on a wall: where its flame is (x east, y south, z up), and the side of its cell its wall is on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Torch {
    pub at: [f64; 3],
    pub wall: Side,
}

impl Dungeon {
    /// A torch on the first wall of a cell that has one, never over the exit door or the portal; whether it stood.
    fn torch_on(&mut self, cell: usize) -> bool {
        let doors = [(self.way_in.cell, self.way_in.side), (self.portal.cell, self.portal.side)];
        let Some(wall) = SIDES.into_iter().find(|&side| self.rock_beside(cell, side) && !doors.contains(&(cell, side)))
        else {
            return false;
        };
        let [x, y] = self.centre(cell);
        let [dx, dy] = wall.unit();
        let off = CELL_M / 2.0 - TORCH_INSET_M;
        self.torches.push(Torch { at: [x + dx * off, y + dy * off, TORCH_M], wall });
        true
    }

    /// A block's torches: on a wall of each room, one for every sixteen of its rectangle's cells, its quiet cells on
    /// every third diagonal first and any of its cells if none will do; and on every fourth corridor cell, row by row.
    pub(crate) fn light(&mut self, square: (usize, usize), block: &BlockLayout) {
        for (number, room) in block.rooms.iter().enumerate() {
            let want = ((room.width * room.depth + 8) / 16).max(1);
            let mut lit = 0;
            for (x, y) in block.quiet_cells(number) {
                if lit < want && (x + y) % 3 == 0 && self.torch_on(self.cell_of(square, x, y)) {
                    lit += 1;
                }
            }
            for (x, y) in block.room_cells(number) {
                if lit == 0 && self.torch_on(self.cell_of(square, x, y)) {
                    lit += 1;
                }
            }
        }
        let mut corridors = 0;
        for y in 0..BLOCK_CELLS {
            for x in 0..BLOCK_CELLS {
                if block.cells[y * BLOCK_CELLS + x] == Cell::Corridor {
                    if corridors % 4 == 0 {
                        self.torch_on(self.cell_of(square, x, y));
                    }
                    corridors += 1;
                }
            }
        }
    }

    /// Two torches on the portal's wall, one either side of it, so the end of the way is lit and marked before the
    /// portal opens.
    pub(crate) fn flank_portal(&mut self) {
        let [x, y] = self.centre(self.portal.cell);
        let [dx, dy] = self.portal.side.unit();
        let off = CELL_M / 2.0 - TORCH_INSET_M;
        for along in [-PORTAL_TORCH_M, PORTAL_TORCH_M] {
            let at = [x + dx * off - dy * along, y + dy * off + dx * along, TORCH_M];
            self.torches.push(Torch { at, wall: self.portal.side });
        }
    }
}
