//! The landmarks: set pieces a dungeon's rooms are remembered by, one in a dungeon of two or three blocks and two in
//! one of four or five, each in a room of its own style and never the way in's or the end. A piece stands on whole
//! cells of its room, clear of the room's rim, or with its back on the rock; never on or beside a doorway, the way in
//! or the portal, nor on a torch's cell, and the room's other cells stay one walk and as many as its band. The room
//! takes the landmark's role and name, and its purpose furnishes it round the piece.

use crate::lane::Lane;
use crate::props::posts_for;
use crate::{CELL_M, Cell, Dungeon, PILLAR_HALF_M, SIDES, Side};

/// A landmark as `content/dungeon/landmarks.json` lists it: its module, its style's key, its role and name, its
/// footprint in cells (west to east, north to south), whether its north edge stands on a wall with its front to the
/// south, and its solids (min x, min y, max x, max y, top) and glows (x, y, z, kind) in its own frame, x east and y
/// south from the footprint's north-west corner.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Landmark {
    pub module: &'static str,
    pub style: &'static str,
    pub role: &'static str,
    pub name: &'static str,
    pub cells: [usize; 2],
    pub wall: bool,
    pub solids: &'static [[f64; 5]],
    pub glows: &'static [[f64; 4]],
}

/// The landmarks as `content/dungeon/landmarks.json` lists them, in its order: the crate's `build.rs` writes them from
/// it as the crate builds.
pub const LANDMARKS: &[Landmark] = include!(concat!(env!("OUT_DIR"), "/landmarks.rs"));

/// A landmark placed: its room, the cells it covers (row by row), the north-west corner of its turned footprint (m),
/// its quarter turns clockwise, and its solids and glows in the dungeon's frame.
#[derive(Clone, Debug, PartialEq)]
pub struct Placed {
    pub landmark: &'static Landmark,
    pub room: usize,
    pub cells: Vec<usize>,
    pub origin: [f64; 2],
    pub turns: u8,
    pub solids: Vec<[f64; 5]>,
    pub glows: Vec<[f64; 4]>,
}

/// A point of a footprint `footprint_m` wide and deep, turned `turns` quarters clockwise, from the north-west corner
/// of the turned footprint.
#[must_use]
pub fn turned(point: [f64; 2], turns: u8, footprint_m: [f64; 2]) -> [f64; 2] {
    let ([x, y], [width, depth]) = (point, footprint_m);
    match turns % 4 {
        0 => [x, y],
        1 => [depth - y, x],
        2 => [width - x, depth - y],
        _ => [y, width - x],
    }
}

/// A solid of a footprint turned as `turned` turns its corners.
#[must_use]
pub fn turned_box(solid: [f64; 5], turns: u8, footprint_m: [f64; 2]) -> [f64; 5] {
    let [first_x, first_y] = turned([solid[0], solid[1]], turns, footprint_m);
    let [second_x, second_y] = turned([solid[2], solid[3]], turns, footprint_m);
    [first_x.min(second_x), first_y.min(second_y), first_x.max(second_x), first_y.max(second_y), solid[4]]
}

/// The wall a wall piece's back stands on at each turn: its north edge turned.
const BACKS: [Side; 4] = [Side::North, Side::East, Side::South, Side::West];

/// Where a footprint might stand: its north-west cell (column, row), its size in cells, its turns, and its back's side
/// for a wall piece.
#[derive(Clone, Copy, Debug)]
struct Spot {
    column: usize,
    row: usize,
    across: usize,
    down: usize,
    turns: u8,
    back: Option<Side>,
}

/// A list shuffled on a lane.
fn shuffled<T>(mut items: Vec<T>, lane: &mut Lane) -> Vec<T> {
    for last in (1..items.len()).rev() {
        items.swap(last, lane.below(last + 1));
    }
    items
}

impl Dungeon {
    /// Places the landmarks on the lane `landmark:<seed>`: each look's in an order drawn once, the rooms tried from
    /// the middle of the walk outward, the first that fits a room standing there; then takes away the pillars they
    /// stand in place of.
    pub(crate) fn place_landmarks(&mut self, seed: u32) {
        let mut lane = Lane::named(&format!("landmark:{seed}"));
        let orders: Vec<Vec<&'static Landmark>> = self
            .looks
            .iter()
            .map(|look| shuffled(LANDMARKS.iter().filter(|landmark| landmark.style == look.key).collect(), &mut lane))
            .collect();
        let want = if self.squares.len() >= 4 { 2 } else { 1 };
        for room in self.landmark_rooms() {
            if self.landmarks.len() == want {
                break;
            }
            for &landmark in &orders[self.rooms[room].look] {
                if self.landmarks.iter().any(|placed| placed.landmark.module == landmark.module) {
                    continue;
                }
                let drawn = if landmark.wall { 0 } else { lane.below(4) as u8 };
                if let Some(placed) = self.fit(room, landmark, drawn) {
                    self.landmarks.push(placed);
                    break;
                }
            }
        }
        self.clear_pillars();
    }

