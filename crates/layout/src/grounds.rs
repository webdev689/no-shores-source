//! Where a zone's public events are fought, marked with its other sites in the zones that hold them: one hamlet's three
//! stores (stacked crates, sacks and barrels under a tarp, on clear ground beside its houses near its plaza, off the
//! ways), the point its raiders come in from (toward the zone's camp, or from the shore where it has none) and the two
//! banners they plant at its edge; and in one wilds, where its fissure opens (beside the battlefield's obelisk, clear
//! of its ruins) and the spot its crystal growth rises at. A store and a fissure stand square to the grid, a fissure's
//! long side east and west, and a body runs into a store on the page and in the room alike.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::collide::Box3;
use crate::field::{Field, distance};
use crate::paths::Path;
use crate::seat::Seating;
use crate::sites::{Site, SiteKind};
use std::f64::consts::TAU;

/// The box of each of the three stacks a store is drawn as (tools/modules: tithe-stores-a, -b and -c), grown to cover
/// the plundered stack it turns into too (2.5 x 2.049 x 0.90 m): its half-width east and west, its half-depth north and
/// south, and its height, metres. A hamlet's store `nth` (its mark's number less one) is drawn as the stack after its
/// own, as the page picks it (client/src/city/eventProps.ts).
pub const STORE_STACKS: [([f64; 2], f64); 3] = [([1.302, 1.0245], 1.73), ([1.25, 1.112], 1.4), ([1.3, 1.0245], 1.0)];
/// The room a store is laid out in: wide and deep enough for any of the stacks.
pub const STORE_HALF: [f64; 2] = [1.302, 1.112];
/// How far below the ground its box reaches, so a slope never leaves a gap under it.
const STORE_SUNK: f64 = 0.3;
/// The stores stand within this of the plaza, this far from each other, and this far clear of every building, set
/// piece and prop, and of every way's edge.
pub const STORES_FROM_PLAZA: f64 = 35.0;
pub const STORES_APART: f64 = 8.0;
pub const STORE_CLEAR: f64 = 1.5;
pub const STORE_OFF_WAYS: f64 = 2.0;
/// How far out from the plaza a hamlet's raiders come in, and how far its banners stand, either side of the way in.
pub const APPROACH_M: f64 = 36.0;
pub const BANNERS_M: f64 = 28.0;
pub const BANNERS_APART: f64 = 6.0;
/// How far from the fissure its crystal growth rises: the nearest of these that is clear.
const GROWTH_M: [f64; 3] = [17.0, 14.0, 20.0];
/// How far from the wilds' middle its fissure opens, the nearest of these that is clear: off the obelisk the
/// battlefield stands at its middle, and inside the ring of ruins and rocks round it. The crack's ground, half of it
/// east and west and north and south (tools/modules' lattice-fissure, end crusts and all, drawn unturned), and how
/// far it keeps clear of everything standing.
const FISSURE_M: [f64; 3] = [12.0, 9.0, 15.0];
pub const FISSURE_HALF: [f64; 2] = [7.7, 4.9];
pub const FISSURE_CLEAR: f64 = 1.0;

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

