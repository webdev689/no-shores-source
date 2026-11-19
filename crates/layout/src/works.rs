//! The great works of a layout, built across and along its canyons so they make its ways and its bounds: a colossal
//! ruined wall dammed across one canyon with a breach broken through it where the track runs, a viaduct carried over
//! another from cliff top to cliff top with one span fallen into the gorge, retaining walls along the feet of the
//! wider basins (the rock of the cliffs and outcrops is rocks.rs'). All of stone, laid as the city's solids, and every
//! one a box a body meets: the deck of a viaduct overhead, its piers and the wall's flanks in the way.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::distance;
use crate::paths::{Path, Tier, off_line, simplified};
use crate::pieces::{Kit, ahead, turn_along};
use city::solids::{Material, Shape, Solid};
use land::sculpts::{Outcrop, Sculpts};

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
/// Where the carving first raises the floor this much, metres, is a cliff's foot (rocks.rs FOOT_RISE_M).
const FOOT: f64 = crate::rocks::FOOT_RISE_M;

/// A straight run of a path: its middle, its way and its length.
type Run = ([f64; 2], [f64; 2], f64);

/// A path's longest straight run: the point of the path itself nearest its middle, and the path's own way there, so
/// a work square to it stands square to the way as it wanders, not to the run's chord.
fn longest_run(path: &Path) -> Option<Run> {
    let points = &path.points;
    let (middle, length) = simplified(points, 6.0)
        .windows(2)
        .map(|pair| ([(pair[0][0] + pair[1][0]) / 2.0, (pair[0][1] + pair[1][1]) / 2.0], distance(pair[0], pair[1])))
        .max_by(|first, second| first.1.total_cmp(&second.1))?;
    let nearest = (0..points.len())
        .min_by(|&first, &second| distance(points[first], middle).total_cmp(&distance(points[second], middle)))?;
    let (back, ahead) = (points[nearest.saturating_sub(1)], points[(nearest + 1).min(points.len() - 1)]);
    let span = distance(back, ahead).max(1e-9);
    Some((points[nearest], [(ahead[0] - back[0]) / span, (ahead[1] - back[1]) / span], length))
}

/// Whether every one of a work's pieces that stands lower than a head over the floor keeps clear of every way's
/// walked width: its box, square to the world, as a body meets it.
fn clear_of_ways(pieces: &[Solid], paths: &[Path], floor: f64) -> bool {
    pieces.iter().filter(|piece| piece.at[2] < floor + 2.0).all(|piece| {
        let [west, north, east, south, ..] = piece.bounds();
        crate::paths::clear_of([west, north, east, south], paths)
    })
}

/// Whether a point stands clear of every area's reach, so a work is built in a canyon and not in a basin.
fn between_areas(areas: &[Area], at: [f64; 2]) -> bool {
    areas.iter().all(|area| distance(area.at, at) > area.radius + 45.0)
}

/// Builds a layout's great works: the wall across the longest track's straightest run, the viaduct over the next
/// longest path's and a natural arch over a third.
pub fn build(kit: &mut Kit, areas: &[Area], paths: &[Path], rise: f64, carved: &Sculpts) {
    let mut runs: Vec<(Tier, Run)> = paths
        .iter()
        .filter_map(|path| longest_run(path).map(|run| (path.tier, run)))
        .filter(|(_, run)| run.2 > 50.0 && between_areas(areas, run.0))
        .collect();
    runs.sort_by(|first, second| second.1.2.total_cmp(&first.1.2));
    let wall = runs.iter().find(|(tier, _)| *tier == Tier::Track).or(runs.first()).copied();
    if let Some((tier, (middle, way, _))) = wall {
        great_wall(kit, middle, way, tier, rise, paths);
    }
    // The viaduct stands well away from the wall, so each is a place of its own.
    let apart = |run: &&(Tier, Run)| wall.is_none_or(|(_, (middle, _, _))| distance(middle, run.1.0) > WORKS_APART_M);
    let viaduct_at = runs.iter().find(apart).copied();
    if let Some((tier, (middle, way, _))) = viaduct_at {
        viaduct(kit, middle, way, tier, rise, paths);
    }
    // A natural arch over a third canyon, apart from both.
    let clear_of =
        |work: Option<(Tier, Run)>, at: [f64; 2]| work.is_none_or(|(_, run)| distance(run.0, at) > WORKS_APART_M);
    if let Some((tier, (middle, way, _))) =
        runs.iter().find(|(_, run)| clear_of(wall, run.0) && clear_of(viaduct_at, run.0))
    {
        crate::skyline::natural_arch(kit, *middle, *way, *tier, rise, carved);
    }
}

