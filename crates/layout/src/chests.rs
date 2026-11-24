//! The places a patrol's chests may stand, after Destiny 1's loot chests: tucked against something tall (a building, a
//! ruin's wall, a rock, a tent, a stack of crates, a lookout's parapet) in each place a body comes to, never on a way,
//! and spread apart, so a player finds one by looking round a place rather than down a road. A patrol's room stands
//! a few chests at a time at places drawn among these (`room::finds`).

use crate::collide::Box3;
use crate::field::{Field, distance, ring_holds};
use crate::paths::{Path, off_line};
use crate::plantings::Planting;
use crate::seat::Seated;
use crate::sites::{Site, SiteKind};
use land::exact::rand01;

/// How far a chest's middle stands out from the face it is tucked against, metres: its half depth (0.29, the event
/// chest's, `tools/modules/chest.py`) and the 0.4 its lid swings back past its back as it opens, and a hand.
pub const OUT_M: f64 = 0.75;
/// Half its width along the face and half its depth, with a hand's room round it, metres.
const HALF_WIDE_M: f64 = 0.55;
const HALF_DEEP_M: f64 = 0.4;
/// How tall what it is tucked against stands over the ground at least, metres: taller than the chest by a body's
/// half, so it reads as tucked behind something.
const ANCHOR_TALL_M: f64 = 1.0;
/// How far from a way's edge a chest stands at least, and from a building a body walks into (whose doors it keeps
/// clear of) and any other, metres.
const OFF_WAYS_M: f64 = 1.5;
const OFF_ROOMS_M: f64 = 1.5;
const OFF_BUILDINGS_M: f64 = 0.1;
/// How far it keeps from a planting's stem, and how much its ground may rise or fall under its corners, metres.
const PLANTING_M: f64 = 1.0;
const LEVEL_M: f64 = 0.2;
/// How far apart two chest places stand, and how far each stands from a resource place, a beacon and a spawn, metres.
const APART_M: f64 = 25.0;
const FROM_SITES_M: f64 = 10.0;
const FROM_SPAWNS_M: f64 = 15.0;
/// How many places a place of the layout holds at most, how far round a lookout its places lie, and how many a layout
/// holds in all.
const EACH_MOST: usize = 2;
const LOOKOUT_REACH_M: f64 = 10.0;
pub const PLACES_MOST: usize = 24;

/// Where the layout's things stand, as the chests' places keep clear of them.
#[derive(Debug, Clone, Copy)]
pub struct Standing<'a> {
    pub boxes: &'a [Box3],
    pub buildings: &'a [Seated],
    pub props: &'a [Seated],
    pub plantings: &'a [Planting],
    pub paths: &'a [Path],
    pub spawns: &'a [[f64; 2]],
}

/// A place of the layout a body comes to, round which its chests lie: its middle and its reach.
#[derive(Debug, Clone, Copy)]
pub struct Round {
    pub at: [f64; 2],
    pub reach: f64,
}

/// The chests' places as sites, each with the way its front faces (radians clockwise from north): round each of
/// `rounds` in turn, at most EACH_MOST, drawn on `seed`, and PLACES_MOST in all.
#[must_use]
pub fn mark(
    rounds: &[Round],
    field: &Field,
    ring: &[[f64; 2]],
    standing: Standing<'_>,
    (sites, floor): (&[Site], &dyn Fn(f64, f64) -> f64),
    seed: u32,
) -> Vec<Site> {
    let mut placed: Vec<Site> = Vec::new();
    let kept_from: Vec<[f64; 2]> = sites
        .iter()
        .filter(|site| matches!(site.kind, SiteKind::Resource | SiteKind::Beacon))
        .flat_map(|site| std::iter::once(site.at).chain(site.node))
        .collect();
    for (number, round) in rounds.iter().enumerate() {
        let reach = round.reach + HALF_WIDE_M;
        let anchors: Vec<&Box3> = standing
            .boxes
            .iter()
            .filter(|anchor| {
                let middle = [(anchor[0] + anchor[2]) / 2.0, (anchor[1] + anchor[3]) / 2.0];
                distance(middle, round.at) <= reach && anchor[4] - floor(middle[0], middle[1]) >= ANCHOR_TALL_M
            })
            .collect();
        let near: Vec<&Box3> =
            standing.boxes.iter().filter(|other| touches(other, round.at, reach + HALF_WIDE_M + 4.0)).collect();
        // Each anchor's four faces, tried in an order drawn for the place, so two places of a kind differ.
        let mut tries: Vec<(f64, [f64; 2], u8)> = anchors
            .iter()
            .enumerate()
            .flat_map(|(nth, anchor)| {
                faces(anchor).into_iter().enumerate().map(move |(face, try_at)| (nth, face, try_at))
            })
            .map(|(nth, face, (at, facing))| {
                let key = rand01(seed, &[0x0C4E_5700, number as i64, nth as i64, face as i64]);
                (key, at, facing)
            })
            .collect();
        tries.sort_by(|first, second| first.0.total_cmp(&second.0));
        let mut here = 0;
        for (_, at, facing) in tries {
            if here == EACH_MOST || placed.len() == PLACES_MOST {
                break;
            }
            let apart = placed.iter().all(|other| distance(other.at, at) >= APART_M)
                && kept_from.iter().all(|&other| distance(other, at) >= FROM_SITES_M)
                && standing.spawns.iter().all(|&spawn| distance(spawn, at) >= FROM_SPAWNS_M);
            if apart && distance(at, round.at) <= reach && fits(at, facing, field, ring, standing, (&near, floor)) {
                let facing = Some(f64::from(facing) * core::f64::consts::FRAC_PI_2);
                placed.push(Site { kind: SiteKind::Chest, at, radius: HALF_WIDE_M, holds: None, node: None, facing });
                here += 1;
            }
        }
    }
    placed
}

