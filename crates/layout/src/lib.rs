//! Each patrol area's and instance's layout, planned from its claim on the land by the same rules on the server and
//! in every browser. A patrol area is a loop of areas round its landing (a hamlet, a farm, a ruin, a keep on the
//! heights), joined by tracks and footpaths, with a gate at its edge into each instance of its side; an instance runs
//! from its entrance, by way of its areas, to the arena it ends in. The section a body may walk is traced round what
//! the layout holds, so it follows the land.

pub mod areas;
pub mod basins;
pub mod book;
pub mod brief;
pub mod carve;
pub mod caverns;
mod clearing;
mod climbs;
pub mod collide;
pub mod compose;
pub mod dressing;
pub mod field;
pub mod halls;
pub mod heights;
pub mod interiors;
pub mod ledges;
pub mod marks;
pub mod masses;
pub mod modules;
pub mod paths;
pub mod pieces;
pub mod pieces_coast;
pub mod pieces_land;
pub mod plantings;
pub mod ring;
pub mod rocks;
pub mod run_climbs;
pub mod run_halls;
pub mod run_kits;
pub mod runs;
pub mod seat;
pub mod settle;
pub mod sites;
pub mod skyline;
pub mod spaces;
pub mod works;

use crate::areas::{Area, place, radius_of};
use crate::book::Book;
use crate::brief::{AreaKind, Brief};
use crate::field::{CELL_M, Field, distance};
use crate::paths::{Blocked, Path, Tier};
use crate::seat::{Seating, hub};
use land::exact::seed_of;
use land::ground::Ground;
use land::sites::{Node, NodeKind};
use serde::Serialize;

/// How far past its claim a layout reads the land, metres, and how far for its runs past the edge: as far as a run
/// reaches out, a whole number of cells further, so the two grids' cells lie alike.
const MARGIN_M: f64 = 40.0;
const RUNS_MARGIN_M: f64 = MARGIN_M + 52.0 * CELL_M;

/// Another node a layout leads to or comes from: its id and the middle of its claim.
#[derive(Debug, Clone, PartialEq)]
pub struct Link {
    pub id: String,
    pub towards: [f64; 2],
}

/// A node's layout.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Layout {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub theme: String,
    /// The section a body may walk, metres east and south, and the spawns a player lands and respawns at.
    pub ring: Vec<[f64; 2]>,
    pub spawns: Vec<[f64; 2]>,
    pub areas: Vec<Area>,
    pub paths: Vec<Path>,
    pub sites: Vec<sites::Site>,
    /// The linear combat areas breaking off a patrol area.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub runs: Vec<runs::Run>,
    /// The stone its cliffs and rubble wear where it is not its climate's.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stone: Option<String>,
    #[serde(flatten)]
    pub seating: Seating,
    /// How the layout carves its land.
    pub sculpt: land::sculpts::Sculpt,
    /// Each of its areas' basins, as its sculpt was carved from them.
    #[serde(skip)]
    pub basins: Vec<basins::Basin>,
    /// What a body runs into, once the layout is laid on the ground: west, north, east, south, top and bottom.
    pub boxes: Vec<collide::Box3>,
    /// The kinds of its climate's nature it plants, and where.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plantings: Vec<plantings::Planting>,
    /// Its spaces and the connections between them.
    pub map: spaces::Map,
}

/// A claim's ring in world metres.
fn claim_of(node: &Node) -> Vec<[f64; 2]> {
    node.ring.iter().map(|point| [point.x as f64, point.y as f64]).collect()
}

/// The middle of a node's claim.
#[must_use]
pub fn middle_of(node: &Node) -> [f64; 2] {
    let ring = claim_of(node);
    let count = ring.len().max(1) as f64;
    let (x, y) = ring.iter().fold((0.0, 0.0), |(x, y), point| (x + point[0], y + point[1]));
    [x / count, y / count]
}

