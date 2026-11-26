//! The ground the hub's courts are laid with: its ways as flagstone walks over the cobbles, apart from the ground beside
//! them, every corner where they meet, cross or turn curved so none is sharp; and the gardens' lawn and the smiths'
//! yard's earth laid under them, so a walk's own edge bounds the ground, and under the small pieces and round the rest.

use super::Laid;
use super::dress::{OVERHEAD_M, Rect, corners, inside, rect_gap};
use crate::courtyard::Frame;
use crate::landmarks::turn_toward;
use crate::modules::all;
use crate::social::Grain;
use crate::solids::{Material, Shape, Solid};

/// How wide a walk is laid and how high its flags stand over the cobbles, metres.
const WALK_WIDE_M: f64 = 3.2;
const WALK_HIGH_M: f64 = 0.06;
/// A step in height between pieces of flagstones of a different grain, metres: a joint's round and fillets stand a step
/// over the flagstones of the world's grain (a round's border) and over every other joint's they reach, and each
/// walk's strips over every joint and over each other walk leaving the same joint. Each walk's flags run along it
/// (`walkGrain.ts`), so where two pieces of a different grain overlap, one lies over the other, never level with it.
const WALK_RISE_M: f64 = 0.002;
/// The longest piece a walk's strip is laid in, metres: the city is drawn a few centimetres nearer than it stands,
/// which bends a long face, and a short one keeps over the lawn laid under it.
const WALK_PIECE_M: f64 = 3.0;
/// The sides of the round at a walk's end, which rounds its outer corners where it turns; the radius of the curve each
/// inner corner where walks meet is laid round to, and how many straight pieces lay it.
const ROUND_SIDES: u32 = 40;
const FILLET_M: f64 = 2.0;
const FILLET_PIECES: usize = 8;

/// A walk leaving a joint: its way out, the way its strips run and the level they stand at.
type Way = ([f64; 2], [f64; 2], usize);
/// A joint: where it is, the way of the walk laid on top there, and its round and fillets.
type Joint = ([f64; 2], [f64; 2], Vec<Solid>);
/// A walk running straight through a joint under another standing over it is capped there: the cap's length along
/// it, and the level of the strips it must stand over.
type Cap = Option<(f64, usize)>;

