//! A room furnished by its purpose: each lay's pieces stood by its pattern, every one inside its own cell and under
//! the ceiling. A piece never stands on a doorway's cell (one beside a corridor, so no frame is ever blocked), on the
//! way in's cell, the portal's or the Reeve's post, against a torch's wall, within half a metre of a flame, or as a
//! solid within a cell's length of the Reeve's post; and once it stands, the room's free cells are still one walk and
//! as many as its foes take.

use crate::fixtures::Fixture;
use crate::lane::Lane;
use crate::models::{Piece, PropModel};
use crate::props::{HUNG_M, Prop, posts_for};
use crate::purposes::{Facing, Lay, Pattern};
use crate::{CELL_M, Cell, Dungeon, SIDES, Side};

/// How much room a piece leaves under its room's ceiling, how far a free-standing piece keeps inside its cell's
/// edges, how long a piece along a wall may be and how far out from it, and how far any solid keeps from a flame (m).
const UNDER_CEILING_M: f64 = 0.3;
const FREE_MARGIN_M: f64 = 0.4;
const ALONG_WALL_M: f64 = CELL_M - 0.1;
const MOST_INTO_M: f64 = 2.0;
const FLAME_CLEAR_M: f64 = 0.5;
/// How far every piece and fixture with a solid keeps from the Reeve's post: past his cache, 1.6 m out and clear by
/// 0.5 m, with floor round him to fight on.
const POST_CLEAR_M: f64 = CELL_M;

/// A room while it is furnished: the cells a piece may take, the cells and walls taken, the solids' cells, the flames
/// a solid keeps clear of, and what has been laid.
#[derive(Debug)]
pub(crate) struct Fitting {
    pub room: usize,
    pub height: f64,
    /// The quiet cells a piece may stand on, row by row.
    pub open: Vec<usize>,
    pub taken: Vec<usize>,
    pub solid: Vec<usize>,
    pub walls: Vec<(usize, Side)>,
    pub flames: Vec<[f64; 2]>,
    /// The Reeve's post, in the end room.
    pub post: Option<[f64; 2]>,
    /// How many of the room's cells stay free.
    pub keep: usize,
    /// The room's cell first reached from the way in, and the wall a Flank stands by.
    pub entry: usize,
    pub anchor: Option<(usize, Side)>,
    pub props: Vec<Prop>,
    pub fixtures: Vec<Fixture>,
}

/// Draws a piece from the families: a family with a piece that fits, then one of its pieces that fits.
pub(crate) fn draw(lane: &mut Lane, families: &[&[PropModel]], fits: impl Fn(&PropModel) -> bool) -> Option<PropModel> {
    let fitting: Vec<Vec<PropModel>> = families
        .iter()
        .map(|family| family.iter().copied().filter(|model| fits(model)).collect::<Vec<_>>())
        .filter(|family| !family.is_empty())
        .collect();
    let family = fitting.get(lane.below(fitting.len()))?;
    family.get(lane.below(family.len())).copied()
}

/// How far a point lies from a box across the floor.
fn apart(point: [f64; 2], solid: &[f64; 5]) -> f64 {
    let dx = (solid[0] - point[0]).max(point[0] - solid[2]).max(0.0);
    let dy = (solid[1] - point[1]).max(point[1] - solid[3]).max(0.0);
    (dx * dx + dy * dy).sqrt()
}

impl Fitting {
    /// Whether the room's free cells stay one walk and enough, with `cell` taken by a solid too.
    fn walk_holds(&self, dungeon: &Dungeon, cell: usize) -> bool {
        let cells = &dungeon.rooms[self.room].cells;
        let free: Vec<usize> = cells.iter().copied().filter(|&at| at != cell && !self.solid.contains(&at)).collect();
        let Some(&first) = free.first() else { return false };
        if free.len() < self.keep {
            return false;
        }
        let mut reached = vec![first];
        let mut todo = vec![first];
        while let Some(at) = todo.pop() {
            for side in SIDES {
                if let Some(next) = dungeon.beside(at, side)
                    && free.contains(&next)
                    && !reached.contains(&next)
                {
                    reached.push(next);
                    todo.push(next);
                }
            }
        }
        reached.len() == free.len()
    }

    /// Whether a piece or a fixture may stand on `cell`, against `wall` if it stands against one, with this solid.
    pub(crate) fn may(&self, dungeon: &Dungeon, cell: usize, wall: Option<Side>, solid: Option<&[f64; 5]>) -> bool {
        let open = self.open.contains(&cell) && !self.taken.contains(&cell);
        let wall_free = wall.is_none_or(|side| !self.walls.contains(&(cell, side)) && dungeon.rock_beside(cell, side));
        let clear = solid.is_none_or(|solid| {
            self.flames.iter().all(|&flame| apart(flame, solid) >= FLAME_CLEAR_M)
                && self.post.is_none_or(|post| apart(post, solid) >= POST_CLEAR_M)
                && self.walk_holds(dungeon, cell)
        });
        open && wall_free && clear
    }