/// A layout's ways: its paths, and each run's on past its end beat's middle to its door.
fn ways_of(paths: &[Path], runs: &[runs::Run]) -> Vec<Path> {
    let doors = runs.iter().filter_map(|run| {
        let points = vec![*run.line.last()?, run.door];
        Some(Path { tier: Tier::Footpath, points, crossings: Vec::new(), heights: Vec::new() })
    });
    paths.iter().cloned().chain(doors).collect()
}

/// Plans a node's layout on the ground from its brief: for a patrol area, `links` are the instances its gates lead
/// to; for an instance, the patrol area it is entered from. `biome` is its landmass's, which sets how high its massif
/// stands and the shape of its outcrops where its brief names none. `avoid` are the other nodes' claims, which its
/// runs past its edge keep clear of.
#[must_use]
pub fn plan(
    node: &Node,
    ground: &Ground,
    brief: &Brief,
    links: &[Link],
    book: &Book,
    biome: Option<&str>,
    avoid: &[Vec<[f64; 2]>],
) -> Layout {
    let (rise, shape) = (carve::rise_of(biome), carve::shape_of(brief, biome));
    let seed = seed_of(0x1A70, &node.id);
    let field = Field::read(ground, &claim_of(node), MARGIN_M);
    let patrol = node.kind == NodeKind::Patrol;
    let (areas, wanted) = place_areas(node, &field, brief, links, seed);
    let moduled = modules::standing(&areas, brief.heights);
    let mut seating = compose::stand(&areas, (&wanted, &moduled), book, (ground, &field), (seed, brief.heights));
    let mut buildings = std::mem::take(&mut seating.buildings);
    let mut kit = pieces::Kit { ground, book, seed: seed ^ 0x400D, draws: 0, into: &mut seating };
    for building in &mut buildings {
        if let Some(built) = interiors::build(&mut kit, building, book) {
            kit.into.rooms.extend(built.solids);
            kit.into.walls.extend(built.boxes);
        }
    }
    seating.buildings = buildings;
    let mut kit = pieces::Kit { ground, book, seed, draws: 0, into: &mut seating };
    let heart = areas.iter().fold([0.0, 0.0], |sum, area| [sum[0] + area.at[0], sum[1] + area.at[1]]);
    let heart = [heart[0] / areas.len().max(1) as f64, heart[1] / areas.len().max(1) as f64];
    for (area, &module) in areas.iter().zip(&moduled) {
        let linked = area.leads_to.as_ref().and_then(|id| links.iter().find(|link| &link.id == id));
        let toward = unit(linked.map_or(heart, |link| link.towards), area.at, field.seaward);
        if module {
            modules::seat(&mut kit, area, toward);
        } else {
            pieces::build(&mut kit, area, toward, field.seaward);
        }
    }
    // A module's area is reached at its first socket (a gate, a stair's foot), not through its walls to its middle.
    let hubs: Vec<[f64; 2]> = areas
        .iter()
        .zip(&wanted)
        .zip(&moduled)
        .map(|((area, &blocks), &module)| match (module, blocks) {
            (true, _) => modules::hub(&seating, area),
            (false, 0) => area.at,
            (false, _) => hub(&seating, area.at),
        })
        .collect();
    let blocked = blocked_by(&field, &seating);
    let (mut paths, joined) = paths::lay(&field, &areas, &hubs, &blocked, patrol, seed);
    // A way ending at an area's middle stops at what stands there: its set piece, tower or hull.
    for (area, _) in areas.iter().zip(&hubs).filter(|&(area, &hub)| distance(hub, area.at) < 1e-6) {
        clearing::end_at_rim(&mut paths, area.at, clearing::rim_of(&seating, area.at));
    }
    clearing::round_rooms(&mut paths, &seating);
    clearing::keep_off_paths(&mut seating, &paths, &|x, y| ground.height_at(x, y));
    let mut kit = pieces::Kit { ground, book, seed: seed ^ 0xB41D, draws: 0, into: &mut seating };
    for path in &paths {
        for &banks in &path.crossings {
            if brief.heights {
                pieces_land::stone_bridge(&mut kit, banks, path.tier.width());
            } else {
                pieces_land::bridge(&mut kit, banks, path.tier.width());
            }
        }
    }
    dressing::dress(&mut kit, &areas, &paths, &moduled);
    let mut sites = sites::mark(&field, &areas, &paths, &seating, seed);
    let mut kit = pieces::Kit { ground, book, seed: seed ^ 0x51E5, draws: 0, into: &mut seating };
    marks::build(&mut kit, &sites);
    let anchor = areas.first().map_or_else(|| middle_of(node), |area| area.at);
    let exits: Vec<([f64; 2], [f64; 2])> = areas
        .iter()
        .filter_map(|area| {
            let linked = area.leads_to.as_ref().and_then(|id| links.iter().find(|link| &link.id == id));
            match (area.kind, linked) {
                (AreaKind::Gate | AreaKind::Entrance, Some(link)) => {
                    Some((area.at, unit(link.towards, area.at, field.seaward)))
                }
                (AreaKind::Landing, _) if field.seaward != [0.0, 0.0] => Some((area.at, field.seaward)),
                _ => None,
            }
        })
        .collect();
    let pockets: Vec<[f64; 2]> =
        sites.iter().filter(|site| site.kind == sites::SiteKind::Resource).map(|site| site.at).collect();
    // A run past the edge is read on a wider field, the claim carried out round it by its wing, and so is a river the
    // brief names: its wings carry the claim along its course and its banks are floor.
    let claim = claim_of(node);
    let beyond = brief.runs.iter().any(|run| run.place == brief::RunPlace::Beyond);
    let mut wide = (patrol && (beyond || brief.river)).then(|| field.widened(ground, &claim, RUNS_MARGIN_M));
    let river = wide.as_ref().filter(|_| brief.river).and_then(|wide| field::river_wing(wide, &claim, avoid));
    let meadows = river.as_ref().map_or(&[][..], |river| river.floors.as_slice());
    let levels = heights::levels(&areas, brief);
    let network = carve::Network {
        areas: &areas,
        paths: &paths,
        exits: &exits,
        pockets: &pockets,
        meadows,
        levels: &levels,
        joined: &joined,
        moduled: &moduled,
    };
    let (mut sculpt, basins, caverns) = carve::carve(&field, claim_of(node), network, &seating, shape, rise, seed);
    // Rock in the middle of the claim that no floor or climb reaches is given a climb or a valley, before the runs are
    // found in what is left.
    let mass_climbs = masses::reach_masses(&field, &mut sculpt);
    // The runs are cut into the rock the carving left.
    let runs = if patrol && !brief.runs.is_empty() {
        let bare = land::sculpts::Sculpts::from(vec![sculpt.clone()]);
        let field = wide.as_ref().unwrap_or(&field);
        let setting =
            runs::Setting { field, claim: &claim, areas: &areas, bare: &bare, taken: &sculpt.climbs, avoid, rise };
        runs::find(&setting, &brief.runs, seed)
    } else {
        Vec::new()
    };
    sculpt.runs = runs.iter().flat_map(|run| runs::capsules(run, runs::half_of(run.kind))).collect();
    sculpt.wings = runs.iter().filter_map(|run| runs::wing(run, &claim)).collect();
    sculpt.wings.extend(river.iter().flat_map(|river| river.wings.iter().copied()));
    if let Some(wide) = &mut wide {
        for &wing in &sculpt.wings {
            wide.claim_more(wing);
        }
    }
    // Cliff stairs between heights, cut last into the rock the runs and climbs leave.
    let ledges = if brief.heights { ledges::cut(&field, (&areas, ground), &mut sculpt) } else { Vec::new() };
    let reach = wide.as_ref().unwrap_or(&field);
    let carved = land::sculpts::Sculpts::from(vec![sculpt.clone()]);
    // What stands on a terrace or a raised floor (a place at a height, a way graded between places) was stood on the
    // land before it was carved: lift it onto the land's level there, as the last cut (a climb's face, a ledge's slot)
    // leaves it.
    let terraces: Vec<[f64; 7]> = basins.iter().flat_map(|basin| basin.terraces.iter().copied()).collect();
    let raised_floors: Vec<[f64; 7]> = terraces.iter().chain(&sculpt.levels).copied().collect();
    if !raised_floors.is_empty() {
        let raised = |[x, y]: [f64; 2]| carved.raise(x, y, ground.coast.at(x, y));
        let floor = |[x, y]: [f64; 2]| carved.floor_distance(x, y) <= 0.0;
        basins::seat_on_terraces(&mut seating, &raised_floors, &raised, &floor);
    }
    // A module levels the ground under its floors, where it now stands.
    let module_pads: Vec<land::pads::Pad> = seating.solids.iter().flat_map(city::modules::pads).collect();
    seating.pads.extend(module_pads);
    let cells = ring::section_cells(reach, &|x, y| carved.floor_distance(x, y), anchor, &seating.bridges);
    let ring = ring::traced(reach, &cells);
    let mut kit = pieces::Kit { ground, book, seed: seed ^ 0x3A11, draws: 0, into: &mut seating };
    // The works keep off the climbs' ways as off every other, though those are walked only once the works stand.
    let kept: Vec<paths::Path> = paths.iter().cloned().chain(climb_ways(&sculpt.climbs)).collect();
    works::build(&mut kit, &areas, (&paths, &kept), &sculpt.outcrops, &carved);
    for cavern in &caverns {
        caverns::build(&mut kit, cavern, &carved);
    }
    for ledge in &ledges {
        ledges::build(&mut kit, ledge, &carved);
    }
    if brief.heights {
        for area in areas.iter().filter(|area| area.kind == AreaKind::Gate) {
            if let Some(&(middle, toward)) = exits.iter().find(|(at, _)| *at == area.at) {
                pieces::gate_to_rock(&mut kit, middle, toward, &carved);
            }
        }
    }
    // Each climb is walked as a footpath, and its lookout over the basin is a place of its own.
    for (pair, walk) in carve::lookouts(&sculpt.climbs).zip(climb_ways(&sculpt.climbs)) {
        let ([x1, y1, x2, y2, ..], end) = (pair[0], [pair[1][0], pair[1][1]]);
        paths.push(walk);
        skyline::lookout(&mut kit, end, [x2 - x1, y2 - y1], &carved);
        skyline::kerb(&mut kit, [x1, y1], [x2, y2], pair[0][4], &carved);
    }
    for climb in &mass_climbs {
        masses::ruin(&mut kit, climb, &carved, &sculpt.outcrops);
    }
    let walked = paths.len();
    // Each run is walked as a footpath, foes hold its beats, and its end and door are marked for the missions to come.
    for run in &runs {
        paths.push(paths::Path {
            tier: Tier::Footpath,
            points: run.line.clone(),
            crossings: Vec::new(),
            heights: Vec::new(),
        });
        let named = Some(run.name.clone());
        let (end, held) = run.beats.split_last().map_or((None, &[][..]), |(end, held)| (Some(end), held));
        sites.extend(held.iter().map(|beat| sites::Site {
            kind: sites::SiteKind::Foes,
            at: beat.at,
            radius: beat.radius,
            holds: None,
        }));
        sites.extend(end.map(|end| sites::Site {
            kind: sites::SiteKind::Objective,
            at: end.at,
            radius: end.radius,
            holds: named.clone(),
        }));
        sites.push(sites::Site { kind: sites::SiteKind::Door, at: run.door, radius: 3.0, holds: named });
    }
    // What comes after keeps off the ways, a run's on past its end beat's middle to its door too.
    let ways = ways_of(&paths, &runs);
    works::retaining_walls(&mut kit, &areas, &ways, &sculpt.outcrops, &carved);
    for run in &runs {
        run_kits::build(&mut kit, run, &carved);
    }
    // Where a gorge out of the claim meets a river, a footbridge carries its way over.
    for &(from, way) in &exits {
        pieces_land::footbridges(&mut kit, reach, (carve::gorge(&field, from, way, 0.0), brief.heights), &ring);
    }
    let gorges: Vec<Path> = exits
        .iter()
        .map(|&(from, way)| Path {
            tier: Tier::Footpath,
            points: vec![from, [from[0] + way[0] * 2000.0, from[1] + way[1] * 2000.0]],
            crossings: Vec::new(),
            heights: Vec::new(),
        })
        .collect();
    let fallen = kit.into.solids.len();
    // Fallen rock lies in no stone built before it, a run's or any other, nor on a run's climb.
    let built: Vec<city::solids::Solid> =
        kit.into.solids.iter().filter(|solid| !rocks::loose(solid)).copied().collect();
    let stone = rocks::kept_clear(&built, &runs);
    rocks::talus(&mut kit, &ring, (&ways, &gorges), &carved);
    rocks::clad(&mut kit, &sculpt.outcrops, &ways, &carved);
    rocks::keep_off(kit.into, fallen, &stone);
    // Last of what stands, so a shelf's headstones keep out of all the rest.
    basins::graves(&mut kit, &terraces, &carved);
    // The climbs, the works, the marks and the rock came after what stands was first kept off the ways: keep it off
    // them all again. A run keeps its own pieces off its line (run_kits.rs).
    // Each piece now stands on the land as carved, lifted onto its raised floor.
    let carved_height = |x: f64, y: f64| ground.height_at(x, y) + carved.raise(x, y, ground.coast.at(x, y));
    clearing::keep_off_paths(&mut seating, &paths[..walked], &carved_height);
    // Last, so what is planted keeps off all that stands.
    let takes = |at: [f64; 2], reach: f64| plantings::takes(ground, &sculpt, &carved, &ring, at, reach);
    let zone = plantings::Zone { biome, seed, takes: &takes };
    let plantings = plantings::plantings(&areas, &basins, &paths, &seating, &runs, &zone);
    let spawns = spawns_round(&field, anchor);
    let ways: Vec<(Path, [usize; 2])> = paths.iter().cloned().zip(joined.iter().copied()).collect();
    let raise = |[x, y]: [f64; 2]| carved.raise(x, y, ground.coast.at(x, y));
    let land = spaces::Land {
        floor: &|at| ground.height_at(at[0], at[1]) + raise(at),
        level: &|at| carved.floor_share(at[0], at[1]),
    };
    let climbs: Vec<&[[f64; 7]]> = carve::lookouts(&sculpt.climbs).collect();
    let drawn = spaces::Drawn {
        areas: &areas,
        ways: &ways,
        climbs: &climbs,
        runs: &runs,
        caverns: &caverns,
        ledges: &ledges,
        solids: &seating.solids,
    };
    let map = spaces::map(&drawn, &land);
    Layout {
        id: node.id.clone(),
        kind: node.kind,
        name: node.name.clone(),
        theme: brief.theme.clone(),
        ring,
        spawns,
        areas,
        paths,
        sites,
        runs,
        stone: brief.stone.clone(),
        seating,
        sculpt,
        basins,
        boxes: Vec::new(),
        plantings,
        map,
    }
}

