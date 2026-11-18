//! The rock of a layout's cliffs and outcrops, in rubble: talus along every cliff's foot (heaps of boulders against
//! the face, scree before them, great slabs leant on the cliff) and the pillars and boulders round each mesa and
//! spire. What lies past the section is never reached, so it is no box (collide.rs); scree is stepped over.

use crate::field::{distance, ring_holds};
use crate::paths::{Path, off_line};
use crate::pieces::{Kit, model, turn_along};
use city::solids::{Material, Shape, Solid};
use land::sculpts::Sculpts;

/// How far apart the talus's heaps and its slabs lie along a cliff's foot, metres.
const HEAP_EVERY_M: f64 = 7.0;
const SLAB_EVERY_M: f64 = 46.0;
/// How far rock keeps from a path's line, metres.
const PATH_CLEAR_M: f64 = 10.0;
/// Scree is lower than a body steps over (collide.rs STEPPED_OVER_M).
const SCREE_TALLEST_M: f64 = 0.4;

/// Whether a point lies within `clear` metres of a path's line.
fn near_path(paths: &[Path], at: [f64; 2], clear: f64) -> bool {
    paths.iter().any(|path| path.points.windows(2).any(|pair| off_line(at, pair[0], pair[1]) < clear))
}

/// A stone of rubble whose base stands at a point on the ground (`at`, its height the ground's there), sunk a share
/// of its height, turned at random and tipped up to `tip` radians either way.
pub fn stone(kit: &mut Kit, shape: Shape, at: [f64; 3], size: [f64; 3], tip: f64) {
    let base = at[2] - size[2] * 0.25;
    let turn = kit.draw() * std::f64::consts::TAU;
    let (lean, roll) = ((kit.draw() - 0.5) * 2.0 * tip, (kit.draw() - 0.5) * 2.0 * tip);
    let upright = Solid::upright(shape, [at[0], at[1], base], size, Material::Rubble).turned(turn);
    kit.solid(Solid { lean, roll, ..upright });
}

/// A point on the ground as it is laid at the floor's level.
fn on_floor(kit: &Kit, at: [f64; 2]) -> [f64; 3] {
    [at[0], at[1], kit.height(at)]
}

/// A point on the ground as carved: the cliffs' faces raised over the land the kit reads.
fn on_carved(kit: &Kit, carved: &Sculpts, at: [f64; 2]) -> [f64; 3] {
    let coast = kit.ground.coast.at(at[0], at[1]);
    [at[0], at[1], kit.height(at) + carved.raise(at[0], at[1], coast)]
}

/// A boulder's shape: a faceted dome or a broken block.
fn boulder_shape(kit: &mut Kit) -> Shape {
    if kit.draw() < 0.5 { Shape::Dome { sides: 6 } } else { Shape::Pyramid { top: 0.35 + kit.draw() * 0.3 } }
}

/// A point `out` metres along `way` from `from`, and `side` metres across it.
fn off(from: [f64; 2], way: [f64; 2], out: f64, side: f64) -> [f64; 2] {
    [from[0] + way[0] * out - way[1] * side, from[1] + way[1] * out + way[0] * side]
}

/// Talus along the section's edge, walked at even steps, on the cliffs as `carved`; never on a path.
pub fn talus(kit: &mut Kit, ring: &[[f64; 2]], paths: &[Path], carved: &Sculpts) {
    let (mut carried, mut since_slab) = (0.0, 0.0);
    for (at, &from) in ring.iter().enumerate() {
        let to = ring[(at + 1) % ring.len()];
        let length = distance(from, to);
        if length < 1e-6 {
            continue;
        }
        let along = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        let mut step = HEAP_EVERY_M - carried;
        while step <= length {
            let foot = [from[0] + along[0] * step, from[1] + along[1] * step];
            since_slab += HEAP_EVERY_M;
            step += HEAP_EVERY_M;
            if near_path(paths, foot, PATH_CLEAR_M) {
                continue;
            }
            // Outward is the side of the edge the section does not hold: toward the cliff.
            let normal = [along[1], -along[0]];
            let outward = if ring_holds(ring, foot[0] + normal[0] * 3.0, foot[1] + normal[1] * 3.0) {
                [-normal[0], -normal[1]]
            } else {
                normal
            };
            heap(kit, carved, foot, outward);
            if since_slab >= SLAB_EVERY_M {
                since_slab = 0.0;
                slab(kit, carved, foot, outward);
            }
        }
        carried = length - (step - HEAP_EVERY_M);
    }
}

