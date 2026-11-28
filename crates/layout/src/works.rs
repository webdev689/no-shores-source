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
use crate::skyline::carved_at;
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

/// How far a work's box keeps off a cavern's or a ledge's cut floor past its half-width, metres: in the rock round it.
const CUT_CLEAR_M: f64 = 2.0;

/// The widest a canyon is measured, metres, either side of its way.
const MOST_HALF_M: f64 = 200.0;

/// Where a work stands: a canyon's middle, its way and its half-width there.
type Place = ([f64; 2], [f64; 2], f64);

/// A straight run of a path: its middle, its way, its length and its canyon's half-width there.
type Run = ([f64; 2], [f64; 2], f64, f64);

/// A path's longest straight run: the point of the path itself nearest its middle, and the path's own way there, so
/// a work square to it stands square to the way as it wanders, not to the run's chord.
fn longest_run(path: &Path, areas: &[Area]) -> Option<Run> {
    let points = &path.points;
    let (middle, length) = simplified(points, 6.0)
        .windows(2)
        .map(|pair| ([(pair[0][0] + pair[1][0]) / 2.0, (pair[0][1] + pair[1][1]) / 2.0], distance(pair[0], pair[1])))
        .max_by(|first, second| first.1.total_cmp(&second.1))?;
    let nearest = (0..points.len())
        .min_by(|&first, &second| distance(points[first], middle).total_cmp(&distance(points[second], middle)))?;
    let (back, ahead) = (points[nearest.saturating_sub(1)], points[(nearest + 1).min(points.len() - 1)]);
    let span = distance(back, ahead).max(1e-9);
    let way = [(ahead[0] - back[0]) / span, (ahead[1] - back[1]) / span];
    Some((points[nearest], way, length, crate::carve::canyon_half_at(path, points[nearest], areas)))
}

/// What the works keep off: every way's walked width, and the floors cut into the rock before them (each cavern's
/// tunnel and hollow, each ledge's slot onto its stair's top), as capsules from one point to another with a
/// half-width.
#[derive(Debug, Clone, Copy)]
pub struct Kept<'a> {
    pub ways: &'a [Path],
    pub cuts: &'a [[f64; 5]],
}

/// Whether every one of a work's pieces that stands lower than a head over the floor keeps clear of every way's
/// walked width and every cut floor: its box, square to the world, as a body meets it.
fn clear_of_ways(pieces: &[Solid], kept: Kept, floor: f64) -> bool {
    pieces.iter().filter(|piece| piece.at[2] < floor + 2.0).all(|piece| {
        let [west, north, east, south, ..] = piece.bounds();
        let print = [west, north, east, south];
        let off_cut = |cut: &[f64; 5]| {
            crate::paths::rect_off_line(print, [cut[0], cut[1]], [cut[2], cut[3]]) > cut[4] + CUT_CLEAR_M
        };
        crate::paths::clear_of(print, kept.ways) && kept.cuts.iter().all(off_cut)
    })
}

/// Whether a point stands clear of every area's reach, so a work is built in a canyon and not in a basin.
fn between_areas(areas: &[Area], at: [f64; 2]) -> bool {
    areas.iter().all(|area| distance(area.at, at) > area.radius + 45.0)
}

/// Whether a work across a canyon at a run, reaching as far as the great wall's ends into the cliffs either side, keeps
/// clear of every outcrop: the outcrops are placed before the works, which would otherwise stand into one.
fn clear_of_outcrops(run: &Run, outcrops: &[Outcrop]) -> bool {
    let (middle, way, _, half) = *run;
    let reach = half * 1.35 + land::sculpts::CLIFF_RUN_M + 26.0;
    let across = [-way[1], way[0]];
    let ends = [ahead(middle, across, -reach, 0.0), ahead(middle, across, reach, 0.0)];
    outcrops.iter().all(|outcrop| {
        let ([first, last], within) = outcrop.footprint();
        crate::paths::segments_apart(ends, [first, last]) > within + WALL_THICK_M + 3.0
    })
}