/// Places a brief's areas, and how many blocks each stands (0 for an area of no blocks). A patrol area's landing comes
/// first, on the seaward side, then a gate at the edge toward each instance it leads to, then the brief's other areas.
/// An instance's entrance comes first, at the edge toward its patrol area, and each later area lies further on.
fn place_areas(node: &Node, field: &Field, brief: &Brief, links: &[Link], seed: u32) -> (Vec<Area>, Vec<u8>) {
    let mut areas: Vec<Area> = Vec::new();
    let mut wanted: Vec<u8> = Vec::new();
    let mut put = |areas: &mut Vec<Area>,
                   kind: AreaKind,
                   name: &str,
                   blocks: u8,
                   leads_to: Option<String>,
                   pull: &dyn Fn([f64; 2]) -> f64| {
        let radius = radius_of(kind, blocks);
        if let Some(at) = place(field, kind, radius, areas, seed ^ areas.len() as u32, pull) {
            areas.push(Area { kind, name: name.to_owned(), at, radius, leads_to });
            wanted.push(if compose::stands_blocks(kind) { blocks.max(1) } else { 0 });
        }
    };
    let span = field.columns.max(field.rows) as f64 * CELL_M;
    let edge_pull = |towards: [f64; 2]| {
        move |at: [f64; 2]| {
            let inside = field.inside[field.nearest(at[0], at[1])];
            1.5 * (1.0 - distance(at, towards) / span).max(0.0) - inside / 150.0
        }
    };
    if node.kind == NodeKind::Patrol {
        if let Some(landing) = brief.areas.iter().find(|area| area.kind == AreaKind::Landing) {
            // Players come ashore from the sea, so the landing lies on the claim's seaward side.
            let (middle, seaward) = (middle_of(node), field.seaward);
            let shoreward = move |at: [f64; 2]| {
                let ahead = (at[0] - middle[0]) * seaward[0] + (at[1] - middle[1]) * seaward[1];
                (ahead / (span * 0.35)).clamp(-1.0, 1.0)
            };
            put(&mut areas, AreaKind::Landing, &landing.name, 0, None, &shoreward);
        }
        for link in links {
            put(&mut areas, AreaKind::Gate, "", 0, Some(link.id.clone()), &edge_pull(link.towards));
        }
        for brief_area in brief.areas.iter().filter(|area| area.kind != AreaKind::Landing) {
            put(&mut areas, brief_area.kind, &brief_area.name, brief_area.blocks.unwrap_or(1), None, &|_| 0.0);
        }
    } else {
        let entrance = brief.areas.iter().find(|area| area.kind == AreaKind::Entrance);
        let towards = links.first().map_or_else(|| middle_of(node), |link| link.towards);
        let name = entrance.map_or("The Way In", |area| area.name.as_str());
        put(&mut areas, AreaKind::Entrance, name, 0, links.first().map(|link| link.id.clone()), &edge_pull(towards));
        let later: Vec<_> = brief.areas.iter().filter(|area| area.kind != AreaKind::Entrance).collect();
        for (order, brief_area) in later.iter().enumerate() {
            let Some(start) = areas.first().map(|area| area.at) else { break };
            // Each area of an instance lies further on than the last, so the way through it runs one way.
            let share = (order + 1) as f64 / later.len() as f64;
            let ahead = move |at: [f64; 2]| 1.2 * (1.0 - (distance(at, start) / (span * 0.55) - share).abs()).max(0.0);
            put(&mut areas, brief_area.kind, &brief_area.name, brief_area.blocks.unwrap_or(1), None, &ahead);
        }
    }
    (areas, wanted)
}

