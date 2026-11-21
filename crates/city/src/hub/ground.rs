//! The ground the hub's courts are laid with, after the owner's "the pathway needs to be a different texture from the
//! ground" and "pathways are jagged due to tiles. These need to be smooth with proper rounded Ness. No hard edges": its
//! ways as flagstone walks over the cobbles, every corner where they meet or turn curved, and the gardens' lawn and the
//! smiths' yard's earth laid under them, under the small pieces and round the rest.

use super::Laid;
use super::dress::{OVERHEAD_M, Rect, corners, inside, rect_gap};
use crate::courtyard::Frame;
use crate::landmarks::turn_toward;
use crate::modules::all;
use crate::solids::{Material, Shape, Solid};

/// How wide a walk is laid and how high its flags stand over the cobbles, metres.
const WALK_WIDE_M: f64 = 3.2;
const WALK_HIGH_M: f64 = 0.06;
/// The longest piece a walk's strip is laid in, metres: the city is drawn a few centimetres nearer than it stands,
/// which bends a long face, and a short one keeps over the lawn laid under it.
const WALK_PIECE_M: f64 = 3.0;
/// The sides of the round at a walk's end, which rounds its outer corners where it turns; the radius of the curve each
/// inner corner where walks meet is laid round to, and how many straight pieces lay it.
const ROUND_SIDES: u32 = 40;
const FILLET_M: f64 = 2.0;
const FILLET_PIECES: usize = 8;

/// Lays the platform's ways as walks of dressed flagstones over its cobbles and lawns: a strip along each link in short
/// pieces, a round the walk's width at each end, and each inner corner where walks meet filled round, so every corner
/// curves.
pub(crate) fn walks(frame: &Frame, laid: &mut Laid) {
    let mut ends: Vec<([f64; 2], Vec<[f64; 2]>)> = Vec::new();
    for [from, to] in super::folk::platform_links() {
        let [one, two] = [frame.at(from[0], from[1]), frame.at(to[0], to[1])];
        let along = [two[0] - one[0], two[1] - one[1]];
        let long = libm::hypot(along[0], along[1]);
        if long < 1e-6 {
            continue;
        }
        let pieces = (long / WALK_PIECE_M).ceil();
        for piece in 0..pieces as usize {
            let share = (piece as f64 + 0.5) / pieces;
            let middle = [one[0] + along[0] * share, one[1] + along[1] * share, frame.level];
            let strip = Solid::upright(Shape::Block, middle, [WALK_WIDE_M, long / pieces, WALK_HIGH_M], Material::Path);
            laid.solids.push(strip.turned(turn_toward(along)));
        }
        let away = [along[0] / long, along[1] / long];
        for (end, leaving) in [(one, away), (two, [-away[0], -away[1]])] {
            match ends.iter_mut().find(|(known, _)| libm::hypot(known[0] - end[0], known[1] - end[1]) < 0.01) {
                Some((_, ways)) => ways.push(leaving),
                None => ends.push((end, vec![leaving])),
            }
        }
    }
    for (joint, mut ways) in ends {
        let round = Shape::Column { sides: ROUND_SIDES, top: 1.0 };
        let at = [joint[0], joint[1], frame.level];
        laid.solids.push(Solid::upright(round, at, [WALK_WIDE_M, WALK_WIDE_M, WALK_HIGH_M], Material::Path));
        ways.sort_by(|one, two| libm::atan2(one[1], one[0]).total_cmp(&libm::atan2(two[1], two[0])));
        for (k, &one) in ways.iter().enumerate() {
            let two = ways[(k + 1) % ways.len()];
            for ([middle_x, middle_y], size, along) in fillet(joint, one, two) {
                let piece = Solid::upright(Shape::Block, [middle_x, middle_y, frame.level], size, Material::Path);
                laid.solids.push(piece.turned(turn_toward(along)));
            }
        }
    }
}

