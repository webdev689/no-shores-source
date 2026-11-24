//! Boxes square to the world that keep to what is drawn. A built shape is cut into parts of its own frame that keep
//! within `KEEP_M` of it (a tapering one in layers, a wide round one in crossed boxes), and each part is boxed so its
//! boxes keep within `KEEP_M` of it too: whole where its box already does, in strips across the world where it is
//! turned off the world's axes, and halved again and again where it leans or rolls.

use crate::collision::Box2;
use crate::solids::{Shape, Solid};
use land::exact::sin_cos;

/// How far a box may stand off what it boxes, metres: a body climbing it, or standing at its edge, keeps this close
/// to what is drawn. The layouts lay a wall at a slant in lengths whose boxes keep as close (`halls.rs`). A shape cut
/// into parts first (a round, a taper) spends half of it on its parts and half on their boxes.
pub const KEEP_M: f64 = 0.45;
const SHAPED_M: f64 = KEEP_M / 2.0;
/// A solid that leans or rolls so little none of it moves further than a box may stand off it is boxed as if it stood
/// upright, its boxes within `KEEP_M` of where it would stand: a sea stack, a standing stone or a stone of rubble set
/// a little off plumb is a few boxes, not hundreds.
pub const STILL_M: f64 = KEEP_M;
/// A round's own box stands up to 0.41 of its radius off it at the corners; one this share as wide stands at most
/// 0.172 of its radius off it either way, in at its sides and out at its corners. Past what that keeps to `KEEP_M`,
/// a round is crossed boxes inside it.
const ROUND_SHARE: f64 = 0.828;
const ROUND_OFF_SHARE: f64 = 0.172;
/// A part leaned or rolled is halved at most this many times, so a long one is never cut endlessly; and a piece this
/// long or less is halved no further for the reach its tilt alone throws its box out by, so a stone tilted as rubble
/// lies is a box or two, not dozens.
const MOST_HALVINGS: u32 = 8;
pub(crate) const TILTED_PIECE_M: f64 = 2.0;

/// A part of a shape's own frame: low x, y, z, then high x, y, z.
pub type Part = [f64; 6];

/// The parts of a shape's own frame, each within `budget` of what is drawn: a block whole; an arch its jambs and the
/// head over its crown, so a body walks through it; a column, a dome, a pyramid and a gable in layers that narrow as
/// it does; natural rock and a module their own parts.
#[must_use]
pub fn shape_parts(shape: Shape, size: [f64; 3], budget: f64) -> Vec<Part> {
    let [width, depth, height] = size;
    let (half_width, half_depth) = (width / 2.0, depth / 2.0);
    let reach = half_width.max(half_depth);
    match shape {
        Shape::Block => vec![[-half_width, -half_depth, 0.0, half_width, half_depth, height]],
        Shape::Arch { opening } => {
            let radius = half_width * crate::collision::ARCH_OPENING_WIDTH;
            let crown = opening.clamp(0.05, 0.95) * height;
            vec![
                [-half_width, -half_depth, 0.0, -radius, half_depth, height],
                [radius, -half_depth, 0.0, half_width, half_depth, height],
                [-radius, -half_depth, crown, radius, half_depth, height],
            ]
        }
        Shape::Column { .. } | Shape::Dome { .. } | Shape::Pyramid { .. } => {
            let top = match shape {
                Shape::Column { top, .. } | Shape::Pyramid { top } => top,
                _ => 0.0,
            };
            let dome = matches!(shape, Shape::Dome { .. });
            let outline = Outline {
                height,
                narrows: &|up: f64| {
                    if dome {
                        (1.0 - (up / height) * (up / height)).max(0.0).sqrt()
                    } else {
                        1.0 - (1.0 - top) * up / height
                    }
                },
                up_at: &|share: f64| {
                    if dome {
                        height * (1.0 - share * share).max(0.0).sqrt()
                    } else if top >= 1.0 {
                        height
                    } else {
                        height * (1.0 - share) / (1.0 - top)
                    }
                },
            };
            let round = !matches!(shape, Shape::Pyramid { .. });
            // A rectangle's corner narrows along its diagonal; a round's as far as its reach.
            let narrowing = if round { reach } else { (half_width * half_width + half_depth * half_depth).sqrt() };
            layers(&outline, narrowing, budget, |share| if round { round_misfit(reach * share, budget) } else { 0.0 })
                .into_iter()
                .flat_map(|(from, to, share)| across(half_width * share, half_depth * share, round, from, to, budget))
                .collect()
        }
        Shape::Gable => {
            let outline = Outline { height, narrows: &|up| 1.0 - up / height, up_at: &|share| height * (1.0 - share) };
            layers(&outline, half_width, budget, |_| 0.0)
                .into_iter()
                .map(|(from, to, share)| [-half_width * share, -half_depth, from, half_width * share, half_depth, to])
                .collect()
        }
        _ => crate::rock::parts(shape, size),
    }
}

