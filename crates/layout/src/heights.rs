//! The heights a zone's places stand at where its brief asks for them (`heights`), and its ways graded between them as
//! one network. An area's floor stands at a level by its kind, as a share of the massif's height: the land's own level
//! for what meets the sea, the river or a gorge out and for what lies sunk; higher for what is built to be looked up
//! to. A way holds the lower of its two places' levels and ramps up near the higher, so a place up high stands on its
//! platform over the ways, a way between two places up high runs along a causeway, and one between two places down
//! low keeps down; no stretch of any way climbs steeper than a track may but where two floors stand too near along it
//! (then a ramp's steepest), and ways side by side stand at one level.

use crate::areas::Area;
use crate::brief::{AreaKind, Brief};
use crate::field::distance;
use crate::paths::{Path, off_line};

/// How near two points of different ways must lie to be held at one level, metres.
const BESIDE_M: f64 = 10.0;
/// How far from a river crossing's banks a way is held at the land's own level, metres: past where the river's banks
/// blend into the land.
const CROSSING_HELD_M: f64 = land::ground::BANK_M + 2.0;
/// The steepest a way climbs to a place over it, a rise a metre: under a track's 0.18 where the massif's local height
/// stands its highest, 1.15 times its own.
pub const STEEPEST: f64 = 0.14;

/// The level an area's floor stands at by its kind, as a share of the massif's height.
#[must_use]
pub const fn level_of(kind: AreaKind) -> f64 {
    match kind {
        AreaKind::Landing
        | AreaKind::Entrance
        | AreaKind::Gate
        | AreaKind::Dock
        | AreaKind::Wreck
        | AreaKind::Hulks
        | AreaKind::Causeway
        | AreaKind::Bones
        | AreaKind::Mill
        | AreaKind::Quarry
        | AreaKind::Graveyard
        | AreaKind::Coven
        | AreaKind::Cave
        | AreaKind::Plot
        | AreaKind::Breach => 0.0,
        AreaKind::Wilds | AreaKind::Arena => 0.2,
        AreaKind::Farm => 0.25,
        AreaKind::Hamlet => 0.35,
        AreaKind::Camp => 0.4,
        AreaKind::Ruin => 0.45,
        AreaKind::Shrine => 0.55,
        AreaKind::Tower | AreaKind::Lighthouse => 0.6,
        AreaKind::Keep => 0.7,
    }
}

/// Each area's level: its brief's, where the brief names one for it, else its kind's; every area at the land's own
/// level where the brief does not ask for heights.
#[must_use]
pub fn levels(areas: &[Area], brief: &Brief) -> Vec<f64> {
    areas
        .iter()
        .map(|area| {
            if !brief.heights {
                return 0.0;
            }
            let named = brief.areas.iter().find(|wanted| wanted.kind == area.kind && wanted.name == area.name);
            named.and_then(|wanted| wanted.level).map_or_else(|| level_of(area.kind), |level| f64::from(level) / 100.0)
        })
        .collect()
}

