//! A dungeon's storeys, stacked downward from the way in's: each storey a plane of cells laid as the whole grid was
//! when there was one, the planes one after another in `cells` and `ceilings`; the flights of stairs between them,
//! walked as the smooth slope under their steps; and the open spans of each column of cells, from floor to ceiling,
//! that a body stands in, a line passes through and rock or a slab between storeys bounds.

use crate::{CELL_M, Cell, Dungeon, FLOOR_M, SIDES};

/// How far each storey stands under the one over it (m), and the most storeys a dungeon holds.
pub const STOREY_M: f64 = 8.0;
pub const STOREYS_MOST: usize = 3;
/// A flight's cells, one after another in a straight line, its length (m), and its ceiling over its slope (m).
pub const FLIGHT_CELLS: usize = 4;
pub const FLIGHT_M: f64 = CELL_M * FLIGHT_CELLS as f64;
pub const FLIGHT_CEILING_M: f64 = 3.2;

/// A flight of stairs from a landing on storey `upper` down to a landing on the storey under it. `cells` are plane
/// indices (a cell's number on storey 0), head first, `Cell::Stair` on both storeys; `top` is the landing's plane
/// index on `upper`, the cell before the head, and `bottom` the landing's on `upper + 1`, the cell after the foot.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stair {
    pub upper: usize,
    pub cells: [usize; FLIGHT_CELLS],
    pub top: usize,
    pub bottom: usize,
}

impl Stair {
    /// The height of a flight's slope at (x, y): its upper storey's floor at the head's edge, falling STOREY_M over
    /// FLIGHT_M along the flight to the lower storey's floor at the foot's edge, level past either end. Taken as a
    /// share of the way between the two edges, so it meets each landing's floor exactly.
    #[must_use]
    pub fn slope_at(&self, columns: usize, x: f64, y: f64) -> f64 {
        let (head, top) = (self.cells[0], self.top);
        let (head_column, head_row) = (head % columns, head / columns);
        let across = head_row == top / columns;
        let going = if across { head_column > top % columns } else { head_row > top / columns };
        let (coordinate, index) = if across { (x, head_column) } else { (y, head_row) };
        // The head's edge is the near side of its cell; the foot's the far side of the last cell.
        let (start, end) = if going {
            (index as f64 * CELL_M, (index + FLIGHT_CELLS) as f64 * CELL_M)
        } else {
            ((index + 1) as f64 * CELL_M, (index + 1 - FLIGHT_CELLS.min(index + 1)) as f64 * CELL_M)
        };
        let share = ((coordinate - start) / (end - start)).clamp(0.0, 1.0);
        let (upper, lower) = (storey_floor(self.upper), storey_floor(self.upper + 1));
        upper + (lower - upper) * share
    }
}

/// An open span of a column of cells: the storey it stands on, its floor and its ceiling (absolute z), and the flight
/// whose slope is its floor where it is one, in which case `floor` is the slope's lowest in the column.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Span {
    pub storey: usize,
    pub floor: f64,
    pub ceiling: f64,
    pub stair: Option<usize>,
}

/// A storey's floor, metres up: storey 0 the top.
#[must_use]
pub fn storey_floor(storey: usize) -> f64 {
    FLOOR_M - STOREY_M * storey as f64
}

/// The storey whose floor lies nearest a height, of `storeys` (at least 1).
#[must_use]
pub fn storey_at(storeys: usize, z: f64) -> usize {
    let below = ((FLOOR_M - z) / STOREY_M + 0.5).floor();
    if below > 0.0 { (below as usize).min(storeys.max(1) - 1) } else { 0 }
}

/// The storey a point at a height is in, of `storeys` (at least 1): the highest floor at or under it.
#[must_use]
pub fn storey_under(storeys: usize, z: f64) -> usize {
    (0..storeys).find(|&storey| storey_floor(storey) <= z).unwrap_or(storeys.max(1) - 1)
}

impl Dungeon {
    /// The cells of one storey.
    #[must_use]
    pub const fn plane(&self) -> usize {
        self.columns * self.rows
    }

    /// The storey a cell number lies on.
    #[must_use]
    pub const fn storey_of(&self, cell: usize) -> usize {
        cell / self.plane()
    }

    /// The floor a cell's storey stands at, metres up.
    #[must_use]
    pub fn floor_of(&self, cell: usize) -> f64 {
        storey_floor(self.storey_of(cell))
    }

    /// The storey whose floor lies nearest a height, within the dungeon's storeys.
    #[must_use]
    pub fn storey_at(&self, z: f64) -> usize {
        storey_at(self.storeys, z)
    }

    /// The same column's cell on the other storey of a flight, for a flight's cell.
    #[must_use]
    pub fn stair_twin(&self, cell: usize) -> Option<usize> {
        let Some(&Cell::Stair(number)) = self.cells.get(cell) else { return None };
        let upper = self.stairs.get(usize::from(number))?.upper;
        let (storey, at) = (self.storey_of(cell), cell % self.plane());
        Some(if storey == upper { (upper + 1) * self.plane() + at } else { upper * self.plane() + at })
    }

