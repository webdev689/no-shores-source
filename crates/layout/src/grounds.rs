//! Where a zone's public events are fought, marked with its other sites: each hamlet's three stores (stacked crates,
//! sacks and barrels under a tarp, on clear ground beside its houses near its plaza, off the ways), the point its
//! raiders come in from (toward the zone's camp, or from the shore where it has none) and the two banners they plant
//! at its edge; and in each wilds, the spot its crystal growth rises at. A store stands square to the grid, its long
//! side east and west, and a body runs into it on the page and in the room alike.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::collide::Box3;
use crate::field::{Field, distance};
use crate::paths::Path;
use crate::seat::Seating;
use crate::sites::{Site, SiteKind};
use std::f64::consts::TAU;

/// A store's half-width east and west and half-depth north and south, and its height, metres.
pub const STORE_HALF: [f64; 2] = [1.2, 0.8];
pub const STORE_HEIGHT: f64 = 1.6;
/// How far below the ground its box reaches, so a slope never leaves a gap under it.
const STORE_SUNK: f64 = 0.3;
/// The stores stand within this of the plaza, this far from each other, and this far clear of every building, set
/// piece and prop, and of every way's edge.
const STORES_FROM_PLAZA: f64 = 35.0;
const STORES_APART: f64 = 8.0;
const STORE_CLEAR: f64 = 1.5;
const STORE_OFF_WAYS: f64 = 2.0;
/// How far out from the plaza a hamlet's raiders come in, and how far its banners stand, either side of the way in.
const APPROACH_M: f64 = 36.0;
const BANNERS_M: f64 = 28.0;
const BANNERS_APART: f64 = 6.0;
/// How far from the wilds' middle its crystal growth rises: the nearest of these that is clear.
const GROWTH_M: [f64; 3] = [17.0, 14.0, 20.0];

/// What a box covers, west, north, east and south.
type Print = [f64; 4];

/// The prints of everything standing that a store keeps clear of: buildings, set pieces and props.
fn standing(seating: &Seating) -> Vec<Print> {
    let buildings = seating.buildings.iter().chain(&seating.props).map(|seated| seated.footprint);
    let solids = seating.solids.iter().map(|solid| {
        let [west, north, east, south, _, _] = solid.bounds();
        [west, north, east, south]
    });
    buildings.chain(solids).collect()
}

/// Whether a print widened by `clear` stands on walkable land, apart from everything standing and off every way.
fn open(field: &Field, (prints, paths): (&[Print], &[Path]), at: [f64; 2], half: [f64; 2], clear: f64) -> bool {
    let [west, north, east, south] = [at[0] - half[0], at[1] - half[1], at[0] + half[0], at[1] + half[1]];
    let corners = [[west, north], [east, north], [east, south], [west, south], at];
    let land = corners
        .iter()
        .all(|&[x, y]| field.cell_of(x, y).is_some_and(|(column, row)| field.walkable(field.index(column, row))));
    let apart = prints.iter().all(|print| {
        west - clear > print[2] || east + clear < print[0] || north - clear > print[3] || south + clear < print[1]
    });
    let reach = half[0].max(half[1]) + STORE_OFF_WAYS;
    let off_ways = paths.iter().all(|path| {
        let edge = path.tier.width() / 2.0 + reach;
        path.points.windows(2).all(|pair| crate::paths::off_line(at, pair[0], pair[1]) > edge)
    });
    land && apart && off_ways
}

/// A hamlet's three stores: beside its houses, each tried a store's room out from the middle of each side of each
/// building near the plaza, nearest the plaza first; any still wanted, on a ring halfway out to STORES_FROM_PLAZA.
fn stores(field: &Field, around: (&[Print], &[Path]), hamlet: &Area, seating: &Seating) -> Vec<[f64; 2]> {
    let out = STORE_HALF[0] + STORE_CLEAR + 0.5;
    let mut tried: Vec<[f64; 2]> = seating
        .buildings
        .iter()
        .map(|building| building.footprint)
        .flat_map(|[west, north, east, south]| {
            let (middle_x, middle_y) = ((west + east) / 2.0, (north + south) / 2.0);
            [[middle_x, north - out], [east + out, middle_y], [middle_x, south + out], [west - out, middle_y]]
        })
        .filter(|&at| distance(at, hamlet.at) <= STORES_FROM_PLAZA)
        .collect();
    tried.sort_by(|one, two| distance(*one, hamlet.at).total_cmp(&distance(*two, hamlet.at)));
    let ring = (0..12).map(|turn| {
        let angle = TAU * f64::from(turn) / 12.0;
        let half = STORES_FROM_PLAZA / 2.0;
        [hamlet.at[0] + libm::sin(angle) * half, hamlet.at[1] - libm::cos(angle) * half]
    });
    let mut chosen: Vec<[f64; 2]> = Vec::new();
    for at in tried.into_iter().chain(ring) {
        let spaced = chosen.iter().all(|other| distance(*other, at) >= STORES_APART);
        if chosen.len() < 3 && spaced && open(field, around, at, STORE_HALF, STORE_CLEAR) {
            chosen.push(at);
        }
    }
    chosen
}

