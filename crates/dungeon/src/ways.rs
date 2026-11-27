//! A block storey's ways, as the Forge joins them: its nodes (each room's middle cell, its landings, its doorways onto
//! the blocks beside and its gallery) joined by Prim's tree, nearest first by how many cells apart they lie, each pair
//! the tree left unjoined joined now and then for a loop; each join the cheapest way through the rock.

use crate::block::{AREA, BLOCK_CELLS, BlockLayout, at, beside, on_rim, opening_cell};
use crate::descent::{At, StoreyPlan};
use crate::lane::Lane;
use crate::{CORRIDOR_HEIGHT_M, Cell, SIDES};

/// A loop's chance for each pair the tree left unjoined: at most LOOP_MOST, and fewer as a storey has more nodes.
const LOOP_MOST: f64 = 0.3;
const LOOP_OVER_NODES: f64 = 2.0;

const fn apart(first: At, second: At) -> usize {
    first.0.abs_diff(second.0) + first.1.abs_diff(second.1)
}

impl BlockLayout {
    /// The cheapest way between two cells, through rock, rooms and corridors but never the rim (but `rim`'s cells and
    /// the goal), a room's stone or a cell its plan keeps; its cells, or None. Rock costs more than an open cell, so
    /// ways reuse ways.
    fn route(&self, from: At, to: At, rim: &[At]) -> Option<Vec<At>> {
        let cost = |index: usize| match self.cells[index] {
            Cell::Rock => 3.0,
            Cell::Room(_) => 2.0,
            Cell::Corridor | Cell::Stair(_) | Cell::Void => 1.0,
        };
        let (start, goal) = (at(from.0, from.1), at(to.0, to.1));
        let guess =
            |index: usize| (index % BLOCK_CELLS).abs_diff(to.0) as f64 + (index / BLOCK_CELLS).abs_diff(to.1) as f64;
        let mut distance = vec![f64::INFINITY; AREA];
        let mut previous: Vec<Option<usize>> = vec![None; AREA];
        distance[start] = 0.0;
        let mut open = vec![start];
        while !open.is_empty() {
            let mut best = 0;
            for candidate in 1..open.len() {
                if distance[open[candidate]] + guess(open[candidate]) < distance[open[best]] + guess(open[best]) {
                    best = candidate;
                }
            }
            let index = open.remove(best);
            if index == goal {
                break;
            }
            for side in SIDES {
                let Some((x, y)) = beside(index % BLOCK_CELLS, index / BLOCK_CELLS, side) else { continue };
                let next = at(x, y);
                let walled = on_rim(x, y) && !rim.contains(&(x, y)) && next != goal;
                if walled || self.stone((x, y)) || self.blocked[next] {
                    continue;
                }
                let through = distance[index] + cost(next);
                if through < distance[next] {
                    distance[next] = through;
                    previous[next] = Some(index);
                    if !open.contains(&next) {
                        open.push(next);
                    }
                }
            }
        }
        if !distance[goal].is_finite() {
            return None;
        }
        let mut path = vec![to];
        let mut index = goal;
        while let Some(before) = previous[index] {
            path.push((before % BLOCK_CELLS, before / BLOCK_CELLS));
            index = before;
        }
        path.reverse();
        Some(path)
    }

    /// Carves a way's rock into corridor.
    fn carve(&mut self, path: &[At]) {
        for &(x, y) in path {
            if self.cells[at(x, y)] == Cell::Rock {
                self.cells[at(x, y)] = Cell::Corridor;
                self.ceilings[at(x, y)] = CORRIDOR_HEIGHT_M;
            }
        }
    }

