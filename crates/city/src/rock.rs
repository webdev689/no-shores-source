//! Natural rock, the solids that do what the land cannot: a cave roof, an overhang, a rock arch and a tunnel mouth.
//! Each is a few boxes of its own frame (its parts), and each part is drawn as a rounded, rough lump inside its box,
//! so the boxes a body runs into hold all of the rock drawn. The roughness is the land's exact noise of the solid's
//! seed, so the browser (client/src/rules/rockMesh.ts) draws every vertex to the bit.

use crate::collision::Box2;
use crate::solids::{Shape, Solid};
use land::exact::{clamp, fbm, ridged};
use std::collections::HashMap;

/// A rock's surface in its own frame: its vertices and its triangles, each wound out of the rock.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct RockMesh {
    pub positions: Vec<[f64; 3]>,
    pub triangles: Vec<[u32; 3]>,
}

/// A rock's side is cut into cells about this wide, metres, and at most this many along a part's edge.
const CELL_M: f64 = 0.75;
const MOST_CELLS: u32 = 40;
/// A lump is pulled in along its normal by up to 0.6 of this share of its box's half along each axis, and of this
/// far, metres; up to 1.4 of it underneath. Under a whole half on every axis, so no corner crosses its box's middle.
const ROUGH_SHARE: f64 = 0.4;
const ROUGH_MOST_M: f64 = 2.0;
/// How far across a lump's broad bulges and its crags are, metres.
const BULGE_M: f64 = 5.0;
const CRAG_M: f64 = 1.6;

/// The boxes of a rock's own frame (low x, y, z, then high x, y, z) it is made of, or a module's (`modules`);
/// none for a built shape.
#[must_use]
pub fn parts(shape: Shape, [width, depth, height]: [f64; 3]) -> Vec<[f64; 6]> {
    let (west, north, east, south) = (-width / 2.0, -depth / 2.0, width / 2.0, depth / 2.0);
    // Two legs and the head over them, and for an arch a broad foot at the base of each leg.
    let frame = |leg: f64, head: f64, from: f64| {
        vec![
            [west, from, 0.0, west + leg * width, south, height],
            [east - leg * width, from, 0.0, east, south, height],
            [west, from, head * height, east, south, height],
        ]
    };
    match shape {
        Shape::CaveRoof { .. } => vec![[west, north, 0.0, east, south, height]],
        Shape::Overhang { .. } => vec![
            [west, north, 0.0, east, north + 0.4 * depth, height],
            [0.9 * west, north, 0.55 * height, 0.9 * east, south, height],
        ],
        Shape::RockArch { .. } => {
            let mut arch = frame(0.26, 0.62, north);
            arch.push([west, north, 0.0, west + 0.36 * width, south, 0.35 * height]);
            arch.push([east - 0.36 * width, north, 0.0, east, south, 0.35 * height]);
            arch
        }
        Shape::TunnelMouth { .. } => {
            let mut mouth = frame(0.3, 0.6, north + 0.3 * depth);
            mouth.push([0.8 * west, north, 0.72 * height, 0.8 * east, north + 0.4 * depth, height]);
            mouth
        }
        Shape::Module { module, group } => crate::modules::parts(module, group, height),
        _ => Vec::new(),
    }
}

/// A rock's surface: each of its parts' rough lumps, in its own frame.
#[must_use]
pub fn mesh(shape: Shape, size: [f64; 3]) -> RockMesh {
    let seed = match shape {
        Shape::CaveRoof { seed }
        | Shape::Overhang { seed }
        | Shape::RockArch { seed }
        | Shape::TunnelMouth { seed } => seed,
        _ => return RockMesh::default(),
    };
    // A rock with no size, or one not a number, has no surface to draw.
    if !size.iter().all(|&side| side > 0.0) {
        return RockMesh::default();
    }
    // Each part's sides set against something, by axis: -1 its low side, 1 its high one. A leg or a jamb stands on
    // the ground; an overhang's back and lip are set in the face behind them, a tunnel mouth's frame in the rock.
    let set: &[[i8; 3]] = match shape {
        Shape::Overhang { .. } => &[[0, -1, -1], [0, -1, 0]],
        Shape::RockArch { .. } => &[[0, 0, -1], [0, 0, -1], [0, 0, 0], [0, 0, -1], [0, 0, -1]],
        Shape::TunnelMouth { .. } => &[[0, 1, -1], [0, 1, -1], [0, 1, 0], [0, 0, 0]],
        _ => &[],
    };
    let mut rock = RockMesh::default();
    for (index, part) in parts(shape, size).into_iter().enumerate() {
        lump(seed, part, set.get(index).copied().unwrap_or_default(), &mut rock);
    }
    rock
}

