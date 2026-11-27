//! A patrol area's ways across to the other patrol areas of its island
//! ([[Each Island Has Three Regions, and Saltmere's Three Patrol Zones Stay, Linked]]), standing at the runs' ends
//! ([[The Ways Across Stand at the Runs' Ends, Not on the Landing]]): each at the end of the run lying most nearly
//! toward its zone, one run a zone. Where that run's sealed door is no passage's mouth, the door is the way across;
//! where it is one, the way across stands a second arch of the door's make in the run's end arena, clear of the run's
//! way, the mouth's reach and the objective's spot, facing into the arena. Each is an area (a gate marked `crosses`,
//! leading to its zone) and a gate site at the spot a player crossing from that zone stands, a step inside the end
//! arena, from which E reaches it.

use crate::Link;
use crate::areas::Area;
use crate::basins::Basin;
use crate::brief::AreaKind;
use crate::field::distance;
use crate::paths::off_line;
use crate::runs::{Run, WAY_CLEAR_M, half_of};
use crate::sites::{Site, SiteKind};
use serde::Deserialize;

/// How near a way across's spot a player stands to use it, metres: a passage mouth's reach (the client's
/// `MOUTH_REACH_M`), so the two never overlap where they share an end arena.
pub const REACH_M: f64 = 4.0;
/// How far inside the end arena from its door or arch a player crossing in stands, metres: a body's step.
const STEP_M: f64 = 2.0;
/// How far in from the end arena's rim a second arch stands, metres, so its frame keeps on the arena's floor.
const ARCH_IN_M: f64 = 3.5;
/// The headings round the end arena a second arch is tried at.
const ARCH_HEADINGS: u32 = 36;
/// How much further than its frame's half-depth a second arch keeps from the run's way, metres.
const ARCH_CLEAR_M: f64 = 0.5;
/// A door's and an arch's frame, metres: as wide as the door it holds and 3 m more, 1.6 m deep (run_kits.rs `door`).
const FRAME_DEPTH_M: f64 = 1.6;

/// Whether an area is a way across: a gate to another patrol area, as `add` marks it.
#[must_use]
pub fn is_crossing(area: &Area) -> bool {
    area.kind == AreaKind::Gate && area.crosses
}

/// A way across as planned before the runs are built: the patrol zone it leads to, the run it stands at the end of,
/// where a player stands to use it and arrives through it, and, where the run's door is a passage's mouth, the places
/// its second arch may stand, the best first (none where the door is the way across). The run's kit stands the arch
/// at the first its own pieces leave clear (run_kits.rs) and `at` is set to that one's spot.
#[derive(Debug, Clone, PartialEq)]
pub struct Across {
    pub leads_to: String,
    pub run: usize,
    pub at: [f64; 2],
    pub arches: Vec<Arch>,
}

/// A place a second arch may stand: its door spot and its facing (as a run's `door` and `facing`: out of the arena),
/// and the spot a player stands at to use it, a step in from it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Arch {
    pub door: [f64; 2],
    pub facing: [f64; 2],
    pub spot: [f64; 2],
}

/// An island's passages as far as the ways across read them: the patrol zone they web out from, and the runs whose
/// sealed doors are their mouths (`content/passages`, as the passage crate reads it).
#[derive(Deserialize)]
struct Mouths {
    patrol: String,
    mouths: Vec<String>,
}

const PASSAGES: [&str; 1] = [include_str!("../../../content/passages/saltmere.json")];

/// Whether the sealed door of the run `run` of patrol zone `zone` is a passage's mouth.
fn is_mouth(zone: &str, run: &str) -> bool {
    PASSAGES
        .iter()
        .filter_map(|text| serde_json::from_str::<Mouths>(text).ok())
        .any(|island| island.patrol == zone && island.mouths.iter().any(|mouth| mouth == run))
}

/// How far apart two bearings are, radians, 0 to pi.
fn apart(first: f64, second: f64) -> f64 {
    let turn = (first - second).rem_euclid(std::f64::consts::TAU);
    turn.min(std::f64::consts::TAU - turn)
}

/// The bearing from one point to another.
fn bearing(from: [f64; 2], to: [f64; 2]) -> f64 {
    libm::atan2(to[1] - from[1], to[0] - from[0])
}

/// Which run's end each other patrol zone's way across stands at: the run whose end arena, seen from the zone's
/// middle `middle`, lies at the bearing nearest the bearing to that zone's middle; the nearest pair of all is taken
/// first, and a run taken is no other zone's. A zone left with no run has no way across.
fn runs_of(middle: [f64; 2], links: &[Link], runs: &[Run]) -> Vec<(usize, usize)> {
    let ends: Vec<f64> = runs
        .iter()
        .map(|run| run.beats.last().map_or(run.door, |end| end.at))
        .map(|end| bearing(middle, end))
        .collect();
    let mut pairs: Vec<(f64, usize, usize)> = links
        .iter()
        .enumerate()
        .filter(|(_, link)| link.patrol)
        .flat_map(|(zone, link)| {
            let toward = bearing(middle, link.towards);
            ends.iter().enumerate().map(move |(run, &end)| (apart(toward, end), zone, run))
        })
        .collect();
    pairs.sort_by(|first, second| first.0.total_cmp(&second.0).then((first.1, first.2).cmp(&(second.1, second.2))));
    let mut taken: Vec<(usize, usize)> = Vec::new();
    for (_, zone, run) in pairs {
        if taken.iter().all(|&(other_zone, other_run)| other_zone != zone && other_run != run) {
            taken.push((zone, run));
        }
    }
    taken.sort_unstable();
    taken
}