/// A shape's outline up its height: its share of its base's reach at each height, and the height at a share.
struct Outline<'a> {
    height: f64,
    narrows: &'a dyn Fn(f64) -> f64,
    up_at: &'a dyn Fn(f64) -> f64,
}

/// A shape that narrows as it rises, cut into layers each boxed as wide as its foot. A layer's top corner stands off
/// the shape by its cross-section's own misfit at its foot (`misfit`, of its reach's share there) and either the
/// rise to its top or how far the shape narrows across it (`narrowing`, its corner's reach): each layer rises as far
/// as keeps that within `budget`.
fn layers(outline: &Outline, narrowing: f64, budget: f64, misfit: impl Fn(f64) -> f64) -> Vec<(f64, f64, f64)> {
    let mut cut = Vec::new();
    let mut from = 0.0;
    while from < outline.height {
        let share = (outline.narrows)(from);
        let off = misfit(share).min(budget);
        let rise = (budget * budget - off * off).max(0.0).sqrt();
        let narrowed = share - (budget - off) / narrowing.max(1e-9);
        let across = if narrowed <= 0.0 { outline.height } else { (outline.up_at)(narrowed) };
        let to = (from + rise).max(across).min(outline.height);
        cut.push((from, to, share));
        if to <= from {
            break;
        }
        from = to;
    }
    cut
}

/// How far a round of this reach's boxes (`across`) stand outside it at most, metres.
fn round_misfit(reach: f64, budget: f64) -> f64 {
    if reach * (std::f64::consts::SQRT_2 - 1.0) <= budget / 2.0 {
        reach * (std::f64::consts::SQRT_2 - 1.0)
    } else if reach * ROUND_OFF_SHARE <= budget / 2.0 {
        reach * ROUND_OFF_SHARE
    } else {
        0.0
    }
}

/// A layer's cross-section, halves `half_x` by `half_y`, as boxes of its own frame: a rectangle whole; a round in
/// its own box while that stands within half of `budget` of it, then in one box a little inside it, then in boxes
/// crossed inside it, as many as keep the round within `budget` of them.
fn across(half_x: f64, half_y: f64, round: bool, from: f64, to: f64, budget: f64) -> Vec<Part> {
    let reach = half_x.max(half_y);
    if !round || reach * (std::f64::consts::SQRT_2 - 1.0) <= budget / 2.0 {
        return vec![[-half_x, -half_y, from, half_x, half_y, to]];
    }
    if reach * ROUND_OFF_SHARE <= budget / 2.0 {
        let (x, y) = (half_x * ROUND_SHARE, half_y * ROUND_SHARE);
        return vec![[-x, -y, from, x, y, to]];
    }
    let count = (std::f64::consts::PI * reach / (4.0 * budget)).ceil().max(2.0) as u32;
    (0..count)
        .map(|step| {
            let angle = (f64::from(step) + 0.5) * std::f64::consts::FRAC_PI_2 / f64::from(count);
            let (sine, cosine) = sin_cos(angle);
            let (x, y) = (half_x * cosine, half_y * sine);
            [-x, -y, from, x, y, to]
        })
        .collect()
}

/// How far a solid's parts may stand off it, and their boxes off them: a shape whose parts are itself (a block, an
/// arch's pieces, rock) spends all of `KEEP_M` on its boxes; one cut into parts first spends half on each.
#[must_use]
pub const fn keeps_of(shape: Shape) -> (f64, f64) {
    match shape {
        Shape::Column { .. } | Shape::Dome { .. } | Shape::Pyramid { .. } | Shape::Gable => {
            (SHAPED_M, KEEP_M - SHAPED_M)
        }
        _ => (0.0, KEEP_M),
    }
}

/// A part of a solid's own frame as boxes square to the world, each within `keep` of it.
#[must_use]
pub fn part_boxes(solid: &Solid, part: Part, keep: f64) -> Vec<Box2> {
    let whole = box_of(solid, part);
    if off(solid, part, whole) <= keep {
        return vec![whole];
    }
    if solid.lean == 0.0 && solid.roll == 0.0 {
        let [x0, y0, z0, x1, y1, z1] = part;
        let corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(|[x, y]| {
            let [east, south, _] = solid.place([x, y, 0.0]);
            [east, south]
        });
        return strips(corners, solid.at[2] + z0, solid.at[2] + z1, keep);
    }
    halves(solid, part, keep, 0)
}

/// A part's box square to the world round its turned corners: west, north, east, south, top, bottom.
fn box_of(solid: &Solid, part: Part) -> Box2 {
    let [x0, y0, z0, x1, y1, z1] = part;
    let [west, north, east, south, bottom, top] = solid.bounds_of([x0, y0, z0, x1, y1, z1]);
    [west, north, east, south, top, bottom]
}