    /// Joins the storey's nodes: Prim's tree from the first, each step the nearest pair of a joined node and one not
    /// yet joined (the first such pair on a tie), then each pair it left unjoined one time in min(LOOP_MOST,
    /// LOOP_OVER_NODES / nodes). The rooms are ordered for the way in's door, farthest from the other nodes first.
    pub(crate) fn join(&mut self, lane: &mut Lane, plan: &StoreyPlan) {
        let middles: Vec<At> = (0..self.rooms.len())
            .map(|number| {
                let cells = self.room_cells(number);
                cells.get(cells.len() / 2).copied().unwrap_or((self.rooms[number].x, self.rooms[number].y))
            })
            .collect();
        let rim: Vec<At> = plan.openings.iter().map(|&opening| opening_cell(opening)).collect();
        let others: Vec<At> = rim.iter().chain(&plan.landings).copied().collect();
        let gallery = plan.gallery.as_ref().and_then(|gallery| gallery.cells.first().copied());
        self.nodes = middles.iter().chain(&others).copied().chain(gallery).collect();
        let count = self.nodes.len();
        let mut joined = vec![false; count];
        let mut tree: Vec<(usize, usize)> = Vec::new();
        if let Some(first) = joined.first_mut() {
            *first = true;
        }
        for _ in 1..count {
            let mut best: Option<(usize, usize, usize)> = None;
            for to in (0..count).filter(|&to| !joined[to]) {
                for from in (0..count).filter(|&from| joined[from]) {
                    let length = apart(self.nodes[from], self.nodes[to]);
                    if best.is_none_or(|(_, _, shortest)| length < shortest) {
                        best = Some((from, to, length));
                    }
                }
            }
            let Some((from, to, _)) = best else { break };
            joined[to] = true;
            tree.push((from, to));
        }
        for &(from, to) in &tree {
            if let Some(path) = self.route(self.nodes[from], self.nodes[to], &rim) {
                self.carve(&path);
            }
        }
        let share = LOOP_MOST.min(LOOP_OVER_NODES / count.max(1) as f64);
        for first in 0..count {
            for second in first + 1..count {
                let in_tree = tree.iter().any(|&pair| pair == (first, second) || pair == (second, first));
                if !in_tree
                    && lane.chance(share)
                    && let Some(path) = self.route(self.nodes[first], self.nodes[second], &rim)
                {
                    self.carve(&path);
                }
            }
        }
        let far = |number: &usize| others.iter().map(|&other| apart(middles[*number], other)).min().unwrap_or(0);
        self.order = (0..self.rooms.len()).collect();
        self.order.sort_by_key(|number| (core::cmp::Reverse(far(number)), *number));
    }

    /// Whether every room, way and opening is one walk: every open cell reached from the first.
    pub(crate) fn one_walk(&self) -> bool {
        let Some(first) = self.cells.iter().position(|&cell| cell != Cell::Rock) else { return false };
        let mut reached = vec![false; AREA];
        let mut todo = vec![first];
        reached[first] = true;
        while let Some(index) = todo.pop() {
            for side in SIDES {
                let Some((x, y)) = beside(index % BLOCK_CELLS, index / BLOCK_CELLS, side) else { continue };
                let next = at(x, y);
                if !reached[next] && self.cells[next] != Cell::Rock {
                    reached[next] = true;
                    todo.push(next);
                }
            }
        }
        self.cells.iter().zip(&reached).all(|(&cell, &seen)| cell == Cell::Rock || seen)
    }

    /// How many doorways a room has: its cells' sides that meet a corridor.
    pub(crate) fn doorways(&self, number: usize) -> usize {
        self.room_cells(number)
            .into_iter()
            .map(|(x, y)| {
                let corridor = |(bx, by): At| self.cells[at(bx, by)] == Cell::Corridor;
                SIDES.into_iter().filter(|&side| beside(x, y, side).is_some_and(corridor)).count()
            })
            .sum()
    }

    /// How many of its rooms are dead ends: one doorway alone.
    pub(crate) fn dead_ends(&self) -> usize {
        (0..self.rooms.len()).filter(|&number| self.doorways(number) == 1).count()
    }
}
