//! A warren: a block storey laid as a labyrinth a player can lose their way in. A few small chambers are carved
//! first, then a maze of one-cell ways through the rock round them, every second cell a crossing, grown by a
//! randomised walk that turns back only where it can go no further; most of its dead ends are then broken through
//! into the next way, so it loops on itself. Each chamber is reached from two sides, and the storey's other nodes and
//! the maze's pieces are joined after as any storey's are (`ways.rs`).

use crate::block::{BLOCK_CELLS, BlockLayout, at, beside};
use crate::descent::{At, StoreyPlan};
use crate::lane::Lane;
use crate::shapes::Shape;
use crate::styles::{Form, Style};
use crate::{CORRIDOR_HEIGHT_M, Cell, SIDES, Side};

/// A warren's chambers: how many, and their forms, a cave's in the caverns.
const CHAMBERS: (usize, usize) = (2, 3);
const ROOMS: &[Form] = &[
    Form { shape: Shape::Rectangle, weight: 2, along: (2, 3), across: (2, 3) },
    Form { shape: Shape::Round, weight: 1, along: (3, 3), across: (3, 3) },
];
const CAVES: &[Form] = &[Form { shape: Shape::Cave, weight: 1, along: (3, 4), across: (3, 4) }];
/// The share of the maze's dead ends broken through into the way beside.
const BRAID_SHARE: f64 = 0.65;

impl BlockLayout {
    /// Carves a warren: its chambers, then the maze round them, then each chamber's two ways into the maze. The maze's
    /// pieces, each by one of its cells, are added to the nodes its ways join.
    pub(crate) fn carve_warren(&mut self, lane: &mut Lane, style: &Style, plan: &StoreyPlan) {
        let forms = if style.key == "caverns" { CAVES } else { ROOMS };
        let small = Style { rooms: CHAMBERS, forms, ..*style };
        self.carve_rooms(lane, &small, &StoreyPlan { great: None, ..plan.clone() });
        let pieces = self.carve_maze(lane);
        for number in 0..self.rooms.len() {
            self.reach_chamber(number);
        }
        self.warren = true;
        self.extra_nodes = pieces;
    }

    /// Whether a cell may be a way of the maze: rock no plan keeps, no stone, and no room's cell beside it, so the maze
    /// opens into a chamber only where a chamber's own way is carved.
    fn mazed(&self, (x, y): At) -> bool {
        let index = at(x, y);
        let by_room = SIDES
            .into_iter()
            .any(|side| beside(x, y, side).is_some_and(|(bx, by)| matches!(self.cells[at(bx, by)], Cell::Room(_))));
        (1..BLOCK_CELLS - 1).contains(&x)
            && (1..BLOCK_CELLS - 1).contains(&y)
            && self.cells[index] == Cell::Rock
            && !self.blocked[index]
            && !self.stone((x, y))
            && !by_room
    }

    fn open(&mut self, (x, y): At) {
        self.cells[at(x, y)] = Cell::Corridor;
        self.ceilings[at(x, y)] = CORRIDOR_HEIGHT_M;
    }

    /// The crossing two cells on from `from` along `side`, and the cell between, where both may be ways.
    fn step(&self, from: At, side: Side) -> Option<(At, At)> {
        let between = beside(from.0, from.1, side)?;
        let next = beside(between.0, between.1, side)?;
        (self.mazed(between) || self.cells[at(between.0, between.1)] == Cell::Corridor)
            .then_some((between, next))
            .filter(|&(_, next)| next.0 % 2 == 1 && next.1 % 2 == 1)
    }

    /// Grows the maze over every crossing (odd cells) it may take, a walk from each one not yet reached, and breaks
    /// most of its dead ends through. One cell of each piece it grew.
    fn carve_maze(&mut self, lane: &mut Lane) -> Vec<At> {
        let crossings: Vec<At> = (1..BLOCK_CELLS - 1)
            .step_by(2)
            .flat_map(|y| (1..BLOCK_CELLS - 1).step_by(2).map(move |x| (x, y)))
            .collect();
        let mut reached = vec![false; crossings.len()];
        let index_of = |cell: At| crossings.iter().position(|&each| each == cell);
        let mut pieces = Vec::new();
        for start in 0..crossings.len() {
            if reached[start] || !self.mazed(crossings[start]) {
                continue;
            }
            pieces.push(crossings[start]);
            reached[start] = true;
            self.open(crossings[start]);
            let mut trail = vec![crossings[start]];
            while let Some(&here) = trail.last() {
                let ways: Vec<(At, At)> = SIDES
                    .into_iter()
                    .filter_map(|side| self.step(here, side))
                    .filter(|&(_, next)| index_of(next).is_some_and(|found| !reached[found]) && self.mazed(next))
                    .collect();
                if ways.is_empty() {
                    trail.pop();
                    continue;
                }
                let (between, next) = ways[lane.below(ways.len())];
                if let Some(found) = index_of(next) {
                    reached[found] = true;
                }
                self.open(between);
                self.open(next);
                trail.push(next);
            }
        }
        self.braid(lane, &crossings);
        pieces
    }

    /// Breaks most dead ends of the maze through into a way beside them, so it loops.
    fn braid(&mut self, lane: &mut Lane, crossings: &[At]) {
        for &cell in crossings {
            if self.cells[at(cell.0, cell.1)] != Cell::Corridor {
                continue;
            }
            let open = |layout: &Self, side: Side| {
                beside(cell.0, cell.1, side).is_some_and(|(bx, by)| layout.cells[at(bx, by)] != Cell::Rock)
            };
            if SIDES.into_iter().filter(|&side| open(self, side)).count() != 1 || !lane.chance(BRAID_SHARE) {
                continue;
            }
            let through: Vec<At> = SIDES
                .into_iter()
                .filter(|&side| !open(self, side))
                .filter_map(|side| self.step(cell, side))
                .filter(|&(between, next)| self.mazed(between) && self.cells[at(next.0, next.1)] == Cell::Corridor)
                .map(|(between, _)| between)
                .collect();
            if !through.is_empty() {
                let between = through[lane.below(through.len())];
                self.open(between);
            }
        }
    }

    /// Carves two ways into a chamber from the maze: to the nearest of the maze's ways, and to the nearest of those on
    /// the far side of the chamber from it, each the cheapest way through the rock.
    fn reach_chamber(&mut self, number: usize) {
        let cells = self.room_cells(number);
        let Some(&middle) = cells.get(cells.len() / 2) else { return };
        let ways: Vec<At> = (0..BLOCK_CELLS * BLOCK_CELLS)
            .filter(|&index| self.cells[index] == Cell::Corridor)
            .map(|index| (index % BLOCK_CELLS, index / BLOCK_CELLS))
            .collect();
        let apart = |cell: At| cell.0.abs_diff(middle.0) + cell.1.abs_diff(middle.1);
        let Some(&first) = ways.iter().min_by_key(|&&cell| (apart(cell), cell.1, cell.0)) else { return };
        let away = |cell: At| (cell.0 as isize - middle.0 as isize, cell.1 as isize - middle.1 as isize);
        let (first_x, first_y) = away(first);
        let second = ways
            .iter()
            .copied()
            .filter(|&cell| {
                let (east, south) = away(cell);
                east * first_x + south * first_y < 0
            })
            .min_by_key(|&cell| (apart(cell), cell.1, cell.0));
        for goal in core::iter::once(first).chain(second) {
            if let Some(path) = self.route(middle, goal, &[]) {
                self.carve(&path);
            }
        }
    }
}
