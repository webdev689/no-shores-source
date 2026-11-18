//! What the rooms read, made at build time. A whole continent's land outgrows a room's memory, so for every node, the
//! ones drawn in a landmass's edits file and its city's social space, the bake keeps what that node's room needs: its
//! section and spawns, an exact window of the ground over the section and past it, and the boxes a body runs into
//! there.

use city::rmb::Blocks;
use city::stations::StationKind;
use land::edits::Edits;
use land::ground::Ground;
use land::landmass::generate;
use land::sites::NodeKind;
use serde::Serialize;
use world::layout::Continent;

/// How far past a section's ring its window reaches, metres: beyond the 60 m where a body dies, so no living body
/// ever stands where the window stops answering as the whole ground does.
pub const MARGIN_M: f64 = 100.0;

/// One node as its room reads it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NodeFile {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub continent: String,
    /// The section's ring and spawns, metres east and south.
    pub ring: Vec<[f64; 2]>,
    pub spawns: Vec<[f64; 2]>,
    /// The window's rect: west, north, east and south.
    pub bounds: [f64; 4],
    pub ground: Ground,
    /// The boxes a body runs into within the rect: west, north, east, south and top.
    pub boxes: Vec<[f64; 5]>,
    /// In a social space, the counters that answer a player's gear, which the room serves only at each.
    pub counters: Vec<Counter>,
}

/// A counter of a social space: its station, and its middle.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Counter {
    pub kind: StationKind,
    pub at: [f64; 2],
}

/// What a node's index lists of it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Listed {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub continent: String,
    pub bounds: [f64; 4],
}

impl From<&NodeFile> for Listed {
    fn from(node: &NodeFile) -> Self {
        let NodeFile { id, kind, name, continent, bounds, .. } = node;
        Listed { id: id.clone(), kind: *kind, name: name.clone(), continent: continent.clone(), bounds: *bounds }
    }
}

/// The longest room name the server's router takes, and the prefix of a node's room.
pub const ROOM_NAME_LIMIT: usize = 40;
pub const NODE_ROOM: &str = "node-";

/// Why a world's nodes cannot each have a file and a room of their own: two with one id (an edits file checks its
/// own ids only), the index's own name, or an id too long for a room's name. None when every node can.
#[must_use]
pub fn ids_problem(nodes: &[NodeFile]) -> Option<String> {
    let mut seen = std::collections::BTreeSet::new();
    nodes.iter().find_map(|node| {
        if !seen.insert(node.id.as_str()) {
            Some(format!("two nodes are called {}", node.id))
        } else if node.id == "index" {
            Some("no node may be called index, the index's own name".to_owned())
        } else if NODE_ROOM.len() + node.id.len() > ROOM_NAME_LIMIT {
            Some(format!("{} is too long for its room's name, {NODE_ROOM}<id>, of {ROOM_NAME_LIMIT}", node.id))
        } else {
            None
        }
    })
}

/// The rect a section's window covers: its ring's bounds and MARGIN_M past them each way.
#[must_use]
pub fn bounds_of(ring: &[[f64; 2]]) -> [f64; 4] {
    let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    let [west, north, east, south] = ring
        .iter()
        .fold(start, |[west, north, east, south], &[x, y]| [west.min(x), north.min(y), east.max(x), south.max(y)]);
    [west - MARGIN_M, north - MARGIN_M, east + MARGIN_M, south + MARGIN_M]
}

/// Whether a station answers a player's gear: the Reader opens Vestiges, the vaults keep gear, the Quartermaster and
/// the Armsmith sell it, and the Tailor sells emblems.
fn answers_gear(kind: StationKind) -> bool {
    use StationKind::{Armsmith, Quartermaster, Reader, Tailor, Vault};
    matches!(kind, Reader | Vault | Quartermaster | Armsmith | Tailor)
}

