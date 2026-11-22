//! A prop as it stands in a dungeon: a forged model at a point, turned a quarter at a time, with the box it fills.
//! And where a room's foes stand once its props are laid: on its free cells nearest its middle.

use crate::models::PropModel;
use crate::{CELL_M, Dungeon, Side};

/// How far a piece against a wall stands its back off it, and a hanging its face (m).
pub(crate) const OFF_WALL_M: f64 = 0.1;
const HUNG_OFF_WALL_M: f64 = 0.02;
/// Where a hanging's foot is hung: over a body's head (m).
pub const HUNG_M: f64 = 2.0;
/// The most cells of a room its foes stand on, and a band's foes: one for each this many of its cells, rounded.
pub const POSTS_A_ROOM: usize = 4;
const CELLS_A_FOE: usize = 10;

/// How many of a room's cells its props leave free for its foes: one for each ten of its cells, rounded, two at
/// least and POSTS_A_ROOM at most. A band is as many foes.
#[must_use]
pub const fn posts_for(cells: usize) -> usize {
    let posts = (cells + CELLS_A_FOE / 2) / CELLS_A_FOE;
    if posts < 2 {
        2
    } else if posts > POSTS_A_ROOM {
        POSTS_A_ROOM
    } else {
        posts
    }
}

/// A prop laid: its model, where its origin stands (x east, y south, z up), its yaw (radians clockwise from north,
/// turning its +z as an RMB block's yaw does), and the box it fills (min x, min y, max x, max y, top); a hanging fills
/// none.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Prop {
    pub model: u32,
    pub at: [f64; 3],
    pub yaw: f64,
    pub solid: Option<[f64; 5]>,
}

impl PropModel {
    /// Its plan with its front to `front`: how far it reaches east-west and north-south (m).
    pub(crate) fn plan(&self, front: Side) -> (f64, f64) {
        if front.unit()[0] == 0.0 { (self.width(), self.depth()) } else { (self.depth(), self.width()) }
    }

    /// Stood with its box's middle over `centre`, its front (+z) to `front` and its foot `foot` over the floor; a
    /// solid where `solid` says.
    pub(crate) fn stood(&self, centre: [f64; 2], front: Side, foot: f64, solid: bool) -> Prop {
        let [front_x, front_y] = front.unit();
        let [right_x, right_y] = front.clockwise().unit();
        let (box_x, box_z) = ((self.min[0] + self.max[0]) / 2.0, (self.min[2] + self.max[2]) / 2.0);
        let at = [
            centre[0] - right_x * box_x - front_x * box_z,
            centre[1] - right_y * box_x - front_y * box_z,
            foot - self.min[1],
        ];
        let (reach_x, reach_y) = self.plan(front);
        let (half_x, half_y) = (reach_x / 2.0, reach_y / 2.0);
        let top = foot + self.height();
        let solid =
            solid.then_some([centre[0] - half_x, centre[1] - half_y, centre[0] + half_x, centre[1] + half_y, top]);
        Prop { model: self.id, at, yaw: front.bearing(), solid }
    }

    /// Its front and how far it reaches out from a wall when it stands against one: its front to the room, turned a
    /// quarter more where it is deeper than wide, so its long side runs along the wall.
    pub(crate) fn against(&self, wall: Side) -> (Side, f64) {
        if self.depth() > self.width() {
            (wall.opposite().clockwise(), self.width())
        } else {
            (wall.opposite(), self.depth())
        }
    }

    /// Stood on the floor against the wall on `wall`'s side of the cell whose middle is `middle`, its back
    /// OFF_WALL_M off it.
    pub(crate) fn on_wall(&self, middle: [f64; 2], wall: Side) -> Prop {
        let (front, into) = self.against(wall);
        let [wall_x, wall_y] = wall.unit();
        let off = CELL_M / 2.0 - OFF_WALL_M - into / 2.0;
        self.stood([middle[0] + wall_x * off, middle[1] + wall_y * off], front, 0.0, true)
    }

    /// Hung on the wall on `wall`'s side of the cell whose middle is `middle`, its face to the room and its foot at
    /// HUNG_M; no solid.
    pub(crate) fn hung(&self, middle: [f64; 2], wall: Side) -> Prop {
        let [wall_x, wall_y] = wall.unit();
        let off = CELL_M / 2.0 - HUNG_OFF_WALL_M - self.depth() / 2.0;
        self.stood([middle[0] + wall_x * off, middle[1] + wall_y * off], wall.opposite(), HUNG_M, false)
    }
}

impl Dungeon {
    /// The cell a point stands in.
    pub(crate) fn cell_at(&self, at: [f64; 2]) -> usize {
        (at[1] / CELL_M) as usize * self.columns + (at[0] / CELL_M) as usize
    }

    /// Whether a cell holds a solid: a prop's or a fixture's, each of which stands inside its own cell, or a
    /// landmark's footprint.
    #[must_use]
    pub fn holds_solid(&self, cell: usize) -> bool {
        if self.under_landmark(cell) {
            return true;
        }
        let mut solids = self
            .props
            .iter()
            .filter_map(|prop| prop.solid)
            .chain(self.fixtures.iter().filter_map(|fixture| fixture.solid));
        solids
            .any(|[min_x, min_y, max_x, max_y, _]| self.cell_at([(min_x + max_x) / 2.0, (min_y + max_y) / 2.0]) == cell)
    }

    /// A room's `count` free cells nearest its middle, those that hold no solid: its quiet cells first and then the
    /// rest, each nearest first, of two as near the first laid. Where a room's foes stand, and its first the Reeve's
    /// post in the end room. A smaller count's cells are always the first of a larger's.
    #[must_use]
    pub fn nearest_middle(&self, room: usize, count: usize) -> Vec<usize> {
        let found = &self.rooms[room];
        let middle = [
            (found.x as f64 + found.width as f64 / 2.0) * CELL_M,
            (found.y as f64 + found.depth as f64 / 2.0) * CELL_M,
        ];
        let from_middle = |cell: &usize| {
            let [x, y] = self.centre(*cell);
            (x - middle[0]) * (x - middle[0]) + (y - middle[1]) * (y - middle[1])
        };
        let nearest_first = |mut cells: Vec<usize>| {
            cells.sort_by(|first, second| from_middle(first).total_cmp(&from_middle(second)));
            cells
        };
        let free = |cell: &usize| !self.holds_solid(*cell);
        let quiet: Vec<usize> = found.quiet.iter().copied().filter(free).collect();
        let rest = found.cells.iter().copied().filter(|cell| !found.quiet.contains(cell) && free(cell)).collect();
        let mut cells = nearest_first(quiet);
        cells.extend(nearest_first(rest));
        cells.truncate(count);
        cells
    }
}