/// The retaining walls along the wider basins' feet, clear of every way (the climbs' too) and every outcrop.
pub fn retaining_walls(kit: &mut Kit, areas: &[Area], paths: &[Path], outcrops: &[Outcrop], carved: &Sculpts) {
    for area in
        areas.iter().filter(|area| area.radius >= 60.0 && !matches!(area.kind, AreaKind::Wilds | AreaKind::Arena))
    {
        retaining(kit, area, (paths, outcrops), carved);
    }
}

/// A canyon's half-width at its floor and how far its cliffs run out, for a tier.
fn canyon(tier: Tier) -> (f64, f64) {
    (if tier == Tier::Track { 15.0 } else { 11.0 }, land::sculpts::CLIFF_RUN_M)
}

/// The great wall: a dam of ashlar across the canyon square to its way, its ends sunk into the cliffs either side,
/// buttressed on both faces, battlemented, and broken through where the track runs, the breach's sides stepped where
/// its courses fell and their stones heaped below. The breach opens until no piece stands on a way, and no fallen
/// stone lies on one.
fn great_wall(kit: &mut Kit, middle: [f64; 2], way: [f64; 2], tier: Tier, rise: f64, paths: &[Path]) {
    let (half, run) = canyon(tier);
    let floor = kit.height(middle);
    let across = [-way[1], way[0]];
    let turn = turn_along(across);
    let reach = (half * 1.35 + run) + 26.0;
    let top = floor + rise + WALL_OVER_M;
    let pieces = |breach: f64| {
        let mut pieces = Vec::new();
        for side in [-1.0, 1.0] {
            let length = reach - breach;
            let (start, end) = (ahead(middle, across, side * breach, 0.0), ahead(middle, across, side * reach, 0.0));
            crate::halls::wall(&mut pieces, start, end, floor - 3.0, top, WALL_THICK_M, Material::Stone);
            // The breach's broken edge: courses stepping back from the gap, each lower than the last.
            for course in 0..5 {
                let at = ahead(middle, across, side * (breach + 1.5 + f64::from(course) * 1.6), 0.0);
                let height = (top - floor) * (0.25 + 0.15 * f64::from(course));
                let size = [WALL_THICK_M + 0.6, 3.2, height];
                pieces.push(
                    Solid::upright(Shape::Block, [at[0], at[1], floor - 1.0], size, Material::Stone).turned(turn),
                );
            }
            for buttress in 0..((length / 9.0) as u32) {
                let along = breach + 6.0 + f64::from(buttress) * 9.0;
                for face in [-1.0, 1.0] {
                    let at =
                        ahead(ahead(middle, across, side * along, 0.0), way, face * (WALL_THICK_M / 2.0 + 1.0), 0.0);
                    let size = [2.2, 2.0, top - floor - 4.0];
                    pieces.push(
                        Solid::upright(Shape::Block, [at[0], at[1], floor - 2.0], size, Material::Trim).turned(turn),
                    );
                }
            }
            for merlon in 0..((length / 3.0) as u32) {
                let at = ahead(middle, across, side * (breach + 6.0 + f64::from(merlon) * 3.0), 0.0);
                let size = [WALL_THICK_M, 1.4, 1.8];
                pieces.push(Solid::upright(Shape::Block, [at[0], at[1], top], size, Material::Stone).turned(turn));
            }
        }
        pieces
    };
    let least = tier.width() / 2.0 + BREACH_SPARE_M;
    let breach =
        (0..12).map(|wider| least + f64::from(wider)).find(|&breach| clear_of_ways(&pieces(breach), paths, floor));
    let breach = breach.unwrap_or(least + 12.0);
    for piece in pieces(breach) {
        kit.solid(piece);
    }
    for _ in 0..14 {
        let along = (kit.draw() - 0.5) * breach * 1.4;
        let out = (kit.draw() - 0.5) * 22.0;
        let at = ahead(ahead(middle, across, along, 0.0), way, out, 0.0);
        let size = [1.5 + kit.draw() * 2.5, 1.2 + kit.draw() * 2.0, 1.0 + kit.draw() * 1.8];
        let spin = kit.draw() * 3.0;
        let stone =
            Solid::upright(Shape::Block, [at[0], at[1], kit.height(at) - 0.4], size, Material::Stone).turned(spin);
        if (out.abs() >= WALL_THICK_M / 2.0 + 2.0 || along.abs() >= tier.width())
            && clear_of_ways(&[stone], paths, floor)
        {
            kit.solid(stone);
        }
    }
}

