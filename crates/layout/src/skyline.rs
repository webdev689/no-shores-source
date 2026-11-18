//! What stands against a layout's sky: the ruins of an older frontier along its cliff tops (broken towers and runs
//! of wall on the rim, so the bounds read as a border once held) and a natural arch of rock left standing over one of
//! its canyons, its way running under it. All past the section but the arch's span, which is met only overhead.

use crate::field::{distance, ring_holds};
use crate::paths::{Path, Tier, off_line};
use crate::pieces::{Kit, ahead, turn_along};
use crate::rocks::stone;
use city::solids::{Material, Shape, Solid};
use land::sculpts::Sculpts;

/// How far apart the rim's ruins stand along the section's edge, and how far back from it, on the cliff tops, metres.
const RUIN_EVERY_M: f64 = 170.0;
const RIM_BACK_M: f64 = 26.0;
/// How much the top may rise and fall under a ruin's spread, metres.
const UNEVEN_MOST_M: f64 = 1.5;
/// How far a ruin keeps from a way out through the cliffs (a gorge or a canyon's mouth), metres.
const WAY_CLEAR_M: f64 = 45.0;

/// A point on the ground as carved.
fn carved_at(kit: &Kit, carved: &Sculpts, at: [f64; 2]) -> f64 {
    kit.height(at) + carved.raise(at[0], at[1], kit.ground.coast.at(at[0], at[1]))
}

/// Ruins along the cliff tops round the section, walked at even steps, each where the massif stands over it.
pub fn rim(kit: &mut Kit, ring: &[[f64; 2]], paths: &[Path], carved: &Sculpts) {
    let mut carried = RUIN_EVERY_M / 2.0;
    for (at, &from) in ring.iter().enumerate() {
        let to = ring[(at + 1) % ring.len()];
        let length = distance(from, to);
        if length < 1e-6 {
            continue;
        }
        let along = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        let mut step = RUIN_EVERY_M - carried;
        while step <= length {
            let edge = [from[0] + along[0] * step, from[1] + along[1] * step];
            step += RUIN_EVERY_M * (0.75 + kit.draw() * 0.5);
            let normal = [along[1], -along[0]];
            let outward = if ring_holds(ring, edge[0] + normal[0] * 3.0, edge[1] + normal[1] * 3.0) {
                [-normal[0], -normal[1]]
            } else {
                normal
            };
            let site = [edge[0] + outward[0] * RIM_BACK_M, edge[1] + outward[1] * RIM_BACK_M];
            let near_way = paths
                .iter()
                .any(|path| path.points.windows(2).any(|pair| off_line(site, pair[0], pair[1]) < WAY_CLEAR_M));
            // Only where the cliff stands: a ruin on low ground past a gorge's mouth would sit in plain view of nothing.
            let standing = carved_at(kit, carved, site) - kit.height(edge);
            // Only on a top level enough to hold it: a ruin on a slope would stand in the hill, not on it.
            let heights = [[6.0, 0.0], [-6.0, 0.0], [0.0, 6.0], [0.0, -6.0], [0.0, 0.0]]
                .map(|[east, south]| carved_at(kit, carved, [site[0] + east, site[1] + south]));
            let uneven = heights.iter().copied().fold(f64::NEG_INFINITY, f64::max)
                - heights.iter().copied().fold(f64::INFINITY, f64::min);
            if near_way || ring_holds(ring, site[0], site[1]) || standing < 8.0 || uneven > UNEVEN_MOST_M {
                continue;
            }
            if kit.draw() < 0.45 {
                tower_stump(kit, carved, site);
            } else {
                wall_run(kit, carved, site, along);
            }
        }
        carried = length - (step - RUIN_EVERY_M);
        carried = carried.clamp(0.0, RUIN_EVERY_M);
    }
}