/// How far a box stands off a part at most: its farthest corner's distance from the part, as a box's farthest point
/// from anything convex is one of its corners.
fn off(solid: &Solid, part: Part, [west, north, east, south, top, bottom]: Box2) -> f64 {
    let [x0, y0, z0, x1, y1, z1] = part;
    let mut farthest: f64 = 0.0;
    for corner in 0..8 {
        let x = if corner & 1 == 0 { west } else { east };
        let y = if corner & 2 == 0 { north } else { south };
        let z = if corner & 4 == 0 { bottom } else { top };
        let [own_x, own_y, own_z] = solid.own([x, y, z]);
        let gap = |value: f64, low: f64, high: f64| (low - value).max(value - high).max(0.0);
        let (across, along, rise) = (gap(own_x, x0, x1), gap(own_y, y0, y1), gap(own_z, z0, z1));
        farthest = farthest.max((across * across + along * along + rise * rise).sqrt());
    }
    farthest
}

/// A leaning or rolled part halved until each piece's box keeps within `keep` of it, each time across the side
/// whose halving brings the halves' boxes nearest it: halving a side the tilt does not throw out gains nothing.
fn halves(solid: &Solid, part: Part, keep: f64, halved: u32) -> Vec<Box2> {
    let whole = box_of(solid, part);
    let longest = (part[3] - part[0]).max(part[4] - part[1]).max(part[5] - part[2]);
    let forgiven = if longest <= TILTED_PIECE_M { longest * tilt_reach(solid) } else { 0.0 };
    if halved >= MOST_HALVINGS || off(solid, part, whole) <= keep + forgiven {
        return vec![whole];
    }
    let halved_across = |axis: usize| {
        let middle = (part[axis] + part[axis + 3]) / 2.0;
        let (mut low, mut high) = (part, part);
        low[axis + 3] = middle;
        high[axis] = middle;
        (low, high)
    };
    let worse = |axis: usize| {
        let (low, high) = halved_across(axis);
        off(solid, low, box_of(solid, low)).max(off(solid, high, box_of(solid, high)))
    };
    let axis = (0..3).fold(0, |best, axis| if worse(axis) < worse(best) { axis } else { best });
    let (low, high) = halved_across(axis);
    let mut boxes = halves(solid, low, keep, halved + 1);
    boxes.extend(halves(solid, high, keep, halved + 1));
    boxes
}

/// How far a metre of a part reaches out of square as the solid leans and rolls, in the land's exact sines, as the
/// browser's rules work it to the bit.
#[must_use]
pub fn tilt_reach(solid: &Solid) -> f64 {
    sin_cos(solid.lean.abs()).0 + sin_cos(solid.roll.abs()).0
}

/// How far the solid's leaning and rolling moves its farthest corner from where it would stand upright, at most.
#[must_use]
pub fn tilt_move(solid: &Solid) -> f64 {
    let [width, depth, height] = solid.size;
    (width * width / 4.0 + depth * depth / 4.0 + height * height).sqrt() * tilt_reach(solid)
}

/// A footprint turned off the world's axes (its four corners in order round it, in world metres) from `bottom` to
/// `top`, as strips across the world, each the box of the footprint within it. A strip as wide as `keep` over the
/// larger of the footprint's sides' slants stands no more than `keep` past the footprint's edges, whichever way the
/// strips run; they run the way that takes fewer.
#[must_use]
pub fn strips(corners: [[f64; 2]; 4], bottom: f64, top: f64, keep: f64) -> Vec<Box2> {
    let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    let [west, north, east, south] = corners
        .iter()
        .fold(start, |[west, north, east, south], &[x, y]| [west.min(x), north.min(y), east.max(x), south.max(y)]);
    let side = [corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]];
    let length = (side[0] * side[0] + side[1] * side[1]).sqrt();
    if length <= 1e-12 {
        return vec![[west, north, east, south, top, bottom]];
    }
    let slant = (side[0].abs() / length).max(side[1].abs() / length);
    let width = keep / slant;
    let (across_x, across_y) = (((east - west) / width).ceil().max(1.0), ((south - north) / width).ceil().max(1.0));
    // Strips across y each span the footprint's x within them; strips across x its y.
    let along_y = across_y <= across_x;
    let (axis, from, to, count) = if along_y { (1, north, south, across_y) } else { (0, west, east, across_x) };
    let other = 1 - axis;
    (0..count as u32)
        .map(|strip| {
            let low = from + (to - from) * f64::from(strip) / count;
            let high = from + (to - from) * f64::from(strip + 1) / count;
            let (mut least, mut most) = (f64::INFINITY, f64::NEG_INFINITY);
            for at in 0..4 {
                let (a, b) = (corners[at], corners[(at + 1) % 4]);
                if (low..=high).contains(&a[axis]) {
                    least = least.min(a[other]);
                    most = most.max(a[other]);
                }
                for edge in [low, high] {
                    if (a[axis] - edge) * (b[axis] - edge) < 0.0 {
                        let along = a[other] + (b[other] - a[other]) * (edge - a[axis]) / (b[axis] - a[axis]);
                        least = least.min(along);
                        most = most.max(along);
                    }
                }
            }
            if along_y { [least, low, most, high, top, bottom] } else { [low, least, high, most, top, bottom] }
        })
        .filter(|found| found[0] <= found[2] && found[1] <= found[3])
        .collect()
}

#[cfg(test)]
#[path = "hug_tests.rs"]
mod tests;