/// A part's lump: its box's sides cut into cells, each corner pulled in onto the round-cornered body inside the box
/// (|x|^4 + |y|^4 + |z|^4 = 1 of its halves) and then in along that body's normal by the noise, so no corner leaves
/// the box. A corner is kept once by its place on the box's lattice, so neighbouring sides share their edges. A side
/// set against something (`set`) stays flat and full: the lump is rounded as half of a box twice as long that way.
fn lump(seed: u32, part: [f64; 6], set: [i8; 3], into: &mut RockMesh) {
    let low = [part[0], part[1], part[2]];
    let length = [part[3] - part[0], part[4] - part[1], part[5] - part[2]];
    let cells = length.map(|side| ((side / CELL_M).ceil() as u32).clamp(2, MOST_CELLS));
    let half: [f64; 3] = core::array::from_fn(|at| if set[at] == 0 { length[at] / 2.0 } else { length[at] });
    let middle: [f64; 3] = core::array::from_fn(|at| match set[at] {
        -1 => low[at],
        1 => part[at + 3],
        _ => low[at] + half[at],
    });
    let mut kept: HashMap<[u32; 3], u32> = HashMap::new();
    let mut corner = |lattice: [u32; 3], into: &mut RockMesh| -> u32 {
        *kept.entry(lattice).or_insert_with(|| {
            let on_box: [f64; 3] =
                core::array::from_fn(|at| low[at] + length[at] * f64::from(lattice[at]) / f64::from(cells[at]));
            // A corner on the set sides alone stays on them, drawn in half way so the free sides' rims hold it.
            let free =
                (0..3).any(|at| (lattice[at] == 0 && set[at] != -1) || (lattice[at] == cells[at] && set[at] != 1));
            let pulled = if !free {
                core::array::from_fn(|at| middle[at] + (on_box[at] - middle[at]) * 0.5)
            } else {
                pulled_in(seed, on_box, middle, half)
            };
            // Held to the box whatever the seed and size, so the boxes always hold the rock drawn.
            into.positions.push(core::array::from_fn(|at| clamp(pulled[at], part[at], part[at + 3])));
            (into.positions.len() - 1) as u32
        })
    };
    for axis in 0..3 {
        let (across, along) = ((axis + 1) % 3, (axis + 2) % 3);
        for side in [0, cells[axis]] {
            for step in 0..cells[across] {
                for row in 0..cells[along] {
                    let at = |first: u32, second: u32| {
                        let mut lattice = [0; 3];
                        (lattice[axis], lattice[across], lattice[along]) = (side, first, second);
                        lattice
                    };
                    let quad = [at(step, row), at(step + 1, row), at(step + 1, row + 1), at(step, row + 1)]
                        .map(|lattice| corner(lattice, into));
                    // Across then along turns about +axis: wound out on the high side, the other way on the low.
                    let quad = if side == 0 { [quad[0], quad[3], quad[2], quad[1]] } else { quad };
                    into.triangles.push([quad[0], quad[1], quad[2]]);
                    into.triangles.push([quad[0], quad[2], quad[3]]);
                }
            }
        }
    }
}