/// Lays the platform's ways as walks of dressed flagstones over its cobbles and lawns: a strip along each link in short
/// pieces, a round the walk's width at each end, and each inner corner where walks meet filled round, so every corner
/// curves.
pub(crate) fn walks(frame: &Frame, laid: &mut Laid) {
    // Each link: its ends and the level its strips stand at among the walks leaving its joints. Each joint, and each
    // walk leaving it: its way out, the way its strips run and their level.
    let mut walked: Vec<([f64; 2], [f64; 2], usize)> = Vec::new();
    let mut ends: Vec<([f64; 2], Vec<Way>)> = Vec::new();
    let links: Vec<[[f64; 2]; 2]> = super::folk::platform_links()
        .into_iter()
        .map(|[from, to]| [frame.at(from[0], from[1]), frame.at(to[0], to[1])])
        .collect();
    let at_joint = |joint: [f64; 2], point: [f64; 2]| libm::hypot(joint[0] - point[0], joint[1] - point[1]) < 0.01;
    for [one, two] in joined(&links) {
        let along = [two[0] - one[0], two[1] - one[1]];
        let long = libm::hypot(along[0], along[1]);
        if long < 1e-6 {
            continue;
        }
        let taken = |level: &usize| {
            walked.iter().any(|&(from, to, other)| {
                other == *level && [from, to].iter().any(|&end| at_joint(end, one) || at_joint(end, two))
            })
        };
        let level = (0..).find(|level| !taken(level)).unwrap_or(0);
        walked.push((one, two, level));
        let away = [along[0] / long, along[1] / long];
        for (end, leaving) in [(one, away), (two, [-away[0], -away[1]])] {
            match ends.iter_mut().find(|(known, _)| at_joint(*known, end)) {
                Some((_, ways)) => ways.push((leaving, along, level)),
                None => ends.push((end, vec![(leaving, along, level)])),
            }
        }
    }
    // The round and the corners at a joint run in the grain of the walk laid on top there, so it runs on unbroken and
    // the others meet it at its edge; each joint's a step over every earlier one's its pieces reach.
    let (joints, caps): (Vec<Joint>, Vec<Cap>) = ends
        .into_iter()
        .map(|(joint, ways)| {
            let (top, cap) = top_of(&ways);
            ((joint, top, joint_pieces(frame, joint, ways)), cap)
        })
        .unzip();
    let steps = joint_steps(&joints);
    let over = steps.iter().max().map_or(1, |most| most + 2);
    for (one, two, level) in walked {
        let along = [two[0] - one[0], two[1] - one[1]];
        let long = libm::hypot(along[0], along[1]);
        let high = WALK_HIGH_M + WALK_RISE_M * (over + level) as f64;
        let pieces = (long / WALK_PIECE_M).ceil();
        for piece in 0..pieces as usize {
            let share = (piece as f64 + 0.5) / pieces;
            let middle = [one[0] + along[0] * share, one[1] + along[1] * share, frame.level];
            let strip = Solid::upright(Shape::Block, middle, [WALK_WIDE_M, long / pieces, high], Material::Path);
            laid.grains.push(grain(laid.solids.len(), along, one));
            laid.solids.push(strip.turned(turn_toward(along)));
        }
    }
    for (((joint, top, pieces), step), cap) in joints.into_iter().zip(steps).zip(caps) {
        for mut piece in pieces {
            piece.size[2] = WALK_HIGH_M + WALK_RISE_M * (1 + step) as f64;
            laid.grains.push(grain(laid.solids.len(), top, joint));
            laid.solids.push(piece);
        }
        if let Some((long, level)) = cap {
            let high = WALK_HIGH_M + WALK_RISE_M * (over + level + 1) as f64;
            let piece = Solid::upright(
                Shape::Block,
                [joint[0], joint[1], frame.level],
                [WALK_WIDE_M, long, high],
                Material::Path,
            );
            laid.grains.push(grain(laid.solids.len(), top, joint));
            laid.solids.push(piece.turned(turn_toward(top)));
        }
    }
}

/// The way the walk on top at a joint runs, and its cap: a walk running straight through it (of two, the one standing
/// higher), capped where another walk stands over it, as long as that walk's strip crosses its width; else the walk
/// standing highest, needing none.
fn top_of(ways: &[Way]) -> ([f64; 2], Cap) {
    let pairs = ways.iter().enumerate().flat_map(|(k, one)| ways[k + 1..].iter().map(move |two| (one, two)));
    let straight = pairs
        .filter(|(one, two)| one.0[0] * two.0[0] + one.0[1] * two.0[1] < -0.99999)
        .max_by_key(|(one, two)| one.2.min(two.2));
    let Some((one, two)) = straight else {
        return (ways.iter().max_by_key(|way| way.2).map_or([0.0, 1.0], |way| way.1), None);
    };
    let half = WALK_WIDE_M / 2.0;
    let over: Vec<&Way> =
        ways.iter().filter(|way| way.2 > one.2.min(two.2) && way.2 != one.2 && way.2 != two.2).collect();
    let reach = |way: &&Way| {
        let sine = (one.0[0] * way.0[1] - one.0[1] * way.0[0]).abs().max(0.2);
        let cosine = (one.0[0] * way.0[0] + one.0[1] * way.0[1]).abs();
        half * (cosine + 1.0) / sine
    };
    let long = over.iter().map(reach).fold(0.0, f64::max) * 2.0;
    let level = over.iter().map(|way| way.2).max();
    (one.1, level.map(|level| (long.min(4.0 * WALK_WIDE_M), level)))
}