/// The level of each point of each way, as a share of the massif's height (`rise` metres): the floor's (`held_at`) where
/// the point lies on an area's basin; else the lower of its way's two areas' levels (`joined`), raised wherever a higher point lies
/// near enough along the ways that the way would climb steeper than `STEEPEST` from it, so it ramps up to it instead,
/// and lowered likewise toward a place lower than it. Points of different ways within 10 m are joined, so ways side by
/// side stand within a walkable slope of one another.
#[must_use]
pub fn graded(
    paths: &[Path],
    joined: &[[usize; 2]],
    held_at: &dyn Fn([f64; 2]) -> Option<f64>,
    (levels, rise): (&[f64], f64),
) -> Vec<Vec<f64>> {
    let points: Vec<[f64; 2]> = paths.iter().flat_map(|path| path.points.iter().copied()).collect();
    let starts: Vec<usize> = paths
        .iter()
        .scan(0, |start, path| {
            let at = *start;
            *start += path.points.len();
            Some(at)
        })
        .collect();
    let way_of = |point: usize| starts.iter().rposition(|&start| start <= point).unwrap_or(0);
    // A way crossing a river comes down to the land's own level at its bridge, where the river keeps its banks
    // whatever the carving round it; elsewhere a point is held where `held_at` holds it.
    let crossing = |at: [f64; 2]| {
        paths
            .iter()
            .flat_map(|path| &path.crossings)
            .any(|&[first, second]| off_line(at, first, second) <= CROSSING_HELD_M)
    };
    let held: Vec<Option<f64>> = points.iter().map(|&at| if crossing(at) { Some(0.0) } else { held_at(at) }).collect();
    let lower = |way: usize| joined.get(way).map_or(0.0, |&[from, to]| levels[from].min(levels[to]));
    let mut level: Vec<f64> =
        (0..points.len()).map(|point| held[point].unwrap_or_else(|| lower(way_of(point)))).collect();
    let mut neighbours: Vec<Vec<(usize, f64)>> = vec![Vec::new(); points.len()];
    let mut link = |first: usize, second: usize| {
        let apart = distance(points[first], points[second]);
        neighbours[first].push((second, apart));
        neighbours[second].push((first, apart));
    };
    for (path, &start) in paths.iter().zip(&starts) {
        for index in 1..path.points.len() {
            link(start + index - 1, start + index);
        }
    }
    for first in 0..points.len() {
        for second in first + 1..points.len() {
            if way_of(first) != way_of(second) && distance(points[first], points[second]) <= BESIDE_M {
                link(first, second);
            }
        }
    }
    // Each point raised to no less than any point's level less the steepest climb over the way between them: the
    // highest first, as a shortest-path search spreads its nearest first.
    let fall = STEEPEST / rise.max(1.0);
    let mut queue: std::collections::BinaryHeap<Raised> =
        level.iter().enumerate().map(|(point, &share)| Raised(share, point)).collect();
    while let Some(Raised(share, point)) = queue.pop() {
        if share < level[point] {
            continue;
        }
        for &(other, apart) in &neighbours[point] {
            let reached = share - fall * apart;
            if held[other].is_none() && reached > level[other] + 1e-12 {
                level[other] = reached;
                queue.push(Raised(reached, other));
            }
        }
    }
    // And lowered to no more than any held point's level plus the steepest climb over the way from it, so a way passing
    // a place lower than itself falls to it instead of stepping down at its edge.
    let mut ceiling: Vec<f64> = held.iter().map(|held| held.unwrap_or(f64::INFINITY)).collect();
    let mut lowest: std::collections::BinaryHeap<std::cmp::Reverse<Raised>> = (0..points.len())
        .filter_map(|point| held[point].map(|share| std::cmp::Reverse(Raised(share, point))))
        .collect();
    while let Some(std::cmp::Reverse(Raised(share, point))) = lowest.pop() {
        if share > ceiling[point] {
            continue;
        }
        for &(other, apart) in &neighbours[point] {
            let reached = share + fall * apart;
            if reached < ceiling[other] - 1e-12 {
                ceiling[other] = reached;
                lowest.push(std::cmp::Reverse(Raised(reached, other)));
            }
        }
    }
    for point in (0..points.len()).filter(|&point| held[point].is_none()) {
        level[point] = level[point].min(ceiling[point]);
    }
    // Where two floors stand too near along the ways for one to be climbed to from the other at `STEEPEST`, the
    // lowering leaves a step at the higher one's edge: the way climbs the rest to it as a ramp, raised again to no less
    // than each floor's level less a basin's ramp's steepest climb from it (`ramps` takes it as a ramp to carve).
    let ramp_fall = crate::basins::RAMP_STEEPEST / rise.max(1.0);
    let mut ramped: Vec<f64> = held.iter().map(|held| held.unwrap_or(f64::NEG_INFINITY)).collect();
    let mut queue: std::collections::BinaryHeap<Raised> =
        held.iter().enumerate().filter_map(|(point, held)| held.map(|share| Raised(share, point))).collect();
    while let Some(Raised(share, point)) = queue.pop() {
        if share < ramped[point] {
            continue;
        }
        for &(other, apart) in &neighbours[point] {
            let reached = share - ramp_fall * apart;
            if held[other].is_none() && reached > ramped[other] + 1e-12 && reached > level[other] {
                ramped[other] = reached;
                queue.push(Raised(reached, other));
            }
        }
    }
    for point in (0..points.len()).filter(|&point| held[point].is_none()) {
        level[point] = level[point].max(ramped[point]);
    }
    paths.iter().zip(&starts).map(|(path, &start)| level[start..start + path.points.len()].to_vec()).collect()
}