/// A point of a part's box pulled onto its rounded body and in by the rock's noise there: broad bulges and hollows,
/// and crags over them.
fn pulled_in(seed: u32, on_box: [f64; 3], middle: [f64; 3], half: [f64; 3]) -> [f64; 3] {
    let share: [f64; 3] = core::array::from_fn(|at| (on_box[at] - middle[at]) / half[at]);
    let fourth = |value: f64| value * value * value * value;
    let reach = (fourth(share[0]) + fourth(share[1]) + fourth(share[2])).sqrt().sqrt();
    // The rounded body's normal there, its x^3 / half each way.
    let normal: [f64; 3] = core::array::from_fn(|at| share[at] * share[at] * share[at] / half[at]);
    let norm = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
    let rough = (0..3).fold(ROUGH_MOST_M, |most, at| {
        if normal[at] == 0.0 { most } else { most.min(ROUGH_SHARE * half[at] * norm / normal[at].abs()) }
    });
    let underneath = (-normal[2] / norm).max(0.0);
    // Two of the frame's axes mixed with the third, so every side of a box varies both ways across it.
    let [x, y, z] = on_box;
    let (across, along) = (x + 0.71 * z, y - 0.53 * z);
    let bulges = fbm(seed, across / BULGE_M, along / BULGE_M, 3);
    let crags = ridged(seed.wrapping_add(1), across / CRAG_M, along / CRAG_M, 3);
    let depth = rough * (0.6 + 0.8 * underneath) * clamp(0.5 + 0.8 * bulges + 0.5 * (crags - 0.5), 0.0, 1.0);
    core::array::from_fn(|at| middle[at] + (on_box[at] - middle[at]) / reach - normal[at] / norm * depth)
}

/// Whether a shape is met by its parts' boxes rather than its whole box: natural rock, and a module's surfaces (only
/// its first group has parts).
#[must_use]
pub const fn is_rock(shape: Shape) -> bool {
    matches!(
        shape,
        Shape::CaveRoof { .. }
            | Shape::Overhang { .. }
            | Shape::RockArch { .. }
            | Shape::TunnelMouth { .. }
            | Shape::Module { .. }
    )
}

/// How long a slice of a turned part runs at most, metres: a part turned off the world's axes is boxed in slices along
/// its longer side, so each slice's box, square to the world round its turned corners, keeps close to the rock. A
/// slice runs no longer than the part is thick either (0.5 m at the least), so a thin wall's slices, a parapet's, keep
/// as close to it as a lump's do.
const SLICE_M: f64 = 2.0;
const THINNEST_SLICE_M: f64 = 0.5;

/// What a body runs into of a rock: each part's box, square to the world round its turned corners (west, north,
/// east, south, top, bottom, as the city's boxes); a part turned off the world's axes in slices along its longer side.
#[must_use]
pub fn boxes(solid: &Solid) -> Vec<Box2> {
    sliced(solid, parts(solid.shape, solid.size))
}

/// Boxes of a solid's parts (boxes of its own frame: low x, y, z, then high), each square to the world round its turned
/// corners; a part turned off the world's axes in slices along its longer side.
#[must_use]
pub fn sliced(solid: &Solid, parts: Vec<[f64; 6]>) -> Vec<Box2> {
    let square = (solid.turn / std::f64::consts::FRAC_PI_2 - (solid.turn / std::f64::consts::FRAC_PI_2).round()).abs()
        < 1e-9
        && solid.lean == 0.0
        && solid.roll == 0.0;
    parts
        .into_iter()
        .flat_map(|[west, north, bottom, east, south, top]| {
            let (long, along_x) =
                if east - west >= south - north { (east - west, true) } else { (south - north, false) };
            let short = (east - west).min(south - north);
            let slice = SLICE_M.min(short.max(THINNEST_SLICE_M));
            let count = if square { 1 } else { (long / slice).ceil().max(1.0) as usize };
            (0..count).map(move |slice| {
                let (from, to) = (slice as f64 / count as f64, (slice + 1) as f64 / count as f64);
                if along_x {
                    [west + (east - west) * from, north, bottom, west + (east - west) * to, south, top]
                } else {
                    [west, north + (south - north) * from, bottom, east, north + (south - north) * to, top]
                }
            })
        })
        .map(|part| {
            let [west, north, east, south, bottom, top] = solid.bounds_of(part);
            [west, north, east, south, top, bottom]
        })
        .collect()
}

#[cfg(test)]
#[path = "rock_tests.rs"]
mod tests;
