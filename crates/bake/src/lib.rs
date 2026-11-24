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
use layout::book::Book;
use layout::brief::Briefs;
use serde::Serialize;
use std::path::{Path, PathBuf};
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
    /// The boxes a body runs into within the rect: west, north, east, south, top and underside.
    pub boxes: Vec<city::collision::Box2>,
    /// In a social space, the counters that answer a player's gear, which the room serves only at each.
    pub counters: Vec<Counter>,
    /// In Overlook's social space, where a player stands to read the bounty board: its counter, apart from the
    /// stations' since no keeper stands at it.
    pub board: Option<[f64; 2]>,
    /// In a social space Shape visits, the places he may stand, one a week.
    pub shape_spots: Vec<[f64; 2]>,
    /// Whether its room takes no player: a patrol area or mission until a pass is done on it ([`lock`]), or a social
    /// space still locked (`city::social_open`).
    pub locked: bool,
    /// Where its public events are fought, in a zone that holds them ([`EVENT_ZONES`]).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounds: Option<Grounds>,
    /// The nodes its layout's gates and way in lead to, each one laid: a patrol area's instances, an instance's patrol
    /// area. The server lets a player through into a node only from one whose gate leads there.
    pub gates: Vec<String>,
    /// In a patrol area, its layout's resource places, where its room's nodes stand, in the layout's order.
    pub resources: Vec<[f64; 2]>,
    /// In a patrol area, its layout's chest places, each x, y and the way its front faces (radians clockwise from
    /// north), where its room stands a few chests at a time, in the layout's order.
    pub chests: Vec<[f64; 3]>,
    /// In a patrol area, its layout's props that hold things (`dungeon::models::HOLDERS`), each its box across
    /// (west, north, east, south), its foot, its top and its model, which its room makes searchable now and then.
    pub holders: Vec<[f64; 7]>,
    /// In a patrol area, its layout's foes' sites in its caverns (a coven's or a cave's area) and on its runs' beats
    /// short of their end arenas, in the layout's order: where its room stands a group as a player first comes near.
    pub foes: Vec<[f64; 2]>,
    /// The places the houses' roads name: each of its layout's areas, and each run at its mouth.
    pub places: Vec<Place>,
    /// Its layout's paths, each its points, that a road's figure walks between places.
    pub paths: Vec<Vec<[f64; 2]>>,
}

/// A place of a node: its name, middle and reach, metres.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Place {
    pub name: String,
    pub at: [f64; 2],
    pub radius: f64,
}

/// How far a run's place reaches round its mouth, metres.
pub const RUN_REACH_M: f64 = 25.0;

/// A layout's foes' sites a room stands groups at: a run's beats (a site naming nothing) and a coven's or a cave's
/// area; a camp's, a ruin's and the rest stand in the garrison's square or wait on the owner's word.
#[must_use]
pub fn foes_of(layout: &layout::Layout) -> Vec<[f64; 2]> {
    use layout::brief::AreaKind;
    let cavern = |name: &String| {
        layout.areas.iter().any(|area| &area.name == name && matches!(area.kind, AreaKind::Coven | AreaKind::Cave))
    };
    let held = layout.sites.iter().filter(|site| site.kind == layout::sites::SiteKind::Foes);
    held.filter(|site| site.holds.as_ref().is_none_or(cavern)).map(|site| site.at).collect()
}

/// A patrol's chest places, each x, y and the way it faces, in the layout's order.
#[must_use]
pub fn chests_of(layout: &layout::Layout) -> Vec<[f64; 3]> {
    let places = layout.sites.iter().filter(|site| site.kind == layout::sites::SiteKind::Chest);
    places.map(|site| [site.at[0], site.at[1], site.facing.unwrap_or_default()]).collect()
}

