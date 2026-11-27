//! A dungeon's ground for its bodies: its storeys' floors, its flights' slopes and its rock a wall, and its doorways'
//! jambs, pillars, props, fixtures and landmarks solid. They are the ground's own walls rather than blocks, since
//! movement climbs a block too tall to step onto and a dungeon has ceilings over it. A body's middle keeps movement's
//! half-width from every one of them on its own storey, as a block keeps a body off its sides, so no body stands in a
//! wall's face. Each column of cells holds open spans one over another (`Dungeon::spans`): a body stands on the
//! highest floor at or below a step over its feet, and a line or a shot is stopped by rock and the slabs between.

use dungeon::{Cell, Dungeon, FLIGHT_CELLS, Span, Stair, storey_at, storey_floor};
use movement::heights::WALL_RISE_M;
use movement::{Heights, TUNING, Terrain};

/// A dungeon's ground: each storey's plane of open cells (a flight's and a Void's open), its cells, each column's
/// spans, the flights, its solids (min x, min y, max x, max y, bottom, top, as the dungeon's `boxes` give them) with
/// the storey each stands on, and for each column the solids within a body's half-width of it.
#[derive(Clone, Debug, PartialEq)]
pub struct DungeonGround {
    planes: Vec<Heights>,
    pub(crate) cell: f64,
    pub(crate) columns: usize,
    pub(crate) rows: usize,
    pub(crate) storeys: usize,
    cells: Vec<Cell>,
    spans: Vec<Vec<Span>>,
    stairs: Vec<Stair>,
    pub(crate) solids: Vec<[f64; 6]>,
    solid_storeys: Vec<usize>,
    pub(crate) near: Vec<Vec<usize>>,
}

