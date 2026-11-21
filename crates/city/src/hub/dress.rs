//! What fills the hub's courts, each piece where it would be and why, after the owner's "It should feel lively, there
//! shouldnt be so much bare ground. Populate everything", then "Its way too crowded. Like it needs to make sense with
//! object placement. It needs to tell a story, and the pathway needs to be a different texture from the ground". The
//! ways are laid as flagstone walks over the courts' cobbles; each court is a scene of its own (a landing under an
//! avenue of trees, a garden round its fountain with the band's drinkers, the smiths' yard, a market lane, the stable's
//! stores), each piece kept clear of every way, post, arrival and counter, of what already stands and of the ring's
//! edge, or left out; then a place for the walkers at each bench, table, tree, stall and pile, reached straight from
//! the nearest way point that sees it.

use super::Laid;
use super::placing::{Stood, stand_at};
use crate::collision::{Box2, into_boxes};
use crate::courtyard::Frame;
use crate::landmarks::turn_toward;
use crate::life::{CLEAR_M, Keep, Post, Task, Ways};
use crate::modules::{all, number_of};
use crate::solids::{Material, Shape, Solid};

/// How a piece is turned: its front to the way nearest it, or toward a place (metres seaward, across).
#[derive(Clone, Copy)]
enum Faces {
    Way,
    Toward(f64, f64),
}

/// A piece of a scene: its module, where it stands (metres seaward of the plaza's middle, and across it), and how it
/// is turned.
#[derive(Clone, Copy)]
struct Placing {
    name: &'static str,
    toward: f64,
    across: f64,
    faces: Faces,
}

const fn at(name: &'static str, toward: f64, across: f64, faces: Faces) -> Placing {
    Placing { name, toward, across, faces }
}

/// `count` of a piece evenly from one place to another, each facing the way nearest it.
fn line(name: &'static str, from: [f64; 2], to: [f64; 2], count: u32) -> impl Iterator<Item = Placing> {
    (0..count).map(move |nth| {
        let share = if count > 1 { f64::from(nth) / f64::from(count - 1) } else { 0.5 };
        at(name, from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share, Faces::Way)
    })
}

/// `count` of a piece round a place, `radius` out, from `first` degrees, each facing it.
fn ring(name: &'static str, middle: [f64; 2], radius: f64, count: u32, first: f64) -> impl Iterator<Item = Placing> {
    (0..count).map(move |nth| {
        let angle = (first + 360.0 * f64::from(nth) / f64::from(count)).to_radians();
        let [toward, across] = [middle[0] + radius * libm::cos(angle), middle[1] + radius * libm::sin(angle)];
        at(name, toward, across, Faces::Toward(middle[0], middle[1]))
    })
}

/// The market's stalls in turn along a row.
const STALLS: [&str; 6] = [
    "market-stall-cloth",
    "market-stall-bread",
    "market-stall-flowers",
    "market-stall-fruit",
    "market-stall-fish",
    "market-stall-pots",
];