/// A patrol's props that hold things, inside its ring: each its box across, its foot, its top and its model.
#[must_use]
pub fn holders_of(layout: &layout::Layout) -> Vec<[f64; 7]> {
    let held = layout.seating.props.iter().filter_map(|prop| {
        let [west, north, east, south] = prop.footprint;
        let inside = layout::field::ring_holds(&layout.ring, (west + east) / 2.0, (north + south) / 2.0);
        inside.then(|| dungeon::models::held_by(prop.model, prop.footprint, prop.at[2])).flatten()
    });
    held.collect()
}

/// A layout's places: its areas, then its runs at their mouths, but a run named as one of its areas is, whose name
/// names that area alone.
#[must_use]
pub fn places_of(layout: &layout::Layout) -> Vec<Place> {
    let areas = layout.areas.iter().map(|area| Place { name: area.name.clone(), at: area.at, radius: area.radius });
    let named = |name: &str| layout.areas.iter().any(|area| area.name == name);
    let runs = layout.runs.iter().filter(|run| !named(&run.name));
    areas.chain(runs.map(|run| Place { name: run.name.clone(), at: run.mouth, radius: RUN_REACH_M })).collect()
}

pub use layout::grounds::{EVENT_ZONES, FISSURE_RADIUS, FissureGround, Grounds, RaidGround, grounds_of};

/// A counter of a social space: its station, and its middle.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Counter {
    pub kind: StationKind,
    pub at: [f64; 2],
}

/// What a node's index lists of it: the server reads where each node's gates lead from it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Listed {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub continent: String,
    pub bounds: [f64; 4],
    pub gates: Vec<String>,
}

impl From<&NodeFile> for Listed {
    fn from(node: &NodeFile) -> Self {
        let NodeFile { id, kind, name, continent, bounds, gates, .. } = node;
        let (id, name, continent, gates) = (id.clone(), name.clone(), continent.clone(), gates.clone());
        Listed { id, kind: *kind, name, continent, bounds: *bounds, gates }
    }
}