/// A joint's round and the fillets of its inner corners, `ways` the ways the walks leave it.
fn joint_pieces(frame: &Frame, joint: [f64; 2], mut ways: Vec<Way>) -> Vec<Solid> {
    let round = Shape::Column { sides: ROUND_SIDES, top: 1.0 };
    let at = [joint[0], joint[1], frame.level];
    let mut pieces = vec![Solid::upright(round, at, [WALK_WIDE_M, WALK_WIDE_M, WALK_HIGH_M], Material::Path)];
    ways.sort_by(|one, two| libm::atan2(one.0[1], one.0[0]).total_cmp(&libm::atan2(two.0[1], two.0[0])));
    for k in 0..ways.len() {
        let [one, two] = [ways[k].0, ways[(k + 1) % ways.len()].0];
        for ([middle_x, middle_y], size, along) in fillet(joint, one, two) {
            let piece = Solid::upright(Shape::Block, [middle_x, middle_y, frame.level], size, Material::Path);
            pieces.push(piece.turned(turn_toward(along)));
        }
    }
    pieces
}

/// Each joint's step up: the first not taken by an earlier joint whose pieces' reach meets its own.
fn joint_steps(joints: &[Joint]) -> Vec<usize> {
    let reach = |(joint, _, pieces): &Joint| {
        let far = |piece: &Solid| {
            libm::hypot(piece.at[0] - joint[0], piece.at[1] - joint[1])
                + libm::hypot(piece.size[0], piece.size[1]) / 2.0
        };
        pieces.iter().map(far).fold(0.0, f64::max)
    };
    let mut steps: Vec<usize> = Vec::with_capacity(joints.len());
    for (number, one) in joints.iter().enumerate() {
        let meets = |other: usize| {
            let two = &joints[other];
            libm::hypot(one.0[0] - two.0[0], one.0[1] - two.0[1]) < reach(one) + reach(two)
        };
        let taken = |step: &usize| (0..number).any(|other| steps[other] == *step && meets(other));
        steps.push((0..).find(|step| !taken(step)).unwrap_or(0));
    }
    steps
}

/// The grain of the solid laid next, `solid`, in a walk running `along` through `middle`: its turn within a half
/// turn, so a walk laid either way along one line runs one grain.
fn grain(solid: usize, along: [f64; 2], middle: [f64; 2]) -> Grain {
    Grain { solid, turn: turn_toward(along).rem_euclid(std::f64::consts::PI), middle, width: WALK_WIDE_M }
}

/// The links cut wherever another crosses or meets one partway, so every crossing is a joint the walks round.
fn joined(links: &[[[f64; 2]; 2]]) -> Vec<[[f64; 2]; 2]> {
    let mut cut = Vec::new();
    for (number, &[one, two]) in links.iter().enumerate() {
        let along = [two[0] - one[0], two[1] - one[1]];
        let mut shares = vec![0.0, 1.0];
        for (other, &[three, four]) in links.iter().enumerate() {
            let across = [four[0] - three[0], four[1] - three[1]];
            let denominator = along[0] * across[1] - along[1] * across[0];
            if other == number || denominator.abs() < 1e-9 {
                continue;
            }
            let gap = [three[0] - one[0], three[1] - one[1]];
            let share = (gap[0] * across[1] - gap[1] * across[0]) / denominator;
            let theirs = (gap[0] * along[1] - gap[1] * along[0]) / denominator;
            if share > 1e-6 && share < 1.0 - 1e-6 && (-1e-6..=1.0 + 1e-6).contains(&theirs) {
                shares.push(share);
            }
        }
        shares.sort_by(f64::total_cmp);
        shares.dedup_by(|one, two| (*one - *two).abs() < 1e-6);
        for pair in shares.windows(2) {
            let point = |share: f64| [one[0] + along[0] * share, one[1] + along[1] * share];
            cut.push([point(pair[0]), point(pair[1])]);
        }
    }
    cut
}

