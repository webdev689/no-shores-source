//! Where each cell's water goes. A priority flood from the window's edge and the sea (Barnes, Lehman and Mulla 2014,
//! with an epsilon) fills every closed hollow to its spill, so water crosses a lake to its outlet; each cell then drains
//! to its steepest lower neighbour on the filled ground. The flood's pop order runs downstream to upstream.

use crate::grid::{D8_LENGTH, D8_X, D8_Y};
use crate::heap::CellHeap;

/// The rise a filled flat gains a cell, metres, so every filled cell has a way down.
pub const EPSILON: f64 = 0.001;
/// A cell that drains nowhere: the window's edge or the sea.
pub const OUTLET: u32 = u32::MAX;

#[derive(Debug)]
pub struct Routing {
    /// The ground with every hollow brimful.
    pub filled: Vec<f64>,
    /// Each cell's receiver, or OUTLET.
    pub receiver: Vec<u32>,
    /// Metres to the receiver.
    pub distance: Vec<f64>,
    /// The cells the flood reached, downstream first: every land cell and the outlets beside land.
    pub order: Vec<u32>,
}

/// Whether cell `index` of a `width` by `height` window lies on its edge.
#[must_use]
pub fn on_edge(index: usize, width: usize, height: usize) -> bool {
    let (i, j) = (index % width, index / width);
    i == 0 || j == 0 || i == width - 1 || j == height - 1
}

/// The cell `direction` steps from `index`, or None past the window.
#[must_use]
pub fn neighbour(index: usize, direction: usize, width: usize, height: usize) -> Option<usize> {
    let i = (index % width) as isize + D8_X[direction];
    let j = (index / width) as isize + D8_Y[direction];
    (i >= 0 && j >= 0 && (i as usize) < width && (j as usize) < height).then(|| j as usize * width + i as usize)
}

/// Routes a surface of `width` by `height` cells of `cell_m` metres, `sea` marking the cells that are open water.
#[must_use]
pub fn route_flow(ground: &[f64], width: usize, height: usize, cell_m: f64, sea: &[bool]) -> Routing {
    let count = width * height;
    let mut heap = CellHeap::with_capacity(count);
    let (mut filled, mut seen) = (vec![0.0; count], vec![false; count]);
    let (mut receiver, mut distance, mut order) = (vec![OUTLET; count], vec![0.0; count], Vec::with_capacity(count));
    // Open water drains nowhere; only the outlets next to land start the flood, so a window mostly of sea costs
    // little more than its land.
    for index in 0..count {
        if on_edge(index, width, height) || sea[index] {
            seen[index] = true;
            filled[index] = ground[index];
            let by_land =
                (0..8).any(|direction| neighbour(index, direction, width, height).is_some_and(|next| !sea[next]));
            if by_land {
                heap.push(index as u32, ground[index]);
            }
        }
    }
    while let Some(cell) = heap.pop() {
        let cell = cell as usize;
        order.push(cell as u32);
        for direction in 0..8 {
            let Some(next) = neighbour(cell, direction, width, height) else { continue };
            if seen[next] {
                continue;
            }
            seen[next] = true;
            let fill = if ground[next] > filled[cell] + EPSILON { ground[next] } else { filled[cell] + EPSILON };
            filled[next] = fill;
            heap.push(next as u32, fill);
        }
    }
    for &cell in &order {
        let index = cell as usize;
        if on_edge(index, width, height) || sea[index] {
            continue;
        }
        let mut best = 0.0;
        for (direction, length) in D8_LENGTH.iter().enumerate() {
            let Some(next) = neighbour(index, direction, width, height) else { continue };
            let step = length * cell_m;
            let slope = (filled[index] - filled[next]) / step;
            if slope > best {
                best = slope;
                receiver[index] = next as u32;
                distance[index] = step;
            }
        }
    }
    Routing { filled, receiver, distance, order }
}

/// Sums `own` down the routing: each cell's total of itself and everything upstream of it.
#[must_use]
pub fn accumulate(routing: &Routing, own: &[f64]) -> Vec<f64> {
    let mut total = own.to_vec();
    for &cell in routing.order.iter().rev() {
        let receiver = routing.receiver[cell as usize];
        if receiver != OUTLET {
            total[receiver as usize] += total[cell as usize];
        }
    }
    total
}

/// The cells of every closed hollow the flood brimmed, each hollow whole.
#[must_use]
pub fn hollows(routing: &Routing, ground: &[f64], width: usize, height: usize) -> Vec<Vec<u32>> {
    let count = width * height;
    let wet = |index: usize| routing.filled[index] - ground[index] > 1e-6;
    let mut seen = vec![false; count];
    let mut found = Vec::new();
    for &cell in &routing.order {
        let start = cell as usize;
        if seen[start] || !wet(start) {
            continue;
        }
        seen[start] = true;
        let mut cells = vec![start as u32];
        let mut at = 0;
        while at < cells.len() {
            let cell = cells[at] as usize;
            at += 1;
            for direction in 0..8 {
                let Some(next) = neighbour(cell, direction, width, height) else { continue };
                if !seen[next] && wet(next) {
                    seen[next] = true;
                    cells.push(next as u32);
                }
            }
        }
        found.push(cells);
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pit_fills_to_its_spill_and_every_cell_drains_out() {
        // a bowl 5 x 5: the window's edge at 0, a rim at 10 inside it, a pit at 2 in the middle
        let (width, height) = (5, 5);
        let mut ground: Vec<f64> = (0..25).map(|index| if on_edge(index, 5, 5) { 0.0 } else { 10.0 }).collect();
        ground[12] = 2.0;
        let routing = route_flow(&ground, width, height, 100.0, &[false; 25]);
        assert!(routing.filled[12] >= 10.0, "the pit is filled to the rim");
        let lakes = hollows(&routing, &ground, width, height);
        assert_eq!(lakes, [[12]]);
        let rain = accumulate(&routing, &[1.0; 25]);
        let outflow: f64 = (0..25).filter(|&index| routing.receiver[index] == OUTLET).map(|index| rain[index]).sum();
        assert!((outflow - 25.0).abs() < 1e-9, "all the rain reaches an outlet");
    }
}