/// The hub's scenes, court by court.
fn scenes() -> Vec<Placing> {
    let mut scene = Vec::new();
    // The Watch Court, where the arrivals land: an avenue of trees along the seaward walk between its ways in, a
    // garden bed in each quarter round the obelisk with a bench by it looking at the obelisk, potted trees lining the
    // walk down to the Beacon, and a flower seller by the passage to the Forge Yard.
    for across in [-44.0, -12.0, 12.0, 44.0] {
        scene.push(at("court-tree", 45.0, across, Faces::Way));
    }
    for (toward, across) in [(21.0, -21.0), (21.0, 21.0), (-8.0, -19.0), (-8.0, 19.0)] {
        scene.push(at("lawn-bed", toward, across, Faces::Toward(8.0, 0.0)));
    }
    for across in [-21.0, 21.0] {
        scene.push(at("bench", 13.0, across, Faces::Toward(8.0, 0.0)));
    }
    for side in [-1.0, 1.0] {
        scene.extend(line("potted-tree", [-36.0, side * 7.0], [-48.0, side * 7.0], 2));
    }
    scene.push(at("flower-cart", 26.0, 42.0, Faces::Way));
    // The West Court, a garden for the music: a tree on each quarter of the fountain, benches looking at it from
    // outside its ring of ways, the band's listeners at tables on the bandstand's flanks with the drinks' barrels
    // behind it, and beds along the parapet.
    for (toward, across) in [(14.0, -84.0), (14.0, -112.0), (-6.0, -76.0), (-6.0, -120.0)] {
        scene.push(at("court-tree", toward, across, Faces::Toward(-6.0, -98.0)));
    }
    scene.extend(ring("bench", [-6.0, -98.0], 13.0, 4, 45.0));
    for (name, toward, across) in [
        ("table-benches", -42.0, -84.0),
        ("table-benches", -40.0, -108.0),
        ("parasol-table", -34.0, -86.0),
        ("parasol-table", -34.0, -110.0),
    ] {
        scene.push(at(name, toward, across, Faces::Toward(-40.0, -98.0)));
    }
    scene.push(at("barrel-stack", -50.0, -98.0, Faces::Toward(-40.0, -98.0)));
    for toward in [6.0, -18.0] {
        scene.push(at("lawn-bed", toward, -124.0, Faces::Way));
    }
    scene.push(at("flower-cart", 34.0, -86.0, Faces::Way));
    // The Forge Yard, at work: fuel stacked by the forge, stores by the armoury, hay by the cart, a table where the
    // smiths eat by their anvils, and the charcoal's cart come in.
    for (name, toward, across) in [
        ("woodpile", 40.0, 121.0),
        ("woodpile", 12.0, 121.0),
        ("barrel-stack", -28.0, 121.0),
        ("crates-barrels", -36.0, 126.0),
        ("sacks-grain", -20.0, 98.0),
        ("bale-stack", -44.0, 100.0),
        ("table-benches", -4.0, 102.0),
        ("cart", 32.0, 84.0),
    ] {
        scene.push(at(name, toward, across, Faces::Way));
    }
    // The Beacon Walk, a market lane: a row of stalls either side facing it, their deliveries stood behind them.
    let mut stall = STALLS.iter().cycle();
    for across in [-128.0, -108.0, -86.0, -40.0, 40.0, 92.0, 108.0, 128.0] {
        scene.push(at(stall.next().copied().unwrap_or("market-stall-fruit"), -70.0, across, Faces::Way));
    }
    for across in [-104.0, -82.0, -34.0, 34.0, 82.0, 104.0] {
        scene.push(at(stall.next().copied().unwrap_or("market-stall-fruit"), -91.0, across, Faces::Way));
    }
    for (name, across) in [("cart", -98.0), ("sacks-grain", -118.0), ("amphorae", 98.0), ("crates-barrels", 118.0)] {
        scene.push(at(name, -62.0, across, Faces::Way));
    }
    // The Stair Yard, the stable's stores.
    for (name, toward, across) in
        [("bale-stack", -118.0, 104.0), ("barrel-stack", -142.0, 130.0), ("hay-cart", -108.0, 124.0)]
    {
        scene.push(at(name, toward, across, Faces::Way));
    }
    scene
}

/// How far a piece keeps from a way's line beyond the way's own clearance, from a way point, a post, an arrival, a
/// counter, what already stands, another piece and the ring's edge, metres.
const PAST_WAY_M: f64 = 0.25;
const FROM_POINT_M: f64 = 1.6;
const FROM_POST_M: f64 = 1.2;
const OFF_POST_LINE_M: f64 = 0.7;
const FROM_ARRIVAL_M: f64 = 5.0;
const FROM_COUNTER_M: f64 = 3.0;
const FROM_STANDING_M: f64 = 0.6;
const BETWEEN_M: f64 = 0.9;
const FROM_EDGE_M: f64 = 0.8;
/// Only what stands lower than this over the floor is kept clear of: a lamp or a banner overhead is not.
const OVERHEAD_M: f64 = 2.5;
/// How far a walker's place stands out from a piece's front, and how far a way point may be from it, metres; how far
/// its straight walk keeps from every box.
const OUT_M: f64 = 0.8;
const REACH_M: f64 = 45.0;
const WALK_CLEAR_M: f64 = 0.6;

/// A piece laid in a court.
pub(crate) struct Dressed {
    name: &'static str,
    stood: Stood,
}