/// A viaduct: a deck from cliff top to cliff top across the canyon, on piers standing at the canyon's sides with
/// arches between them, and one span fallen, its stones lying in the gorge beside the way.
fn viaduct(kit: &mut Kit, middle: [f64; 2], way: [f64; 2], tier: Tier, rise: f64, paths: &[Path]) {
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
        let standing = Solid::upright(
            Shape::Block,
            [at[0], at[1], floor - 2.0],
            [DECK_M, PIER_M, deck - floor + 2.0],
            Material::Stone,
        )
        .turned(turn);
        // A pier turned across the way reaches further than its middle: its box keeps off every way.
        if along.abs() > tier.width() / 2.0 + PIER_M && clear_of_ways(&[standing], paths, floor) {
            kit.solid(standing);
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
/// following the curve, each found by walking out from the basin's middle to the cliff's real foot, and broken where
/// a way runs by or an outcrop stands at the rim, its foot not the cliff's.
fn retaining(kit: &mut Kit, area: &Area, (paths, outcrops): (&[Path], &[Outcrop]), carved: &Sculpts) {
    let edge = area.radius + 30.0;
    let start = kit.draw() * std::f64::consts::TAU;
    let arc = 1.2 + kit.draw() * 1.6;
    let pieces = (arc * edge / 7.0) as u32;
    for piece in 0..pieces {
        let angle = start + arc * f64::from(piece) / f64::from(pieces);
        let (sine, cosine) = land::exact::sin_cos(angle);
        let (outward, tangent) = ([sine, -cosine], [cosine, sine]);
        // The floor's edge wanders out to 1.35 of its reach; the wall stands its half-thickness in front of the foot.
        let mut out = area.radius;
        // A mesa standing on the floor is not the cliff: the foot lies past the floor's edge.
        let foot = |out: f64| {
            let at = ahead(area.at, outward, out, 0.0);
            crate::rocks::raised(kit, carved, at) >= FOOT && carved.floor_distance(at[0], at[1]) > 0.0
        };
        while out < (edge + 2.0) * 1.35 && !foot(out) {
            out += 0.5;
        }
        if out >= (edge + 2.0) * 1.35 {
            continue;
        }
        let at = ahead(area.at, outward, out - 0.7, 0.0);
        let on_path = paths.iter().any(|path| {
            path.points.windows(2).any(|pair| off_line(at, pair[0], pair[1]) < path.tier.width() / 2.0 + 4.1)
        });
        let in_rock = outcrops.iter().any(|outcrop| {
            let ([first, last], reach) = outcrop.footprint();
            off_line(at, first, last) < reach + 4.0
        });
        if on_path || in_rock {
            continue;
        }
        kit.stand(Shape::Block, at, [1.4, 7.2, 4.2], turn_along(tangent), Material::Stone, 1.0);
    }
}
