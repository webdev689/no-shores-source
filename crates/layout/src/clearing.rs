//! Keeping a layout's ways and what stands clear of each other: a way stops at the set piece at an area's middle and
//! bends round a room's corner, and what a way runs over is left out.

use crate::field::{CELL_M, Field, Water, distance};
use crate::paths::{KEEP_OFF_M, Path, Tier};
use crate::seat::Seating;
use std::f64::consts::TAU;

/// How far apart the points of a footpath round a piece lie, and the furthest past its ways' ends it is laid, metres.
const ROUND_STEP_M: f64 = 6.0;
const ROUND_WIDEST_M: f64 = 12.0;

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

/// The footpaths round what stands at a place's middle that join the ways stopped at its rim (`end_at_rim`): from each
/// way's end round to the next by bearing, the widest gap between them left open, so the ways meet as a body walks
/// round the piece. Each is laid as close round as it keeps on walkable land clear of everything standing, up to
/// ROUND_WIDEST_M further out; one that never does is not laid.
pub(crate) fn round_rim(paths: &[Path], at: [f64; 2], rim: f64, field: &Field, seating: &Seating) -> Vec<Path> {
    let reach = rim + Tier::Track.width() / 2.0 + 1.2 + CELL_M;
    let mut ends: Vec<[f64; 2]> = paths
        .iter()
        .flat_map(|path| path.points.first().into_iter().chain(path.points.last()))
        .copied()
        .filter(|&end| distance(end, at) > rim && distance(end, at) <= reach)
        .collect();
    let bearing = |point: [f64; 2]| libm::atan2(point[1] - at[1], point[0] - at[0]);
    ends.sort_by(|one, two| bearing(*one).total_cmp(&bearing(*two)));
    ends.dedup_by(|one, two| distance(*one, *two) < 1.0);
    if rim <= 0.0 || ends.len() < 2 {
        return Vec::new();
    }
    let gap = |nth: usize| (bearing(ends[(nth + 1) % ends.len()]) - bearing(ends[nth])).rem_euclid(TAU);
    let widest = (0..ends.len()).max_by(|&one, &two| gap(one).total_cmp(&gap(two))).unwrap_or(0);
    let nearest = ends.iter().map(|&end| distance(end, at)).fold(0.0, f64::max);
    let standing = standing_prints(seating);
    let clear = |point: [f64; 2]| open_ground(field, &standing, point, Tier::Footpath.width() / 2.0 + KEEP_OFF_M);
    let round = |from: [f64; 2], to: [f64; 2], turn: f64, out: f64| -> Vec<[f64; 2]> {
        let steps = ((turn * out / ROUND_STEP_M).ceil() as usize).max(1);
        let arc = (0..=steps).map(|step| {
            let angle = bearing(from) + turn * step as f64 / steps as f64;
            [at[0] + libm::cos(angle) * out, at[1] + libm::sin(angle) * out]
        });
        std::iter::once(from).chain(arc).chain(std::iter::once(to)).collect()
    };
    // The arc and the far half of each step out to it from a way's end; the end itself is its way's.
    let laid = |points: &[[f64; 2]]| {
        let last = points.len() - 1;
        let half = |one: [f64; 2], two: [f64; 2]| [(one[0] + two[0]) / 2.0, (one[1] + two[1]) / 2.0];
        let steps_out = [half(points[0], points[1]), half(points[last], points[last - 1])];
        steps_out.into_iter().all(clear)
            && points[1..last].windows(2).all(|pair| {
                let pieces = (distance(pair[0], pair[1]) / (ROUND_STEP_M / 2.0)).ceil().max(1.0) as usize;
                (0..=pieces).all(|piece| {
                    let share = piece as f64 / pieces as f64;
                    clear([
                        pair[0][0] + (pair[1][0] - pair[0][0]) * share,
                        pair[0][1] + (pair[1][1] - pair[0][1]) * share,
                    ])
                })
            })
    };
    let joining = (0..ends.len()).filter(|&nth| nth != widest).filter_map(|nth| {
        let (from, to) = (ends[nth], ends[(nth + 1) % ends.len()]);
        let outs = (0..=ROUND_WIDEST_M as usize / 2).map(|wider| nearest + 2.0 * wider as f64);
        let points = outs.map(|out| round(from, to, gap(nth), out)).find(|points| laid(points))?;
        Some(Path { tier: Tier::Footpath, points, crossings: Vec::new(), heights: Vec::new() })
    });
    joining.collect()
}

/// Lays the footpaths round each piece of `rims` (its middle and its rim) after the ways, and how many ways came first.
pub(crate) fn join_round(paths: &mut Vec<Path>, rims: &[([f64; 2], f64)], field: &Field, seating: &Seating) -> usize {
    let ways = paths.len();
    let round: Vec<Path> = rims.iter().flat_map(|&(at, rim)| round_rim(paths, at, rim, field, seating)).collect();
    paths.extend(round);
    ways
}