/// A run's door's frame's width, metres (run_kits.rs `door`).
pub(crate) fn frame_width(run: &Run) -> f64 {
    (3.0 * half_of(run.kind)).max(5.5) + 3.0
}

/// How far a point lies from a run's way, its line and on to its door, metres.
fn off_way(run: &Run, at: [f64; 2]) -> f64 {
    run.way().windows(2).map(|pair| off_line(at, pair[0], pair[1])).fold(f64::INFINITY, f64::min)
}

/// A second arch in a run's end arena, the run's door being a passage's mouth: on the arena's floor, its frame clear
/// of the run's way by `WAY_CLEAR_M` and more, its spot's reach clear of the mouth's, facing the arena's middle (the
/// objective's spot); every heading that fits, the one whose spot lies furthest from the run's way first.
fn arches_of(run: &Run) -> Vec<Arch> {
    let Some(end) = run.beats.last() else { return Vec::new() };
    let half = frame_width(run) / 2.0;
    let fits = (0..ARCH_HEADINGS).filter_map(|heading| {
        let turn = std::f64::consts::TAU * f64::from(heading) / f64::from(ARCH_HEADINGS);
        let (sine, cosine) = land::exact::sin_cos(turn);
        let out = [sine, -cosine];
        let door = [end.at[0] + out[0] * (end.radius - ARCH_IN_M), end.at[1] + out[1] * (end.radius - ARCH_IN_M)];
        let spot = [door[0] - out[0] * STEP_M, door[1] - out[1] * STEP_M];
        // Its frame stands a metre out from its door spot, as a run's door's does.
        let frame = [door[0] + out[0], door[1] + out[1]];
        let across = [-out[1], out[0]];
        let ends = [-1.0, 1.0].map(|side| [frame[0] + across[0] * half * side, frame[1] + across[1] * half * side]);
        let clear = WAY_CLEAR_M + FRAME_DEPTH_M / 2.0 + ARCH_CLEAR_M;
        let off_frame = (0..=8)
            .map(|step| f64::from(step) / 8.0)
            .map(|share| {
                [ends[0][0] + (ends[1][0] - ends[0][0]) * share, ends[0][1] + (ends[1][1] - ends[0][1]) * share]
            })
            .map(|at| off_way(run, at))
            .fold(f64::INFINITY, f64::min);
        let frame_off_door = off_line(run.door, ends[0], ends[1]);
        let on_floor = ends.iter().all(|&corner| distance(corner, end.at) + FRAME_DEPTH_M / 2.0 <= end.radius);
        let fits = off_frame > clear
            && off_way(run, spot) > WAY_CLEAR_M
            && distance(spot, run.door) > 2.0 * REACH_M + 1.0
            && frame_off_door > REACH_M
            && on_floor;
        fits.then_some(Arch { door, facing: out, spot })
    });
    let mut fits: Vec<Arch> = fits.collect();
    fits.sort_by(|first, second| off_way(run, second.spot).total_cmp(&off_way(run, first.spot)));
    fits
}

/// The ways across of a patrol zone `zone` whose claim's middle is `middle`, at its runs' ends (`runs_of`).
#[must_use]
pub fn plan(zone: &str, middle: [f64; 2], links: &[Link], runs: &[Run]) -> Vec<Across> {
    runs_of(middle, links, runs)
        .into_iter()
        .filter_map(|(link, number)| {
            let run = &runs[number];
            let leads_to = links[link].id.clone();
            if is_mouth(zone, &run.name) {
                let arches = arches_of(run);
                // A run's end no arch fits in holds no way across.
                let at = arches.first().map(|arch| arch.spot);
                return at.map(|at| Across { leads_to, run: number, at, arches });
            }
            let at = [run.door[0] - run.facing[0] * STEP_M, run.door[1] - run.facing[1] * STEP_M];
            Some(Across { leads_to, run: number, at, arches: Vec::new() })
        })
        .collect()
}

/// Adds the ways across to a planned layout's areas (each with an empty basin, standing in a run's end arena) and
/// its sites, each a gate holding the zone it leads to.
pub fn add(across: &[Across], (areas, basins): (&mut Vec<Area>, &mut Vec<Basin>), sites: &mut Vec<Site>) {
    for way in across {
        let (at, radius, holds) = (way.at, REACH_M, Some(way.leads_to.clone()));
        sites.push(Site { kind: SiteKind::Gate, at, radius, holds: holds.clone(), node: None, facing: None });
        basins.push(Basin { floors: Vec::new(), terraces: Vec::new() });
        areas.push(Area { kind: AreaKind::Gate, name: String::new(), at, radius, leads_to: holds, crosses: true });
    }
}

#[cfg(test)]
#[path = "crossings_tests.rs"]
mod tests;