    /// Takes a cell, and a wall if one, for something that stands there.
    pub(crate) fn take(&mut self, cell: usize, wall: Option<Side>, solid: bool) {
        self.taken.push(cell);
        if solid {
            self.solid.push(cell);
        }
        self.walls.extend(wall.map(|side| (cell, side)));
    }

    /// Stands a prop on `cell` if it may; whether it stood.
    fn put(&mut self, dungeon: &Dungeon, cell: usize, wall: Option<Side>, prop: Prop) -> bool {
        if !self.may(dungeon, cell, wall, prop.solid.as_ref()) {
            return false;
        }
        self.take(cell, wall, prop.solid.is_some());
        self.props.push(prop);
        true
    }

    /// Whether a piece stood on the floor fits under the ceiling, and one hung does.
    fn fits_under(&self, model: &PropModel) -> bool {
        let foot = if model.piece == Piece::Hung { HUNG_M } else { 0.0 };
        foot + model.height() <= self.height - UNDER_CEILING_M
    }

    /// Whether a piece fits against a wall: along it and out from it, inside its cell.
    fn fits_wall(&self, model: &PropModel, wall: Side) -> bool {
        let (front, into) = model.against(wall);
        let (reach_x, reach_y) = model.plan(front);
        let along = if wall.unit()[0] == 0.0 { reach_x } else { reach_y };
        model.piece != Piece::Hung && self.fits_under(model) && along <= ALONG_WALL_M && into <= MOST_INTO_M
    }

    /// Whether a piece fits free-standing in a cell, FREE_MARGIN_M inside its edges, whichever way it faces.
    fn fits_free(&self, model: &PropModel) -> bool {
        let room = CELL_M - 2.0 * FREE_MARGIN_M;
        model.piece != Piece::Hung && self.fits_under(model) && model.width() <= room && model.depth() <= room
    }

    /// The side of a cell that looks most toward the room's entry, its front for a piece that faces whoever comes in.
    fn toward_entry(&self, dungeon: &Dungeon, cell: usize) -> Side {
        let ([x, y], [to_x, to_y]) = (dungeon.centre(cell), dungeon.centre(self.entry));
        let (dx, dy) = (to_x - x, to_y - y);
        if dx.abs() >= dy.abs() && dx != 0.0 {
            if dx > 0.0 { Side::East } else { Side::West }
        } else if dy > 0.0 {
            Side::South
        } else {
            Side::North
        }
    }

    /// Lays one lay's pieces by its pattern.
    pub(crate) fn lay(&mut self, dungeon: &Dungeon, lane: &mut Lane, lay: &Lay) {
        let cells = dungeon.rooms[self.room].cells.len();
        let count = |per: usize| (cells / per).max(1);
        match lay.pattern {
            Pattern::Walls { per } => self.walls_lay(dungeon, lane, lay.families, count(per), false),
            Pattern::Hung { per } => self.walls_lay(dungeon, lane, lay.families, count(per), true),
            Pattern::Middle => self.middle(dungeon, lane, lay.families),
            Pattern::Rows { facing } => self.rows(dungeon, lane, lay.families, facing),
            Pattern::Flank => self.flank(dungeon, lane, lay.families),
            Pattern::Alcoves => self.alcoves(dungeon, lane, lay.families),
            Pattern::Rubble { per } => self.rubble(dungeon, lane, lay.families, count(per)),
        }
    }

    /// The rock walls of the open cells not yet taken, shuffled on the lane.
    pub(crate) fn wall_spots(&self, dungeon: &Dungeon, lane: &mut Lane) -> Vec<(usize, Side)> {
        let mut spots: Vec<(usize, Side)> = self
            .open
            .iter()
            .flat_map(|&cell| SIDES.into_iter().map(move |side| (cell, side)))
            .filter(|&(cell, side)| dungeon.rock_beside(cell, side) && !self.walls.contains(&(cell, side)))
            .collect();
        for last in (1..spots.len()).rev() {
            spots.swap(last, lane.below(last + 1));
        }
        spots
    }

    /// Up to `count` pieces against the walls, or hung on them.
    fn walls_lay(&mut self, dungeon: &Dungeon, lane: &mut Lane, families: &[&[PropModel]], count: usize, hung: bool) {
        let mut laid = 0;
        for (cell, side) in self.wall_spots(dungeon, lane) {
            if laid == count {
                break;
            }
            if self.taken.contains(&cell) {
                continue;
            }
            let fits = |model: &PropModel| {
                if hung { model.piece == Piece::Hung && self.fits_under(model) } else { self.fits_wall(model, side) }
            };
            let Some(model) = draw(lane, families, fits) else { continue };
            let middle = dungeon.centre(cell);
            let prop = if hung { model.hung(middle, side) } else { model.on_wall(middle, side) };
            if self.put(dungeon, cell, Some(side), prop) {
                laid += 1;
            }
        }
    }