/// The straight pieces that fill the inner corner between two walks leaving a joint, `one` and then `two` turning
/// counterclockwise, round to `FILLET_M`: each a block from a tangent to the curve to the corner, its middle, its size
/// (across, along, high) and the way it runs. None where the walks run on straight or turn away from each other.
fn fillet(joint: [f64; 2], one: [f64; 2], two: [f64; 2]) -> Vec<([f64; 2], [f64; 3], [f64; 2])> {
    let cross = one[0] * two[1] - one[1] * two[0];
    let angle = libm::atan2(cross, one[0] * two[0] + one[1] * two[1]);
    if !(0.6..3.0).contains(&angle) {
        return Vec::new();
    }
    let half = WALK_WIDE_M / 2.0;
    let sum = [one[0] + two[0], one[1] + two[1]];
    let length = libm::hypot(sum[0], sum[1]);
    let bisector = [sum[0] / length, sum[1] / length];
    let sine = libm::sin(angle / 2.0);
    let corner = [joint[0] + bisector[0] * half / sine, joint[1] + bisector[1] * half / sine];
    let centre = [joint[0] + bisector[0] * (half + FILLET_M) / sine, joint[1] + bisector[1] * (half + FILLET_M) / sine];
    // Each walk's inner edge, a point on it and its way; and the normal of each pointing into the corner's ground.
    let [into_one, into_two] = [[-one[1], one[0]], [two[1], -two[0]]];
    let edges = [
        ([joint[0] + into_one[0] * half, joint[1] + into_one[1] * half], one),
        ([joint[0] + into_two[0] * half, joint[1] + into_two[1] * half], two),
    ];
    // The curve faces the joint, from the tangent on the first walk's edge round to the second's.
    let [from, to] = [libm::atan2(-into_one[1], -into_one[0]), libm::atan2(-into_two[1], -into_two[0])];
    let sweep = (to - from + std::f64::consts::TAU) % std::f64::consts::TAU;
    let sweep = if sweep > std::f64::consts::PI { sweep - std::f64::consts::TAU } else { sweep };
    (0..FILLET_PIECES)
        .filter_map(|piece| {
            let turn = from + sweep * (piece as f64 + 0.5) / FILLET_PIECES as f64;
            let out = [libm::cos(turn), libm::sin(turn)];
            let touch = [centre[0] + out[0] * FILLET_M, centre[1] + out[1] * FILLET_M];
            let tangent = [-out[1], out[0]];
            // Where the tangent meets each walk's edge.
            let [first, second] = edges.map(|(point, way)| {
                let denominator = tangent[0] * way[1] - tangent[1] * way[0];
                let step = ((point[0] - touch[0]) * way[1] - (point[1] - touch[1]) * way[0]) / denominator;
                [touch[0] + tangent[0] * step, touch[1] + tangent[1] * step]
            });
            let depth = (corner[0] - touch[0]) * out[0] + (corner[1] - touch[1]) * out[1];
            let long = libm::hypot(second[0] - first[0], second[1] - first[1]);
            (depth > 0.01 && depth < WALK_WIDE_M && long.is_finite()).then(|| {
                let middle = [
                    (first[0] + second[0]) / 2.0 + out[0] * depth / 2.0,
                    (first[1] + second[1]) / 2.0 + out[1] * depth / 2.0,
                ];
                (middle, [depth, long, WALK_HIGH_M], tangent)
            })
        })
        .collect()
}

/// The courts whose open ground is laid over: the gardens as lawn, the smiths' yard as trodden earth, each its ground
/// (metres seaward from and to, and across from and to).
const GROUNDS: [([f64; 2], [f64; 2], Material); 3] = [
    ([-50.0, 44.0], [-50.0, 50.0], Material::Lawn),
    ([-52.0, 46.0], [-128.0, -66.0], Material::Lawn),
    ([-52.0, 46.0], [66.0, 128.0], Material::Earth),
];
/// The ground's cells' side, how far a cell keeps from what stands, and how thick it is laid: under the walks, whose
/// own edges bound it, so it meets them straight and round.
const CELL_M: f64 = 1.0;
const OFF_STANDING_M: f64 = 0.3;
/// The widest piece the ground runs on under, metres: a lamp, a bench, a planter, the well; a stall, a range or a yard
/// keeps its own floor.
const SMALL_PIECE_M: f64 = 4.0;
/// The round pieces the ground runs on under, each on a round of flagstones this far past its edge, metres.
const ON_ROUNDS: [&str; 2] = ["fountain", "bandstand"];
const ROUND_PAST_M: f64 = 1.2;
const GROUND_HIGH_M: f64 = 0.03;