/// The sites a zone's public events stand on, in a zone that holds them (EVENT_ZONES) and nowhere else: its first
/// hamlet that has room for three stores, with them, its raiders' approach and its banners; and its first wilds, with
/// its fissure and its growth's spot. These are the grounds `grounds_of` reads, so every store marked (and boxed) is
/// one the page draws.
#[must_use]
pub fn mark(zone: &str, field: &Field, areas: &[Area], paths: &[Path], seating: &Seating) -> Vec<Site> {
    if !EVENT_ZONES.contains(&zone) {
        return Vec::new();
    }
    let prints = standing(seating);
    let around = (prints.as_slice(), paths);
    let site = |kind: SiteKind, at: [f64; 2], radius: f64, holds: &str| Site {
        kind,
        at,
        radius,
        holds: Some(holds.to_owned()),
        node: None,
        facing: None,
    };
    let mut sites = Vec::new();
    let hamlets = areas.iter().filter(|area| area.kind == AreaKind::Hamlet);
    let raided = hamlets.map(|area| (area, stores(field, around, area, seating))).find(|(_, at)| at.len() == 3);
    if let Some((area, stores)) = raided {
        for at in stores {
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
    let wilds = areas.iter().find(|area| area.kind == AreaKind::Wilds);
    let opened = wilds.and_then(|area| {
        let fissure = nearest_clear(area.at, &FISSURE_M, |at| open(field, around, at, FISSURE_HALF, FISSURE_CLEAR))?;
        Some((area, fissure, nearest_clear(fissure, &GROWTH_M, |at| open(field, around, at, [2.5, 2.5], 1.0))?))
    });
    if let Some((area, fissure, growth)) = opened {
        sites.push(site(SiteKind::Fissure, fissure, FISSURE_HALF[0], &area.name));
        sites.push(site(SiteKind::Growth, growth, 2.5, &area.name));
    }
    sites
}

/// In a zone that holds public events, the held map's public event marks stand where they are fought: the wilds its
/// fissure opens in, and the hamlet its stores stand in, over that hamlet; no other wilds or arena there is marked.
pub fn mark_events(zone: &str, areas: &[Area], sites: &mut Vec<Site>) {
    if !EVENT_ZONES.contains(&zone) {
        return;
    }
    let holder = |kind: SiteKind| sites.iter().find(|site| site.kind == kind).and_then(|site| site.holds.clone());
    let (opened, raided) = (holder(SiteKind::Fissure), holder(SiteKind::Store));
    sites.retain(|site| site.kind != SiteKind::Event || (opened.is_some() && site.holds == opened));
    let hamlet = raided.and_then(|name| areas.iter().find(|area| area.name == name));
    sites.extend(hamlet.map(|area| Site {
        kind: SiteKind::Event,
        at: area.at,
        radius: area.radius,
        holds: Some(area.name.clone()),
        node: None,
        facing: None,
    }));
}

/// The first point clear by `clear`, round `from` at each of `rings` in turn, twelve ways from the north; the first
/// tried when none is.
fn nearest_clear(from: [f64; 2], rings: &[f64], clear: impl Fn([f64; 2]) -> bool) -> Option<[f64; 2]> {
    let tries = rings.iter().flat_map(|&out| {
        (0..12).map(move |turn| {
            let angle = TAU * f64::from(turn) / 12.0;
            [from[0] + libm::sin(angle) * out, from[1] - libm::cos(angle) * out]
        })
    });
    let tries = tries.collect::<Vec<_>>();
    tries.iter().copied().find(|&at| clear(at)).or(tries.first().copied())
}

/// The stack a hamlet's store `nth` is drawn as, as its parts' box: its half across each way and its height.
#[must_use]
pub fn store_stack(nth: usize) -> ([f64; 2], f64) {
    STORE_STACKS[(nth + 1) % STORE_STACKS.len()]
}

/// The box a body runs into at each store, its stack's own, standing on the ground as `height` has it.
#[must_use]
pub fn store_boxes(sites: &[Site], height: &dyn Fn(f64, f64) -> f64) -> Vec<Box3> {
    let stores: Vec<&Site> = sites.iter().filter(|site| site.kind == SiteKind::Store).collect();
    stores
        .iter()
        .enumerate()
        .map(|(at, site)| {
            // Its place among its own hamlet's stores.
            let nth = stores[..at].iter().filter(|other| other.holds == site.holds).count();
            let ([half_x, half_y], tall) = store_stack(nth);
            let [x, y] = site.at;
            let ground = height(x, y);
            [x - half_x, y - half_y, x + half_x, y + half_y, ground + tall, ground - STORE_SUNK]
        })
        .collect()
}

/// The zones that hold public events: Saltmere's one, the Saltgrass Downs, at the owner's word (`room::public::ZONES`).
pub const EVENT_ZONES: [&str; 1] = ["saltgrass-downs"];
/// How far round the fissure its event is fought, metres; and how far past its stores a raid's ground reaches, and
/// the least it reaches from its middle.
pub const FISSURE_RADIUS: f64 = 25.0;
pub const RAID_PAST: f64 = 10.0;
pub const RAID_LEAST: f64 = 20.0;

/// Where a zone's public events are fought.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Grounds {
    pub fissure: Option<FissureGround>,
    pub raid: Option<RaidGround>,
}

/// The Fissure's ground: where its fissure opens in its wilds, how far round it the event is fought, and where its
/// growth rises.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct FissureGround {
    pub at: [f64; 2],
    pub radius: f64,
    pub growth: [f64; 2],
}

/// The raid's ground: the middle of its hamlet's stores and how far round it the raid is fought, the stores, where
/// the raiders come in from, and where their banners are planted at the hamlet's edge.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct RaidGround {
    pub at: [f64; 2],
    pub radius: f64,
    pub stores: Vec<[f64; 2]>,
    pub approach: [f64; 2],
    pub banners: Vec<[f64; 2]>,
}

/// A zone's grounds from its layout's sites: its first wilds that has a growth's spot, and its first hamlet that has
/// three stores; none for a zone that holds no events or has neither.
#[must_use]
pub fn grounds_of(laid: &crate::Layout) -> Option<Grounds> {
    if !EVENT_ZONES.contains(&laid.id.as_str()) {
        return None;
    }
    let of = |kind: SiteKind, place: &str| -> Vec<[f64; 2]> {
        let marked = laid.sites.iter().filter(|site| site.kind == kind && site.holds.as_deref() == Some(place));
        marked.map(|site| site.at).collect()
    };
    let fissure = laid.areas.iter().filter(|area| area.kind == AreaKind::Wilds).find_map(|area| {
        let at = *of(SiteKind::Fissure, &area.name).first()?;
        let growth = *of(SiteKind::Growth, &area.name).first()?;
        Some(FissureGround { at, radius: FISSURE_RADIUS, growth })
    });
    let raid = laid.areas.iter().filter(|area| area.kind == AreaKind::Hamlet).find_map(|area| {
        let (stores, banners) = (of(SiteKind::Store, &area.name), of(SiteKind::Banner, &area.name));
        let approach = *of(SiteKind::Approach, &area.name).first()?;
        (stores.len() == 3).then_some(())?;
        let at = stores.iter().fold([0.0, 0.0], |sum, at| [sum[0] + at[0] / 3.0, sum[1] + at[1] / 3.0]);
        let reach = stores.iter().map(|&point| distance(point, at));
        let radius = reach.fold(RAID_LEAST - RAID_PAST, f64::max) + RAID_PAST;
        Some(RaidGround { at, radius, stores, approach, banners })
    });
    Some(Grounds { fissure, raid })
}
