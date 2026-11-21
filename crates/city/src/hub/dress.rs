//! What fills the hub's courts, after the owner's "It should feel lively, there shouldnt be so much bare ground.
//! Populate everything": each court's own pieces laid over its open ground on a seeded scatter, each turned to face
//! the way nearest it and kept clear of every way, post, arrival and counter, of what already stands and of the
//! ring's edge; then a place for the walkers at each bench, table, tree, stall and pile, reached straight from the
//! nearest way point that sees it.

use super::Laid;
use super::placing::{Stood, stand_at};
use crate::collision::{Box2, into_boxes};
use crate::courtyard::Frame;
use crate::life::{CLEAR_M, Keep, Post, Task, Ways};
use crate::modules::{all, number_of};
use crate::solids::Material;

/// A court's open ground (metres seaward of the plaza's middle from and to, and across it from and to), how far apart
/// its pieces are scattered, metres, and what stands there, each with how often.
struct Court {
    toward: [f64; 2],
    across: [f64; 2],
    apart: f64,
    pieces: &'static [(&'static str, u32)],
}

const COURTS: [Court; 5] = [
    // The Watch Court: shade, green and seats round the obelisk.
    Court {
        toward: [-50.0, 46.0],
        across: [-50.0, 50.0],
        apart: 11.0,
        pieces: &[
            ("court-tree", 3),
            ("lawn-bed", 3),
            ("bench", 2),
            ("planter", 2),
            ("potted-tree", 2),
            ("flower-cart", 1),
            ("parasol-table", 1),
        ],
    },
    // The West Court: a garden and its tables, round the fountain and the band.
    Court {
        toward: [-52.0, 46.0],
        across: [-150.0, -66.0],
        apart: 10.0,
        pieces: &[
            ("court-tree", 3),
            ("lawn-bed", 3),
            ("parasol-table", 3),
            ("table-benches", 2),
            ("bench", 2),
            ("potted-tree", 2),
            ("flower-cart", 1),
        ],
    },
    // The Forge Yard: the smiths' stores and their work.
    Court {
        toward: [-52.0, 46.0],
        across: [66.0, 150.0],
        apart: 9.0,
        pieces: &[
            ("woodpile", 3),
            ("barrel-stack", 3),
            ("crates-barrels", 3),
            ("bale-stack", 2),
            ("hay-cart", 2),
            ("cart", 2),
            ("sacks-grain", 2),
            ("table-benches", 1),
        ],
    },
    // The Beacon Walk's market, either side of the portico.
    Court {
        toward: [-104.0, -56.0],
        across: [-150.0, 150.0],
        apart: 9.0,
        pieces: &[
            ("market-stall-cloth", 3),
            ("market-stall-bread", 3),
            ("market-stall-flowers", 3),
            ("market-stall-fruit", 2),
            ("market-stall-fish", 1),
            ("market-stall-pots", 1),
            ("parasol-table", 2),
            ("flower-cart", 1),
            ("cart", 1),
            ("amphorae", 1),
            ("sacks-grain", 1),
            ("crates-barrels", 1),
        ],
    },
    // The Stair Yard round the base's east side, by the stable.
    Court {
        toward: [-150.0, -106.0],
        across: [96.0, 150.0],
        apart: 9.0,
        pieces: &[("bale-stack", 3), ("hay-cart", 2), ("barrel-stack", 2), ("crates-barrels", 2), ("sacks-grain", 1)],
    },
];

/// How far a piece keeps from a way's line beyond the way's own clearance, from a way point, a post, an arrival, a
/// counter, what already stands, another piece and the ring's edge, metres.
const PAST_WAY_M: f64 = 0.4;
const FROM_POINT_M: f64 = 2.0;
const FROM_POST_M: f64 = 1.2;
const OFF_POST_LINE_M: f64 = 0.7;
const FROM_ARRIVAL_M: f64 = 5.0;
const FROM_COUNTER_M: f64 = 3.0;
const FROM_STANDING_M: f64 = 0.6;
const BETWEEN_M: f64 = 1.0;
const FROM_EDGE_M: f64 = 0.8;
/// Only what stands lower than this over the floor is kept clear of: a lamp or a banner overhead is not.
const OVERHEAD_M: f64 = 2.5;
/// How far a walker's place stands out from a piece's front, and how far a way point may be from it, metres; how far
/// its straight walk keeps from every box.
const OUT_M: f64 = 0.8;
const REACH_M: f64 = 45.0;
const WALK_CLEAR_M: f64 = 0.45;

/// A piece laid in a court.
pub(crate) struct Dressed {
    name: &'static str,
    stood: Stood,
}