    /// A span's floor at (x, y): its storey's floor, or its flight's slope.
    #[must_use]
    pub fn span_floor(&self, span: &Span, x: f64, y: f64) -> f64 {
        span.stair
            .and_then(|number| self.stairs.get(number))
            .map_or(span.floor, |stair| stair.slope_at(self.columns, x, y))
    }

    /// The open spans of a column (a plane index), lowest first: each storey's open cell from its floor to its
    /// ceiling; a flight's one span, from its slope's lowest in the column to FLIGHT_CEILING_M over its highest; a
    /// Void lifting the span under it to the Void's own ceiling. Rock gives none.
    #[must_use]
    pub fn spans(&self, at: usize) -> Vec<Span> {
        let mut spans: Vec<Span> = Vec::new();
        let (west, north) = ((at % self.columns) as f64 * CELL_M, (at / self.columns) as f64 * CELL_M);
        for storey in (0..self.storeys).rev() {
            let cell = storey * self.plane() + at;
            let floor = storey_floor(storey);
            match self.cells[cell] {
                Cell::Room(_) | Cell::Corridor => {
                    spans.push(Span { storey, floor, ceiling: floor + self.ceilings[cell], stair: None });
                }
                Cell::Stair(number) => {
                    let Some(stair) = self.stairs.get(usize::from(number)).filter(|stair| stair.upper == storey) else {
                        continue;
                    };
                    let one = stair.slope_at(self.columns, west, north);
                    let other = stair.slope_at(self.columns, west + CELL_M, north + CELL_M);
                    let (low, high) = (one.min(other), one.max(other));
                    let stair = Some(usize::from(number));
                    spans.push(Span { storey, floor: low, ceiling: high + FLIGHT_CEILING_M, stair });
                }
                Cell::Void => {
                    // Only over the storey just under it: a Void over rock opens nothing.
                    if let Some(under) = spans.last_mut().filter(|under| under.storey == storey + 1) {
                        under.ceiling = floor + self.ceilings[cell];
                    }
                }
                Cell::Rock => {}
            }
        }
        spans
    }

    /// Whether a cell is open on its storey: neither rock nor past the grid.
    #[must_use]
    pub fn open(&self, cell: usize) -> bool {
        self.cells.get(cell).is_some_and(|&kind| kind != Cell::Rock)
    }

    /// The cells round a room and within its rectangle that are not its own, each as a box from its floor to the
    /// storey over (west, north, east, south, bottom, top): what a leap across the room may not cross.
    #[must_use]
    pub fn walls_round(&self, room: usize) -> Vec<[f64; 6]> {
        let found = &self.rooms[room];
        let (first, floor) = (found.storey * self.plane(), storey_floor(found.storey));
        let columns = found.x.saturating_sub(1)..(found.x + found.width + 1).min(self.columns);
        let rows = found.y.saturating_sub(1)..(found.y + found.depth + 1).min(self.rows);
        let squares = rows.flat_map(|row| columns.clone().map(move |column| (column, row)));
        squares
            .filter(|&(column, row)| !found.cells.contains(&(first + row * self.columns + column)))
            .map(|(column, row)| {
                let [west, north] = [column as f64 * CELL_M, row as f64 * CELL_M];
                [west, north, west + CELL_M, north + CELL_M, floor, floor + STOREY_M]
            })
            .collect()
    }

    /// The cells a walk steps to from a cell: those beside it on its storey that are open but open air, which is a
    /// way down alone, and a flight's twin; onto and off a flight only at its landings.
    pub fn walk_from(&self, cell: usize) -> impl Iterator<Item = usize> + '_ {
        SIDES
            .into_iter()
            .filter_map(move |side| self.beside(cell, side))
            .filter(move |&next| self.open(next) && self.cells[next] != Cell::Void && self.steps_between(cell, next))
            .chain(self.stair_twin(cell))
    }

    /// Whether a body steps between two open cells side by side: a flight's cell joins its flight's own cells, and
    /// its head on its upper storey and its foot on the lower each their landing, never another cell beside them.
    fn steps_between(&self, from: usize, to: usize) -> bool {
        let landing = |number: u16, end: usize| {
            let flight = self.stairs.get(usize::from(number))?;
            let (storey, at, plane) = (self.storey_of(end), end % self.plane(), self.plane());
            if storey == flight.upper && at == flight.cells[0] {
                Some(storey * plane + flight.top)
            } else if storey == flight.upper + 1 && at == flight.cells[FLIGHT_CELLS - 1] {
                Some(storey * plane + flight.bottom)
            } else {
                None
            }
        };
        match (self.cells[from], self.cells[to]) {
            (Cell::Stair(one), Cell::Stair(other)) => one == other,
            (Cell::Stair(number), _) => landing(number, from) == Some(to),
            (_, Cell::Stair(number)) => landing(number, to) == Some(from),
            _ => true,
        }
    }
}
