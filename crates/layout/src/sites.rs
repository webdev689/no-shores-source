//! Where a layout's activities will stand, marked as it is laid out so the systems that come later (public events,
//! patrol beacons, resource nodes, foes) find their places ready: Destiny 1's patrol areas hold two to four beacons
//! and one or two event arenas each, and something worth stopping for every couple of hundred metres.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::{Field, distance};
use crate::paths::Path;
use crate::seat::Seating;
use city::solids::Shape;
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
    /// A place the island's resource comes from, dressed as a pile of it, its node standing before it.
    Resource,
    /// Where foes hold ground.
    Foes,
    /// A run's end arena, where a mission's objective will stand; the site names the run.
    Objective,
    /// A run's sealed door, where a mission goes on; the site names the run.
    Door,
    /// A hamlet's store, which the Grey Tithe's raid plunders and its players hold; the site names the hamlet.
    Store,
    /// Where a hamlet's raiders come in from, and where each of their two banners is planted.
    Approach,
    Banner,
    /// Where a wilds' crystal growth rises, 14 to 20 m from its fissure; the site names the wilds.
    Growth,
    /// Where a wilds' fissure opens: clear ground beside its middle, off the obelisk and the ruins its battlefield
    /// stands there; the site names the wilds.
    Fissure,
    /// A place a patrol's chest may stand, tucked against something tall, its front facing away from it (`chests`).
    Chest,
}

/// A site: what it is for, where, how much ground it takes, and what it holds or leads to.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Site {
    pub kind: SiteKind,
    pub at: [f64; 2],
    pub radius: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holds: Option<String>,
    /// Where a resource's node stands: `NODE_FRONT_M` before its dressing, toward the path it lies off; none where that
    /// is off the section's floor.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node: Option<[f64; 2]>,
    /// Which way a chest's place faces, radians clockwise from north.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub facing: Option<f64>,
}

/// How far apart resource nodes stand along the paths, metres.
const RESOURCE_EVERY_M: f64 = 180.0;
/// The most resource nodes a layout holds.
const RESOURCE_MOST: usize = 16;
/// How far off a path a resource node lies at most, metres.
const RESOURCE_OFF_M: f64 = 55.0;
/// How far before its dressing, toward its path, a resource's node stands, metres: past the dressing's widest pieces
/// (`marks`), so its picture stands clear of them.
pub const NODE_FRONT_M: f64 = 5.0;
/// How clear of every piece standing over the floor, and of every planting, a resource's node stands, metres.
pub const NODE_CLEAR_M: f64 = 1.0;
const NODE_PLANTING_M: f64 = 1.5;
/// How far apart resource places stand from each other and from beacons, metres: each place's pieces clear of the
/// other's.
const RESOURCE_APART_M: f64 = 12.0;

/// Whether a resource's node can stand at `node` once the layout is laid: inside its ring (the room's bounds), on dry
/// floor, and clear of every solid taller than a step and of every planting; one that cannot has none, and its place
/// is only dressed.
#[must_use]
pub fn node_stands(
    node: [f64; 2],
    ring: &[[f64; 2]],
    field: &Field,
    (solids, plantings): (&[city::solids::Solid], &[crate::plantings::Planting]),
) -> bool {
    let [x, y] = node;
    let dry = field.water[field.nearest(x, y)] == crate::field::Water::Dry;
    let blocked = solids.iter().any(|solid| {
        let [west, north, east, south, bottom, top] = solid.bounds();
        let near =
            x > west - NODE_CLEAR_M && x < east + NODE_CLEAR_M && y > north - NODE_CLEAR_M && y < south + NODE_CLEAR_M;
        near && top - bottom > 0.3
    });
    let planted =
        plantings.iter().flat_map(|planting| &planting.points).any(|&point| distance(point, node) < NODE_PLANTING_M);
    crate::field::ring_holds(ring, x, y) && dry && !blocked && !planted
}

/// How far a site keeps from a building's footprint and from a module's foot, metres.
const SITE_CLEAR_M: f64 = 1.0;

