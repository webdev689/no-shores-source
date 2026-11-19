//! The heights a zone's places stand at where its brief asks for them (`heights`), and its ways graded between them as
//! one network. An area's floor stands at a level by its kind, as a share of the massif's height: the land's own level
//! for what meets the sea, the river or a gorge out and for what lies sunk; higher for what is built to be looked up
//! to. A way holds the lower of its two places' levels and ramps up near the higher, so a place up high stands on its
//! platform over the ways, a way between two places up high runs along a causeway, and one between two places down
//! low keeps down; no stretch of any way climbs steeper than a track may, and ways side by side stand at one level.

use crate::areas::Area;
use crate::basins::Basin;
use crate::brief::{AreaKind, Brief};
use crate::field::distance;
use crate::paths::{Path, off_line};

/// How near two points of different ways must lie to be held at one level, metres.
const BESIDE_M: f64 = 10.0;
/// The steepest a way climbs to a place over it, a rise a metre: under a track's 0.18 where the massif's local height
/// stands its highest, 1.15 times its own.
const STEEPEST: f64 = 0.14;

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
        | AreaKind::Cave => 0.0,
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

/// The level of each point of each way, as a share of the massif's height (`rise` metres): an area's where the point lies
/// on its basin's floor; else the lower of its way's two areas' levels (`joined`), raised wherever a higher point lies
/// near enough along the ways that the way would climb steeper than `STEEPEST` from it, so it ramps up to it instead,
/// and lowered likewise toward a place lower than it. Points of different ways within 10 m are joined, so ways side by
/// side stand within a walkable slope of one another.
#[must_use]
pub fn graded(paths: &[Path], joined: &[[usize; 2]], basins: &[Basin], (levels, rise): (&[f64], f64)) -> Vec<Vec<f64>> {
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
    let held: Vec<Option<f64>> = points
        .iter()
        .map(|&at| {
            let on = |basin: &Basin| {
                basin.floors.iter().any(|&[x1, y1, x2, y2, half]| off_line(at, [x1, y1], [x2, y2]) <= half)
            };
            basins.iter().zip(levels).find(|(basin, _)| on(basin)).map(|(_, &level)| level)
        })
        .collect();
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
    paths.iter().zip(&starts).map(|(path, &start)| level[start..start + path.points.len()].to_vec()).collect()
}

/// The level of the floor under a point, as a share of the massif's height: the raised floor's there where one is
/// nearer than any floor at the land's own level, else 0.
pub(crate) fn share_at(floors: &[[f64; 5]], raised: &[[f64; 7]], at: [f64; 2]) -> f64 {
    let floor = floors
        .iter()
        .map(|&[x1, y1, x2, y2, half]| off_line(at, [x1, y1], [x2, y2]) - half)
        .fold(f64::INFINITY, f64::min);
    let nearest = raised.iter().map(|&[x1, y1, x2, y2, half, from, to]| {
        let (from_end, to_end) = (distance(at, [x1, y1]), distance(at, [x2, y2]));
        let along = if from_end + to_end > 0.0 { from_end / (from_end + to_end) } else { 0.0 };
        (off_line(at, [x1, y1], [x2, y2]) - half, from + (to - from) * along)
    });
    nearest
        .filter(|&(off, _)| off < floor)
        .min_by(|first, second| first.0.total_cmp(&second.0))
        .map_or(0.0, |(_, share)| share)
}

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
    use crate::paths::Tier;

    fn way(points: &[[f64; 2]]) -> Path {
        Path { tier: Tier::Track, points: points.to_vec(), crossings: Vec::new(), heights: Vec::new() }
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
        let graded = graded(&[way(&straight(0.0))], &[[0, 1]], &basins, (&[0.1, 0.6], 28.0));
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
    fn a_way_between_two_places_up_high_keeps_up() {
        let basins = [basin_at([0.0, 0.0]), basin_at([200.0, 0.0])];
        let graded = graded(&[way(&straight(0.0))], &[[0, 1]], &basins, (&[0.6, 0.6], 28.0));
        assert!(graded[0].iter().all(|level| (level - 0.6).abs() < 1e-9), "{:?}", graded[0]);
    }

    #[test]
    fn ways_side_by_side_stand_at_one_level() {
        let basins = [basin_at([0.0, 0.0]), basin_at([200.0, 0.0]), basin_at([0.0, 6.0])];
        let ways = [way(&straight(0.0)), way(&straight(6.0))];
        let graded = graded(&ways, &[[0, 1], [2, 1]], &basins, (&[0.0, 0.6, 0.0], 28.0));
        for (one, other) in graded[0].iter().zip(&graded[1]) {
            assert!((one - other).abs() * 28.0 <= STEEPEST * 6.0 + 1e-9, "{one} beside {other}");
        }
    }

    #[test]
    fn a_brief_without_heights_keeps_every_area_at_the_land_level() {
        let area = |kind| Area { kind, name: String::new(), at: [0.0, 0.0], radius: 40.0, leads_to: None };
        let areas = [area(AreaKind::Keep), area(AreaKind::Hamlet)];
        let mut brief = crate::brief::Briefs::default().of("none", land::sites::NodeKind::Patrol);
        assert_eq!(levels(&areas, &brief), vec![0.0, 0.0]);
        brief.heights = true;
        assert_eq!(levels(&areas, &brief), vec![level_of(AreaKind::Keep), level_of(AreaKind::Hamlet)]);
    }
}