/// A round tower broken off at its top, its fallen courses round its foot.
fn tower_stump(kit: &mut Kit, carved: &Sculpts, site: [f64; 2]) {
    let across = 5.0 + kit.draw() * 3.5;
    let tall = 6.0 + kit.draw() * 10.0;
    let base = carved_at(kit, carved, site) - 1.5;
    let tower = Solid::upright(
        Shape::Column { sides: 12, top: 0.92 },
        [site[0], site[1], base],
        [across, across, tall],
        Material::Stone,
    );
    let lean = (kit.draw() - 0.5) * 0.06;
    kit.solid(Solid { lean, ..tower });
    // A broken crown: a few merlons left standing on one side.
    let left = 2 + (kit.draw() * 3.0) as u32;
    let start = kit.draw() * std::f64::consts::TAU;
    for merlon in 0..left {
        let angle = start + f64::from(merlon) * 0.45;
        let at = ahead(site, [0.0, -1.0], across * 0.42, angle);
        let size = [1.1, 0.9, 1.0 + kit.draw()];
        kit.solid(Solid::upright(Shape::Block, [at[0], at[1], base + tall - 0.2], size, Material::Stone).turned(angle));
    }
    for _ in 0..3 + (kit.draw() * 3.0) as u32 {
        let at = ahead(site, [0.0, -1.0], across * (0.6 + kit.draw() * 0.6), kit.draw() * std::f64::consts::TAU);
        let ground = carved_at(kit, carved, at);
        let size = [0.9 + kit.draw() * 1.2, 0.7 + kit.draw() * 0.8, 0.5 + kit.draw() * 0.6];
        stone(kit, Shape::Pyramid { top: 0.5 }, [at[0], at[1], ground], size, 0.3);
    }
}

/// A run of curtain wall along the rim, in lengths broken to different heights, a gap where a length fell.
fn wall_run(kit: &mut Kit, carved: &Sculpts, site: [f64; 2], along: [f64; 2]) {
    let lengths = 2 + (kit.draw() * 3.0) as u32;
    let long = 6.0 + kit.draw() * 3.0;
    let start = -(f64::from(lengths) * long) / 2.0;
    for piece in 0..lengths {
        if kit.draw() < 0.2 {
            continue;
        }
        let offset = start + (f64::from(piece) + 0.5) * long;
        let at = [site[0] + along[0] * offset, site[1] + along[1] * offset];
        let base = carved_at(kit, carved, at) - 1.2;
        let high = 3.0 + kit.draw() * 4.5;
        kit.solid(
            Solid::upright(Shape::Block, [at[0], at[1], base], [1.6, long + 0.2, high], Material::Stone)
                .turned(turn_along(along)),
        );
        if kit.draw() < 0.35 {
            // A buttress against its outer face.
            let buttress = [at[0] - along[1] * 1.6, at[1] + along[0] * 1.6];
            let size = [1.6, 1.4, high * 0.8];
            kit.solid(
                Solid::upright(Shape::Pyramid { top: 0.6 }, [buttress[0], buttress[1], base], size, Material::Stone)
                    .turned(turn_along(along)),
            );
        }
    }
}

/// A lookout on the massif's top at a climb's end (`toward`, the way the climb ran up): a parapet of broken stone round
/// its edge but where the climb comes up, and an iron brazier glowing on a plinth over the drop.
pub fn lookout(kit: &mut Kit, at: [f64; 2], toward: [f64; 2], carved: &Sculpts) {
    let length = (toward[0] * toward[0] + toward[1] * toward[1]).sqrt().max(1e-9);
    let up = [toward[0] / length, toward[1] / length];
    let reach = 9.5;
    for piece in 0..18 {
        let angle = f64::from(piece) * std::f64::consts::TAU / 18.0;
        let spot = ahead(at, up, reach, angle);
        // The climb arrives from behind: no parapet across it.
        let behind = (spot[0] - at[0]) * up[0] + (spot[1] - at[1]) * up[1] < -reach * 0.75;
        if behind || kit.draw() < 0.2 {
            continue;
        }
        let ground = carved_at(kit, carved, spot);
        let high = 0.8 + kit.draw() * 0.5;
        let tangent = [spot[1] - at[1], at[0] - spot[0]];
        let wall =
            Solid::upright(Shape::Block, [spot[0], spot[1], ground - 0.3], [0.7, 3.2, high + 0.3], Material::Stone);
        kit.solid(wall.turned(turn_along(tangent)));
    }
    let front = [at[0] + up[0] * 5.5, at[1] + up[1] * 5.5];
    let ground = carved_at(kit, carved, front);
    kit.solid(Solid::upright(
        Shape::Column { sides: 8, top: 0.85 },
        [front[0], front[1], ground - 0.3],
        [1.4, 1.4, 1.4],
        Material::Stone,
    ));
    kit.solid(Solid::upright(
        Shape::Column { sides: 8, top: 1.4 },
        [front[0], front[1], ground + 1.1],
        [0.9, 0.9, 0.45],
        Material::Iron,
    ));
    kit.solid(Solid::upright(
        Shape::Pyramid { top: 0.2 },
        [front[0], front[1], ground + 1.45],
        [0.7, 0.7, 0.55],
        Material::Glow,
    ));
}

