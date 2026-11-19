//! A dungeon's props: the forged models of its style laid against its rooms' walls, as the Forge laid a room's
//! scenery, one for each ten of its cells and at least one where a cell is free, each on a quiet cell against a wall.
//! They keep clear of the way in, the portal, a torch's wall, and the cells where a room's foes and the Reeve stand, so
//! nothing the rooms place meets one. Each is a solid a body, a foe and a shot meet.

use crate::lane::Lane;
use crate::{CELL_M, Dungeon, SIDES, Side};

/// A forged prop by its model id, and its box in the forged frame (x right, y up, z forward), as `content/forged/
/// props.json` measures it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PropModel {
    pub id: u32,
    pub min: [f64; 3],
    pub max: [f64; 3],
}

/// How far a prop's back stands off its wall, and how much room it leaves under its room's ceiling (m).
const OFF_WALL_M: f64 = 0.1;
const UNDER_CEILING_M: f64 = 0.3;
/// A room asks for one prop for each this many of its cells, and at least one.
const CELLS_A_PROP: usize = 10;
/// The cells nearest a room's middle a band of foes may stand on, kept clear of props.
pub const POSTS_A_ROOM: usize = 4;

/// A prop laid: its model, where its origin stands (x east, y south, z up), its yaw (radians clockwise from north,
/// turning its +z as an RMB block's yaw does), and the box it fills (min x, min y, max x, max y, top).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Prop {
    pub model: u32,
    pub at: [f64; 3],
    pub yaw: f64,
    pub solid: [f64; 5],
}

/// A Crypt's props: low coffins, tomb markers, a pedestal, broken columns and the Tithe's crates.
pub const CRYPT_PROPS: &[PropModel] = &[
    PropModel { id: 43304, min: [-0.45, -0.3, -1.05], max: [0.45, 0.375, 1.05] },
    PropModel { id: 43306, min: [-0.45, -0.275, -1.0], max: [0.45, 0.375, 1.1] },
    PropModel { id: 43055, min: [-0.5, -1.039, -0.5], max: [0.5, 0.861, 0.5] },
    PropModel { id: 43057, min: [-0.5, -1.039, -0.5], max: [0.5, 0.861, 0.5] },
    PropModel { id: 41020, min: [-0.285, -0.477, -0.285], max: [0.285, 0.468, 0.285] },
    PropModel { id: 41731, min: [-0.275, 0.0, -0.375], max: [0.275, 1.225, 0.225] },
    PropModel { id: 41733, min: [-0.3, 0.0, -0.4], max: [0.3, 1.05, 0.25] },
    PropModel { id: 41816, min: [-0.4, -0.201, -0.389], max: [0.4, 0.201, 0.389] },
    PropModel { id: 41818, min: [-0.289, -0.289, -0.289], max: [0.289, 0.289, 0.289] },
];

/// The Halls' props: the Tithe's crates, a cabinet, cupboards and shelves, a table, a bench, a chair and a rack.
#[allow(clippy::approx_constant, reason = "a chair's measured 0.318 m is the forged table's, not one over pi")]
pub const HALLS_PROPS: &[PropModel] = &[
    PropModel { id: 41816, min: [-0.4, -0.201, -0.389], max: [0.4, 0.201, 0.389] },
    PropModel { id: 41817, min: [-0.4, -0.25, -0.389], max: [0.4, 0.25, 0.389] },
    PropModel { id: 41822, min: [-0.389, -0.389, -0.389], max: [0.389, 0.389, 0.389] },
    PropModel { id: 41827, min: [-0.475, -0.3, -0.475], max: [0.475, 0.3, 0.475] },
    PropModel { id: 41831, min: [-0.475, -0.3, -0.4], max: [0.475, 0.3, 0.4] },
    PropModel { id: 41022, min: [-0.48, -0.443, -0.271], max: [0.48, 0.32, 0.344] },
    PropModel { id: 41032, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258] },
    PropModel { id: 41108, min: [-0.886, -0.443, -0.591], max: [0.886, 0.325, 0.591] },
    PropModel { id: 41105, min: [-0.9, -0.375, -0.25], max: [0.9, 0.175, 0.25] },
    PropModel { id: 41100, min: [-0.415, -0.372, -0.432], max: [0.41, 0.878, 0.318] },
    PropModel { id: 41125, min: [-0.6, -0.321, -0.775], max: [0.6, 0.479, 0.775] },
    PropModel { id: 41035, min: [-0.438, -0.859, -0.193], max: [0.438, 0.943, 0.258] },
];