/// A rectangle square to the world: west, north, east, south.
type Rect = [f64; 4];

fn point_to_segment(point: [f64; 2], [from, to]: [[f64; 2]; 2]) -> f64 {
    let along = [to[0] - from[0], to[1] - from[1]];
    let length = along[0] * along[0] + along[1] * along[1];
    let share = if length > 0.0 {
        (((point[0] - from[0]) * along[0] + (point[1] - from[1]) * along[1]) / length).clamp(0.0, 1.0)
    } else {
        0.0
    };
    libm::hypot(point[0] - (from[0] + along[0] * share), point[1] - (from[1] + along[1] * share))
}

fn point_to_rect([x, y]: [f64; 2], [west, north, east, south]: Rect) -> f64 {
    let outside = [(west - x).max(x - east).max(0.0), (north - y).max(y - south).max(0.0)];
    libm::hypot(outside[0], outside[1])
}

fn corners([west, north, east, south]: Rect) -> [[f64; 2]; 4] {
    [[west, north], [east, north], [east, south], [west, south]]
}

/// Whether a segment crosses a rectangle, by clipping it to the rectangle's four sides.
fn crosses(segment: [[f64; 2]; 2], [west, north, east, south]: Rect) -> bool {
    let along = [segment[1][0] - segment[0][0], segment[1][1] - segment[0][1]];
    let (mut low, mut high) = (0.0_f64, 1.0_f64);
    for (step, room) in [
        (-along[0], segment[0][0] - west),
        (along[0], east - segment[0][0]),
        (-along[1], segment[0][1] - north),
        (along[1], south - segment[0][1]),
    ] {
        if step == 0.0 {
            if room < 0.0 {
                return false;
            }
        } else if step < 0.0 {
            low = low.max(room / step);
        } else {
            high = high.min(room / step);
        }
    }
    low <= high
}

/// How far a segment passes from a rectangle: none where it crosses it.
fn segment_to_rect(segment: [[f64; 2]; 2], rect: Rect) -> f64 {
    if crosses(segment, rect) {
        return 0.0;
    }
    let ends = segment.iter().map(|&end| point_to_rect(end, rect));
    let edges = corners(rect).into_iter().map(|corner| point_to_segment(corner, segment));
    ends.chain(edges).fold(f64::INFINITY, f64::min)
}

fn rect_gap(one: Rect, two: Rect) -> f64 {
    let across = (two[0] - one[2]).max(one[0] - two[2]).max(0.0);
    let along = (two[1] - one[3]).max(one[1] - two[3]).max(0.0);
    libm::hypot(across, along)
}

fn inside(ring: &[[f64; 2]], [x, y]: [f64; 2]) -> bool {
    let mut within = false;
    for at in 0..ring.len() {
        let ([x0, y0], [x1, y1]) = (ring[at], ring[(at + 1) % ring.len()]);
        if (y0 > y) != (y1 > y) && x < x0 + (y - y0) / (y1 - y0) * (x1 - x0) {
            within = !within;
        }
    }
    within
}

/// The four ways a piece may face, the frame's own: seaward, landward, and either way across.
fn faced(frame: &Frame, toward: [f64; 2]) -> [f64; 2] {
    let across = frame.across();
    let ways = [frame.seaward, [-frame.seaward[0], -frame.seaward[1]], across, [-across[0], -across[1]]];
    ways.into_iter()
        .max_by(|one, two| {
            (one[0] * toward[0] + one[1] * toward[1]).total_cmp(&(two[0] * toward[0] + two[1] * toward[1]))
        })
        .unwrap_or(frame.seaward)
}

/// The rectangle a module stood at `at` facing `facing` (square to the world) covers.
fn footprint(size: [f64; 3], at: [f64; 2], facing: [f64; 2]) -> Rect {
    let side = [-facing[1], facing[0]];
    let [half_wide, half_deep] = [size[0] / 2.0, size[1] / 2.0];
    let reach = [
        (side[0] * half_wide).abs() + (facing[0] * half_deep).abs(),
        (side[1] * half_wide).abs() + (facing[1] * half_deep).abs(),
    ];
    [at[0] - reach[0], at[1] - reach[1], at[0] + reach[0], at[1] + reach[1]]
}

