//! Each patrol area's and instance's layout, planned from its claim on the land by the same rules on the server and
//! in every browser. A patrol area is a loop of areas round its landing (a hamlet, a farm, a ruin, a keep on the
//! heights), joined by tracks and footpaths, with a gate at its edge into each instance of its side; an instance runs
//! from its entrance, by way of its areas, to the arena it ends in. The section a body may walk is traced round what
//! the layout holds, so it follows the land.

pub mod areas;
pub mod book;
pub mod brief;
pub mod collide;
pub mod compose;
pub mod field;
pub mod paths;
pub mod ring;
pub mod seat;
pub mod settle;

use crate::areas::{Area, place, radius_of};
use crate::book::Book;
use crate::brief::{AreaKind, Brief};
use crate::field::{CELL_M, Field, distance};
use crate::paths::{Blocked, Path, Tier, crossings, find, network, smoothed};
use crate::seat::{Seating, hub};
use land::exact::seed_of;
use land::ground::Ground;
use land::sites::{Node, NodeKind};
use serde::Serialize;

/// How far past its claim a layout reads the land, metres.
const MARGIN_M: f64 = 40.0;

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
    #[serde(flatten)]
    pub seating: Seating,
    /// What a body runs into, once the layout is laid on the ground: west, north, east, south, top and bottom.
    pub boxes: Vec<collide::Box3>,
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

/// Plans a node's layout on the ground from its brief: for a patrol area, `links` are the instances its gates lead
/// to; for an instance, the patrol area it is entered from.
#[must_use]
pub fn plan(node: &Node, ground: &Ground, brief: &Brief, links: &[Link], book: &Book) -> Layout {
    let seed = seed_of(0x1A70, &node.id);
    let field = Field::read(ground, &claim_of(node), MARGIN_M);
    let patrol = node.kind == NodeKind::Patrol;
    let (areas, wanted) = place_areas(node, &field, brief, links, seed);
    let mut seating = compose::stand(&areas, &wanted, book, ground, &field, seed);
    let hubs: Vec<[f64; 2]> =
        areas.iter().zip(&wanted).map(|(area, &blocks)| if blocks > 0 { hub(&seating, area.at) } else { area.at }).collect();
    let blocked = blocked_by(&field, &seating);
    let paths = lay_paths(&field, &areas, &hubs, &blocked, patrol, seed);
    keep_props_off(&mut seating, &paths);
    let anchor = areas.first().map_or_else(|| middle_of(node), |area| area.at);
    let room: Vec<([f64; 2], f64)> = areas.iter().map(|area| (area.at, area.radius)).collect();
    let lines: Vec<Vec<[f64; 2]>> = paths.iter().map(|path| path.points.clone()).collect();
    let cells = ring::section_cells(&field, &room, &lines, anchor, seed);
    let ring = ring::traced(&field, &cells);
    let spawns = spawns_round(&field, anchor);
    Layout {
        id: node.id.clone(),
        kind: node.kind,
        name: node.name.clone(),
        theme: brief.theme.clone(),
        ring,
        spawns,
        areas,
        paths,
        seating,
        boxes: Vec::new(),
    }
}