/// The stretches of a graded way (its points and their levels, shares of a massif `rise` metres high) that climb
/// steeper than `STEEPEST`, where two floors stand too near along it (`graded`), and the stretch either side where the
/// climb eases into the way's own: each a ramp of a basin's, from one point to the next with its two levels.
#[must_use]
pub fn ramps(points: &[[f64; 2]], levels: &[f64], rise: f64) -> Vec<[f64; 7]> {
    let steepest = STEEPEST / rise.max(1.0) * 1.01;
    let steep = |at: usize| {
        let (from, to) = (at, at + 1);
        to < points.len() && (levels[to] - levels[from]).abs() > steepest * distance(points[from], points[to])
    };
    (0..points.len().saturating_sub(1))
        .filter(|&at| steep(at) || (at > 0 && steep(at - 1)) || steep(at + 1))
        .map(|at| {
            let (from, to, half) = (points[at], points[at + 1], crate::basins::RAMP_HALF_M);
            [from[0], from[1], to[0], to[1], half, levels[at], levels[at + 1]]
        })
        .collect()
}

/// How far along a capsule's line a point lies, 0 at its first end to 1 at its second, as the land reads a capsule's
/// level: the point's nearest on the line.
fn along(from: [f64; 2], to: [f64; 2], at: [f64; 2]) -> f64 {
    let (span_x, span_y) = (to[0] - from[0], to[1] - from[1]);
    let length = span_x * span_x + span_y * span_y;
    if length > 0.0 {
        (((at[0] - from[0]) * span_x + (at[1] - from[1]) * span_y) / length).clamp(0.0, 1.0)
    } else {
        0.0
    }
}

/// The level of the floor under a point, as a share of the massif's height: the raised floor's there where one is
/// nearer than any floor at the land's own level, else 0.
pub(crate) fn share_at(floors: &[[f64; 5]], raised: &[[f64; 7]], at: [f64; 2]) -> f64 {
    let floor = floors
        .iter()
        .map(|&[x1, y1, x2, y2, half]| off_line(at, [x1, y1], [x2, y2]) - half)
        .fold(f64::INFINITY, f64::min);
    let nearest = raised.iter().map(|&[x1, y1, x2, y2, half, from, to]| {
        (off_line(at, [x1, y1], [x2, y2]) - half, from + (to - from) * along([x1, y1], [x2, y2], at))
    });
    nearest
        .filter(|&(off, _)| off < floor)
        .min_by(|first, second| first.0.total_cmp(&second.0))
        .map_or(0.0, |(_, share)| share)
}