/// The prints a way round a piece keeps off: every building, and every prop and solid too large for `keep_off_paths`
/// to clear off a way (the middle's own piece among them); what is small is cleared from it as from any way.
fn standing_prints(seating: &Seating) -> Vec<[f64; 4]> {
    let area = |[west, north, east, south]: [f64; 4]| (east - west) * (south - north);
    let large_props = seating.props.iter().map(|prop| prop.footprint).filter(|&print| area(print) > LARGE_PROP_M2);
    let buildings = seating.buildings.iter().map(|building| building.footprint);
    let solids = seating
        .solids
        .iter()
        .map(|solid| solid.bounds())
        .filter(|&[west, north, east, south, _, _]| (east - west).max(south - north) > SMALL_SOLID_M);
    let solids = solids.map(|[west, north, east, south, _, _]| [west, north, east, south]);
    buildings.chain(large_props).chain(solids).collect()
}

/// The ground a prop covers past which a way does not run through it, square metres (`blocked_by` in lib.rs).
const LARGE_PROP_M2: f64 = 6.0;

/// Whether a body may walk at `at`: dry land a way crosses (`paths::find`'s ground), `keep` metres off every print.
fn open_ground(field: &Field, prints: &[[f64; 4]], at: [f64; 2], keep: f64) -> bool {
    let Some((column, row)) = field.cell_of(at[0], at[1]) else { return false };
    let cell = field.index(column, row);
    let land = field.water[cell] == Water::Dry && field.slope[cell] <= 1.2 && field.walkable(cell);
    let off = |&[west, north, east, south]: &[f64; 4]| {
        at[0] < west - keep || at[0] > east + keep || at[1] < north - keep || at[1] > south + keep
    };
    land && prints.iter().all(off)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn way(points: Vec<[f64; 2]>) -> Path {
        Path { tier: Tier::Track, points, crossings: Vec::new(), heights: Vec::new() }
    }

    #[test]
    fn the_ways_stopped_at_a_pieces_rim_are_joined_round_it_and_never_through_it() {
        // Three ways come to a tower at the middle from the east, the north and the west, each stopped at its rim.
        let mut ways = vec![
            way(vec![[100.0, 0.0], [50.0, 0.0], [0.0, 0.0]]),
            way(vec![[0.0, -100.0], [0.0, -50.0], [0.0, 0.0]]),
            way(vec![[-100.0, 0.0], [-50.0, 0.0], [0.0, 0.0]]),
        ];
        end_at_rim(&mut ways, [0.0, 0.0], 8.0);
        let field = Field::level(-160.0, -160.0, 40, 40);
        let round = round_rim(&ways, [0.0, 0.0], 8.0, &field, &Seating::default());
        assert_eq!(round.len(), 2, "three ends joined by two, the widest gap (the south) left open");
        for path in &round {
            assert!(
                path.points.iter().all(|&point| distance(point, [0.0, 0.0]) > 8.0),
                "round the rim, not through it"
            );
            let ends = [path.points[0], path.points[path.points.len() - 1]];
            for end in ends {
                assert!(ways.iter().any(|way| way.points.last() == Some(&end)), "each joins a way's end: {end:?}");
            }
            assert!(path.points.iter().all(|point| point[1] <= 1e-9), "by the north, the way round the closed side");
        }
        assert!(
            round_rim(&ways[..1], [0.0, 0.0], 8.0, &field, &Seating::default()).is_empty(),
            "one alone joins nothing"
        );
        let hut = |footprint: [f64; 4]| crate::seat::Seated {
            model: 0,
            at: [0.0, 0.0, 0.0],
            yaw: 0.0,
            building: false,
            footprint,
            purpose: 0,
            open: false,
            grounded: false,
        };
        // A hut between the north and the east ways: the way round goes out past it.
        let mut seating = Seating { props: vec![hut([6.0, -12.0, 10.0, -6.0])], ..Seating::default() };
        let round = round_rim(&ways, [0.0, 0.0], 8.0, &field, &seating);
        let past =
            |path: &Path| path.points[1..path.points.len() - 1].iter().all(|&point| distance(point, [0.0; 2]) > 18.0);
        assert_eq!(round.len(), 2, "both joins still laid: {round:?}");
        assert!(round.iter().any(past), "the one by the hut runs out past it: {round:?}");
        seating.props.push(hut([-30.0, -30.0, 30.0, -8.6]));
        let round = round_rim(&ways, [0.0, 0.0], 8.0, &field, &seating);
        assert!(round.iter().all(|path| path.points.iter().all(|point| point[1] > -8.0)), "none north: {round:?}");
    }
}