/// Every node of a continent, drawn and social, generated with its edits and its city settled on the land. Fails
/// for edits that break their rules or a city that cannot be planned.
pub fn nodes_of(continent: &Continent, edits: Edits, blocks: &Blocks) -> Result<Vec<NodeFile>, String> {
    let mut landmass = generate(continent, edits)?;
    if let Some(problem) = landmass.problems().first() {
        return Err(format!("{}: {}: {}", continent.id, problem.subject, problem.message));
    }
    let plan = city::settle(&mut landmass, blocks)?;
    let cut = |id: String, kind: NodeKind, name: String, ring: Vec<[f64; 2]>, spawns: Vec<[f64; 2]>| {
        let bounds = bounds_of(&ring);
        let [west, north, east, south] = bounds;
        let ground = landmass.surface.window(west, north, east, south);
        let boxes = plan.as_ref().map(|plan| city::collision::boxes_within(plan, bounds)).unwrap_or_default();
        let continent = continent.id.clone();
        NodeFile { id, kind, name, continent, ring, spawns, bounds, ground, boxes, counters: Vec::new() }
    };
    let whole =
        |points: &[world::geometry::Point]| points.iter().map(|point| [point.x as f64, point.y as f64]).collect();
    let drawn = landmass
        .edits
        .nodes
        .iter()
        .map(|node| cut(node.id.clone(), node.kind, node.name.clone(), whole(&node.ring), whole(&node.spawns)));
    let social = plan.as_ref().map(|plan| {
        let (id, social) = (city::social_id(&plan.id), &plan.social);
        let counters = social.stations.iter().filter(|station| answers_gear(station.kind));
        NodeFile {
            counters: counters.map(|station| Counter { kind: station.kind, at: station.counter }).collect(),
            ..cut(id, NodeKind::Social, plan.name.clone(), social.ring.clone(), social.spawns.clone())
        }
    });
    Ok(drawn.chain(social).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_reaches_the_margin_past_its_ring_each_way() {
        let ring = [[100.0, 200.0], [300.0, 250.0], [150.0, 400.0]];
        assert_eq!(bounds_of(&ring), [0.0, 100.0, 400.0, 500.0]);
    }

    const SQUARE: &str = r#"{ "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] }"#;
    const GLADE: &str = r#"{ "strokes": [], "nodes": [{ "id": "glade", "kind": "patrol", "name": "The Glade",
        "ring": [[260000, 360000], [261000, 360000], [261000, 361000], [260000, 361000]],
        "spawns": [[260500, 360500]] }] }"#;

    fn glade() -> (NodeFile, world::layout::Layout) {
        let layout = world::layout::parse(SQUARE).unwrap();
        let mut nodes =
            nodes_of(&layout.continents[0], land::edits::parse(GLADE).unwrap(), &Blocks::default()).unwrap();
        assert_eq!(nodes.len(), 1);
        (nodes.remove(0), layout)
    }

    #[test]
    fn a_square_landmass_with_a_node_bakes_its_window_and_section() {
        let (node, layout) = glade();
        assert_eq!((node.id.as_str(), node.continent.as_str(), node.kind), ("glade", "square", NodeKind::Patrol));
        assert_eq!(node.bounds, [259_900.0, 359_900.0, 261_100.0, 361_100.0]);
        assert!(node.boxes.is_empty(), "no city stands on the square");
        let whole = generate(&layout.continents[0], land::edits::parse(GLADE).unwrap()).unwrap();
        for (x, y) in [(260_500.25, 360_500.75), (259_950.5, 361_050.5)] {
            assert_eq!(node.ground.height_at(x, y).to_bits(), whole.surface.height_at(x, y).to_bits());
        }
    }

    #[test]
    fn nodes_sharing_an_id_one_called_index_and_an_id_too_long_for_a_room_are_refused() {
        let (node, _) = glade();
        let called = |id: &str| NodeFile { id: id.to_owned(), ..node.clone() };
        assert_eq!(ids_problem(&[called("glade"), called("glen")]), None);
        assert_eq!(ids_problem(&[called("glade"), called("glade")]), Some("two nodes are called glade".to_owned()));
        assert!(ids_problem(&[called("index")]).is_some());
        assert_eq!(ids_problem(&[called(&"a".repeat(35))]), None, "node- and 35 make 40");
        assert!(ids_problem(&[called(&"a".repeat(36))]).is_some());
    }
}