/// Builds a layout's great works: the wall across the longest track's straightest run, the viaduct over the next
/// longest path's and a natural arch over a third, each clear of the outcrops.
/// `paths` are the ways the works are set on; `kept`, every way they keep off, the climbs' among them, and the cut
/// floors.
pub fn build(kit: &mut Kit, areas: &[Area], (paths, kept): (&[Path], Kept), outcrops: &[Outcrop], carved: &Sculpts) {
    // Each run's canyon as carved: a way opened into one floor between near places, or a floor's wander, is as wide
    // as the land makes it, not as wide as the way alone would cut it.
    let carved_half = |(middle, way, length, half): Run| -> Run {
        let across = [-way[1], way[0]];
        let side = |sign: f64| {
            let mut out = 0.0;
            while out < MOST_HALF_M
                && carved.floor_distance(middle[0] + across[0] * sign * out, middle[1] + across[1] * sign * out) <= 0.0
            {
                out += 0.5;
            }
            out
        };
        (middle, way, length, half.max(side(1.0)).max(side(-1.0)))
    };
    let mut runs: Vec<(Tier, Run)> = paths
        .iter()
        .filter_map(|path| longest_run(path, areas).map(|run| (path.tier, carved_half(run))))
        .filter(|(_, run)| run.2 > 50.0 && between_areas(areas, run.0) && clear_of_outcrops(run, outcrops))
        .collect();
    runs.sort_by(|first, second| second.1.2.total_cmp(&first.1.2));
    // The wall across the longest track's run where it crosses no other way but at its breach, else the next run's.
    let tracks_first = runs
        .iter()
        .filter(|(tier, _)| *tier == Tier::Track)
        .chain(runs.iter().filter(|(tier, _)| *tier != Tier::Track));
    let wall = tracks_first
        .copied()
        .find(|&(tier, (middle, way, _, half))| great_wall(kit, (middle, way, half), tier, kept, carved));
    // The viaduct stands well away from the wall, so each is a place of its own.
    let apart = |run: &&(Tier, Run)| wall.is_none_or(|(_, (middle, ..))| distance(middle, run.1.0) > WORKS_APART_M);
    let viaduct_at = runs.iter().find(apart).copied();
    if let Some((tier, (middle, way, _, half))) = viaduct_at {
        viaduct(kit, (middle, way, half), tier, kept, carved);
    }
    // A natural arch over a third canyon, apart from both.
    let clear_of =
        |work: Option<(Tier, Run)>, at: [f64; 2]| work.is_none_or(|(_, run)| distance(run.0, at) > WORKS_APART_M);
    if let Some((_, (middle, way, _, half))) =
        runs.iter().find(|(_, run)| clear_of(wall, run.0) && clear_of(viaduct_at, run.0))
    {
        crate::skyline::natural_arch(kit, (*middle, *way, *half), kept.ways, carved);
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

/// The great wall: a dam of ashlar across the canyon square to its way, its ends sunk into the cliffs either side,
/// buttressed on both faces, battlemented, and broken through where the track runs, the breach's sides stepped where
/// its courses fell and their stones heaped below. The breach opens until no piece stands on a way, and no fallen
/// stone lies on one; where no breach up to 12 m wider clears every way, no wall is built and it returns false.
fn great_wall(kit: &mut Kit, (middle, way, half): Place, tier: Tier, kept: Kept, carved: &Sculpts) -> bool {
    let run = land::sculpts::CLIFF_RUN_M;
    let floor = carved_at(kit, carved, middle);
    let across = [-way[1], way[0]];
    let turn = turn_along(across);
    let reach = (half * 1.35 + run) + 26.0;
    let top = crate::skyline::rim_across(kit, carved, middle, way, half) + WALL_OVER_M;
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
            // From 6 m past the breach to the wall's end, each merlon (1.4 m along the wall) wholly on its top.
            let merlons = ((length - 6.0 - 0.7) / 3.0).floor() + 1.0;
            for merlon in 0..merlons.max(0.0) as u32 {
                let at = ahead(middle, across, side * (breach + 6.0 + f64::from(merlon) * 3.0), 0.0);
                let size = [WALL_THICK_M, 1.4, 1.8];
                pieces.push(Solid::upright(Shape::Block, [at[0], at[1], top], size, Material::Stone).turned(turn));
            }
        }
        pieces
    };
    let least = tier.width() / 2.0 + BREACH_SPARE_M;
    let breach =
        (0..12).map(|wider| least + f64::from(wider)).find(|&breach| clear_of_ways(&pieces(breach), kept, floor));
    let Some(breach) = breach else { return false };
    for piece in pieces(breach) {
        kit.solid(piece);
    }
    for _ in 0..14 {
        let along = (kit.draw() - 0.5) * breach * 1.4;
        let out = (kit.draw() - 0.5) * 22.0;
        let at = ahead(ahead(middle, across, along, 0.0), way, out, 0.0);
        let size = [1.5 + kit.draw() * 2.5, 1.2 + kit.draw() * 2.0, 1.0 + kit.draw() * 1.8];
        let spin = kit.draw() * 3.0;
        let base = carved_at(kit, carved, at) - 0.4;
        let stone = Solid::upright(Shape::Block, [at[0], at[1], base], size, Material::Stone).turned(spin);
        if (out.abs() >= WALL_THICK_M / 2.0 + 2.0 || along.abs() >= tier.width())
            && clear_of_ways(&[stone], kept, floor)
        {
            kit.solid(stone);
        }
    }
    true
}