/// A rectangle square to the world: west, north, east, south.
type Rect = [f64; 4];

fn hash(mut value: u64) -> f64 {
    value = value.wrapping_add(0x9e37_79b9_7f4a_7c15);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^= value >> 31;
    (value >> 11) as f64 / (1u64 << 53) as f64
}

fn seeded(court: usize, row: usize, column: usize, salt: u64) -> f64 {
    hash(((court as u64) << 40) ^ ((row as u64) << 20) ^ (column as u64) ^ (salt << 56))
}

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
        .filter(|solid| solid.material != Material::Paving)
        .map(crate::solids::Solid::bounds)
        .filter(|&[_, _, _, _, bottom, top]| bottom < frame.level + OVERHEAD_M && top > frame.level + 0.05)
        .map(|[west, north, east, south, _, _]| [west, north, east, south])
        .collect();
    let counters: Vec<[f64; 2]> = laid.stations.iter().map(|station| station.counter).collect();
    let mut placed: Vec<Rect> = Vec::new();
    let mut dressed = Vec::new();
    for (number, court) in COURTS.iter().enumerate() {
        let total: u32 = court.pieces.iter().map(|&(_, often)| often).sum();
        let rows = ((court.toward[1] - court.toward[0]) / court.apart).floor() as usize;
        let columns = ((court.across[1] - court.across[0]) / court.apart).floor() as usize;
        for row in 0..rows {
            for column in 0..columns {
                let jitter = |salt| (seeded(number, row, column, salt) - 0.5) * court.apart * 0.7;
                let toward = court.toward[0] + (row as f64 + 0.5) * court.apart + jitter(1);
                let across = court.across[0] + (column as f64 + 0.5) * court.apart + jitter(2);
                let mut pick = (seeded(number, row, column, 3) * f64::from(total)) as u32;
                let Some(&(name, _)) = court.pieces.iter().find(|&&(_, often)| {
                    let found = pick < often;
                    pick = pick.saturating_sub(often);
                    found
                }) else {
                    continue;
                };
                let Some(module) = number_of(name).and_then(|at| all().get(at as usize)) else { continue };
                let at = frame.at(toward, across);
                let nearest = lines
                    .iter()
                    .map(|&line| {
                        let along = [line[1][0] - line[0][0], line[1][1] - line[0][1]];
                        let length = (along[0] * along[0] + along[1] * along[1]).max(1e-9);
                        let share = (((at[0] - line[0][0]) * along[0] + (at[1] - line[0][1]) * along[1]) / length)
                            .clamp(0.0, 1.0);
                        [line[0][0] + along[0] * share, line[0][1] + along[1] * share]
                    })
                    .min_by(|one, two| {
                        libm::hypot(one[0] - at[0], one[1] - at[1])
                            .total_cmp(&libm::hypot(two[0] - at[0], two[1] - at[1]))
                    });
                let Some(nearest) = nearest else { continue };
                let facing = faced(frame, [nearest[0] - at[0], nearest[1] - at[1]]);
                let rect = footprint(module.size, at, facing);
                let clear = corners(rect).iter().all(|&corner| {
                    inside(ring, corner)
                        && (0..ring.len()).all(|edge| {
                            point_to_segment(corner, [ring[edge], ring[(edge + 1) % ring.len()]]) >= FROM_EDGE_M
                        })
                }) && lines.iter().all(|&line| segment_to_rect(line, rect) >= CLEAR_M + PAST_WAY_M)
                    && ways.points.iter().all(|point| point_to_rect(point.at, rect) >= FROM_POINT_M)
                    && posts.iter().all(|post| point_to_rect(post.at, rect) >= FROM_POST_M)
                    && post_lines.iter().all(|&line| segment_to_rect(line, rect) >= OFF_POST_LINE_M)
                    && arrivals.iter().all(|&arrival| point_to_rect(arrival, rect) >= FROM_ARRIVAL_M)
                    && laid.spots.iter().all(|&spot| point_to_rect(spot, rect) >= FROM_ARRIVAL_M)
                    && counters.iter().all(|&counter| point_to_rect(counter, rect) >= FROM_COUNTER_M)
                    && standing.iter().all(|&other| rect_gap(rect, other) >= FROM_STANDING_M)
                    && placed.iter().all(|&other| rect_gap(rect, other) >= BETWEEN_M);
                if !clear {
                    continue;
                }
                let Some(stood) = stand_at(name, "front", at, frame.level, facing) else { continue };
                placed.push(rect);
                laid.piece(Some(stood.clone()));
                dressed.push(Dressed { name, stood });
            }
        }
    }
    dressed
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