/// Places a brief's areas, and how many blocks each stands (0 for an area of no blocks). A patrol area's landing comes
/// first, on the seaward side, then a gate at the edge toward each instance it leads to, then the brief's other areas.
/// An instance's entrance comes first, at the edge toward its patrol area, and each later area lies further on.
fn place_areas(node: &Node, field: &Field, brief: &Brief, links: &[Link], seed: u32) -> (Vec<Area>, Vec<u8>) {
    let mut areas: Vec<Area> = Vec::new();
    let mut wanted: Vec<u8> = Vec::new();
    let mut put = |areas: &mut Vec<Area>, kind: AreaKind, name: &str, blocks: u8, leads_to: Option<String>, pull: &dyn Fn([f64; 2]) -> f64| {
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

/// The cells a path may not cross: under a building, and a metre and a half round it.
fn blocked_by(field: &Field, seating: &Seating) -> Blocked {
    let mut blocked = vec![false; field.columns * field.rows];
    let column_of = |x: f64| ((x - field.west) / CELL_M).floor().clamp(0.0, (field.columns - 1) as f64) as usize;
    let row_of = |y: f64| ((y - field.north) / CELL_M).floor().clamp(0.0, (field.rows - 1) as f64) as usize;
    for building in &seating.buildings {
        let [west, north, east, south] = building.footprint;
        for row in row_of(north - 1.5)..=row_of(south + 1.5) {
            for column in column_of(west - 1.5)..=column_of(east + 1.5) {
                blocked[field.index(column, row)] = true;
            }
        }
    }
    Blocked(blocked)
}

/// Leaves out the props a path runs over: a cart or a fence in the middle of a track.
fn keep_props_off(seating: &mut Seating, paths: &[Path]) {
    seating.props.retain(|prop| {
        let at = [prop.at[0], prop.at[1]];
        paths.iter().all(|path| {
            let reach = path.tier.width() / 2.0 + 0.6;
            path.points.windows(2).all(|pair| crate::paths::off_line(at, pair[0], pair[1]) > reach)
        })
    });
}

/// The paths joining a layout's areas. A patrol area's areas are joined by tracks along a tree of the shortest links
/// and footpaths closing a loop or two; its gates by a footpath from the nearest area. An instance's run in a chain.
fn lay_paths(field: &Field, areas: &[Area], hubs: &[[f64; 2]], blocked: &Blocked, patrol: bool, seed: u32) -> Vec<Path> {
    let mut laid = vec![false; field.columns * field.rows];
    let mut links: Vec<(usize, usize, Tier)> = Vec::new();
    if patrol {
        let open: Vec<usize> = (0..areas.len()).filter(|&at| areas[at].kind != AreaKind::Gate).collect();
        let points: Vec<[f64; 2]> = open.iter().map(|&at| areas[at].at).collect();
        let loops = if open.len() >= 6 { 2 } else { usize::from(open.len() >= 4) };
        let (tree, closing) = network(&points, loops);
        links.extend(tree.iter().map(|&(first, second)| (open[first], open[second], Tier::Track)));
        links.extend(closing.iter().map(|&(first, second)| (open[first], open[second], Tier::Footpath)));
        for gate in (0..areas.len()).filter(|&at| areas[at].kind == AreaKind::Gate) {
            let nearest = open.iter().copied().min_by(|&first, &second| {
                distance(areas[first].at, areas[gate].at).total_cmp(&distance(areas[second].at, areas[gate].at))
            });
            if let Some(nearest) = nearest {
                links.push((nearest, gate, Tier::Footpath));
            }
        }
    } else {
        links.extend((1..areas.len()).map(|at| (at - 1, at, Tier::Footpath)));
    }
    let mut paths = Vec::new();
    for (from, to, tier) in links {
        let (start, end) = (hubs[from], hubs[to]);
        let Some(cells) = find(field, [start, end], tier, &laid, blocked, seed) else { continue };
        for &cell in &cells {
            laid[cell] = true;
        }
        paths.push(Path { tier, points: smoothed(field, &cells, start, end), crossings: crossings(field, &cells), heights: Vec::new() });
    }
    paths
}

/// Three spawns round a landing or an entrance, a few metres apart on walkable ground.
fn spawns_round(field: &Field, at: [f64; 2]) -> Vec<[f64; 2]> {
    let offsets = [[0.0, 0.0], [6.0, 3.0], [-6.0, 3.0]];
    offsets
        .iter()
        .map(|offset| [at[0] + offset[0], at[1] + offset[1]])
        .filter(|point| field.cell_of(point[0], point[1]).is_some_and(|(column, row)| field.walkable(field.index(column, row))))
        .chain(std::iter::once(at))
        .take(3)
        .collect()
}