/// A viaduct: a deck from cliff top to cliff top across the canyon, on piers standing at the canyon's sides with
/// arches between them, and one span fallen, its stones lying in the gorge beside the way.
fn viaduct(kit: &mut Kit, (middle, way, half): Place, tier: Tier, kept: Kept, carved: &Sculpts) {
    let run = land::sculpts::CLIFF_RUN_M;
    let floor = carved_at(kit, carved, middle);
    let across = [-way[1], way[0]];
    let turn = turn_along(across);
    let deck = floor + (crate::skyline::rim_across(kit, carved, middle, way, half) - floor) * 0.92;
    let reach = half * 1.35 + run + 10.0;
    let spans = ((2.0 * reach) / SPAN_M).ceil() as i32;
    let span = 2.0 * reach / f64::from(spans);
    let pier = |along: f64| {
        let at = ahead(middle, across, along, 0.0);
        let size = [DECK_M, PIER_M, deck - floor + 2.0];
        Solid::upright(Shape::Block, [at[0], at[1], floor - 2.0], size, Material::Stone).turned(turn)
    };
    // A pier turned across the way reaches further than its middle: its box keeps off every way. One that would stand
    // on a way is moved out from the middle until it stands clear, by half a span at most, or left out (the middle's
    // own pier is only left out); each span then runs between two piers that stand, so no arch hangs over the way.
    let clear = |along: f64| along.abs() > tier.width() / 2.0 + PIER_M && clear_of_ways(&[pier(along)], kept, floor);
    let piers: Vec<f64> = (0..=spans)
        .filter_map(|number| {
            let along = -reach + f64::from(number) * span;
            let out = if along.abs() < span / 4.0 { 0.0 } else { along.signum() };
            (0..=(span / 2.0 / 0.5) as i32).map(|step| along + out * f64::from(step) * 0.5).find(|&at| clear(at))
        })
        .collect();
    // The fallen span is the one holding the point a span and a half past the middle's, as it was before any pier moved.
    let fallen = -reach + (f64::from(spans / 2 + 1) + 0.5) * span;
    for &along in &piers {
        kit.solid(pier(along));
    }
    for pair in piers.windows(2) {
        let (from, to) = (pair[0], pair[1]);
        if (from..to).contains(&fallen) {
            continue;
        }
        let (next, length) = (ahead(middle, across, (from + to) / 2.0, 0.0), to - from);
        let arch_rise = (deck - floor) * 0.45;
        let arch = Solid::upright(
            Shape::Arch { opening: 0.7 },
            [next[0], next[1], deck - arch_rise],
            [length, DECK_M, arch_rise],
            Material::Stone,
        );
        kit.solid(arch.turned(turn + std::f64::consts::FRAC_PI_2));
        kit.solid(
            Solid::upright(Shape::Block, [next[0], next[1], deck - 0.8], [DECK_M + 0.8, length, 0.8], Material::Paving)
                .turned(turn),
        );
        for side in [-1.0, 1.0] {
            let rail = ahead(next, way, side * (DECK_M / 2.0 + 0.2), 0.0);
            kit.solid(
                Solid::upright(Shape::Block, [rail[0], rail[1], deck], [0.5, length, 1.1], Material::Trim).turned(turn),
            );
        }
    }
    let gap = ahead(middle, across, fallen, 0.0);
    for stone in 0..8 {
        let at = ahead(gap, way, (kit.draw() - 0.5) * 14.0, kit.draw() - 0.5);
        if distance(at, middle) < tier.width() {
            continue;
        }
        let size = [2.0 + kit.draw() * 3.0, 1.5 + kit.draw() * 2.0, 1.2 + kit.draw()];
        let spin = kit.draw() * 3.0 + f64::from(stone);
        let base = carved_at(kit, carved, at) - 0.5;
        kit.solid(Solid::upright(Shape::Block, [at[0], at[1], base], size, Material::Stone).turned(spin));
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
        // Walked out from the area's middle, since a tiered area's floor may end short of its reach; the floor's edge
        // wanders out to 1.35 of its reach; the wall stands its half-thickness in front of the foot.
        let mut out = 0.0;
        // Off the floor, the land raised a foot's height is the cliff's foot (a mesa standing on the floor is not the
        // cliff), and fallen as far is a raised floor's edge where the land falls away, with no cliff to hold back.
        let off_floor = |out: f64| {
            let at = ahead(area.at, outward, out, 0.0);
            let raised = crate::rocks::raised(kit, carved, at);
            (raised.abs() >= FOOT && carved.floor_distance(at[0], at[1]) > 0.0).then_some(raised)
        };
        let mut found = None;
        while out < (edge + 2.0) * 1.35 {
            found = off_floor(out);
            if found.is_some() {
                break;
            }
            out += 0.5;
        }
        if !found.is_some_and(|raised| raised >= FOOT) {
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
        let base = carved_at(kit, carved, at) - 1.0;
        kit.solid(
            Solid::upright(Shape::Block, [at[0], at[1], base], [1.4, 7.2, 4.2], Material::Stone)
                .turned(turn_along(tangent)),
        );
    }
}
