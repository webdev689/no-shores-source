//! Where a layout's activities will stand, marked as it is laid out so the systems that come later (public events,
//! patrol beacons, resource nodes, foes) find their places ready: Destiny 1's patrol areas hold two to four beacons
//! and one or two event arenas each, and something worth stopping for every couple of hundred metres.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::{Field, Water, distance};
use crate::paths::Path;
use crate::seat::Seating;
use land::exact::rand01;
use serde::Serialize;

/// What a site is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SiteKind {
    /// Where players come ashore.
    Landing,
    /// A way into an instance; the site names it.
    Gate,
    /// Open ground a public event is fought over.
    Event,
    /// A patrol beacon.
    Beacon,
    /// A resource node: ore, herbs, timber or salvage.
    Resource,
    /// Where foes hold ground.
    Foes,
    /// A run's end arena, where a mission's objective will stand; the site names the run.
    Objective,
    /// A run's sealed door, where a mission goes on; the site names the run.
    Door,
}

/// A site: what it is for, where, how much ground it takes, and what it holds or leads to.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Site {
    pub kind: SiteKind,
    pub at: [f64; 2],
    pub radius: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holds: Option<String>,
}

/// How far apart resource nodes stand along the paths, metres, and how far off a path they lie at most.
const RESOURCE_EVERY_M: f64 = 180.0;
/// The most resource nodes a layout holds.
const RESOURCE_MOST: usize = 16;
const RESOURCE_OFF_M: f64 = 55.0;

/// Whether a point is clear to stand a site on: walkable land not under a building or within a metre of one.
fn clear(field: &Field, seating: &Seating, at: [f64; 2]) -> bool {
    let open_land = field.cell_of(at[0], at[1]).is_some_and(|(column, row)| field.walkable(field.index(column, row)));
    open_land
        && seating.buildings.iter().all(|building| {
            let [west, north, east, south] = building.footprint;
            at[0] < west - 1.0 || at[0] > east + 1.0 || at[1] < north - 1.0 || at[1] > south + 1.0
        })
}

/// The sites of a layout.
/// How far a beacon or a resource keeps from every way's edge, metres: it stands beside the ways, never on one.
const OFF_PATHS_M: f64 = 5.0;

/// Whether a point keeps OFF_PATHS_M clear of every path's edge.
fn off_paths(paths: &[Path], at: [f64; 2]) -> bool {
    paths.iter().all(|path| {
        let reach = path.tier.width() / 2.0 + OFF_PATHS_M;
        path.points.windows(2).all(|pair| crate::paths::off_line(at, pair[0], pair[1]) > reach)
    })
}

#[must_use]
pub fn mark(field: &Field, areas: &[Area], paths: &[Path], seating: &Seating, seed: u32) -> Vec<Site> {
    let mut sites = Vec::new();
    let site = |kind: SiteKind, at: [f64; 2], radius: f64, holds: Option<String>| Site { kind, at, radius, holds };
    for (number, area) in areas.iter().enumerate() {
        match area.kind {
            AreaKind::Landing | AreaKind::Entrance => sites.push(site(SiteKind::Landing, area.at, area.radius, None)),
            AreaKind::Gate => sites.push(site(SiteKind::Gate, area.at, area.radius, area.leads_to.clone())),
            AreaKind::Wilds | AreaKind::Arena => {
                sites.push(site(SiteKind::Event, area.at, area.radius, Some(area.name.clone())))
            }
            _ => {}
        }
        if matches!(
            area.kind,
            AreaKind::Camp
                | AreaKind::Ruin
                | AreaKind::Keep
                | AreaKind::Coven
                | AreaKind::Cave
                | AreaKind::Wreck
                | AreaKind::Arena
        ) {
            sites.push(site(SiteKind::Foes, area.at, area.radius * 0.8, Some(area.name.clone())));
        }
        if matches!(area.kind, AreaKind::Gate | AreaKind::Landing | AreaKind::Entrance) {
            continue;
        }
        // Two beacons a place, on its rim, where a body can stand: something to take up on arriving.
        let mut placed = 0;
        for turn in 0..12 {
            let angle = std::f64::consts::TAU * (f64::from(turn) / 12.0 + rand01(seed, &[number as i64, 11]));
            let (sine, cosine) = land::exact::sin_cos(angle);
            let at = [area.at[0] + sine * area.radius * 0.85, area.at[1] - cosine * area.radius * 0.85];
            let apart =
                sites.iter().filter(|other| other.kind == SiteKind::Beacon).all(|other| distance(other.at, at) > 40.0);
            if clear(field, seating, at) && apart && off_paths(paths, at) {
                sites.push(site(SiteKind::Beacon, at, 3.0, None));
                placed += 1;
                if placed == 2 {
                    break;
                }
            }
        }
    }
    let mut count = 0_i64;
    for path in paths {
        let mut travelled = 0.0;
        for pair in path.points.windows(2) {
            travelled += distance(pair[0], pair[1]);
            if travelled < RESOURCE_EVERY_M {
                continue;
            }
            travelled = 0.0;
            count += 1;
            let (east, south) = (pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]);
            let length = (east * east + south * south).sqrt().max(1e-9);
            let side = if rand01(seed, &[count, 3]) < 0.5 { -1.0 } else { 1.0 };
            let off = 18.0 + rand01(seed, &[count, 5]) * (RESOURCE_OFF_M - 18.0);
            let at = [pair[1][0] - south / length * off * side, pair[1][1] + east / length * off * side];
            let resources = sites.iter().filter(|other| other.kind == SiteKind::Resource).count();
            if resources < RESOURCE_MOST
                && clear(field, seating, at)
                && off_paths(paths, at)
                && areas.iter().all(|area| distance(area.at, at) > area.radius * 0.6)
            {
                sites.push(site(SiteKind::Resource, at, 2.0, Some(resource_at(field, at).to_owned())));
            }
        }
    }
    sites
}

/// What a resource node at a point holds, by the land there: ore on steep or rocky ground, salvage by the sea, herbs
/// by fresh water, timber elsewhere.
fn resource_at(field: &Field, at: [f64; 2]) -> &'static str {
    let cell = field.nearest(at[0], at[1]);
    if field.slope[cell] > 0.3 {
        "ore"
    } else if field.to_sea[cell] < 60.0 {
        "salvage"
    } else if field.to_fresh[cell] < 60.0 || field.water[cell] != Water::Dry {
        "herbs"
    } else {
        "timber"
    }
}