/// Lays each court's open ground, under its walks and its small pieces, and its round ones each on a round of
/// flagstones: every cell clear of what else stands (a stall, a range, a plinth, a band of inlaid stone) and of the
/// ring's edge, the cells of a row run together into one length.
pub(crate) fn grounds(frame: &Frame, laid: &mut Laid, ring: &[[f64; 2]]) {
    let modules = all();
    let ground_runs_under = |solid: &Solid| match solid.shape {
        Shape::Module { module, .. } => modules.get(module as usize).is_some_and(|found| {
            found.size[0].max(found.size[1]) <= SMALL_PIECE_M || ON_ROUNDS.contains(&found.name.as_str())
        }),
        _ => matches!(solid.material, Material::Paving | Material::Path | Material::Lawn | Material::Earth),
    };
    let rounds: Vec<Solid> = laid
        .solids
        .iter()
        .filter_map(|solid| {
            match solid.shape {
                Shape::Module { module, group: 0 } => {
                    modules.get(module as usize).filter(|found| ON_ROUNDS.contains(&found.name.as_str()))
                }
                _ => None,
            }
            .map(|found| {
                let wide = found.size[0].max(found.size[1]) + 2.0 * ROUND_PAST_M;
                let round = Shape::Column { sides: ROUND_SIDES, top: 1.0 };
                Solid::upright(
                    round,
                    [solid.at[0], solid.at[1], frame.level],
                    [wide, wide, WALK_HIGH_M],
                    Material::Path,
                )
            })
        })
        .collect();
    laid.solids.extend(rounds);
    let standing: Vec<Rect> = laid
        .solids
        .iter()
        .filter(|solid| !ground_runs_under(solid))
        .map(crate::solids::Solid::bounds)
        .filter(|&[_, _, _, _, bottom, _]| bottom < frame.level + OVERHEAD_M)
        .map(|[west, north, east, south, _, _]| [west, north, east, south])
        .collect();
    let mut runs = Vec::new();
    for (toward_span, across_span, material) in GROUNDS {
        let rows = ((toward_span[1] - toward_span[0]) / CELL_M).floor() as usize;
        let columns = ((across_span[1] - across_span[0]) / CELL_M).floor() as usize;
        for row in 0..rows {
            let toward = toward_span[0] + (row as f64 + 0.5) * CELL_M;
            let mut run: Option<(f64, f64)> = None;
            for column in 0..=columns {
                let across = across_span[0] + (column as f64 + 0.5) * CELL_M;
                let middle = frame.at(toward, across);
                let half = CELL_M / 2.0;
                let rect = [middle[0] - half, middle[1] - half, middle[0] + half, middle[1] + half];
                let kept = column < columns
                    && corners(rect).iter().all(|&corner| inside(ring, corner))
                    && standing.iter().all(|&other| rect_gap(rect, other) >= OFF_STANDING_M);
                run = match (run, kept) {
                    (None, true) => Some((across, across)),
                    (Some((first, _)), true) => Some((first, across)),
                    (Some((first, last)), false) => {
                        runs.push((toward, first, last, material));
                        None
                    }
                    (None, false) => None,
                };
            }
        }
    }
    for (toward, first, last, material) in runs {
        let wide = last - first + CELL_M;
        laid.solids.push(frame.block(toward, (first + last) / 2.0, 0.0, [wide, CELL_M, GROUND_HIGH_M], material));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Whether a fillet's piece covers a point.
    fn covers(([x, y], [across, long, _], along): ([f64; 2], [f64; 3], [f64; 2]), point: [f64; 2]) -> bool {
        let unit = libm::hypot(along[0], along[1]);
        let [ux, uy] = [along[0] / unit, along[1] / unit];
        let [dx, dy] = [point[0] - x, point[1] - y];
        (dx * ux + dy * uy).abs() <= long / 2.0 + 1e-9 && (dx * uy - dy * ux).abs() <= across / 2.0 + 1e-9
    }

    #[test]
    fn an_inner_corner_where_walks_meet_is_filled_round_and_no_further() {
        // Two walks leaving a joint at right angles: the corner of their inner edges and the curve's middle.
        let pieces = fillet([0.0, 0.0], [1.0, 0.0], [0.0, 1.0]);
        assert_eq!(pieces.len(), FILLET_PIECES);
        let half = WALK_WIDE_M / 2.0;
        let diagonal = std::f64::consts::FRAC_1_SQRT_2;
        let centre = (half + FILLET_M) * std::f64::consts::SQRT_2;
        let on_curve = centre - FILLET_M;
        let at = |from_joint: f64| [from_joint * diagonal, from_joint * diagonal];
        let covered = |point| pieces.iter().any(|&piece| covers(piece, point));
        assert!(
            covered(at(half * std::f64::consts::SQRT_2 + 0.05)),
            "just past the edges' corner, the lawn's old point"
        );
        assert!(covered(at(on_curve - 0.05)), "just short of the curve");
        assert!(!covered(at(on_curve + 0.05)), "just past the curve the ground stays");
        assert!(
            !covered([half + 0.05, 4.0]) && !covered([4.0, half + 0.05]),
            "along each walk's edge, beyond the curve"
        );
        // Walks running straight on, or turning away from each other, leave no inner corner to fill.
        assert!(fillet([0.0, 0.0], [1.0, 0.0], [-1.0, 0.0]).is_empty());
        assert!(fillet([0.0, 0.0], [0.0, 1.0], [1.0, 0.0]).is_empty());
    }
}