/// How far a point stands from a rectangle: outside, the distance to it; inside, less than nothing by the distance to
/// its nearest side, so a body inside one can only move out.
fn apart_from(x: f64, y: f64, min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> f64 {
    let dx = if x < min_x {
        min_x - x
    } else if x > max_x {
        x - max_x
    } else {
        0.0
    };
    let dy = if y < min_y {
        min_y - y
    } else if y > max_y {
        y - max_y
    } else {
        0.0
    };
    if dx == 0.0 && dy == 0.0 {
        -(x - min_x).min(max_x - x).min(y - min_y).min(max_y - y)
    } else {
        (dx * dx + dy * dy).sqrt()
    }
}

impl DungeonGround {
    /// The ground of a dungeon as the Forge lays it.
    #[must_use]
    pub fn of(dungeon: &Dungeon) -> Option<Self> {
        let cell = dungeon::CELL_M;
        let (columns, rows, plane) = (dungeon.columns, dungeon.rows, dungeon.plane());
        let planes = (0..dungeon.storeys)
            .map(|storey| Heights::new(0.0, 0.0, cell, columns, rows, dungeon.heights(storey)))
            .collect::<Option<Vec<_>>>()?;
        let cells = dungeon.cells.clone();
        let solids = dungeon.boxes();
        let solid_storeys = solids.iter().map(|solid| dungeon.storey_at(solid[4])).collect();
        let reach = TUNING.radius;
        let mut near = vec![Vec::new(); plane];
        for (number, solid) in solids.iter().enumerate() {
            let first = |low: f64| ((low - reach) / cell).floor().max(0.0) as usize;
            let last = |high: f64, count: usize| (((high + reach) / cell).floor().max(0.0) as usize).min(count - 1);
            for row in first(solid[1])..=last(solid[3], rows) {
                for column in first(solid[0])..=last(solid[2], columns) {
                    near[row * columns + column].push(number);
                }
            }
        }
        let spans = (0..plane).map(|at| dungeon.spans(at)).collect();
        let (storeys, stairs) = (dungeon.storeys, dungeon.stairs.clone());
        Some(Self { planes, cell, columns, rows, storeys, cells, spans, stairs, solids, solid_storeys, near })
    }

    /// The solids, each (min x, min y, max x, max y, bottom, top).
    #[must_use]
    pub fn solids(&self) -> &[[f64; 6]] {
        &self.solids
    }

    /// The storey feet at `z` stand on: the one whose floor lies nearest.
    #[must_use]
    pub fn storey_at(&self, z: f64) -> usize {
        storey_at(self.storeys, z)
    }

    /// The column (a plane index) a point stands in, if it is in the grid.
    pub(crate) fn column_at(&self, x: f64, y: f64) -> Option<usize> {
        let (column, row) = ((x / self.cell).floor(), (y / self.cell).floor());
        let inside = column >= 0.0 && row >= 0.0 && column < self.columns as f64 && row < self.rows as f64;
        inside.then_some(row as usize * self.columns + column as usize)
    }

    /// The open spans of a column, lowest first.
    pub(crate) fn spans_of(&self, column: usize) -> &[Span] {
        &self.spans[column]
    }

    /// A span's floor at (x, y): its storey's, or its flight's slope.
    pub(crate) fn span_floor(&self, span: &Span, x: f64, y: f64) -> f64 {
        span.stair
            .and_then(|number| self.stairs.get(number))
            .map_or(span.floor, |stair| stair.slope_at(self.columns, x, y))
    }

    /// A span's reach for a body or a line: from its floor to its ceiling, but below the deepest storey's floor and
    /// over the top storey's ceiling nothing bounds it, so a shot sinking under the floor is met by the floor alone.
    pub(crate) fn span_reach(&self, span: &Span) -> (f64, f64) {
        let flat = span.stair.is_none();
        let low = if flat && span.storey + 1 == self.storeys { f64::NEG_INFINITY } else { span.floor };
        let high = if flat && span.storey == 0 { f64::INFINITY } else { span.ceiling };
        (low, high)
    }

    /// The span of a column that holds feet at `z`: its floor within a step of them and its ceiling over a crouched
    /// body's head.
    fn holding(&self, x: f64, y: f64, z: f64) -> Option<&Span> {
        let column = self.column_at(x, y)?;
        self.spans[column].iter().find(|span| {
            let (low, high) = self.span_reach(span);
            let low = if low == f64::NEG_INFINITY { low } else { self.span_floor(span, x, y) };
            low <= z + TUNING.step && z + TUNING.crouched_height <= high
        })
    }

    /// The storey whose rock and solids wall feet at `z` at a point: the storey of the room or corridor they stand in,
    /// so a body leaping high in a lower room keeps to it; on a flight, in the air or in rock, the nearest floor's.
    pub(crate) fn storey_of_feet(&self, x: f64, y: f64, z: f64) -> usize {
        match self.holding(x, y, z) {
            Some(span) if span.stair.is_none() => span.storey,
            _ => self.storey_at(z),
        }
    }

    /// Whether a solid stands on a storey.
    pub(crate) fn on_storey(&self, number: usize, storey: usize) -> bool {
        self.solid_storeys[number] == storey
    }

    /// Whether a cell beside another of its storey (or itself) is open to a body in that one, as the page walls it: a
    /// flight's cell and any other cell only where one is the flight's head on its upper storey or its foot on the
    /// lower and the other its landing there; a flight's cells to one another; rock never.
    fn open_from(&self, from: usize, to: usize) -> bool {
        match (self.cells[from], self.cells[to]) {
            (_, Cell::Rock) => false,
            (Cell::Stair(one), Cell::Stair(other)) => one == other,
            (Cell::Stair(number), _) => self.lands(number, from, to),
            (_, Cell::Stair(number)) => self.lands(number, to, from),
            _ => true,
        }
    }

    /// Whether `end`, a cell of flight `number`, is its head on its upper storey or its foot on the lower, and
    /// `landing` its landing there.
    fn lands(&self, number: u16, end: usize, landing: usize) -> bool {
        let plane = self.columns * self.rows;
        self.stairs.get(usize::from(number)).is_some_and(|flight| {
            let (storey, at, beside) = (end / plane, end % plane, landing % plane);
            (storey == flight.upper && at == flight.cells[0] && beside == flight.top)
                || (storey == flight.upper + 1 && at == flight.cells[FLIGHT_CELLS - 1] && beside == flight.bottom)
        })
    }

    /// How far a point stands from the nearest rock and solid of a storey, less than nothing inside one; no more
    /// than a body's half-width is ever asked, so only the cells round it are looked at.
    fn clearance(&self, x: f64, y: f64, storey: usize) -> f64 {
        let Some(at) = self.column_at(x, y) else { return 0.0 };
        let (column, row) = (at % self.columns, at / self.columns);
        let first = storey * self.columns * self.rows;
        let mut nearest = TUNING.radius;
        for (step_column, step_row) in [(-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1), (1, 1)] {
            // Past the grid on any side is rock, as a cell holding none is.
            let (next_column, next_row) = (column as isize + step_column, row as isize + step_row);
            let inside = next_column >= 0
                && next_row >= 0
                && (next_column as usize) < self.columns
                && (next_row as usize) < self.rows;
            if !inside || !self.open_from(first + at, first + next_row as usize * self.columns + next_column as usize) {
                let (west, north) = (next_column as f64 * self.cell, next_row as f64 * self.cell);
                nearest = nearest.min(apart_from(x, y, west, north, west + self.cell, north + self.cell));
            }
        }
        for &number in self.near[at].iter().filter(|&&number| self.on_storey(number, storey)) {
            let [min_x, min_y, max_x, max_y, _, _] = self.solids[number];
            nearest = nearest.min(apart_from(x, y, min_x, min_y, max_x, max_y));
        }
        nearest
    }

    /// How deep a point with feet at `z` lies inside a solid of their storey, metres: 0 on open floor.
    pub(crate) fn depth_in_solid(&self, x: f64, y: f64, z: f64) -> f64 {
        (-self.clearance(x, y, self.storey_of_feet(x, y, z))).max(0.0)
    }

    /// Whether the straight line between two points of a storey passes `keep` metres or more from all its rock, the
    /// grid's edge as rock, and every one of its solids: each rock cell near it and each solid, grown by `keep`, is
    /// tested against the line as `clear_of` tests a rectangle.
    #[must_use]
    pub fn clear_between(&self, from: [f64; 2], to: [f64; 2], keep: f64, storey: usize) -> bool {
        let first_cell = storey * self.columns * self.rows;
        let ends = [from, to].map(|[x, y]| self.column_at(x, y).map(|at| first_cell + at));
        let first = |low: f64| ((low - keep) / self.cell).floor() as isize;
        let last = |high: f64| ((high + keep) / self.cell).floor() as isize;
        let rock_clear = (first(from[1].min(to[1]))..=last(from[1].max(to[1]))).all(|row| {
            (first(from[0].min(to[0]))..=last(from[0].max(to[0]))).all(|column| {
                let inside = column >= 0 && row >= 0 && (column as usize) < self.columns && (row as usize) < self.rows;
                let (west, north) = (column as f64 * self.cell, row as f64 * self.cell);
                let open = |next: usize| {
                    self.cells[next] != Cell::Rock && ends.iter().flatten().all(|&end| self.open_from(end, next))
                };
                (inside && open(first_cell + row as usize * self.columns + column as usize))
                    || crate::dungeon_lines::clear_of(
                        [west, north, west + self.cell, north + self.cell],
                        from,
                        to,
                        keep,
                    )
            })
        });
        rock_clear
            && self.solids.iter().enumerate().filter(|(number, _)| self.on_storey(*number, storey)).all(|(_, solid)| {
                crate::dungeon_lines::clear_of([solid[0], solid[1], solid[2], solid[3]], from, to, keep)
            })
    }

    /// The highest floor or solid top at or below `reach` at a point; none where nothing is.
    fn ground_below(&self, x: f64, y: f64, reach: f64, solids: bool) -> Option<f64> {
        let column = self.column_at(x, y)?;
        let floors = self.spans[column].iter().map(|span| self.span_floor(span, x, y));
        let tops = self.near[column]
            .iter()
            .map(|&number| self.solids[number])
            .filter(|&[min_x, min_y, max_x, max_y, bottom, _]| {
                solids && bottom <= reach && x >= min_x && x <= max_x && y >= min_y && y <= max_y
            })
            .map(|solid| solid[5]);
        floors
            .filter(|&floor| floor <= reach)
            .chain(tops)
            .fold(None, |highest: Option<f64>, height| Some(highest.map_or(height, |found| found.max(height))))
    }
}

impl Terrain for DungeonGround {
    /// The highest ground of the column: the top storey's floor where it is open.
    fn height_at(&self, x: f64, y: f64) -> f64 {
        self.height_under(x, y, f64::INFINITY)
    }

    /// The floor of the column under the rock and the solids: `wall_entry` meets a shot at their faces.
    fn floor_at(&self, x: f64, y: f64) -> f64 {
        self.floor_under(x, y, f64::INFINITY)
    }

    /// The highest floor or slope at or below a step over the feet, or a solid's top over it where a thrown drop comes
    /// to rest (a body is kept out of a solid by `walled_at` all the same); a wall's height over the feet's storey
    /// where the column has none.
    fn height_under(&self, x: f64, y: f64, z: f64) -> f64 {
        self.ground_below(x, y, z + TUNING.step, true).unwrap_or_else(|| storey_floor(self.storey_at(z)) + WALL_RISE_M)
    }

    /// A move is walled with the feet at the top ground's height at its start.
    fn walled(&self, from: (f64, f64), to: (f64, f64)) -> bool {
        self.walled_at(from, to, self.height_at(from.0, from.1))
    }

    /// A move is walled when it crosses rock of the feet's storey, ends where no span holds the feet (a slab over
    /// them, or a floor more than a step over them), or ends nearer than a body's half-width to rock or a solid of
    /// that storey and nearer than it began: a body slides along a wall and steps away from one, but never into its
    /// face, and one shoved inside a solid can only move out of it.
    fn walled_at(&self, from: (f64, f64), to: (f64, f64), z: f64) -> bool {
        let storey = self.storey_of_feet(from.0, from.1, z);
        // Feet lifted onto a solid's top (a body shoved inside one) are held as on the floor under it, so a solid
        // reaching near a lower room's ceiling never leaves no room for the head to move out.
        let inside = self.depth_in_solid(from.0, from.1, z) > 0.0;
        let landing = if inside { z.min(self.floor_under(to.0, to.1, z)) } else { z };
        let held = self.holding(to.0, to.1, landing).filter(|span| z <= self.span_reach(span).1);
        if self.planes[storey].walled(from, to) || held.is_none() {
            return true;
        }
        let ends = self.clearance(to.0, to.1, storey);
        ends < TUNING.radius && ends < self.clearance(from.0, from.1, storey)
    }

    /// The floor or slope a shot at `z` falls onto: the highest at or below a step under it, under the rock and the
    /// solids as well; under rock, the floor of the storey it is on.
    fn floor_under(&self, x: f64, y: f64, z: f64) -> f64 {
        self.ground_below(x, y, z + TUNING.step, false).unwrap_or_else(|| storey_floor(self.storey_at(z)))
    }

    /// A line is walled where it crosses rock of its storey (each end's, as feet there are held), as a move is, where
    /// it passes through rock or a slab between storeys, or where it passes through a solid between its bottom and its
    /// top: a look, a blow or a throw passes over a low coffin, never through a shelf.
    fn line_walled(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        let storey = self.storey_of_feet(from[0], from[1], from[2]);
        (storey == self.storey_of_feet(to[0], to[1], to[2])
            && self.planes[storey].walled((from[0], from[1]), (to[0], to[1])))
            || self.slab_across(from, to)
            || self.solid_across(from, to)
    }

    /// A shot enters the first rock or slab it meets, the grid's edge as rock, or a solid where it passes into the box,
    /// whichever it meets first.
    fn wall_entry(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        self.first_entry(from, to)
    }
}

#[cfg(test)]
#[path = "dungeon_ground_tests.rs"]
mod dungeon_ground_tests;
#[cfg(test)]
#[path = "dungeon_storeys_tests.rs"]
mod dungeon_storeys_tests;