/// Whether a point is clear to stand a site on: walkable land not within a metre of a building or a module's foot.
/// A module's floors level the land under its foot once the sites are marked (`city::modules::pads`), so what a site
/// lays there would hang over the levelled ground or sink into it.
fn clear(field: &Field, seating: &Seating, at: [f64; 2]) -> bool {
    let open_land = field.cell_of(at[0], at[1]).is_some_and(|(column, row)| field.walkable(field.index(column, row)));
    let off = |[west, north, east, south]: [f64; 4]| {
        let keep = SITE_CLEAR_M;
        at[0] < west - keep || at[0] > east + keep || at[1] < north - keep || at[1] > south + keep
    };
    let feet =
        seating.solids.iter().filter(|solid| matches!(solid.shape, Shape::Module { group: 0, .. })).map(|solid| {
            let [west, north, east, south, ..] = solid.bounds();
            [west, north, east, south]
        });
    open_land && seating.buildings.iter().map(|building| building.footprint).chain(feet).all(off)
}

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
/// Marks a layout's sites; each resource site holds `resource`, its island's (content/gear/resources.json), or nothing
/// on land that has none.
pub fn mark(
    field: &Field,
    areas: &[Area],
    paths: &[Path],
    seating: &Seating,
    seed: u32,
    resource: Option<&str>,
) -> Vec<Site> {
    let mut sites = Vec::new();
    let site = |kind: SiteKind, at: [f64; 2], radius: f64, holds: Option<String>| Site {
        kind,
        at,
        radius,
        holds,
        node: None,
        facing: None,
    };
    for (number, area) in areas.iter().enumerate() {
        match area.kind {
            AreaKind::Landing | AreaKind::Entrance => sites.push(site(SiteKind::Landing, area.at, area.radius, None)),
            AreaKind::Gate => sites.push(site(SiteKind::Gate, area.at, area.radius, area.leads_to.clone())),
            AreaKind::Wilds | AreaKind::Arena => {
                sites.push(site(SiteKind::Event, area.at, area.radius, Some(area.name.clone())))
            }
            _ => {}
        }
        // Foes hold every area but where players arrive or pass, where folk live, where public events are fought, a
        // Breach's hollow and a guild's plot: a patrol's territories across its zone, each standing its group as a
        // player comes near (the owner's "Territories across the zone").
        let held = !matches!(
            area.kind,
            AreaKind::Landing
                | AreaKind::Entrance
                | AreaKind::Gate
                | AreaKind::Hamlet
                | AreaKind::Wilds
                | AreaKind::Breach
                | AreaKind::Plot
        );
        if held {
            sites.push(site(SiteKind::Foes, area.at, area.radius * 0.8, Some(area.name.clone())));
        }
        if matches!(area.kind, AreaKind::Gate | AreaKind::Landing | AreaKind::Entrance | AreaKind::Plot) {
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
            if clear(field, seating, at) && apart && off_paths(paths, at) && !crate::areas::on_plot(areas, at, 3.0) {
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
            let apart = sites
                .iter()
                .filter(|other| matches!(other.kind, SiteKind::Resource | SiteKind::Beacon))
                .all(|other| distance(other.at, at) > RESOURCE_APART_M);
            if resources < RESOURCE_MOST
                && apart
                && clear(field, seating, at)
                && off_paths(paths, at)
                && areas.iter().all(|area| distance(area.at, at) > area.radius * 0.6)
                && !crate::areas::on_plot(areas, at, NODE_FRONT_M + 3.0)
            {
                let back = NODE_FRONT_M / off;
                let node = [at[0] + (pair[1][0] - at[0]) * back, at[1] + (pair[1][1] - at[1]) * back];
                let holds = resource.map(str::to_owned);
                sites.push(Site { node: Some(node), ..site(SiteKind::Resource, at, 2.0, holds) });
            }
        }
    }
    sites
}

/// How far apart along a way its patrols stand, metres, and how far each keeps off every place's reach, every other
/// foes' site and every landing zone; and how many a zone holds at most.
const WAY_PATROL_EVERY_M: f64 = 200.0;
const WAY_PATROL_CLEAR_M: [f64; 3] = [60.0, 150.0, 80.0];
const WAY_PATROLS_MOST: usize = 8;

/// The foes' sites of a patrol area's patrols on its ways, where its brief asks for them: a point of a way every
/// `WAY_PATROL_EVERY_M` along it that keeps off every place, every foes' site in `sites` and every landing zone in
/// `landings`; the room stands each site's group to walk its beat along the way there.
#[must_use]
pub fn way_patrols(areas: &[Area], ways: &[Path], sites: &[Site], landings: &[[f64; 2]]) -> Vec<Site> {
    let [place_clear, site_clear, landing_clear] = WAY_PATROL_CLEAR_M;
    let mut found: Vec<[f64; 2]> =
        sites.iter().filter(|site| site.kind == SiteKind::Foes).map(|site| site.at).collect();
    let mut patrols = Vec::new();
    for way in ways {
        let mut travelled = 0.0;
        for pair in way.points.windows(2) {
            travelled += distance(pair[0], pair[1]);
            let at = pair[1];
            let clear = areas.iter().all(|area| distance(area.at, at) - area.radius >= place_clear)
                && found.iter().all(|other| distance(*other, at) >= site_clear)
                && landings.iter().all(|landing| distance(*landing, at) >= landing_clear);
            if travelled < WAY_PATROL_EVERY_M || !clear || patrols.len() >= WAY_PATROLS_MOST {
                continue;
            }
            travelled = 0.0;
            found.push(at);
            patrols.push(Site { kind: SiteKind::Foes, at, radius: 0.0, holds: None, node: None, facing: None });
        }
    }
    patrols
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::Tier;
    use city::solids::Solid;

    #[test]
    fn no_beacon_or_resource_stands_on_a_modules_foot() {
        // A track 500 m long across level land, a point every 20 m, so resources are marked beside it.
        let field = Field::level(-300.0, -300.0, 75, 75);
        let points = (0..=25).map(|step| [-250.0 + f64::from(step) * 20.0, 0.0]).collect();
        let paths = [Path { tier: Tier::Track, points, crossings: Vec::new(), heights: Vec::new() }];
        let resource = |sites: &[Site]| sites.iter().find(|site| site.kind == SiteKind::Resource).map(|site| site.at);
        let bare = mark(&field, &[], &paths, &Seating::default(), 7, Some("salt"));
        let Some(at) = resource(&bare) else { panic!("a resource is marked beside the track: {bare:?}") };
        // A keep stood over that resource, as a heights zone's keep stands its module.
        let keep = city::modules::number_of("keep-citadel").expect("the keep's module is in the manifest");
        let solids = city::modules::solids(keep, [at[0], at[1], 5.0], 0.0);
        let foot = solids.iter().find(|solid| matches!(solid.shape, Shape::Module { group: 0, .. })).map(Solid::bounds);
        let Some([west, north, east, south, ..]) = foot else { panic!("the keep stands a first group") };
        let seating = Seating { solids, ..Seating::default() };
        for site in mark(&field, &[], &paths, &seating, 7, Some("salt")) {
            let [x, y] = site.at;
            let on_foot = x > west - 1.0 && x < east + 1.0 && y > north - 1.0 && y < south + 1.0;
            assert!(!on_foot, "a {:?} at {:?} stands on the keep's foot", site.kind, site.at);
        }
    }
}