    /// The rooms a landmark may stand in, all but the way in's and the end, from the middle of the walk outward.
    fn landmark_rooms(&self) -> Vec<usize> {
        let mut along: Vec<usize> =
            (0..self.rooms.len()).filter(|&room| room != self.way_in.room && room != self.end).collect();
        along.sort_by_key(|&room| (self.rooms[room].walk, room));
        let last = along.len().saturating_sub(1);
        let mut order: Vec<usize> = (0..along.len()).collect();
        order.sort_by_key(|&nth| ((2 * nth).abs_diff(last), nth));
        order.into_iter().map(|nth| along[nth]).collect()
    }

    /// A landmark placed in a room where it fits: a free one at the drawn turn (or a quarter on, where that lays its
    /// footprint the other way) nearest the room's middle, clear of the rim where any spot is and else against the
    /// rock; a wall one facing away from its wall, nearest that wall's middle.
    fn fit(&self, room: usize, landmark: &'static Landmark, drawn: u8) -> Option<Placed> {
        let found = &self.rooms[room];
        let [wide, deep] = landmark.cells;
        let turns: Vec<u8> = if landmark.wall {
            vec![0, 1, 2, 3]
        } else if wide == deep {
            vec![drawn]
        } else {
            vec![drawn, (drawn + 1) % 4]
        };
        let mut spots = Vec::new();
        for turn in turns {
            let (across, down) = if turn.is_multiple_of(2) { (wide, deep) } else { (deep, wide) };
            let back = landmark.wall.then_some(BACKS[usize::from(turn)]);
            for row in found.y..=(found.y + found.depth).saturating_sub(down) {
                for column in found.x..=(found.x + found.width).saturating_sub(across) {
                    spots.push(Spot { column, row, across, down, turns: turn, back });
                }
            }
        }
        // Free pieces nearest the room's middle, wall pieces nearest the middle of the room's side they stand on;
        // the drawn turn first, then row by row.
        let middle = [found.x as f64 + found.width as f64 / 2.0, found.y as f64 + found.depth as f64 / 2.0];
        let apart = |spot: &Spot| {
            let (west, north) = (spot.column as f64, spot.row as f64);
            let (east, south) = (west + spot.across as f64, north + spot.down as f64);
            let (point, aim) = match spot.back {
                None => ([(west + east) / 2.0, (north + south) / 2.0], middle),
                Some(Side::North) => ([(west + east) / 2.0, north], [middle[0], found.y as f64]),
                Some(Side::South) => ([(west + east) / 2.0, south], [middle[0], (found.y + found.depth) as f64]),
                Some(Side::West) => ([west, (north + south) / 2.0], [found.x as f64, middle[1]]),
                Some(Side::East) => ([east, (north + south) / 2.0], [(found.x + found.width) as f64, middle[1]]),
            };
            (point[0] - aim[0]) * (point[0] - aim[0]) + (point[1] - aim[1]) * (point[1] - aim[1])
        };
        spots.sort_by(|first, second| apart(first).total_cmp(&apart(second)));
        // Few rooms but the greatest have a spot clear of the rim, so a free piece may then stand against the rock.
        let passes: &[bool] = if landmark.wall { &[false] } else { &[false, true] };
        let spot = passes.iter().find_map(|&backed| spots.iter().find(|spot| self.stands(room, spot, backed)))?;
        Some(self.placed(room, landmark, spot))
    }

    /// The cells a spot covers, row by row.
    fn covered(&self, spot: &Spot) -> Vec<usize> {
        (spot.row..spot.row + spot.down)
            .flat_map(|row| (spot.column..spot.column + spot.across).map(move |column| (row, column)))
            .map(|(row, column)| row * self.columns + column)
            .collect()
    }