fn segments(ways: &Ways) -> Vec<[[f64; 2]; 2]> {
    ways.links
        .iter()
        .filter_map(|&[one, two]| Some([ways.points.get(one as usize)?.at, ways.points.get(two as usize)?.at]))
        .collect()
}

/// Lays each court's pieces over its open ground, kept clear of `ways`, `posts` and `arrivals`, of what `laid` already
/// stands, and of `ring`'s edge. Answers what it laid.
pub(crate) fn dress(
    frame: &Frame,
    laid: &mut Laid,
    ways: &Ways,
    posts: &[Post],
    arrivals: &[[f64; 2]],
    ring: &[[f64; 2]],
) -> Vec<Dressed> {
    let lines = segments(ways);
    let post_lines: Vec<[[f64; 2]; 2]> =
        posts.iter().filter_map(|post| Some([ways.points.get(post.reached_from as usize)?.at, post.at])).collect();
    let standing: Vec<Rect> = laid
        .solids
        .iter()
        .filter(|solid| !matches!(solid.material, Material::Paving | Material::Path | Material::Lawn | Material::Earth))
        .map(crate::solids::Solid::bounds)
        .filter(|&[_, _, _, _, bottom, top]| bottom < frame.level + OVERHEAD_M && top > frame.level + 0.05)
        .map(|[west, north, east, south, _, _]| [west, north, east, south])
        .collect();
    let counters: Vec<[f64; 2]> = laid.stations.iter().map(|station| station.counter).collect();
    let mut placed: Vec<Rect> = Vec::new();
    let mut dressed = Vec::new();
    for placing in scenes() {
        let Some(module) = number_of(placing.name).and_then(|number| all().get(number as usize)) else { continue };
        let at = frame.at(placing.toward, placing.across);
        let toward_of = match placing.faces {
            Faces::Toward(toward, across) => Some(frame.at(toward, across)),
            Faces::Way => lines
                .iter()
                .map(|&line| {
                    let along = [line[1][0] - line[0][0], line[1][1] - line[0][1]];
                    let length = (along[0] * along[0] + along[1] * along[1]).max(1e-9);
                    let share =
                        (((at[0] - line[0][0]) * along[0] + (at[1] - line[0][1]) * along[1]) / length).clamp(0.0, 1.0);
                    [line[0][0] + along[0] * share, line[0][1] + along[1] * share]
                })
                .min_by(|one, two| {
                    libm::hypot(one[0] - at[0], one[1] - at[1]).total_cmp(&libm::hypot(two[0] - at[0], two[1] - at[1]))
                }),
        };
        let Some(toward_of) = toward_of else { continue };
        let facing = faced(frame, [toward_of[0] - at[0], toward_of[1] - at[1]]);
        let rect = footprint(module.size, at, facing);
        let in_ring = corners(rect).iter().all(|&corner| {
            inside(ring, corner)
                && (0..ring.len())
                    .all(|edge| point_to_segment(corner, [ring[edge], ring[(edge + 1) % ring.len()]]) >= FROM_EDGE_M)
        });
        let blocked = [
            (!in_ring, "the ring's edge"),
            (lines.iter().any(|&line| segment_to_rect(line, rect) < CLEAR_M + PAST_WAY_M), "a way"),
            (ways.points.iter().any(|point| point_to_rect(point.at, rect) < FROM_POINT_M), "a way point"),
            (posts.iter().any(|post| point_to_rect(post.at, rect) < FROM_POST_M), "a post"),
            (post_lines.iter().any(|&line| segment_to_rect(line, rect) < OFF_POST_LINE_M), "a walk to a post"),
            (
                arrivals.iter().chain(&laid.spots).any(|&arrival| point_to_rect(arrival, rect) < FROM_ARRIVAL_M),
                "an arrival",
            ),
            (counters.iter().any(|&counter| point_to_rect(counter, rect) < FROM_COUNTER_M), "a counter"),
            (standing.iter().any(|&other| rect_gap(rect, other) < FROM_STANDING_M), "what stands"),
            (placed.iter().any(|&other| rect_gap(rect, other) < BETWEEN_M), "another piece"),
        ]
        .into_iter()
        .find_map(|(blocks, what)| blocks.then_some(what));
        if let Some(_what) = blocked {
            #[cfg(test)]
            eprintln!("left out: {} at {}, {} by {_what}", placing.name, placing.toward, placing.across);
            continue;
        }
        let Some(stood) = stand_at(placing.name, "front", at, frame.level, facing) else { continue };
        placed.push(rect);
        laid.piece(Some(stood.clone()));
        dressed.push(Dressed { name: placing.name, stood });
    }
    dressed
}

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