/// Each basin's floors as carved, at its area's level: at the land's own level as `floors`, else as raised floors
/// (`raised`); with heights a ruin's tiered, but for a spoke a way runs on past its plaza (`walked_spokes`), which
/// keeps the plaza's level so the way crosses no tier's edge. Returns them all, with their levels, as the ways' grading
/// holds them.
pub fn floors_of(
    basins: &[crate::basins::Basin],
    (areas, paths): (&[Area], &[Path]),
    (levels, rise, heights): (&[f64], f64, bool),
    (floors, raised): (&mut Vec<[f64; 5]>, &mut Vec<[f64; 7]>),
) -> Vec<[f64; 7]> {
    let mut held: Vec<[f64; 7]> = Vec::new();
    for ((basin, &level), area) in basins.iter().zip(levels).zip(areas) {
        let tiered = heights && area.kind == AreaKind::Ruin;
        // A tiered ruin's bowl is a plaza at its middle.
        let plaza = basin.floors.first().map_or(0.0, |floor| floor[4].min(area.radius * 0.55));
        let walked = if tiered { walked_spokes(&basin.floors, area.at, plaza, paths) } else { Vec::new() };
        for (number, &[x1, y1, x2, y2, half]) in basin.floors.iter().enumerate() {
            let (near, far) = if distance([x1, y1], area.at) <= distance([x2, y2], area.at) {
                ([x1, y1], [x2, y2])
            } else {
                ([x2, y2], [x1, y1])
            };
            let length = distance(near, far);
            let at = |along: f64| {
                let share = if length > 0.0 { along / length } else { 0.0 };
                [near[0] + (far[0] - near[0]) * share, near[1] + (far[1] - near[1]) * share]
            };
            let flat = plaza.min(length * 0.4);
            let capsules = if tiered && number > 0 && !walked.contains(&number) {
                // Each spoke runs on at the plaza's level to its edge, then a ramp up or down, at the steepest a track
                // takes, to a flat tier where its block stands, so no building is tilted across a slope; a spoke too
                // short for its ramp takes a lower tier. The tier reaches past the spoke's own reach, so what stands on
                // it keeps room before its doors before its edge blends down into the plaza or the spoke beside it.
                let most = (length - flat) * 0.6 * STEEPEST / rise;
                let step = TIERS[(number - 1) % TIERS.len()].clamp(-most, most);
                let tier = (level + step).clamp(0.0, 0.95);
                let foot = flat + (tier - level).abs() * rise / STEEPEST;
                let [start, top] = [at(flat), at(foot)];
                vec![
                    [near[0], near[1], start[0], start[1], half, level, level],
                    [start[0], start[1], top[0], top[1], half, level, tier],
                    [top[0], top[1], far[0], far[1], half + TIER_ROOM_M, tier, tier],
                ]
            } else {
                let half = if tiered && number == 0 { plaza } else { half };
                vec![[near[0], near[1], far[0], far[1], half, level, level]]
            };
            for capsule in capsules {
                held.push(capsule);
                if capsule[5] > 0.0 || capsule[6] > 0.0 {
                    raised.push(capsule);
                } else {
                    floors.push([capsule[0], capsule[1], capsule[2], capsule[3], capsule[4]]);
                }
            }
        }
    }
    held
}

/// The spokes of a ruin's basin (its floors past the first, its plaza) a way runs on past the plaza: at each point a
/// way takes, every 4 m, the spoke whose line runs nearest of those it stands on, as the land reads a level.
fn walked_spokes(floors: &[[f64; 5]], middle: [f64; 2], plaza: f64, paths: &[Path]) -> Vec<usize> {
    let mut walked = Vec::new();
    for path in paths {
        for pair in path.points.windows(2) {
            let steps = (distance(pair[0], pair[1]) / 4.0).ceil().max(1.0);
            for step in 0..=steps as u32 {
                let share = f64::from(step) / steps;
                let at =
                    [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share];
                if distance(at, middle) <= plaza {
                    continue;
                }
                let on = floors
                    .iter()
                    .enumerate()
                    .skip(1)
                    .map(|(number, &[x1, y1, x2, y2, half])| (number, off_line(at, [x1, y1], [x2, y2]), half))
                    .filter(|&(_, off, half)| off <= half)
                    .min_by(|first, second| first.1.total_cmp(&second.1));
                if let Some((number, ..)) = on
                    && !walked.contains(&number)
                {
                    walked.push(number);
                }
            }
        }
    }
    walked
}

/// Each tiered ruin's spokes (with heights, a ruin's basin floors but its plaza), from its plaza to its tier's far end
/// and as wide as the tier: walked from the plaza, so the outcrops keep off them as off a way.
pub(crate) fn spokes(basins: &[crate::basins::Basin], areas: &[Area], heights: bool) -> Vec<[f64; 5]> {
    let ruins = basins.iter().zip(areas).filter(|(_, area)| heights && area.kind == AreaKind::Ruin);
    ruins
        .flat_map(|(basin, _)| basin.floors.iter().skip(1))
        .map(|&[x1, y1, x2, y2, half]| [x1, y1, x2, y2, half + TIER_ROOM_M])
        .collect()
}

