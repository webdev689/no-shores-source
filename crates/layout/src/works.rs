//! The great works of a layout, built across and along its canyons so they make its ways and its bounds: a colossal
//! ruined wall dammed across one canyon with a breach broken through it where the track runs, a viaduct carried over
//! another from cliff top to cliff top with one span fallen into the gorge, retaining walls along the feet of the
//! wider basins (the rock of the cliffs and outcrops is rocks.rs'). All of stone, laid as the city's solids, and every
//! one a box a body meets: the deck of a viaduct overhead, its piers and the wall's flanks in the way.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::distance;
use crate::paths::{Path, Tier, simplified};
use crate::pieces::{Kit, ahead, turn_along};
use city::solids::{Material, Shape, Solid};

/// The great wall's thickness and how far it stands over the massif's top, metres.
const WALL_THICK_M: f64 = 9.0;
const WALL_OVER_M: f64 = 10.0;
/// How wide a breach is past the track it lets through, metres.
const BREACH_SPARE_M: f64 = 5.0;
/// A viaduct's span between piers, its deck's width and its piers' size, metres.
const SPAN_M: f64 = 14.0;
const DECK_M: f64 = 7.0;
const PIER_M: f64 = 4.0;
/// How far apart the great wall and the viaduct stand at least, metres.
const WORKS_APART_M: f64 = 250.0;

/// A straight run of a path: its middle, its way and its length.
type Run = ([f64; 2], [f64; 2], f64);

/// A path's longest straight run.
fn longest_run(path: &Path) -> Option<Run> {
    simplified(&path.points, 6.0)
        .windows(2)
        .map(|pair| {
            let length = distance(pair[0], pair[1]);
            let way = [(pair[1][0] - pair[0][0]) / length.max(1e-9), (pair[1][1] - pair[0][1]) / length.max(1e-9)];
            ([(pair[0][0] + pair[1][0]) / 2.0, (pair[0][1] + pair[1][1]) / 2.0], way, length)
        })
        .max_by(|first, second| first.2.total_cmp(&second.2))
}

/// Whether a point stands clear of every area's reach, so a work is built in a canyon and not in a basin.
fn between_areas(areas: &[Area], at: [f64; 2]) -> bool {
    areas.iter().all(|area| distance(area.at, at) > area.radius + 45.0)
}

/// Builds a layout's great works: the wall across the longest track's straightest run, the viaduct over the next
/// longest path's, and the retaining walls.
pub fn build(kit: &mut Kit, areas: &[Area], paths: &[Path], rise: f64) {
    let mut runs: Vec<(Tier, Run)> = paths
        .iter()
        .filter_map(|path| longest_run(path).map(|run| (path.tier, run)))
        .filter(|(_, run)| run.2 > 50.0 && between_areas(areas, run.0))
        .collect();
    runs.sort_by(|first, second| second.1.2.total_cmp(&first.1.2));
    let wall = runs.iter().find(|(tier, _)| *tier == Tier::Track).or(runs.first()).copied();
    if let Some((tier, (middle, way, _))) = wall {
        great_wall(kit, middle, way, tier, rise);
    }
    // The viaduct stands well away from the wall, so each is a place of its own.
    let apart = |run: &&(Tier, Run)| wall.is_none_or(|(_, (middle, _, _))| distance(middle, run.1.0) > WORKS_APART_M);
    if let Some((tier, (middle, way, _))) = runs.iter().find(apart) {
        viaduct(kit, *middle, *way, *tier, rise);
    }
    for area in
        areas.iter().filter(|area| area.radius >= 60.0 && !matches!(area.kind, AreaKind::Wilds | AreaKind::Arena))
    {
        retaining(kit, area, paths);
    }
}

/// A canyon's half-width at its floor and how far its cliffs run out, for a tier.
fn canyon(tier: Tier) -> (f64, f64) {
    (if tier == Tier::Track { 15.0 } else { 11.0 }, land::sculpts::CLIFF_RUN_M)
}

/// The great wall: a dam of ashlar across the canyon square to its way, its ends sunk into the cliffs either side,
/// buttressed on both faces, battlemented, and broken through where the track runs, the breach's sides stepped where
/// its courses fell and their stones heaped below.
fn great_wall(kit: &mut Kit, middle: [f64; 2], way: [f64; 2], tier: Tier, rise: f64) {
    let (half, run) = canyon(tier);
    let floor = kit.height(middle);
    let across = [-way[1], way[0]];
    let turn = turn_along(across);
    let reach = (half * 1.35 + run) + 26.0;
    let breach = tier.width() / 2.0 + BREACH_SPARE_M;
    let top = floor + rise + WALL_OVER_M;
    for side in [-1.0, 1.0] {
        let length = reach - breach;
        let centre = ahead(middle, across, side * (breach + length / 2.0), 0.0);
        kit.solid(
            Solid::upright(
                Shape::Block,
                [centre[0], centre[1], floor - 3.0],
                [WALL_THICK_M, length, top - floor + 3.0],
                Material::Stone,
            )
            .turned(turn),
        );
        // The breach's broken edge: courses stepping back from the gap, each lower than the last.
        for course in 0..5 {
            let at = ahead(middle, across, side * (breach + 1.5 + f64::from(course) * 1.6), 0.0);
            let height = (top - floor) * (0.25 + 0.15 * f64::from(course));
            kit.solid(
                Solid::upright(
                    Shape::Block,
                    [at[0], at[1], floor - 1.0],
                    [WALL_THICK_M + 0.6, 3.2, height],
                    Material::Stone,
                )
                .turned(turn),
            );
        }
        for buttress in 0..((length / 9.0) as u32) {
            let along = breach + 6.0 + f64::from(buttress) * 9.0;
            for face in [-1.0, 1.0] {
                let at = ahead(ahead(middle, across, side * along, 0.0), way, face * (WALL_THICK_M / 2.0 + 1.0), 0.0);
                kit.solid(
                    Solid::upright(
                        Shape::Block,
                        [at[0], at[1], floor - 2.0],
                        [2.2, 2.0, top - floor - 4.0],
                        Material::Trim,
                    )
                    .turned(turn),
                );
            }
        }
        for merlon in 0..((length / 3.0) as u32) {
            let at = ahead(middle, across, side * (breach + 6.0 + f64::from(merlon) * 3.0), 0.0);
            kit.solid(
                Solid::upright(Shape::Block, [at[0], at[1], top], [WALL_THICK_M, 1.4, 1.8], Material::Stone)
                    .turned(turn),
            );
        }
    }
    for _ in 0..14 {
        let along = (kit.draw() - 0.5) * breach * 1.4;
        let out = (kit.draw() - 0.5) * 22.0;
        let at = ahead(ahead(middle, across, along, 0.0), way, out, 0.0);
        if out.abs() < WALL_THICK_M / 2.0 + 2.0 && along.abs() < tier.width() {
            continue;
        }
        let size = [1.5 + kit.draw() * 2.5, 1.2 + kit.draw() * 2.0, 1.0 + kit.draw() * 1.8];
        let spin = kit.draw() * 3.0;
        kit.stand(Shape::Block, at, size, spin, Material::Stone, 0.4);
    }
}