/// What a walker does at a piece and where, by its sockets: a browser before a market stall's counter, a drinker at a
/// table's seats or before a parasol, a porter at a pile or a cart, and an idler at a seat, a bed or a tree.
fn places(dressed: &Dressed) -> Vec<(Task, [f64; 2], [f64; 2])> {
    let out = |socket: &str| {
        dressed.stood.socket(socket).map(|(at, facing)| [at[0] + facing[0] * OUT_M, at[1] + facing[1] * OUT_M])
    };
    let into = |socket: &str| dressed.stood.socket(socket).map(|(_, facing)| [-facing[0], -facing[1]]);
    let one = |task, socket: &str| out(socket).zip(into(socket)).map(|(at, facing)| (task, at, facing)).into_iter();
    match dressed.name {
        name if name.starts_with("market-stall-") => one(Task::Idle, "counter").collect(),
        "table-benches" => (1..=4)
            .filter_map(|seat| {
                let (at, facing) = dressed.stood.socket(&format!("seat-{seat}"))?;
                Some((Task::Drink, [at[0], at[1]], facing))
            })
            .collect(),
        "parasol-table" => one(Task::Drink, "front").collect(),
        "woodpile" | "bale-stack" | "barrel-stack" | "crates-barrels" | "hay-cart" | "cart" | "sacks-grain" => {
            one(Task::Carry, "front").collect()
        }
        _ => one(Task::Idle, "front").collect(),
    }
}

/// A place for the walkers at each piece laid, reached straight from the nearest way point whose walk to it passes
/// every box, or none where no way point within reach sees it.
pub(crate) fn walkers_places(dressed: &[Dressed], laid: &Laid, ways: &Ways, level: f64) -> Vec<Post> {
    // What a walker meets: the boxes reaching lower than a head over the floor.
    let boxes: Vec<Rect> = laid
        .solids
        .iter()
        .flat_map(into_boxes)
        .filter(|found: &Box2| found[5] < level + 2.0)
        .map(|[west, north, east, south, _, _]| [west, north, east, south])
        .collect();
    let mut found = Vec::new();
    for piece in dressed {
        for (task, at, facing) in places(piece) {
            if boxes.iter().any(|&rect| point_to_rect(at, rect) < WALK_CLEAR_M) {
                continue;
            }
            let mut near: Vec<(usize, f64)> = ways
                .points
                .iter()
                .enumerate()
                .map(|(index, point)| (index, libm::hypot(point.at[0] - at[0], point.at[1] - at[1])))
                .filter(|&(_, distance)| distance <= REACH_M)
                .collect();
            near.sort_by(|one, two| one.1.total_cmp(&two.1));
            let seen = near.into_iter().find(|&(index, _)| {
                let line = [ways.points[index].at, at];
                boxes.iter().all(|&rect| segment_to_rect(line, rect) >= WALK_CLEAR_M)
            });
            let Some((index, _)) = seen else { continue };
            let Ok(reached_from) = u32::try_from(index) else { continue };
            found.push(Post {
                task,
                at,
                facing: libm::atan2(facing[0], -facing[1]),
                keep: Keep::Visited,
                reached_from,
            });
        }
    }
    found
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

    #[test]
    fn a_segment_through_a_thin_box_crosses_it_and_one_beside_it_does_not() {
        let wall = [9.9, -5.0, 10.1, 5.0];
        assert_eq!(segment_to_rect([[0.0, 0.0], [20.0, 0.0]], wall), 0.0, "through its middle");
        assert!((segment_to_rect([[0.0, 6.0], [20.0, 6.0]], wall) - 1.0).abs() < 1e-9, "a metre past its end");
        assert!((segment_to_rect([[0.0, 0.0], [9.0, 0.0]], wall) - 0.9).abs() < 1e-9, "short of it");
    }
}
