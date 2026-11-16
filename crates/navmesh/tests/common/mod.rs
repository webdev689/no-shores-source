//! What the navmesh tests share: courses made of blocks, and measures of a path against them.

use movement::Block;
use navmesh::NavMesh;

/// Points every 5 cm along a path.
pub fn along(path: &[[f64; 3]]) -> Vec<(f64, f64)> {
    let mut points = Vec::new();
    for pair in path.windows(2) {
        let (dx, dy) = (pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]);
        let steps = ((dx * dx + dy * dy).sqrt() / 0.05).ceil().max(1.0) as usize;
        for step in 0..=steps {
            let t = step as f64 / steps as f64;
            points.push((pair[0][0] + dx * t, pair[0][1] + dy * t));
        }
    }
    points
}

/// How far a point is from a block's footprint, across; 0 on or in it.
pub fn distance_to(block: &Block, x: f64, y: f64) -> f64 {
    let dx = (block.min_x - x).max(0.0).max(x - block.max_x);
    let dy = (block.min_y - y).max(0.0).max(y - block.max_y);
    (dx * dx + dy * dy).sqrt()
}

/// The nearest a path comes to a block, across.
pub fn closest(path: &[[f64; 3]], block: &Block) -> f64 {
    along(path).into_iter().map(|(x, y)| distance_to(block, x, y)).fold(f64::INFINITY, f64::min)
}

pub fn path(navmesh: &NavMesh, from: [f64; 3], to: [f64; 3]) -> Vec<[f64; 3]> {
    navmesh.find_path(from, to).unwrap_or_else(|| panic!("no path from {from:?} to {to:?}"))
}

pub fn ends_at(path: &[[f64; 3]], goal: [f64; 3]) {
    let last = path[path.len() - 1];
    let off = (0..3).map(|axis| (last[axis] - goal[axis]).abs()).fold(0.0, f64::max);
    assert!(off < 1e-9, "the path ends at {last:?}, not {goal:?}: {path:?}");
}