/// The Cells' props: beds, a bench, a stool, a table, crates and a trough.
pub const CELLS_PROPS: &[PropModel] = &[
    PropModel { id: 41000, min: [-1.269, -0.262, -0.811], max: [0.936, 0.221, 0.808] },
    PropModel { id: 41001, min: [-1.2, -0.233, -0.512], max: [0.867, 0.38, 0.533] },
    PropModel { id: 41105, min: [-0.9, -0.375, -0.25], max: [0.9, 0.175, 0.25] },
    PropModel { id: 41103, min: [-0.358, -0.306, -0.341], max: [0.367, 0.844, 0.284] },
    PropModel { id: 41111, min: [-0.896, -0.392, -0.571], max: [0.876, 0.263, 0.61] },
    PropModel { id: 41816, min: [-0.4, -0.201, -0.389], max: [0.4, 0.201, 0.389] },
    PropModel { id: 41818, min: [-0.289, -0.289, -0.289], max: [0.289, 0.289, 0.289] },
    PropModel { id: 41209, min: [-0.25, -0.25, -1.026], max: [0.25, 0.25, 1.024] },
];

/// The Sanctum's props: statues, a pedestal, a lectern, columns, an obelisk and a throne.
pub const SANCTUM_PROPS: &[PropModel] = &[
    PropModel { id: 62327, min: [-0.5, -1.55, -0.5], max: [0.5, 1.55, 0.5] },
    PropModel { id: 62329, min: [-0.5, -1.55, -0.5], max: [0.5, 1.25, 1.0] },
    PropModel { id: 41020, min: [-0.285, -0.477, -0.285], max: [0.285, 0.468, 0.285] },
    PropModel { id: 41021, min: [-0.325, -1.033, -0.21], max: [0.325, 0.384, 0.292] },
    PropModel { id: 41723, min: [-0.425, 0.0, -0.55], max: [0.425, 2.6, 0.35] },
    PropModel { id: 43303, min: [-0.375, -0.925, -0.35], max: [0.375, 1.45, 0.4] },
    PropModel { id: 41122, min: [-0.546, -0.716, -0.414], max: [0.529, 1.309, 0.436] },
    PropModel { id: 41731, min: [-0.275, 0.0, -0.375], max: [0.275, 1.225, 0.225] },
];

impl PropModel {
    /// Its height, from its foot to its top.
    #[must_use]
    pub fn height(&self) -> f64 {
        self.max[1] - self.min[1]
    }