/// The straight pieces that fill the inner corner between two walks leaving a joint, `one` and then `two` turning
/// counterclockwise, round to `FILLET_M`: each a block from a tangent to the curve to the corner, its middle, its size
/// (across, along, high) and the way it runs. None where the walks run on straight or turn away from each other.
fn fillet(joint: [f64; 2], one: [f64; 2], two: [f64; 2]) -> Vec<([f64; 2], [f64; 3], [f64; 2])> {
    let cross = one[0] * two[1] - one[1] * two[0];
    let angle = libm::atan2(cross, one[0] * two[0] + one[1] * two[1]);
    if !(0.15..3.0).contains(&angle) {
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
            (depth > 0.01 && long.is_finite()).then(|| strips([first, second, corner], out, depth))
        })
        .flatten()
        .collect()
}

/// How thick a strip filling a corner is, metres: thin enough that its ends keep to the walks' edges.
const STRIP_M: f64 = 0.5;

/// The triangle from the line `first` to `second` to its apex `corner`, a `depth` toward `out`, as strips along that
/// line, each reaching across the whole of its slice of the triangle, in pieces no longer than WALK_PIECE_M: each its
/// middle, its size (across, along, high) and the way it runs.
fn strips([first, second, corner]: [[f64; 2]; 3], out: [f64; 2], depth: f64) -> Vec<([f64; 2], [f64; 3], [f64; 2])> {
    let line = [second[0] - first[0], second[1] - first[1]];
    let length = libm::hypot(line[0], line[1]);
    let along = [line[0] / length, line[1] / length];
    // How far along the line from `first` each side of the triangle is at a share of the way to its apex.
    let at = |from: [f64; 2], share: f64| {
        let point = [from[0] + (corner[0] - from[0]) * share, from[1] + (corner[1] - from[1]) * share];
        (point[0] - first[0]) * along[0] + (point[1] - first[1]) * along[1]
    };
    let count = (depth / STRIP_M).ceil();
    let mut laid = Vec::new();
    for strip in 0..count as usize {
        let [near, far] = [strip as f64 / count, (strip + 1) as f64 / count];
        let low = at(first, near).min(at(first, far));
        let high = at(second, near).max(at(second, far));
        let cuts = ((high - low) / WALK_PIECE_M).ceil().max(1.0);
        let down = (near + far) / 2.0 * depth;
        for cut in 0..cuts as usize {
            let on = low + (high - low) * (cut as f64 + 0.5) / cuts;
            let middle = [first[0] + along[0] * on + out[0] * down, first[1] + along[1] * on + out[1] * down];
            laid.push((middle, [depth / count, (high - low) / cuts, WALK_HIGH_M], along));
        }
    }
    laid
}