/// The unit vector from `from` to `to`; `otherwise` where they meet.
fn unit(to: [f64; 2], from: [f64; 2], otherwise: [f64; 2]) -> [f64; 2] {
    let (east, south) = (to[0] - from[0], to[1] - from[1]);
    let length = (east * east + south * south).sqrt();
    if length > 1e-6 {
        [east / length, south / length]
    } else if otherwise == [0.0, 0.0] {
        [0.0, -1.0]
    } else {
        otherwise
    }
}

/// The cells a path may not cross: under a building, a set piece's solid or a large prop, or within a metre of it,
/// each at least a cell wide.
fn blocked_by(field: &Field, seating: &Seating) -> Blocked {
    let mut blocked = vec![false; field.columns * field.rows];
    let solids = seating.solids.iter().map(|solid| {
        let [west, north, east, south, _, _] = solid.bounds();
        [west, north, east, south]
    });
    let large_props = seating
        .props
        .iter()
        .map(|prop| prop.footprint)
        .filter(|print| (print[2] - print[0]) * (print[3] - print[1]) > 6.0);
    // A building walked into blocks every cell reaching under it, so no way runs through its walls.
    let rooms = seating.buildings.iter().filter(|building| building.open).map(|building| {
        let [west, north, east, south] = building.footprint;
        let half = CELL_M / 2.0;
        [west - half, north - half, east + half, south + half]
    });
    let closed = seating.buildings.iter().filter(|building| !building.open).map(|building| building.footprint);
    let prints: Vec<[f64; 4]> = rooms.chain(closed).chain(solids).chain(large_props).collect();
    // A cell is blocked where its middle stands under something, or a metre from it; a print thinner than a cell is
    // taken as a cell wide, so a thin wall never slips between the cells' middles.
    for [west, north, east, south] in prints {
        let widen = |low: f64, high: f64| {
            let short = ((CELL_M - (high - low)) / 2.0).max(0.0);
            (low - short, high + short)
        };
        let ((west, east), (north, south)) = (widen(west, east), widen(north, south));
        let column_of = |x: f64| ((x - field.west) / CELL_M - 0.5).ceil().max(0.0) as usize;
        let row_of = |y: f64| ((y - field.north) / CELL_M - 0.5).ceil().max(0.0) as usize;
        for row in row_of(north - 1.0)..=row_of(south + 1.0).min(field.rows) {
            for column in column_of(west - 1.0)..=column_of(east + 1.0).min(field.columns) {
                if row >= field.rows || column >= field.columns {
                    continue;
                }
                let [x, y] = field.centre(column, row);
                if x >= west - 1.0 && x <= east + 1.0 && y >= north - 1.0 && y <= south + 1.0 {
                    blocked[field.index(column, row)] = true;
                }
            }
        }
    }
    Blocked(blocked)
}

