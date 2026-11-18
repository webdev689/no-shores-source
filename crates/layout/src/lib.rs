//! Each patrol area's and instance's layout, planned from its claim on the land by the same rules on the server and
//! in every browser. A patrol area is a loop of areas round its landing (a hamlet, a farm, a ruin, a keep on the
//! heights), joined by tracks and footpaths, with a gate at its edge into each instance of its side; an instance runs
//! from its entrance, by way of its areas, to the arena it ends in. The section a body may walk is traced round what
//! the layout holds, so it follows the land.

pub mod areas;
pub mod book;
pub mod brief;
pub mod carve;
pub mod collide;
pub mod compose;
pub mod dressing;
pub mod field;
pub mod halls;
pub mod interiors;
pub mod marks;
pub mod paths;
pub mod pieces;
pub mod pieces_coast;
pub mod pieces_land;
pub mod ring;
pub mod rocks;
pub mod run_halls;
pub mod run_kits;
pub mod runs;
pub mod seat;
pub mod settle;
pub mod sites;
pub mod skyline;
pub mod works;

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
    #[serde(flatten)]
    pub seating: Seating,
    /// How the layout carves its land.
    pub sculpt: land::sculpts::Sculpt,
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
/// to; for an instance, the patrol area it is entered from. `avoid` are the other nodes' claims, which its runs past
/// its edge keep clear of.
#[must_use]
pub fn plan(
    node: &Node,
    ground: &Ground,
    brief: &Brief,
    links: &[Link],
    book: &Book,
    rise: f64,
    avoid: &[Vec<[f64; 2]>],
) -> Layout {
    let seed = seed_of(0x1A70, &node.id);
    let field = Field::read(ground, &claim_of(node), MARGIN_M);
    let patrol = node.kind == NodeKind::Patrol;
    let (areas, wanted) = place_areas(node, &field, brief, links, seed);
    let mut seating = compose::stand(&areas, &wanted, book, ground, &field, seed);
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
    for area in &areas {
        let linked = area.leads_to.as_ref().and_then(|id| links.iter().find(|link| &link.id == id));
        let toward = unit(linked.map_or(heart, |link| link.towards), area.at, field.seaward);
        pieces::build(&mut kit, area, toward, field.seaward);
    }
    let hubs: Vec<[f64; 2]> = areas
        .iter()
        .zip(&wanted)
        .map(|(area, &blocks)| if blocks > 0 { hub(&seating, area.at) } else { area.at })
        .collect();
    let blocked = blocked_by(&field, &seating);
    let mut paths = lay_paths(&field, &areas, &hubs, &blocked, patrol, seed);
    keep_off_paths(&mut seating, &paths, &|x, y| ground.height_at(x, y));
    let mut kit = pieces::Kit { ground, book, seed: seed ^ 0xB41D, draws: 0, into: &mut seating };
    for path in &paths {
        for &banks in &path.crossings {
            pieces_land::bridge(&mut kit, banks, path.tier.width());
        }
    }
    dressing::dress(&mut kit, &areas, &paths);
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
    let network = carve::Network { areas: &areas, paths: &paths, exits: &exits, pockets: &pockets };
    let mut sculpt = carve::carve(&field, claim_of(node), network, &seating, rise, seed);
    // The runs are cut into the rock the carving left, and a run past the edge is read on a wider field, the claim
    // carried out round it by its wing.
    let claim = claim_of(node);
    let beyond = brief.runs.iter().any(|run| run.place == brief::RunPlace::Beyond);
    let mut wide = (patrol && beyond).then(|| Field::read(ground, &claim, RUNS_MARGIN_M));
    let runs = if patrol && !brief.runs.is_empty() {
        let bare = land::sculpts::Sculpts::from(vec![sculpt.clone()]);
        let field = wide.as_ref().unwrap_or(&field);
        let setting = runs::Setting { field, claim: &claim, areas: &areas, bare: &bare, taken: &sculpt.climbs, avoid };
        runs::find(&setting, &brief.runs, seed)
    } else {
        Vec::new()
    };
    sculpt.runs = runs.iter().flat_map(|run| runs::capsules(run, runs::half_of(run.kind))).collect();
    sculpt.wings = runs.iter().filter_map(|run| runs::wing(run, &claim)).collect();
    if let Some(wide) = &mut wide {
        for &wing in &sculpt.wings {
            wide.claim_more(wing);
        }
    }
    let reach = wide.as_ref().unwrap_or(&field);
    let carved = land::sculpts::Sculpts::from(vec![sculpt.clone()]);
    let cells = ring::section_cells(reach, &|x, y| carved.floor_distance(x, y), anchor);
    let ring = ring::traced(reach, &cells);
    let mut kit = pieces::Kit { ground, book, seed: seed ^ 0x3A11, draws: 0, into: &mut seating };
    works::build(&mut kit, &areas, &paths, rise);
    // Each climb is walked as a footpath, and its lookout over the basin is a place of its own.
    let laid = paths.len();
    for pair in sculpt.climbs.chunks_exact(2) {
        let ([x1, y1, x2, y2, ..], end) = (pair[0], [pair[1][0], pair[1][1]]);
        let steps = (field::distance([x1, y1], [x2, y2]) / 8.0).ceil().max(1.0);
        let points = (0..=steps as usize)
            .map(|step| {
                let along = step as f64 / steps;
                [x1 + (x2 - x1) * along, y1 + (y2 - y1) * along]
            })
            .collect();
        paths.push(paths::Path { tier: paths::Tier::Footpath, points, crossings: Vec::new(), heights: Vec::new() });
        skyline::lookout(&mut kit, end, [x2 - x1, y2 - y1], &carved);
        skyline::kerb(&mut kit, [x1, y1], [x2, y2], pair[0][4], &carved);
    }
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
    for run in &runs {
        run_kits::build(&mut kit, run, &carved);
    }
    rocks::talus(&mut kit, &ring, &paths, &carved);
    rocks::clad(&mut kit, &sculpt.outcrops, &paths, &carved);
    skyline::rim(&mut kit, &ring, &paths, &carved);
    // The climbs came after what stands was kept off the ways: keep it off them too.
    keep_off_paths(&mut seating, &paths[laid..], &|x, y| ground.height_at(x, y));
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
        sites,
        runs,
        seating,
        sculpt,
        boxes: Vec::new(),
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

/// The cells a path may not cross: under a building, a set piece's solid or a large prop, and a metre and a half
/// round it.
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
    let prints: Vec<[f64; 4]> =
        seating.buildings.iter().map(|building| building.footprint).chain(solids).chain(large_props).collect();
    // A cell is blocked where its middle stands under something, or a metre from it.
    for [west, north, east, south] in prints {
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

/// Leaves out what a path runs over: a cart or a fence in the middle of a track, a lantern on its post.
fn keep_off_paths(seating: &mut Seating, paths: &[Path], height: &dyn Fn(f64, f64) -> f64) {
    let clear = |at: [f64; 2], spread: f64| {
        paths.iter().all(|path| {
            let reach = path.tier.width() / 2.0 + 0.6 + spread;
            path.points.windows(2).all(|pair| crate::paths::off_line(at, pair[0], pair[1]) > reach)
        })
    };
    seating.props.retain(|prop| clear([prop.at[0], prop.at[1]], 0.0));
    // The set pieces' small solids standing on the ground in a way's path (a lantern, a fire's stones), and what stands
    // on them, go too: a deck, a pile in the water or a work's great stones keep their places.
    let place =
        |solid: &city::solids::Solid| ((solid.at[0] * 100.0).round() as i64, (solid.at[1] * 100.0).round() as i64);
    let in_the_way: std::collections::BTreeSet<(i64, i64)> = seating
        .solids
        .iter()
        .filter(|solid| {
            let small = solid.size[0].max(solid.size[1]) <= SMALL_SOLID_M;
            let ground_at = height(solid.at[0], solid.at[1]);
            let standing = solid.at[2] >= ground_at - 1.2 && solid.at[2] <= ground_at + 0.05;
            small && standing && !clear([solid.at[0], solid.at[1]], solid.size[0].max(solid.size[1]) / 2.0)
        })
        .map(place)
        .collect();
    seating.solids.retain(|solid| !in_the_way.contains(&place(solid)));
}

/// The widest a set piece's solid may be and still be cleared out of a way, metres: a post, a lantern, a stone.
const SMALL_SOLID_M: f64 = 2.5;

/// The paths joining a layout's areas. A patrol area's areas are joined by tracks along a tree of the shortest links
/// and footpaths closing a loop or two; its gates by a footpath from the nearest area. An instance's run in a chain.
fn lay_paths(
    field: &Field,
    areas: &[Area],
    hubs: &[[f64; 2]],
    blocked: &Blocked,
    patrol: bool,
    seed: u32,
) -> Vec<Path> {
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
    let mut group: Vec<usize> = (0..areas.len()).collect();
    let root = |group: &[usize], mut at: usize| {
        while group[at] != at {
            at = group[at];
        }
        at
    };
    let lay = |from: usize, to: usize, tier: Tier, laid: &mut Vec<bool>, paths: &mut Vec<Path>| {
        let (start, end) = (hubs[from], hubs[to]);
        // A way too steep for its tier is laid as a footpath, then as a stepped way, rather than not at all.
        let tries = [
            (tier, tier.steepest()),
            (Tier::Footpath, Tier::Footpath.steepest()),
            (Tier::Footpath, crate::paths::STEPPED),
        ];
        let found = tries.iter().find_map(|&(tier, steepest)| {
            find(field, [start, end], steepest, laid, blocked, seed).map(|cells| (tier, cells))
        });
        let Some((tier, cells)) = found else { return false };
        for &cell in &cells {
            laid[cell] = true;
        }
        paths.push(Path {
            tier,
            points: smoothed(field, &cells, start, end),
            crossings: crossings(field, &cells),
            heights: Vec::new(),
        });
        true
    };
    for (from, to, tier) in links {
        if lay(from, to, tier, &mut laid, &mut paths) {
            let (first, second) = (root(&group, from), root(&group, to));
            group[first] = second;
        }
    }
    // An area no way reached is joined to the nearest one that is joined to the first.
    for area in 1..areas.len() {
        if root(&group, area) == root(&group, 0) {
            continue;
        }
        let mut others: Vec<usize> = (0..areas.len()).filter(|&other| root(&group, other) == root(&group, 0)).collect();
        others.sort_by(|&first, &second| {
            distance(areas[first].at, areas[area].at).total_cmp(&distance(areas[second].at, areas[area].at))
        });
        for other in others {
            if lay(other, area, Tier::Footpath, &mut laid, &mut paths) {
                let (first, second) = (root(&group, area), root(&group, other));
                group[first] = second;
                break;
            }
        }
    }
    paths
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
        keep_off_paths(&mut seating, &[path], &|_, _| 0.0);
        let left: Vec<[f64; 2]> = seating.solids.iter().map(|solid| [solid.at[0], solid.at[1]]).collect();
        assert_eq!(left, [[60.0, 0.5], [70.0, 9.0]], "the lantern on the track and its light are gone");
    }
}