/// The level of the basin floor under a point, as a share of the massif's height: of the capsule
/// (`[x1, y1, x2, y2, half, from, to]`) whose line runs nearest of those it lies on, as the land reads a level, at its
/// place along it; none off them all.
#[must_use]
pub fn on_capsules(capsules: &[[f64; 7]], at: [f64; 2]) -> Option<f64> {
    capsules
        .iter()
        .map(|capsule| (off_line(at, [capsule[0], capsule[1]], [capsule[2], capsule[3]]), capsule))
        .filter(|&(off, capsule)| off <= capsule[4])
        .min_by(|first, second| first.0.total_cmp(&second.0))
        .map(|(_, &[x1, y1, x2, y2, _, from, to])| from + (to - from) * along([x1, y1], [x2, y2], at))
}

/// The tiers a spoke of a raised ruin's basin rises or falls to from its middle, in turn, as shares of the massif's
/// height: so a ruin lies on broken ground.
pub const TIERS: [f64; 3] = [0.1, 0.2, -0.1];
/// How far a tier reaches past its spoke's own reach, metres: a doorway's step out and the blend of its edge.
const TIER_ROOM_M: f64 = 4.0;

/// A point's level waiting to be spread, highest first, ties by its place.
#[derive(Debug, Clone, Copy)]
struct Raised(f64, usize);

impl PartialEq for Raised {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == std::cmp::Ordering::Equal
    }
}

impl Eq for Raised {}

