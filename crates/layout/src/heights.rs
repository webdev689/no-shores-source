//! The heights a zone's places stand at where its brief asks for them (`heights`), and its ways graded between them as
//! one network. An area's floor stands at a level by its kind, as a share of the massif's height: the land's own level
//! for what meets the sea, the river or a gorge out and for what lies sunk; higher for what is built to be looked up
//! to. Every point of every way takes the blend of the levels round it along the ways, so a way runs evenly from one
//! place's level to the next, and ways that share or run beside one another stand at one level where they meet.

use crate::areas::Area;
use crate::basins::Basin;
use crate::brief::{AreaKind, Brief};
use crate::field::distance;
use crate::paths::{Path, off_line};

/// How near two points of different ways must lie to be held at one level, metres.
const BESIDE_M: f64 = 10.0;
/// How strongly two ways side by side are held together, against a neighbour along the way one metre off.
const BESIDE_PULL: f64 = 4.0;
/// How many times the levels are relaxed toward their neighbours' at the most, and the change that counts as settled.
const RELAXATIONS: usize = 4000;
const SETTLED: f64 = 1e-9;

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

/// The level of each point of each way: an area's where the point lies on its basin's floor, and elsewhere the blend of
/// its neighbours', those before and after it along its way (weighted by how near) and every other way's points within
/// 10 m, relaxed until it settles. A point no area holds and no way leads to one from stays at the land's own level.
#[must_use]
pub fn graded(paths: &[Path], basins: &[Basin], levels: &[f64]) -> Vec<Vec<f64>> {
    let points: Vec<[f64; 2]> = paths.iter().flat_map(|path| path.points.iter().copied()).collect();
    let starts: Vec<usize> = paths
        .iter()
        .scan(0, |start, path| {
            let at = *start;
            *start += path.points.len();
            Some(at)
        })
        .collect();
    let held: Vec<Option<f64>> = points
        .iter()
        .map(|&at| {
            let on = |basin: &Basin| {
                basin.floors.iter().any(|&[x1, y1, x2, y2, half]| off_line(at, [x1, y1], [x2, y2]) <= half)
            };
            basins.iter().zip(levels).find(|(basin, _)| on(basin)).map(|(_, &level)| level)
        })
        .collect();
    let mut neighbours: Vec<Vec<(usize, f64)>> = vec![Vec::new(); points.len()];
    for (path, &start) in paths.iter().zip(&starts) {
        for index in 1..path.points.len() {
            let (before, at) = (start + index - 1, start + index);
            let pull = 1.0 / distance(points[before], points[at]).max(0.5);
            neighbours[before].push((at, pull));
            neighbours[at].push((before, pull));
        }
    }
    let way_of = |point: usize| starts.iter().rposition(|&start| start <= point).unwrap_or(0);
    for first in 0..points.len() {
        for second in first + 1..points.len() {
            if way_of(first) != way_of(second) && distance(points[first], points[second]) <= BESIDE_M {
                neighbours[first].push((second, BESIDE_PULL));
                neighbours[second].push((first, BESIDE_PULL));
            }
        }
    }
    let mut level: Vec<f64> = held.iter().map(|held| held.unwrap_or(0.0)).collect();
    for _ in 0..RELAXATIONS {
        let mut moved: f64 = 0.0;
        for point in 0..points.len() {
            if held[point].is_some() || neighbours[point].is_empty() {
                continue;
            }
            let (sum, weight) = neighbours[point]
                .iter()
                .fold((0.0, 0.0), |(sum, weight), &(other, pull)| (sum + level[other] * pull, weight + pull));
            let next = sum / weight;
            moved = moved.max((next - level[point]).abs());
            level[point] = next;
        }
        if moved < SETTLED {
            break;
        }
    }
    paths.iter().zip(&starts).map(|(path, &start)| level[start..start + path.points.len()].to_vec()).collect()
}