/// The first clear point along a line out from `from` toward `toward`, trying from `out` in toward the middle.
fn out_along(field: &Field, around: (&[Print], &[Path]), from: [f64; 2], toward: [f64; 2], out: f64) -> [f64; 2] {
    let along = |metres: f64| [from[0] + toward[0] * metres, from[1] + toward[1] * metres];
    let steps = (0..12).map(|step| out - f64::from(step) * 3.0);
    steps.map(along).find(|&at| open(field, around, at, [0.5, 0.5], 0.5)).unwrap_or_else(|| along(out))
}

/// The sites a zone's public events stand on: for each hamlet its stores, its raiders' approach and its banners;
/// for each wilds its growth's spot.
#[must_use]
pub fn mark(field: &Field, areas: &[Area], paths: &[Path], seating: &Seating) -> Vec<Site> {
    let prints = standing(seating);
    let around = (prints.as_slice(), paths);
    let site = |kind: SiteKind, at: [f64; 2], radius: f64, holds: &str| Site {
        kind,
        at,
        radius,
        holds: Some(holds.to_owned()),
    };
    let mut sites = Vec::new();
    for area in areas.iter().filter(|area| area.kind == AreaKind::Hamlet) {
        for at in stores(field, around, area, seating) {
            sites.push(site(SiteKind::Store, at, STORE_HALF[0], &area.name));
        }
        let camp = areas
            .iter()
            .filter(|other| other.kind == AreaKind::Camp)
            .min_by(|one, two| distance(one.at, area.at).total_cmp(&distance(two.at, area.at)));
        let toward = camp.map_or(field.seaward, |camp| crate::unit(camp.at, area.at, field.seaward));
        let toward = if toward == [0.0, 0.0] { [0.0, -1.0] } else { toward };
        sites.push(site(SiteKind::Approach, out_along(field, around, area.at, toward, APPROACH_M), 3.0, &area.name));
        let edge = [area.at[0] + toward[0] * BANNERS_M, area.at[1] + toward[1] * BANNERS_M];
        for side in [-1.0, 1.0] {
            let aside = [edge[0] - toward[1] * BANNERS_APART * side, edge[1] + toward[0] * BANNERS_APART * side];
            let at = out_along(field, around, area.at, crate::unit(aside, area.at, toward), distance(aside, area.at));
            sites.push(site(SiteKind::Banner, at, 1.0, &area.name));
        }
    }
    for area in areas.iter().filter(|area| area.kind == AreaKind::Wilds) {
        let tries = GROWTH_M.iter().flat_map(|&out| {
            (0..12).map(move |turn| {
                let angle = TAU * f64::from(turn) / 12.0;
                [area.at[0] + libm::sin(angle) * out, area.at[1] - libm::cos(angle) * out]
            })
        });
        let mut tries = tries.collect::<Vec<_>>().into_iter();
        let first = tries.clone().next();
        if let Some(at) = tries.find(|&at| open(field, around, at, [2.5, 2.5], 1.0)).or(first) {
            sites.push(site(SiteKind::Growth, at, 2.5, &area.name));
        }
    }
    sites
}

/// The box a body runs into at each store, standing on the ground as `height` has it.
#[must_use]
pub fn store_boxes(sites: &[Site], height: &dyn Fn(f64, f64) -> f64) -> Vec<Box3> {
    let stores = sites.iter().filter(|site| site.kind == SiteKind::Store);
    stores
        .map(|site| {
            let [x, y] = site.at;
            let ground = height(x, y);
            let [half_x, half_y] = STORE_HALF;
            [x - half_x, y - half_y, x + half_x, y + half_y, ground + STORE_HEIGHT, ground - STORE_SUNK]
        })
        .collect()
}