/// Three spawns round a landing or an entrance, a few metres apart on walkable ground.
fn spawns_round(field: &Field, at: [f64; 2]) -> Vec<[f64; 2]> {
    let offsets = [[0.0, 0.0], [6.0, 3.0], [-6.0, 3.0]];
    offsets
        .iter()
        .map(|offset| [at[0] + offset[0], at[1] + offset[1]])
        .filter(|point| {
            field.cell_of(point[0], point[1]).is_some_and(|(column, row)| field.walkable(field.index(column, row)))
        })
        .chain(std::iter::once(at))
        .take(3)
        .collect()
}

/// Each climb to a lookout as the footpath it is walked as, a point every 8 m or less.
fn climb_ways(climbs: &[[f64; 7]]) -> Vec<paths::Path> {
    carve::lookouts(climbs)
        .map(|pair| {
            let [x1, y1, x2, y2, ..] = pair[0];
            let steps = (field::distance([x1, y1], [x2, y2]) / 8.0).ceil().max(1.0);
            let points = (0..=steps as usize)
                .map(|step| {
                    let along = step as f64 / steps;
                    [x1 + (x2 - x1) * along, y1 + (y2 - y1) * along]
                })
                .collect();
            paths::Path { tier: paths::Tier::Footpath, points, crossings: Vec::new(), heights: Vec::new() }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use city::solids::{Material, Shape, Solid};

    #[test]
    fn a_lantern_on_a_way_goes_with_its_light_and_a_pile_under_a_deck_stays() {
        let path = Path {
            tier: Tier::Track,
            points: vec![[0.0, 0.0], [100.0, 0.0]],
            crossings: Vec::new(),
            heights: Vec::new(),
        };
        let solid = |at: [f64; 3], size: [f64; 3]| Solid::upright(Shape::Block, at, size, Material::Timber);
        let mut seating = Seating {
            solids: vec![
                solid([50.0, 1.0, -0.3], [0.16, 0.16, 2.8]),
                solid([50.0, 1.0, 2.5], [0.2, 0.2, 0.26]),
                solid([60.0, 0.5, -6.0], [0.5, 0.5, 6.0]),
                solid([70.0, 9.0, -0.3], [0.16, 0.16, 2.8]),
            ],
            ..Seating::default()
        };
        clearing::keep_off_paths(&mut seating, &[path], &|_, _| 0.0);
        let left: Vec<[f64; 2]> = seating.solids.iter().map(|solid| [solid.at[0], solid.at[1]]).collect();
        assert_eq!(left, [[60.0, 0.5], [70.0, 9.0]], "the lantern on the track and its light are gone");
    }
}
