//! A dungeon's torches, as the Forge stands them: two either side of the return portal, then on its rooms' walls, one
//! for every sixteen cells of a room's rectangle, and on every fourth corridor cell; never over the exit door or the
//! portal, in a corner, or as a pair with another of its room's.

use crate::block::{BLOCK_CELLS, BlockLayout};
use crate::{CELL_M, Cell, Dungeon, SIDES, Side};

/// A torch's height over the floor, how far in from its wall, and how far its light reaches (m).
pub const TORCH_M: f64 = 2.1;
pub(crate) const TORCH_INSET_M: f64 = 0.35;
pub const TORCH_REACH_M: f64 = 8.0;
/// Two torches of a room closer than this read as a pair, not as a room's light (m).
pub(crate) const TORCH_APART_M: f64 = 2.4;
/// How far along its wall each of the portal's two torches stands from its middle, inside its cell: past its arch,
/// which a style's kit draws out to 1.3 m, and a sconce's own 0.2 m, with 0.05 m between (tools/dungeon/envelope.py).
const PORTAL_TORCH_M: f64 = 1.55;

/// A torch on a wall: where its flame is (x east, y south, z up), and the side of its cell its wall is on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Torch {
    pub at: [f64; 3],
    pub wall: Side,
}

impl Dungeon {
    /// A torch in the middle of the first wall of a cell that has one, never over the exit door or the portal, nor
    /// within `TORCH_APART_M` of another of its room's; whether it stood.
    fn torch_on(&mut self, cell: usize) -> bool {
        let doors = [(self.way_in.cell, self.way_in.side), (self.portal.cell, self.portal.side)];
        let Some(wall) = SIDES.into_iter().find(|&side| self.rock_beside(cell, side) && !doors.contains(&(cell, side)))
        else {
            return false;
        };
        let at = self.wall_middle(cell, wall);
        let room = self.room_at(cell);
        let paired = room.is_some()
            && self.torches.iter().any(|torch| {
                let other = self.cell_at([torch.at[0], torch.at[1]]);
                let [dx, dy] = [torch.at[0] - at[0], torch.at[1] - at[1]];
                self.room_at(other) == room && dx * dx + dy * dy < TORCH_APART_M * TORCH_APART_M
            });
        if !paired {
            self.torches.push(Torch { at, wall });
        }
        !paired
    }

    /// A torch's flame over the middle of a cell's wall, in from it.
    fn wall_middle(&self, cell: usize, wall: Side) -> [f64; 3] {
        let [x, y] = self.centre(cell);
        let [dx, dy] = wall.unit();
        let off = CELL_M / 2.0 - TORCH_INSET_M;
        [x + dx * off, y + dy * off, TORCH_M]
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

    /// Two torches either side of the portal, so the end of the way is lit and marked before the portal opens: on its
    /// wall past its arch, or, where its cell is the room's corner that way, in the middle of the side wall, for
    /// past the arch the corner is too near.
    pub(crate) fn flank_portal(&mut self) {
        let portal = self.portal;
        let door = (self.way_in.cell, self.way_in.side);
        let [x, y, z] = self.wall_middle(portal.cell, portal.side);
        for along in [portal.side.clockwise(), portal.side.clockwise().opposite()] {
            if self.rock_beside(portal.cell, along) && (portal.cell, along) != door {
                self.torches.push(Torch { at: self.wall_middle(portal.cell, along), wall: along });
            } else {
                let [ax, ay] = along.unit();
                let at = [x + ax * PORTAL_TORCH_M, y + ay * PORTAL_TORCH_M, z];
                self.torches.push(Torch { at, wall: portal.side });
            }
        }
    }
}