impl PartialOrd for Raised {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Raised {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.total_cmp(&other.0).then(other.1.cmp(&self.1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::basins::Basin;
    use crate::paths::Tier;

    fn way(points: &[[f64; 2]]) -> Path {
        Path { tier: Tier::Track, points: points.to_vec(), crossings: Vec::new(), heights: Vec::new() }
    }

    /// Each basin's floors held at its level.
    fn held_by(basins: &[Basin], levels: &[f64]) -> impl Fn([f64; 2]) -> Option<f64> {
        let capsules: Vec<[f64; 7]> = basins
            .iter()
            .zip(levels)
            .flat_map(|(basin, &level)| {
                basin.floors.iter().map(move |&[x1, y1, x2, y2, half]| [x1, y1, x2, y2, half, level, level])
            })
            .collect();
        move |at| on_capsules(&capsules, at)
    }

    fn basin_at(at: [f64; 2]) -> Basin {
        Basin { floors: vec![[at[0], at[1], at[0], at[1], 20.0]], terraces: Vec::new() }
    }

    /// A straight way of points every 10 m from (0, 0) to (200, 0).
    fn straight(south: f64) -> Vec<[f64; 2]> {
        (0..=20).map(|step| [f64::from(step) * 10.0, south]).collect()
    }

    #[test]
    fn a_way_holds_the_lower_places_level_and_ramps_up_to_the_higher() {
        let basins = [basin_at([0.0, 0.0]), basin_at([200.0, 0.0])];
        let held = held_by(&basins, &[0.1, 0.6]);
        let graded = graded(&[way(&straight(0.0))], &[[0, 1]], &held, (&[0.1, 0.6], 28.0));
        let levels = &graded[0];
        assert!((levels[0] - 0.1).abs() < 1e-9 && (levels[20] - 0.6).abs() < 1e-9, "each end at its area's level");
        for pair in levels.windows(2).skip(2).take(16) {
            let grade = (pair[1] - pair[0]).abs() * 28.0 / 10.0;
            assert!(grade <= STEEPEST + 1e-9, "no stretch climbs steeper than a track: {grade}");
        }
        assert!((levels[4] - 0.1).abs() < 1e-9, "away from the higher place the way keeps the lower's level");
        assert!(levels[17] > 0.45, "near the higher place it has ramped up: {}", levels[17]);
    }

    #[test]
    fn a_way_between_two_places_up_high_comes_down_to_the_land_at_a_river_it_crosses() {
        // 400 m between them, room for the ramp down from either (0.6 of 28 m at a track's steepest is 120 m).
        let basins = [basin_at([0.0, 0.0]), basin_at([400.0, 0.0])];
        let held = held_by(&basins, &[0.6, 0.6]);
        let points: Vec<[f64; 2]> = (0..=40).map(|step| [f64::from(step) * 10.0, 0.0]).collect();
        let crossing = Path { crossings: vec![[[196.0, 0.0], [204.0, 0.0]]], ..way(&points) };
        let graded = graded(&[crossing], &[[0, 1]], &held, (&[0.6, 0.6], 28.0));
        let levels = &graded[0];
        assert!(levels[20].abs() < 1e-9, "at the bridge the way stands at the land's level: {}", levels[20]);
        assert!((levels[0] - 0.6).abs() < 1e-9 && (levels[40] - 0.6).abs() < 1e-9, "each end at its place's level");
        for pair in levels.windows(2) {
            let grade = (pair[1] - pair[0]).abs() * 28.0 / 10.0;
            assert!(grade <= STEEPEST + 1e-9, "it ramps down and up no steeper than a track: {grade}");
        }
    }

    #[test]
    fn a_way_between_floors_too_near_for_a_tracks_climb_ramps_up_to_the_higher_with_no_step() {
        // 0.6 of 28 m is 16.8 m: 120 m at a track's steepest, and the floors' edges stand 100 m apart.
        let basins = [basin_at([0.0, 0.0]), basin_at([140.0, 0.0])];
        let held = held_by(&basins, &[0.0, 0.6]);
        let points: Vec<[f64; 2]> = (0..=14).map(|step| [f64::from(step) * 10.0, 0.0]).collect();
        let graded = graded(&[way(&points)], &[[0, 1]], &held, (&[0.0, 0.6], 28.0));
        let levels = &graded[0];
        for pair in levels.windows(2) {
            let grade = (pair[1] - pair[0]).abs() * 28.0 / 10.0;
            assert!(grade <= crate::basins::RAMP_STEEPEST + 1e-9, "no stretch climbs steeper than a ramp: {grade}");
        }
        let ramps = ramps(&points, levels, 28.0);
        assert!(!ramps.is_empty(), "the stretch steeper than a track's is a ramp");
        assert!(ramps.iter().all(|ramp| ramp[0] >= 60.0), "the ramp runs up to the higher floor: {ramps:?}");
    }

    #[test]
    fn a_way_between_two_places_up_high_keeps_up() {
        let basins = [basin_at([0.0, 0.0]), basin_at([200.0, 0.0])];
        let held = held_by(&basins, &[0.6, 0.6]);
        let graded = graded(&[way(&straight(0.0))], &[[0, 1]], &held, (&[0.6, 0.6], 28.0));
        assert!(graded[0].iter().all(|level| (level - 0.6).abs() < 1e-9), "{:?}", graded[0]);
    }

    #[test]
    fn ways_side_by_side_stand_at_one_level() {
        let basins = [basin_at([0.0, 0.0]), basin_at([200.0, 0.0]), basin_at([0.0, 6.0])];
        let ways = [way(&straight(0.0)), way(&straight(6.0))];
        let held = held_by(&basins, &[0.0, 0.6, 0.0]);
        let graded = graded(&ways, &[[0, 1], [2, 1]], &held, (&[0.0, 0.6, 0.0], 28.0));
        for (one, other) in graded[0].iter().zip(&graded[1]) {
            assert!((one - other).abs() * 28.0 <= STEEPEST * 6.0 + 1e-9, "{one} beside {other}");
        }
    }

    #[test]
    fn a_brief_without_heights_keeps_every_area_at_the_land_level() {
        let area =
            |kind| Area { kind, name: String::new(), at: [0.0, 0.0], radius: 40.0, leads_to: None, crosses: false };
        let areas = [area(AreaKind::Keep), area(AreaKind::Hamlet)];
        let mut brief = crate::brief::Briefs::default().of("none", land::sites::NodeKind::Patrol);
        assert_eq!(levels(&areas, &brief), vec![0.0, 0.0]);
        brief.heights = true;
        assert_eq!(levels(&areas, &brief), vec![level_of(AreaKind::Keep), level_of(AreaKind::Hamlet)]);
    }
}