/// Whether a box reaches within `reach` of a point, across.
fn touches(other: &Box3, at: [f64; 2], reach: f64) -> bool {
    at[0] > other[0] - reach && at[0] < other[2] + reach && at[1] > other[1] - reach && at[1] < other[3] + reach
}

/// A chest's place before each face of a box, OUT_M out from its middle, and the quarter turns clockwise from north
/// its front faces, away from the box.
fn faces(anchor: &Box3) -> [([f64; 2], u8); 4] {
    let [west, north, east, south, ..] = *anchor;
    let (middle_x, middle_y) = ((west + east) / 2.0, (north + south) / 2.0);
    [
        ([middle_x, north - OUT_M], 0),
        ([east + OUT_M, middle_y], 1),
        ([middle_x, south + OUT_M], 2),
        ([west - OUT_M, middle_y], 3),
    ]
}

/// Whether a chest stands at `at` facing `quarters` turns from north: inside the ring on dry, level, open land, its box and a hand round it
/// clear of every box and prop standing over its ground, OFF_WAYS_M off every way's edge and clear of every planting.
fn fits(
    at: [f64; 2],
    quarters: u8,
    field: &Field,
    ring: &[[f64; 2]],
    standing: Standing<'_>,
    (near, floor): (&[&Box3], &dyn Fn(f64, f64) -> f64),
) -> bool {
    let [x, y] = at;
    let open = field.cell_of(x, y).is_some_and(|(column, row)| field.walkable(field.index(column, row)));
    if !open || !ring_holds(ring, x, y) {
        return false;
    }
    // Across a north or south face it lies wide east to west; across an east or west face, north to south.
    let across = quarters % 2 == 1;
    let (half_x, half_y) = if across { (HALF_DEEP_M, HALF_WIDE_M) } else { (HALF_WIDE_M, HALF_DEEP_M) };
    let ground = floor(x, y);
    let corners =
        [[x - half_x, y - half_y], [x + half_x, y - half_y], [x + half_x, y + half_y], [x - half_x, y + half_y]];
    if corners.iter().any(|&[corner_x, corner_y]| (floor(corner_x, corner_y) - ground).abs() > LEVEL_M) {
        return false;
    }
    let chest = [x - half_x, y - half_y, x + half_x, y + half_y];
    let overlaps = |[west, north, east, south]: [f64; 4]| {
        west < chest[2] && east > chest[0] && north < chest[3] && south > chest[1]
    };
    let boxed = near.iter().any(|other| {
        overlaps([other[0], other[1], other[2], other[3]]) && other[5] < ground + 1.0 && other[4] > ground + 0.05
    });
    let propped = standing.props.iter().any(|prop| overlaps(prop.footprint));
    let housed = standing.buildings.iter().any(|building| {
        let off = if building.open { OFF_ROOMS_M } else { OFF_BUILDINGS_M };
        let [west, north, east, south] = building.footprint;
        overlaps([west - off, north - off, east + off, south + off])
    });
    let on_way = standing.paths.iter().any(|path| {
        let reach = path.tier.width() / 2.0 + OFF_WAYS_M + HALF_WIDE_M;
        path.points.windows(2).any(|pair| off_line(at, pair[0], pair[1]) < reach)
    });
    let planted =
        standing.plantings.iter().flat_map(|planting| &planting.points).any(|&point| distance(point, at) < PLANTING_M);
    !(boxed || propped || housed || on_way || planted)
}

/// The places round which a layout's chests lie: each area a body comes to but its landing, gates and way in, the
/// lookout atop each climb, and each run's beats.
#[must_use]
pub fn rounds_of(areas: &[crate::areas::Area], climbs: &[[f64; 7]], runs: &[crate::runs::Run]) -> Vec<Round> {
    use crate::brief::AreaKind;
    let kept =
        areas.iter().filter(|area| !matches!(area.kind, AreaKind::Landing | AreaKind::Gate | AreaKind::Entrance));
    let lookouts =
        crate::carve::lookouts(climbs).map(|pair| Round { at: [pair[1][0], pair[1][1]], reach: LOOKOUT_REACH_M });
    let beats = runs.iter().flat_map(|run| run.beats.iter().map(|beat| Round { at: beat.at, reach: beat.radius }));
    kept.map(|area| Round { at: area.at, reach: area.radius }).chain(lookouts).chain(beats).collect()
}