/// A heap at a cliff's foot: a great boulder against the face, smaller ones round it, scree spilt before it, and
/// now and then one of the forged rocks.
fn heap(kit: &mut Kit, carved: &Sculpts, foot: [f64; 2], outward: [f64; 2]) {
    let middle = off(foot, outward, 0.5 + kit.draw() * 2.5, (kit.draw() - 0.5) * 3.0);
    let size = [2.5 + kit.draw() * 3.5, 2.0 + kit.draw() * 3.0, 1.8 + kit.draw() * 2.8];
    let shape = boulder_shape(kit);
    stone(kit, shape, on_carved(kit, carved, middle), size, 0.25);
    for _ in 0..1 + (kit.draw() * 3.0) as u32 {
        let at = off(foot, outward, -1.5 + kit.draw() * 4.0, (kit.draw() - 0.5) * 6.0);
        let size = [0.8 + kit.draw() * 1.6, 0.7 + kit.draw() * 1.4, 0.6 + kit.draw() * 1.4];
        let shape = boulder_shape(kit);
        stone(kit, shape, on_carved(kit, carved, at), size, 0.4);
    }
    for _ in 0..2 + (kit.draw() * 2.0) as u32 {
        let at = off(foot, outward, -kit.draw() * 4.0, (kit.draw() - 0.5) * 7.0);
        let across = 0.4 + kit.draw() * 0.8;
        let size = [across, across * (0.6 + kit.draw() * 0.6), 0.2 + kit.draw() * (SCREE_TALLEST_M - 0.2)];
        stone(kit, Shape::Pyramid { top: 0.4 }, on_carved(kit, carved, at), size, 0.3);
    }
    if kit.draw() < 0.3 {
        let rock = kit.pick(&model::ROCKS);
        let yaw = kit.draw() * 360.0;
        let at = off(foot, outward, 1.0, (kit.draw() - 0.5) * 4.0);
        kit.prop(rock, at, yaw);
    }
}

/// A great slab broken from the cliff and leant back against it, its face along the cliff.
fn slab(kit: &mut Kit, carved: &Sculpts, foot: [f64; 2], outward: [f64; 2]) {
    let at = off(foot, outward, 1.0 + kit.draw() * 1.5, (kit.draw() - 0.5) * 4.0);
    let size = [4.0 + kit.draw() * 4.0, 0.9 + kit.draw() * 0.7, 7.0 + kit.draw() * 6.0];
    let base = on_carved(kit, carved, at)[2] - 0.6;
    let lean = 0.25 + kit.draw() * 0.25;
    let roll = (kit.draw() - 0.5) * 0.2;
    let upright =
        Solid::upright(Shape::Block, [at[0], at[1], base], size, Material::Rubble).turned(turn_along(outward));
    kit.solid(Solid { lean, roll, ..upright });
}

/// Pillars of rubble round each outcrop (`[x, y, radius, height]`, the sculpt's), standing against its face as the
/// columns a mesa's rock breaks into, tallest on a spire, and boulders fallen at its foot; none on a path.
pub fn clad(kit: &mut Kit, outcrops: &[[f64; 4]], paths: &[Path]) {
    for &[x, y, radius, tall] in outcrops {
        let spire = radius < 7.5 && tall > 12.0;
        let count = 5 + (radius / 2.0) as u32;
        for pillar in 0..count {
            let angle = (f64::from(pillar) + kit.draw() * 0.6) / f64::from(count) * std::f64::consts::TAU;
            let (sine, cosine) = land::exact::sin_cos(angle);
            let out = radius * (0.8 + kit.draw() * 0.25);
            let at = [x + sine * out, y - cosine * out];
            if near_path(paths, at, PATH_CLEAR_M) {
                continue;
            }
            let across = (radius / 3.0).clamp(2.2, 4.8) * (0.7 + kit.draw() * 0.5);
            let high = tall * if spire { 0.7 + kit.draw() * 0.4 } else { 0.5 + kit.draw() * 0.5 };
            let shape = Shape::Column { sides: 5 + (kit.draw() * 2.0) as u32, top: 0.5 + kit.draw() * 0.3 };
            let size = [across, across * (0.8 + kit.draw() * 0.3), high + 1.0];
            stone(kit, shape, on_floor(kit, at), size, 0.07);
        }
        for _ in 0..2 + (kit.draw() * 3.0) as u32 {
            let angle = kit.draw() * std::f64::consts::TAU;
            let (sine, cosine) = land::exact::sin_cos(angle);
            let out = radius * (1.05 + kit.draw() * 0.3);
            let at = [x + sine * out, y - cosine * out];
            if near_path(paths, at, PATH_CLEAR_M) {
                continue;
            }
            let size = [1.5 + kit.draw() * 2.5, 1.2 + kit.draw() * 2.0, 1.0 + kit.draw() * 1.8];
            let shape = boulder_shape(kit);
            stone(kit, shape, on_floor(kit, at), size, 0.3);
        }
    }
}