/// The longest room name the server's router takes, the prefix of a node's room, and the longest ending one takes: a
/// run of a patrol's last dungeon at Abyss.
pub const ROOM_NAME_LIMIT: usize = 64;
pub const NODE_ROOM: &str = "node-";
pub const LONGEST_ENDING: &str = "--abyss--dungeon-2--run-00000000";

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
        } else if NODE_ROOM.len() + node.id.len() + LONGEST_ENDING.len() > ROOM_NAME_LIMIT {
            Some(format!(
                "{} is too long for its rooms' names, {NODE_ROOM}<id>{LONGEST_ENDING}, of {ROOM_NAME_LIMIT}",
                node.id
            ))
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

/// Whether a station answers a player's gear: every one but the chandler's, who makes the plaza busy; the
/// Harbourmaster's counter sells the Shipwright's modules.
fn answers_gear(kind: StationKind) -> bool {
    kind != StationKind::Chandler
}

/// What a continent's layouts are built with: the RMB blocks' contents and the forged models' boxes, and every
/// node's brief.
#[derive(Debug, Clone, Default)]
pub struct Builders {
    pub book: Book,
    pub briefs: Briefs,
}

/// Every node of a continent, drawn and social, generated with its edits, its city settled on the land and every
/// drawn node's layout laid on it: a drawn node's section, spawns and boxes are its layout's. Fails for edits that
/// break their rules or a city that cannot be planned.
pub fn nodes_of(
    continent: &Continent,
    edits: Edits,
    blocks: &Blocks,
    builders: &Builders,
) -> Result<Vec<NodeFile>, String> {
    let mut landmass = generate(continent, edits)?;
    if let Some(problem) = landmass.problems().first() {
        return Err(format!("{}: {}: {}", continent.id, problem.subject, problem.message));
    }
    let plan = city::settle(&mut landmass, blocks)?;
    let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
    let cut = |id: String, kind: NodeKind, name: String, ring: Vec<[f64; 2]>, spawns: Vec<[f64; 2]>| {
        let bounds = bounds_of(&ring);
        let [west, north, east, south] = bounds;
        let ground = landmass.surface.window(west, north, east, south);
        let mut boxes = plan.as_ref().map(|plan| city::collision::boxes_within(plan, bounds)).unwrap_or_default();
        boxes.extend(layouts.iter().flat_map(|layout| layout::collide::within(&layout.boxes, bounds)));
        let continent = continent.id.clone();
        let (counters, shape_spots, places, paths) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
        NodeFile {
            id,
            kind,
            name,
            continent,
            ring,
            spawns,
            bounds,
            ground,
            boxes,
            counters,
            board: None,
            shape_spots,
            locked: false,
            grounds: None,
            gates: Vec::new(),
            resources: Vec::new(),
            chests: Vec::new(),
            holders: Vec::new(),
            foes: Vec::new(),
            places,
            paths,
        }
    };
    let whole =
        |points: &[world::geometry::Point]| points.iter().map(|point| [point.x as f64, point.y as f64]).collect();
    let drawn = landmass.edits.nodes.iter().map(|node| {
        let laid = layouts.iter().find(|layout| layout.id == node.id && layout.ring.len() >= 3);
        let (ring, spawns) = laid.map_or_else(
            || (whole(&node.ring), whole(&node.spawns)),
            |layout| (layout.ring.clone(), layout.spawns.clone()),
        );
        // As the page's passages go: through an area that leads to a node with a layout of its own.
        let leading = laid.into_iter().flat_map(|layout| &layout.areas).filter_map(|area| area.leads_to.as_ref());
        let gates = leading.filter(|to| layouts.iter().any(|layout| &&layout.id == to)).cloned().collect();
        let resources = laid.map_or_else(Vec::new, |layout| {
            let places = layout.sites.iter().filter(|site| site.kind == layout::sites::SiteKind::Resource);
            places.filter_map(|site| site.node).collect()
        });
        let foes = laid.map(foes_of).unwrap_or_default();
        let patrol = laid.filter(|layout| layout.kind == NodeKind::Patrol);
        let (chests, holders) = (patrol.map(chests_of).unwrap_or_default(), patrol.map(holders_of).unwrap_or_default());
        let places = laid.map(places_of).unwrap_or_default();
        let paths =
            laid.map(|layout| layout.paths.iter().map(|path| path.points.clone()).collect()).unwrap_or_default();
        let grounds = laid.and_then(grounds_of);
        let cut = cut(node.id.clone(), node.kind, node.name.clone(), ring, spawns);
        NodeFile { grounds, gates, resources, chests, holders, foes, places, paths, ..cut }
    });
    let social = plan.as_ref().map(|plan| {
        let (id, social) = (city::social_id(&plan.id), &plan.social);
        let counters = social.stations.iter().filter(|station| answers_gear(station.kind));
        let visited = city::shape_visits(&plan.id);
        NodeFile {
            counters: counters.map(|station| Counter { kind: station.kind, at: station.counter }).collect(),
            board: social.board.map(|board| board.front),
            shape_spots: if visited { social.visitor_spots.clone() } else { Vec::new() },
            locked: !city::social_open(&plan.id),
            ..cut(id, NodeKind::Social, plan.name.clone(), social.ring.clone(), social.spawns.clone())
        }
    });
    Ok(drawn.chain(social).collect())
}

/// Marks each node locked or not by the open list, `open` the ids in `content/world/open.json`
/// ([`land::sites::locked`]); a social space keeps the lock its city gave it (`city::social_open`).
pub fn lock(nodes: &mut [NodeFile], open: &[String]) {
    for node in nodes {
        let social = node.kind == NodeKind::Social && node.locked;
        node.locked = social || land::sites::locked(node.kind, &node.id, open);
    }
}

/// What the layouts are built with: every RMB block file beside the index, the forged models' boxes and the briefs,
/// each left empty where the repository holds none, under the repository's `root`.
pub fn builders(root: &Path) -> Result<Builders, String> {
    let mut builders = Builders::default();
    let rmb = root.join("content/world/rmb");
    if rmb.is_dir() {
        let mut files: Vec<PathBuf> = std::fs::read_dir(&rmb)
            .map_err(|error| format!("{}: {error}", rmb.display()))?
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| {
                path.extension().is_some_and(|extension| extension == "json") && !path.ends_with("index.json")
            })
            .collect();
        files.sort();
        for file in files {
            builders.book.add_blocks(&read_text(&file)?)?;
        }
    }
    let forged = root.join("content/forged");
    for (name, table) in [("buildings.json", &mut builders.book.buildings), ("props.json", &mut builders.book.props)] {
        let path = forged.join(name);
        if path.is_file() {
            *table = layout::book::Book::measures(&read_text(&path)?)?;
        }
    }
    let briefs = root.join("content/world/briefs.json");
    if briefs.is_file() {
        builders.briefs = layout::brief::Briefs::parse(&read_text(&briefs)?)?;
    }
    Ok(builders)
}

