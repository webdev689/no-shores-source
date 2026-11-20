//! Keeping a layout's ways and what stands clear of each other: a way stops at the set piece at an area's middle and
//! bends round a room's corner, and what a way runs over is left out.

use crate::field::{CELL_M, distance};
use crate::paths::Path;
use crate::seat::Seating;

/// How far from a point the pieces standing over it reach: a set piece at an area's middle, its tower or its hull.
pub(crate) fn rim_of(seating: &Seating, at: [f64; 2]) -> f64 {
    let solids = seating.solids.iter().map(|solid| {
        let [west, north, east, south, _, _] = solid.bounds();
        [west, north, east, south]
    });
    let props = seating.props.iter().map(|prop| prop.footprint);
    solids
        .chain(props)
        .filter(|&[west, north, east, south]| at[0] >= west && at[0] <= east && at[1] >= north && at[1] <= south)
        .flat_map(|[west, north, east, south]| [[west, north], [east, north], [east, south], [west, south]])
        .map(|corner| distance(corner, at))
        .fold(0.0, f64::max)
}

/// Ends each way that ends at a point `rim` metres short of it, past what stands there by the room the way keeps
/// from what stands (`keep_off_paths`), so the way stops at the piece and the piece stays; a way shorter than that
/// is left whole.
pub(crate) fn end_at_rim(paths: &mut [Path], at: [f64; 2], rim: f64) {
    if rim <= 0.0 {
        return;
    }
    for path in paths {
        let keep = rim + path.tier.width() / 2.0 + 1.2;
        for reversed in [false, true] {
            if reversed {
                path.points.reverse();
            }
            let ends_here = path.points.last().is_some_and(|&end| distance(end, at) < CELL_M);
            let inside = path.points.iter().rposition(|&point| distance(point, at) >= keep);
            if let (true, Some(last)) = (ends_here, inside)
                && last > 0
            {
                // The way's last point outside the rim, then on along its next segment to the rim.
                let (out, next) = (path.points[last], path.points[last + 1]);
                let along = |share: f64| [out[0] + (next[0] - out[0]) * share, out[1] + (next[1] - out[1]) * share];
                let step = 0.25 / distance(out, next).max(0.25);
                let mut share = 0.0;
                while share + step <= 1.0 && distance(along(share + step), at) >= keep {
                    share += step;
                }
                path.points.truncate(last + 1);
                if share > 0.0 {
                    path.points.push(along(share));
                }
            }
            if reversed {
                path.points.reverse();
            }
        }
    }
}

/// Bends each way round the buildings walked into where it would graze one, as it may near its end's yard: where a
/// segment passes within its half-width of one, a point pushed out to that width is put in at its nearest.
pub(crate) fn round_rooms(paths: &mut [Path], seating: &Seating) {
    let prints: Vec<[f64; 4]> =
        seating.buildings.iter().filter(|building| building.open).map(|building| building.footprint).collect();
    let off_print = |point: [f64; 2], [west, north, east, south]: [f64; 4]| {
        let nearest = [point[0].clamp(west, east), point[1].clamp(north, south)];
        (distance(point, nearest), nearest)
    };
    for path in paths {
        let reach = path.tier.width() / 2.0 + 0.3;
        // Where a segment's point, in tenths along it, comes within reach of a room: that point pushed out past it.
        let grazed = |from: [f64; 2], to: [f64; 2]| {
            (1..10).map(|tenth| f64::from(tenth) / 10.0).find_map(|share| {
                let point = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
                prints.iter().find_map(|&print| {
                    let (off, nearest) = off_print(point, print);
                    (off > 1e-6 && off < reach).then(|| {
                        let push = (reach + 0.3) / off;
                        [nearest[0] + (point[0] - nearest[0]) * push, nearest[1] + (point[1] - nearest[1]) * push]
                    })
                })
            })
        };
        // A point pushed off one room into another's reach would only zig-zag between them: the way is left as it
        // runs there. A segment bends three times at the most.
        let fits = |point: [f64; 2]| prints.iter().all(|&print| off_print(point, print).0 >= reach);
        let mut bent = Vec::with_capacity(path.points.len());
        bent.extend(path.points.first().copied());
        for pair in path.points.windows(2) {
            let mut from = pair[0];
            for _ in 0..3 {
                match grazed(from, pair[1]) {
                    Some(point) if fits(point) => {
                        bent.push(point);
                        from = point;
                    }
                    _ => break,
                }
            }
            bent.push(pair[1]);
        }
        path.points = bent;
    }
}

/// Leaves out what a path runs over: a cart or a fence in the middle of a track, a lantern on its post.
pub(crate) fn keep_off_paths(seating: &mut Seating, paths: &[Path], height: &dyn Fn(f64, f64) -> f64) {
    let clear = |at: [f64; 2], spread: f64| {
        paths.iter().all(|path| {
            let reach = path.tier.width() / 2.0 + 0.6 + spread;
            path.points.windows(2).all(|pair| crate::paths::off_line(at, pair[0], pair[1]) > reach)
        })
    };
    let off_ways = |print: [f64; 4]| crate::paths::clear_of(print, paths);
    // A prop goes where any of its footprint reaches onto a way's width: a ship's hull as well as a lantern.
    seating.props.retain(|prop| off_ways(prop.footprint));
    // So does a building not walked into, as a yard's wall a way leaves its block through, with its pad and plinth.
    let gone: Vec<[f64; 4]> = seating
        .buildings
        .iter()
        .filter(|building| !building.open && !off_ways(building.footprint))
        .map(|building| building.footprint)
        .collect();
    seating.buildings.retain(|building| !gone.contains(&building.footprint));
    seating.pads.retain(|pad| !gone.contains(&pad.bounds));
    seating.solids.retain(|solid| {
        !gone.iter().any(|print| {
            solid.material == city::solids::Material::Stone
                && (solid.at[0] - (print[0] + print[2]) / 2.0).abs() < 1e-9
                && (solid.at[1] - (print[1] + print[3]) / 2.0).abs() < 1e-9
                && (solid.size[0] - (print[2] - print[0] + 0.3)).abs() < 1e-9
        })
    });
    // The set pieces' small solids standing on the ground in a way's path (a lantern, a fire's stones), and what stands
    // on them, go too: a deck, a pile in the water or a work's great stones keep their places.
    let place =
        |solid: &city::solids::Solid| ((solid.at[0] * 100.0).round() as i64, (solid.at[1] * 100.0).round() as i64);
    let in_the_way: std::collections::BTreeSet<(i64, i64)> = seating
        .solids
        .iter()
        .filter(|solid| {
            let small = solid.size[0].max(solid.size[1]) <= SMALL_SOLID_M;
            let ground_at = height(solid.at[0], solid.at[1]);
            let standing = solid.at[2] >= ground_at - 1.2 && solid.at[2] <= ground_at + 0.05;
            small && standing && !clear([solid.at[0], solid.at[1]], solid.size[0].max(solid.size[1]) / 2.0)
        })
        .map(place)
        .collect();
    seating.solids.retain(|solid| !in_the_way.contains(&place(solid)));
}

/// The widest a set piece's solid may be and still be cleared out of a way, metres: a post, a lantern, a stone.
const SMALL_SOLID_M: f64 = 2.5;