    /// Whether a landmark may stand on a spot in a room: on its cells; its back on rock and its other edges inside
    /// the room, or, `backed`, a free piece's edges inside the room or on rock, never on two opposite sides; on no
    /// torch's cell; on and beside no
    /// doorway, the way in or the portal; and the room's other cells one walk and enough.
    fn stands(&self, room: usize, spot: &Spot, backed: bool) -> bool {
        let cells = self.covered(spot);
        let own = |cell: usize| self.room_at(cell) == Some(room);
        if !cells.iter().all(|&cell| own(cell)) {
            return false;
        }
        let rim = cells.iter().all(|&cell| {
            SIDES.into_iter().all(|side| {
                let next = self.beside(cell, side);
                if next.is_some_and(|next| cells.contains(&next)) {
                    true
                } else if spot.back == Some(side) {
                    self.rock_beside(cell, side)
                } else {
                    next.is_some_and(own) || (backed && self.rock_beside(cell, side))
                }
            })
        });
        // Backed on rock on two opposite sides it would fill a passage, not stand in a room.
        let on_rock = |side: Side| {
            cells.iter().any(|&cell| {
                self.beside(cell, side).is_none_or(|next| !cells.contains(&next)) && self.rock_beside(cell, side)
            })
        };
        let pinched = (on_rock(Side::North) && on_rock(Side::South)) || (on_rock(Side::East) && on_rock(Side::West));
        let touches = |at: usize| {
            cells.iter().any(|&cell| cell == at || SIDES.into_iter().any(|side| self.beside(cell, side) == Some(at)))
        };
        let doorway = |cell: usize| {
            SIDES.into_iter().any(|side| self.beside(cell, side).is_some_and(|next| self.cells[next] == Cell::Corridor))
        };
        let found = &self.rooms[room];
        let clear = !found.cells.iter().any(|&cell| doorway(cell) && touches(cell))
            && !self.torches.iter().any(|torch| cells.contains(&self.cell_at(torch.at)))
            && !touches(self.way_in.cell)
            && !touches(self.portal.cell);
        rim && !(backed && spot.back.is_none() && pinched) && clear && self.walk_round(room, &cells)
    }

    /// Whether a room's cells off a footprint are one walk and as many as its band.
    fn walk_round(&self, room: usize, footprint: &[usize]) -> bool {
        let found = &self.rooms[room];
        let rest: Vec<usize> = found.cells.iter().copied().filter(|cell| !footprint.contains(cell)).collect();
        let Some(&first) = rest.first() else { return false };
        let (mut reached, mut todo) = (vec![first], vec![first]);
        while let Some(at) = todo.pop() {
            for side in SIDES {
                if let Some(next) = self.beside(at, side)
                    && rest.contains(&next)
                    && !reached.contains(&next)
                {
                    reached.push(next);
                    todo.push(next);
                }
            }
        }
        reached.len() == rest.len() && rest.len() >= posts_for(found.cells.len())
    }

    /// A landmark as it stands on a spot: its cells, its corner and turns, and its solids and glows turned onto it.
    fn placed(&self, room: usize, landmark: &'static Landmark, spot: &Spot) -> Placed {
        let footprint = [landmark.cells[0] as f64 * CELL_M, landmark.cells[1] as f64 * CELL_M];
        let origin = [spot.column as f64 * CELL_M, spot.row as f64 * CELL_M];
        let solids = landmark
            .solids
            .iter()
            .map(|&solid| {
                let [min_x, min_y, max_x, max_y, top] = turned_box(solid, spot.turns, footprint);
                [min_x + origin[0], min_y + origin[1], max_x + origin[0], max_y + origin[1], top]
            })
            .collect();
        let glows = landmark
            .glows
            .iter()
            .map(|&[x, y, z, kind]| {
                let [turned_x, turned_y] = turned([x, y], spot.turns, footprint);
                [turned_x + origin[0], turned_y + origin[1], z, kind]
            })
            .collect();
        Placed { landmark, room, cells: self.covered(spot), origin, turns: spot.turns, solids, glows }
    }

    /// Whether a cell lies under a landmark.
    #[must_use]
    pub fn under_landmark(&self, cell: usize) -> bool {
        self.landmarks.iter().any(|placed| placed.cells.contains(&cell))
    }

    /// The pillars a landmark's footprint stands in place of: every one whose box meets it.
    pub(crate) fn clear_pillars(&mut self) {
        let footprints: Vec<[f64; 4]> = self
            .landmarks
            .iter()
            .map(|placed| {
                let [wide, deep] = placed.landmark.cells.map(|cells| cells as f64 * CELL_M);
                let (across, down) = if placed.turns.is_multiple_of(2) { (wide, deep) } else { (deep, wide) };
                [placed.origin[0], placed.origin[1], placed.origin[0] + across, placed.origin[1] + down]
            })
            .collect();
        self.pillars.retain(|&[x, y, _]| {
            footprints.iter().all(|&[west, north, east, south]| {
                x + PILLAR_HALF_M <= west
                    || x - PILLAR_HALF_M >= east
                    || y + PILLAR_HALF_M <= north
                    || y - PILLAR_HALF_M >= south
            })
        });
    }
}