/// A low kerb of drystone along a climb's drop, from a little way up it to its top, broken here and there, so the way
/// reads as made and a body keeps to it.
pub fn kerb(kit: &mut Kit, from: [f64; 2], to: [f64; 2], half: f64, carved: &Sculpts) {
    let length = distance(from, to);
    if length < 1.0 {
        return;
    }
    let way = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
    let middle = [(from[0] + to[0]) / 2.0, (from[1] + to[1]) / 2.0];
    let side_of = |side: f64| [middle[0] - way[1] * side * (half + 4.0), middle[1] + way[0] * side * (half + 4.0)];
    // The drop is the side whose land beside the climb lies lower.
    let (left, right) = (carved_at(kit, carved, side_of(1.0)), carved_at(kit, carved, side_of(-1.0)));
    let side = if left < right { 1.0 } else { -1.0 };
    let mut along = 8.0;
    while along < length {
        let at = [
            from[0] + way[0] * along - way[1] * side * (half - 0.4),
            from[1] + way[1] * along + way[0] * side * (half - 0.4),
        ];
        along += 3.4;
        if kit.draw() < 0.15 {
            continue;
        }
        let base = carved_at(kit, carved, at) - 0.2;
        let size = [0.6, 3.4, 0.75 + kit.draw() * 0.2];
        kit.solid(Solid::upright(Shape::Block, [at[0], at[1], base], size, Material::Rubble).turned(turn_along(way)));
    }
}

/// A natural arch of rock left standing over a canyon, square to its way at `middle`: its feet in the cliffs either
/// side, its crown a little over the massif's top, boulders fallen at its feet; the way runs under it.
pub fn natural_arch(kit: &mut Kit, middle: [f64; 2], way: [f64; 2], tier: Tier, rise: f64) {
    let half = if tier == Tier::Track { 15.0 } else { 11.0 };
    // The arch's opening is its middle four-fifths (the city's arch), so its jambs stand on the cliffs' feet.
    let span = 2.0 * (half + 6.0) / 0.9;
    let depth = 7.0 + kit.draw() * 5.0;
    let tall = rise + 3.0 + kit.draw() * 4.0;
    let floor = kit.height(middle);
    let arch = Solid::upright(
        Shape::Arch { opening: 0.72 },
        [middle[0], middle[1], floor - 1.0],
        [span, depth, tall],
        Material::Rubble,
    );
    kit.solid(arch.turned(turn_along(way)));
    let across = [way[1], -way[0]];
    for side in [-1.0, 1.0] {
        for _ in 0..3 + (kit.draw() * 3.0) as u32 {
            let out = side * (half + 1.0 + kit.draw() * 4.0);
            let along = (kit.draw() - 0.5) * depth * 1.5;
            let at = [middle[0] + across[0] * out + way[0] * along, middle[1] + across[1] * out + way[1] * along];
            let size = [1.5 + kit.draw() * 2.5, 1.3 + kit.draw() * 2.0, 1.0 + kit.draw() * 2.0];
            let ground = kit.height(at);
            stone(kit, Shape::Dome { sides: 6 }, [at[0], at[1], ground], size, 0.3);
        }
    }
}