    /// The open cells, nearest the room's middle first.
    pub(crate) fn nearest_middle(&self, dungeon: &Dungeon) -> Vec<usize> {
        let room = &dungeon.rooms[self.room];
        let middle =
            [(room.x as f64 + room.width as f64 / 2.0) * CELL_M, (room.y as f64 + room.depth as f64 / 2.0) * CELL_M];
        let from_middle = |cell: usize| {
            let [x, y] = dungeon.centre(cell);
            (x - middle[0]) * (x - middle[0]) + (y - middle[1]) * (y - middle[1])
        };
        let mut cells = self.open.clone();
        cells.sort_by(|&first, &second| from_middle(first).total_cmp(&from_middle(second)));
        cells
    }

    /// One piece free-standing on the open cell nearest the middle that takes it, its front to the entry.
    fn middle(&mut self, dungeon: &Dungeon, lane: &mut Lane, families: &[&[PropModel]]) {
        let Some(model) = draw(lane, families, |model| self.fits_free(model)) else { return };
        for cell in self.nearest_middle(dungeon) {
            let front = self.toward_entry(dungeon, cell);
            if self.put(dungeon, cell, None, model.stood(dungeon.centre(cell), front, 0.0, true)) {
                return;
            }
        }
    }

    /// One piece on each cell of every second line along the room's longer side, from the second line, but the ends
    /// of each line, which join the aisles between.
    fn rows(&mut self, dungeon: &Dungeon, lane: &mut Lane, families: &[&[PropModel]], facing: Facing) {
        let Some(model) = draw(lane, families, |model| self.fits_free(model)) else { return };
        let room = &dungeon.rooms[self.room];
        let along_x = room.width >= room.depth;
        let (length, lines) = if along_x { (room.width, room.depth) } else { (room.depth, room.width) };
        let entry_step =
            if along_x { self.entry % dungeon.columns - room.x } else { self.entry / dungeon.columns - room.y };
        let onward = 2 * entry_step < length;
        let front = match (facing, along_x, onward) {
            (Facing::Along, true, true) => Side::East,
            (Facing::Along, true, false) => Side::West,
            (Facing::Along, false, true) => Side::South,
            (Facing::Along, false, false) => Side::North,
            (Facing::Across, true, _) => Side::North,
            (Facing::Across, false, _) => Side::West,
        };
        for line in (1..lines).step_by(2) {
            for step in 1..length.saturating_sub(1) {
                let (x, y) = if along_x { (room.x + step, room.y + line) } else { (room.x + line, room.y + step) };
                let cell = y * dungeon.columns + x;
                if dungeon.room_at(cell) == Some(self.room) {
                    self.put(dungeon, cell, None, model.stood(dungeon.centre(cell), front, 0.0, true));
                }
            }
        }
    }

    /// The two cells either side of the anchor along its wall, each with rock on that side.
    pub(crate) fn flank_cells(&self, dungeon: &Dungeon) -> Option<(usize, usize, Side)> {
        let (cell, wall) = self.anchor?;
        let across = if wall.unit()[0] == 0.0 { [Side::West, Side::East] } else { [Side::North, Side::South] };
        let [first, second] = across.map(|side| dungeon.beside(cell, side));
        let (first, second) = (first?, second?);
        let stands = |at: usize| dungeon.room_at(at) == Some(self.room) && dungeon.rock_beside(at, wall);
        (stands(first) && stands(second)).then_some((first, second, wall))
    }

    /// A pair of one piece against the anchor's wall, one either side of it, or none.
    fn flank(&mut self, dungeon: &Dungeon, lane: &mut Lane, families: &[&[PropModel]]) {
        let Some((first, second, wall)) = self.flank_cells(dungeon) else { return };
        let Some(model) = draw(lane, families, |model| self.fits_wall(model, wall)) else { return };
        let before = (self.taken.len(), self.solid.len(), self.walls.len(), self.props.len());
        let both = self.put(dungeon, first, Some(wall), model.on_wall(dungeon.centre(first), wall))
            && self.put(dungeon, second, Some(wall), model.on_wall(dungeon.centre(second), wall));
        if !both {
            self.taken.truncate(before.0);
            self.solid.truncate(before.1);
            self.walls.truncate(before.2);
            self.props.truncate(before.3);
        }
    }