    /// Laid against the wall on `wall`'s side of the cell whose middle is `middle`, its front to the room: turned a
    /// quarter more where it is deeper than it is wide, so its long side runs along the wall.
    fn laid(&self, middle: [f64; 2], wall: Side) -> Prop {
        let (width, depth) = (self.max[0] - self.min[0], self.max[2] - self.min[2]);
        let along_wall = depth > width;
        // The model's +z and +x as they stand: its front, or its side when turned, faces the room.
        let front = if along_wall { clockwise(wall.opposite()) } else { wall.opposite() };
        let [front_x, front_y] = front.unit();
        let [right_x, right_y] = clockwise(front).unit();
        let into = if along_wall { width } else { depth };
        let [wall_x, wall_y] = wall.unit();
        let off = CELL_M / 2.0 - OFF_WALL_M - into / 2.0;
        let middle = [middle[0] + wall_x * off, middle[1] + wall_y * off];
        // The origin sits where the box's middle lands on that point.
        let (box_x, box_z) = ((self.min[0] + self.max[0]) / 2.0, (self.min[2] + self.max[2]) / 2.0);
        let at = [
            middle[0] - right_x * box_x - front_x * box_z,
            middle[1] - right_y * box_x - front_y * box_z,
            -self.min[1],
        ];
        let (half_x, half_y) = if wall_x == 0.0 {
            (if along_wall { depth } else { width } / 2.0, into / 2.0)
        } else {
            (into / 2.0, if along_wall { depth } else { width } / 2.0)
        };
        let solid = [middle[0] - half_x, middle[1] - half_y, middle[0] + half_x, middle[1] + half_y, self.height()];
        Prop { model: self.id, at, yaw: front.bearing(), solid }
    }
}

/// The side a quarter turn clockwise.
const fn clockwise(side: Side) -> Side {
    match side {
        Side::North => Side::East,
        Side::East => Side::South,
        Side::South => Side::West,
        Side::West => Side::North,
    }
}

impl Dungeon {
    /// A room's `count` cells nearest its middle: its quiet cells first and then the rest, each nearest first, of two as
    /// near the first laid. Where a room's foes stand, and its first the Reeve's post in the end room. A smaller count's
    /// cells are always the first of a larger's, so the cells kept for the most foes hold every band's.
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
        let rest = found.cells.iter().copied().filter(|cell| !found.quiet.contains(cell)).collect();
        let mut cells = nearest_first(found.quiet.clone());
        cells.extend(nearest_first(rest));
        cells.truncate(count);
        cells
    }

    /// Lays each room's props, every room on a lane of its own.
    pub(crate) fn furnish(&mut self, seed: u32, models: &[PropModel]) {
        let end_post = self.nearest_middle(self.end, 1);
        let mut kept: Vec<usize> = vec![self.way_in.cell, self.portal.cell];
        // The Reeve's post and the cells round it, where his cache and its Vestiges lie.
        for &post in &end_post {
            kept.push(post);
            for side in SIDES {
                if let Some(next) = self.beside(post, side) {
                    kept.push(next);
                    kept.extend(self.beside(next, clockwise(side)));
                }
            }
        }
        for room in 0..self.rooms.len() {
            kept.extend(self.nearest_middle(room, POSTS_A_ROOM));
        }
        let torches: Vec<(usize, Side)> =
            self.torches.iter().map(|torch| (self.cell_at(torch.at), torch.wall)).collect();
        for room in 0..self.rooms.len() {
            let mut lane = Lane::named(&format!("props:{seed}:{room}"));
            let mut spots: Vec<(usize, Side)> = self.rooms[room]
                .quiet
                .iter()
                .filter(|cell| !kept.contains(cell))
                .flat_map(|&cell| SIDES.into_iter().map(move |side| (cell, side)))
                .filter(|&(cell, side)| self.rock_beside(cell, side) && !torches.contains(&(cell, side)))
                .collect();
            for last in (1..spots.len()).rev() {
                spots.swap(last, lane.below(last + 1));
            }
            let want = (self.rooms[room].cells.len() / CELLS_A_PROP).max(1);
            let mut used: Vec<usize> = Vec::new();
            for (cell, side) in spots {
                if used.len() == want {
                    break;
                }
                let model = models[lane.below(models.len())];
                let fits = model.height() <= self.rooms[room].height - UNDER_CEILING_M;
                if fits && !used.contains(&cell) {
                    used.push(cell);
                    self.props.push(model.laid(self.centre(cell), side));
                }
            }
        }
    }

    /// The cell a point stands in.
    fn cell_at(&self, at: [f64; 3]) -> usize {
        (at[1] / CELL_M) as usize * self.columns + (at[0] / CELL_M) as usize
    }
}