/// A viaduct: a deck from cliff top to cliff top across the canyon, on piers standing at the canyon's sides with
/// arches between them, and one span fallen, its stones lying in the gorge beside the way.
fn viaduct(kit: &mut Kit, middle: [f64; 2], way: [f64; 2], tier: Tier, rise: f64) {
    let (half, run) = canyon(tier);
    let floor = kit.height(middle);
    let across = [-way[1], way[0]];
    let turn = turn_along(across);
    let deck = floor + rise * 0.92;
    let reach = half * 1.35 + run + 10.0;
    let spans = ((2.0 * reach) / SPAN_M).ceil() as i32;
    let fallen = spans / 2 + 1;
    for pier in 0..=spans {
        let along = -reach + f64::from(pier) * (2.0 * reach / f64::from(spans));
        let at = ahead(middle, across, along, 0.0);
        if along.abs() > tier.width() / 2.0 + PIER_M {
            kit.solid(
                Solid::upright(
                    Shape::Block,
                    [at[0], at[1], floor - 2.0],
                    [DECK_M, PIER_M, deck - floor + 2.0],
                    Material::Stone,
                )
                .turned(turn),
            );
        }
        if pier < spans && pier != fallen {
            let next = ahead(middle, across, along + reach / f64::from(spans), 0.0);
            let arch_rise = (deck - floor) * 0.45;
            let arch = Solid::upright(
                Shape::Arch { opening: 0.7 },
                [next[0], next[1], deck - arch_rise],
                [2.0 * reach / f64::from(spans), DECK_M, arch_rise],
                Material::Stone,
            );
            kit.solid(arch.turned(turn + std::f64::consts::FRAC_PI_2));
            kit.solid(
                Solid::upright(
                    Shape::Block,
                    [next[0], next[1], deck - 0.8],
                    [DECK_M + 0.8, 2.0 * reach / f64::from(spans), 0.8],
                    Material::Paving,
                )
                .turned(turn),
            );
            for side in [-1.0, 1.0] {
                let rail = ahead(next, way, side * (DECK_M / 2.0 + 0.2), 0.0);
                kit.solid(
                    Solid::upright(
                        Shape::Block,
                        [rail[0], rail[1], deck],
                        [0.5, 2.0 * reach / f64::from(spans), 1.1],
                        Material::Trim,
                    )
                    .turned(turn),
                );
            }
        }
    }
    let gap = ahead(middle, across, -reach + (f64::from(fallen) + 0.5) * (2.0 * reach / f64::from(spans)), 0.0);
    for stone in 0..8 {
        let at = ahead(gap, way, (kit.draw() - 0.5) * 14.0, kit.draw() - 0.5);
        if distance(at, middle) < tier.width() {
            continue;
        }
        let size = [2.0 + kit.draw() * 3.0, 1.5 + kit.draw() * 2.0, 1.2 + kit.draw()];
        let spin = kit.draw() * 3.0 + f64::from(stone);
        kit.stand(Shape::Block, at, size, spin, Material::Stone, 0.5);
    }
}

/// Retaining walls along part of a basin's edge, where its floor meets the cliff: ashlar four metres high in lengths
/// following the curve, broken where a path leaves the basin.
fn retaining(kit: &mut Kit, area: &Area, paths: &[Path]) {
    let edge = area.radius + 30.0;
    let start = kit.draw() * std::f64::consts::TAU;
    let arc = 1.2 + kit.draw() * 1.6;
    let pieces = (arc * edge / 7.0) as u32;
    for piece in 0..pieces {
        let angle = start + arc * f64::from(piece) / f64::from(pieces);
        let at = ahead(area.at, [0.0, -1.0], edge, angle);
        let on_path = paths.iter().any(|path| path.points.iter().any(|&point| distance(point, at) < 14.0));
        if on_path {
            continue;
        }
        let (sine, cosine) = land::exact::sin_cos(angle);
        let tangent = [cosine, sine];
        kit.stand(Shape::Block, at, [1.4, 7.2, 4.2], turn_along(tangent), Material::Stone, 1.0);
    }
}
