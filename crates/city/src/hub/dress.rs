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
        .filter(|solid| !matches!(solid.material, Material::Paving | Material::Path))
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

/// Lays the platform's ways as walks of dressed flagstones over its cobbles: a strip along each link, a round at each
/// end so the strips meet.
pub(crate) fn walks(frame: &Frame, laid: &mut Laid) {
    let mut ends: Vec<[f64; 2]> = Vec::new();
    for [from, to] in super::folk::platform_links() {
        let [one, two] = [frame.at(from[0], from[1]), frame.at(to[0], to[1])];
        let along = [two[0] - one[0], two[1] - one[1]];
        let long = libm::hypot(along[0], along[1]);
        if long < 1e-6 {
            continue;
        }
        let middle = [(one[0] + two[0]) / 2.0, (one[1] + two[1]) / 2.0, frame.level];
        let strip = Solid::upright(Shape::Block, middle, [WALK_WIDE_M, long, WALK_HIGH_M], Material::Path);
        laid.solids.push(strip.turned(turn_toward(along)));
        for end in [one, two] {
            if !ends.iter().any(|&known| libm::hypot(known[0] - end[0], known[1] - end[1]) < 0.01) {
                ends.push(end);
            }
        }
    }
    for [x, y] in ends {
        let round = Shape::Column { sides: 16, top: 1.0 };
        laid.solids.push(Solid::upright(
            round,
            [x, y, frame.level],
            [WALK_WIDE_M, WALK_WIDE_M, WALK_HIGH_M],
            Material::Path,
        ));
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

    #[test]
    fn a_segment_through_a_thin_box_crosses_it_and_one_beside_it_does_not() {
        let wall = [9.9, -5.0, 10.1, 5.0];
        assert_eq!(segment_to_rect([[0.0, 0.0], [20.0, 0.0]], wall), 0.0, "through its middle");
        assert!((segment_to_rect([[0.0, 6.0], [20.0, 6.0]], wall) - 1.0).abs() < 1e-9, "a metre past its end");
        assert!((segment_to_rect([[0.0, 0.0], [9.0, 0.0]], wall) - 0.9).abs() < 1e-9, "short of it");
    }
}