    /// One piece in each alcove, against the rock facing its opening.
    fn alcoves(&mut self, dungeon: &Dungeon, lane: &mut Lane, families: &[&[PropModel]]) {
        for cell in self.open.clone() {
            let open: Vec<Side> = SIDES.into_iter().filter(|&side| !dungeon.rock_beside(cell, side)).collect();
            let [opening] = open[..] else { continue };
            let back = opening.opposite();
            let Some(model) = draw(lane, families, |model| self.fits_wall(model, back)) else { continue };
            self.put(dungeon, cell, Some(back), model.on_wall(dungeon.centre(cell), back));
        }
    }

    /// Up to `count` pieces scattered free-standing over open cells, each its own way and off its cell's middle.
    fn rubble(&mut self, dungeon: &Dungeon, lane: &mut Lane, families: &[&[PropModel]], count: usize) {
        let mut cells = self.open.clone();
        for last in (1..cells.len()).rev() {
            cells.swap(last, lane.below(last + 1));
        }
        let mut laid = 0;
        for cell in cells {
            if laid == count {
                break;
            }
            if self.taken.contains(&cell) {
                continue;
            }
            let Some(model) = draw(lane, families, |model| self.fits_free(model)) else { continue };
            let front = SIDES[lane.below(SIDES.len())];
            let (reach_x, reach_y) = model.plan(front);
            let slack = |reach: f64| CELL_M / 2.0 - FREE_MARGIN_M - reach / 2.0;
            let [x, y] = dungeon.centre(cell);
            let (shift_x, shift_y) =
                ((lane.draw() * 2.0 - 1.0) * slack(reach_x), (lane.draw() * 2.0 - 1.0) * slack(reach_y));
            if self.put(dungeon, cell, None, model.stood([x + shift_x, y + shift_y], front, 0.0, true)) {
                laid += 1;
            }
        }
    }
}

impl Dungeon {
    /// The room's fitting as furnishing begins: its quiet cells but those kept, its torches' walls and flames, and the
    /// Reeve's post if he stands in it.
    fn fitting(&self, room: usize, kept: &[usize], post: Option<usize>, steps: &[u32]) -> Fitting {
        let found = &self.rooms[room];
        // A landmark's footprint takes no piece, and walls the walk round it as a solid would.
        let under: Vec<usize> = found.cells.iter().copied().filter(|&cell| self.under_landmark(cell)).collect();
        let open: Vec<usize> =
            found.quiet.iter().copied().filter(|cell| !kept.contains(cell) && !under.contains(cell)).collect();
        let mut walls = vec![(self.way_in.cell, self.way_in.side), (self.portal.cell, self.portal.side)];
        walls.extend(self.torches.iter().map(|torch| (self.cell_at([torch.at[0], torch.at[1]]), torch.wall)));
        let flames = self.torches.iter().map(|torch| [torch.at[0], torch.at[1]]).collect();
        let entry = found.cells.iter().copied().min_by_key(|&cell| (steps[cell], cell)).unwrap_or(0);
        let anchor = if room == self.end {
            Some((self.portal.cell, self.portal.side))
        } else if room == self.way_in.room {
            Some((self.way_in.cell, self.way_in.side))
        } else {
            // The way on: the doorway farthest along the walk.
            let doorways = found.cells.iter().flat_map(|&cell| SIDES.into_iter().map(move |side| (cell, side)));
            doorways
                .filter(|&(cell, side)| self.beside(cell, side).is_some_and(|next| self.cells[next] == Cell::Corridor))
                .max_by_key(|&(cell, _)| (steps[cell], core::cmp::Reverse(cell)))
        };
        Fitting {
            room,
            height: found.height,
            open,
            taken: Vec::new(),
            solid: under,
            walls,
            flames,
            post: post.filter(|_| room == self.end).map(|cell| self.centre(cell)),
            keep: posts_for(found.cells.len()),
            entry,
            anchor,
            props: Vec::new(),
            fixtures: Vec::new(),
        }
    }

    /// Furnishes and lights every room by its purpose, each on lanes of its own. The Reeve's post, and the floor round
    /// it where his cache and its Vestiges lie, are kept clear.
    pub(crate) fn furnish(&mut self, seed: u32, steps: &[u32]) {
        let post = self.nearest_middle(self.end, 1).first().copied();
        let mut kept = vec![self.way_in.cell, self.portal.cell];
        kept.extend(post);
        for room in 0..self.rooms.len() {
            let mut fitting = self.fitting(room, &kept, post, steps);
            let purpose = self.rooms[room].purpose;
            let mut lane = Lane::named(&format!("props:{seed}:{room}"));
            for lay in purpose.lays {
                fitting.lay(self, &mut lane, lay);
            }
            let mut lane = Lane::named(&format!("lights:{seed}:{room}"));
            for light in purpose.lights {
                fitting.light(self, &mut lane, light);
            }
            self.props.extend(fitting.props);
            self.fixtures.extend(fitting.fixtures);
        }
    }
}