fn read_text(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))
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
        let mut nodes = nodes_of(
            &layout.continents[0],
            land::edits::parse(GLADE).unwrap(),
            &Blocks::default(),
            &Builders::default(),
        )
        .unwrap();
        assert_eq!(nodes.len(), 1);
        (nodes.remove(0), layout)
    }

    #[test]
    fn a_layout_s_foes_sites_its_room_stands_are_its_caverns_and_its_runs_beats_short_of_their_end_arenas() {
        let (_, layout) = glade();
        let mut whole = generate(&layout.continents[0], land::edits::parse(GLADE).unwrap()).unwrap();
        let laid =
            layout::settle::settle(&mut whole, &layout::book::Book::default(), &layout::brief::Briefs::default());
        let mut glade = laid.into_iter().find(|each| each.id == "glade").expect("laid");
        glade.areas.truncate(2);
        glade.areas[0].kind = layout::brief::AreaKind::Cave;
        glade.areas[1].kind = layout::brief::AreaKind::Camp;
        let site = |kind, at, holds: Option<&String>| layout::sites::Site {
            kind,
            at,
            radius: 10.0,
            holds: holds.cloned(),
            node: None,
            facing: None,
        };
        let (cave, camp) = (&glade.areas[0], &glade.areas[1]);
        glade.sites = vec![
            site(layout::sites::SiteKind::Foes, cave.at, Some(&cave.name)),
            site(layout::sites::SiteKind::Foes, camp.at, Some(&camp.name)),
            site(layout::sites::SiteKind::Foes, [1.0, 2.0], None),
            site(layout::sites::SiteKind::Objective, [3.0, 4.0], Some(&cave.name)),
        ];
        assert_eq!(foes_of(&glade), vec![glade.areas[0].at, [1.0, 2.0]]);
    }

    #[test]
    fn a_patrols_chest_places_keep_their_facing_and_only_its_props_that_hold_things_are_holders() {
        let (_, layout) = glade();
        let mut whole = generate(&layout.continents[0], land::edits::parse(GLADE).unwrap()).unwrap();
        let laid = layout::settle::settle(&mut whole, &Default::default(), &Default::default());
        let mut glade = laid.into_iter().find(|each| each.id == "glade").expect("laid");
        let chest = layout::sites::Site {
            kind: layout::sites::SiteKind::Chest,
            at: [5.0, 6.0],
            radius: 0.5,
            holds: None,
            node: None,
            facing: Some(1.5),
        };
        glade.sites = vec![chest];
        assert_eq!(chests_of(&glade), vec![[5.0, 6.0, 1.5]]);
        let [middle_x, middle_y] =
            [(glade.ring[0][0] + glade.ring[2][0]) / 2.0, (glade.ring[0][1] + glade.ring[2][1]) / 2.0];
        let seated = |model: u32| layout::seat::Seated {
            model,
            at: [middle_x, middle_y, 10.0],
            yaw: 0.0,
            building: false,
            footprint: [middle_x - 0.4, middle_y - 0.4, middle_x + 0.4, middle_y + 0.4],
            purpose: 0,
            open: false,
            grounded: true,
        };
        // A crate holds things; a rock does not.
        glade.seating.props = vec![seated(41816), seated(41704)];
        let crate_box = dungeon::models::holder(41816).expect("a crate");
        let foot_and_top = [10.0 + crate_box.min[1], 10.0 + crate_box.max[1]];
        let held = holders_of(&glade);
        assert_eq!(held.len(), 1, "the crate alone");
        assert_eq!([held[0][4], held[0][5]], foot_and_top, "its foot and top as it stands");
        assert_eq!(held[0][6], 41_816.0, "and its model, which the page names it by");
    }

    #[test]
    fn a_square_landmass_with_a_node_bakes_its_laid_window_and_section() {
        let (node, layout) = glade();
        assert_eq!((node.id.as_str(), node.continent.as_str(), node.kind), ("glade", "square", NodeKind::Patrol));
        assert_eq!(node.bounds, bounds_of(&node.ring), "the window covers the laid section and its margin");
        let [west, north, east, south] = node.bounds;
        assert!(
            west >= 259_900.0 - 100.0
                && east <= 261_100.0 + 100.0
                && north >= 359_900.0 - 100.0
                && south <= 361_100.0 + 100.0
        );
        let mut whole = generate(&layout.continents[0], land::edits::parse(GLADE).unwrap()).unwrap();
        let laid =
            layout::settle::settle(&mut whole, &layout::book::Book::default(), &layout::brief::Briefs::default());
        for (x, y) in [(260_500.25, 360_500.75), (259_950.5, 361_050.5)] {
            assert_eq!(node.ground.height_at(x, y).to_bits(), whole.surface.height_at(x, y).to_bits());
        }
        // Its room's nodes stand at its layout's resource places, in their order.
        let glade = laid.iter().find(|each| each.id == "glade").expect("laid");
        let resource = |site: &&layout::sites::Site| site.kind == layout::sites::SiteKind::Resource;
        let nodes: Vec<_> = glade.sites.iter().filter(resource).filter_map(|site| site.node).collect();
        assert!(!nodes.is_empty(), "the glade lays resources");
        for site in glade.sites.iter().filter(resource).filter(|site| site.node.is_some()) {
            let [x, y] = site.node.expect("a resource's node");
            let (east, south) = (x - site.at[0], y - site.at[1]);
            let off = (east * east + south * south).sqrt();
            assert!((off - layout::sites::NODE_FRONT_M).abs() < 1e-6, "before its dressing: {off}");
        }
        assert_eq!(node.resources, nodes, "each where its node stands, before its dressing");
    }

    #[test]
    fn a_laid_node_names_its_areas_and_its_runs_as_places_for_the_houses_roads() {
        let layout = world::layout::parse(SQUARE).unwrap();
        let brief = r#"{ "glade": { "theme": "", "areas": [{ "kind": "camp", "name": "The Camp" }] } }"#;
        let builders = Builders { briefs: Briefs::parse(brief).unwrap(), ..Builders::default() };
        let edits = land::edits::parse(GLADE).unwrap();
        let node = nodes_of(&layout.continents[0], edits, &Blocks::default(), &builders).unwrap().remove(0);
        let camp = node.places.iter().find(|place| place.name == "The Camp").expect("the camp is a place");
        assert_eq!(camp.radius, layout::areas::radius_of(layout::brief::AreaKind::Camp, 0));
        let [west, north, east, south] = node.bounds;
        assert!((west..east).contains(&camp.at[0]) && (north..south).contains(&camp.at[1]), "within its window");
        assert!(serde_json::to_string(&node).unwrap().contains(r#""places":[{"name":"The Camp","at":["#));
        assert!(!node.paths.is_empty() && node.paths.iter().all(|path| path.len() >= 2), "its paths, each a way");
    }

    #[test]
    fn a_run_named_as_an_area_is_no_place_of_its_own() {
        let layout = world::layout::parse(SQUARE).unwrap();
        let brief = r#"{ "glade": { "theme": "", "areas": [{ "kind": "keep", "name": "The Keep" }],
            "runs": [{ "name": "The Keep", "kind": "gorge", "place": "rock" }, { "name": "The Cut", "kind": "gorge", "place": "rock" }] } }"#;
        let builders = Builders { briefs: Briefs::parse(brief).unwrap(), ..Builders::default() };
        let edits = land::edits::parse(GLADE).unwrap();
        let node = nodes_of(&layout.continents[0], edits, &Blocks::default(), &builders).unwrap().remove(0);
        let named = |name: &str| node.places.iter().filter(|place| place.name == name).count();
        assert_eq!((named("The Keep"), named("The Cut")), (1, 1), "the area alone, and the run of its own name");
    }

    #[test]
    fn a_patrol_area_s_gate_leads_to_its_instance_and_the_instance_s_way_in_back_and_the_index_says_so() {
        const GLADE_AND_GROVE: &str = r#"{ "strokes": [], "nodes": [{ "id": "glade", "kind": "patrol",
            "name": "The Glade", "ring": [[260000, 360000], [261000, 360000], [261000, 361000], [260000, 361000]],
            "spawns": [[260500, 360500]] }, { "id": "grove", "kind": "mission", "name": "The Grove",
            "ring": [[262000, 360000], [263000, 360000], [263000, 361000], [262000, 361000]],
            "spawns": [[262500, 360500]] }] }"#;
        let layout = world::layout::parse(SQUARE).unwrap();
        let edits = land::edits::parse(GLADE_AND_GROVE).unwrap();
        let nodes = nodes_of(&layout.continents[0], edits, &Blocks::default(), &Builders::default()).unwrap();
        let gates = |id: &str| nodes.iter().find(|node| node.id == id).map(|node| node.gates.clone());
        assert_eq!(gates("glade"), Some(vec!["grove".to_owned()]));
        assert_eq!(gates("grove"), Some(vec!["glade".to_owned()]));
        assert!(nodes.iter().all(|node| Listed::from(node).gates == node.gates), "the index lists them");
    }

    #[test]
    fn nodes_sharing_an_id_one_called_index_and_an_id_too_long_for_a_room_are_refused() {
        let (node, _) = glade();
        let called = |id: &str| NodeFile { id: id.to_owned(), ..node.clone() };
        assert_eq!(ids_problem(&[called("glade"), called("glen")]), None);
        assert_eq!(ids_problem(&[called("glade"), called("glade")]), Some("two nodes are called glade".to_owned()));
        assert!(ids_problem(&[called("index")]).is_some());
        let longest = ids_problem(&[called(&"a".repeat(27))]);
        assert_eq!(longest, None, "node-, 27 and --abyss--dungeon-2--run-00000000 make 64");
        assert!(ids_problem(&[called(&"a".repeat(28))]).is_some());
    }

    #[test]
    fn a_patrol_area_the_open_list_does_not_name_is_written_locked() {
        let (node, _) = glade();
        let mut nodes = vec![node];
        lock(&mut nodes, &[]);
        assert!(nodes[0].locked);
        assert!(serde_json::to_string(&nodes[0]).unwrap().contains(r#""locked":true"#));
        lock(&mut nodes, &["glade".to_owned()]);
        assert!(!nodes[0].locked);
    }

    #[test]
    fn a_social_space_keeps_its_city_s_lock_whatever_the_open_list_says() {
        let (node, _) = glade();
        let social =
            |locked| NodeFile { id: "harbour-social".to_owned(), kind: NodeKind::Social, locked, ..node.clone() };
        let mut nodes = vec![social(true), social(false)];
        lock(&mut nodes, &["harbour-social".to_owned()]);
        assert_eq!([nodes[0].locked, nodes[1].locked], [true, false], "a city's own word on its social space");
    }
}