/// The border of flagstones round a flat round of `radius` at `middle`: short pieces round it, from just inside its edge
/// out past the ground's steps where it is kept off the round.
fn border(middle: [f64; 2], radius: f64, level: f64) -> Vec<Solid> {
    let outer = radius - 0.2 + BORDER_M;
    let count = (std::f64::consts::TAU * outer / BORDER_PIECE_M).ceil();
    (0..count as usize)
        .map(|piece| {
            let angle = std::f64::consts::TAU * piece as f64 / count;
            let (sine, cosine) = (libm::sin(angle), libm::cos(angle));
            let reach = radius - 0.2 + BORDER_M / 2.0;
            let at = [middle[0] + cosine * reach, middle[1] + sine * reach, level];
            let long = std::f64::consts::TAU * outer / count + 0.1;
            let piece = Solid::upright(Shape::Block, at, [BORDER_M, long, WALK_HIGH_M], Material::Path);
            piece.turned(turn_toward([-sine, cosine]))
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
/// The widest of the courts' fixed pieces the ground runs on under, metres: a lamp, a bench, a planter, the well; a
/// stall, a range or a yard keeps its own floor. The scenes' pieces are set after the ground, all of them on it.
const SMALL_PIECE_M: f64 = 4.0;
/// The round pieces the ground runs on under, each on a round of flagstones this far past its edge, metres.
const ON_ROUNDS: [&str; 2] = ["fountain", "bandstand"];
const ROUND_PAST_M: f64 = 1.2;
/// A round laid flat in the court (a band of stone round the obelisk) keeps the ground off by its own round, under a
/// border of flagstones this wide from just inside its edge, laid in pieces this long round it, metres.
const BORDER_M: f64 = 2.0;
const BORDER_PIECE_M: f64 = 2.0;
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
        // Round stone standing proud of the ground (a plinth, a brazier's foot) stands on it; a flat one is bordered.
        Shape::Column { .. } => true,
        _ => matches!(solid.material, Material::Paving | Material::Path | Material::Lawn | Material::Earth),
    };
    let flat_rounds: Vec<([f64; 2], f64)> = laid
        .solids
        .iter()
        .filter(|solid| matches!(solid.shape, Shape::Column { .. }) && solid.size[2] < GROUND_HIGH_M * 2.0)
        .map(|solid| ([solid.at[0], solid.at[1]], solid.size[0].max(solid.size[1]) / 2.0))
        .collect();
    for &(middle, radius) in &flat_rounds {
        laid.solids.extend(border(middle, radius, frame.level));
    }
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
                    && standing.iter().all(|&other| rect_gap(rect, other) >= OFF_STANDING_M)
                    && flat_rounds.iter().all(|&(round, radius)| {
                        let [x, y] = [round[0].clamp(rect[0], rect[2]), round[1].clamp(rect[1], rect[3])];
                        libm::hypot(x - round[0], y - round[1]) >= radius + OFF_STANDING_M
                    });
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
        assert!(pieces.len() >= FILLET_PIECES);
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

    #[test]
    fn a_narrow_corner_where_walks_meet_is_filled_round_too_and_never_past_their_far_edges() {
        let half = WALK_WIDE_M / 2.0;
        for degrees in [17.4_f64, 37.0, 60.0] {
            let angle = degrees.to_radians();
            let two = [libm::cos(angle), libm::sin(angle)];
            let pieces = fillet([0.0, 0.0], [1.0, 0.0], two);
            let bisector = [libm::cos(angle / 2.0), libm::sin(angle / 2.0)];
            let corner = half / libm::sin(angle / 2.0);
            let at = |from_joint: f64| [bisector[0] * from_joint, bisector[1] * from_joint];
            let covered = |point| pieces.iter().any(|&piece| covers(piece, point));
            assert!(covered(at(corner + 0.05)), "{degrees}°: just past the edges' corner");
            let on_curve = (half + FILLET_M) / libm::sin(angle / 2.0) - FILLET_M;
            assert!(!covered(at(on_curve + 0.05)), "{degrees}°: just past the curve the ground stays");
            // Nothing reaches the ground beyond either walk's far edge.
            for distance in 0..40 {
                let along = f64::from(distance);
                let beyond_two = [two[0] * along - two[1] * (half + 0.05), two[1] * along + two[0] * (half + 0.05)];
                assert!(!covered([along, -half - 0.05]) && !covered(beyond_two), "{degrees}°: past a far edge");
            }
            assert!(
                pieces
                    .iter()
                    .all(|&(_, [deep, long, _], _)| deep <= WALK_PIECE_M + 1e-9 && long <= WALK_PIECE_M + 1e-9)
            );
        }
    }

    #[test]
    fn links_that_cross_or_meet_partway_are_cut_there_into_a_joint() {
        let cross = [[[0.0, 0.0], [10.0, 0.0]], [[5.0, -5.0], [5.0, 5.0]]];
        let mut cut = joined(&cross);
        cut.sort_by(|one, two| one[0][0].total_cmp(&two[0][0]).then(one[0][1].total_cmp(&two[0][1])));
        assert_eq!(
            cut,
            [[[0.0, 0.0], [5.0, 0.0]], [[5.0, -5.0], [5.0, 0.0]], [[5.0, 0.0], [10.0, 0.0]], [[5.0, 0.0], [5.0, 5.0]]]
        );
        // One that ends partway along another cuts it; ones that only share an end are left whole.
        assert_eq!(joined(&[[[0.0, 0.0], [10.0, 0.0]], [[4.0, 0.0], [4.0, 6.0]]]).len(), 3);
        assert_eq!(joined(&[[[0.0, 0.0], [10.0, 0.0]], [[10.0, 0.0], [10.0, 6.0]]]).len(), 2);
    }
}
