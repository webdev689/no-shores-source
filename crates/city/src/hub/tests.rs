//! Overlook's hub as continent 1's plan lays it: its keepers, its places of Shape's, its ring, and its townsfolk's
//! ways walked with the movement rules over the plan's ground and boxes.

use crate::Plan;
use crate::stations::StationKind;
use std::sync::OnceLock;

/// Continent 1's ground with its city settled, and the city's plan, once for every test.
fn planned() -> &'static (land::ground::Ground, Plan) {
    static PLANNED: OnceLock<(land::ground::Ground, Plan)> = OnceLock::new();
    PLANNED.get_or_init(|| {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let layout = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent = layout.continents.into_iter().find(|continent| continent.id == "continent-1").expect("it");
        let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
        let blocks = crate::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index");
        let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
        let plan = crate::settle(&mut landmass, &blocks).expect("its city settles").expect("Saltmere has a city");
        (landmass.surface, plan)
    })
}

/// The plan's ground as the movement rules read it.
struct Ground<'plan>(&'plan land::ground::Ground);

impl movement::Terrain for Ground<'_> {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        self.0.height_at(x, y)
    }
}

fn ring_bounds(ring: &[[f64; 2]]) -> [f64; 4] {
    ring.iter().fold([f64::MAX, f64::MAX, f64::MIN, f64::MIN], |[west, north, east, south], &[x, y]| {
        [west.min(x), north.min(y), east.max(x), south.max(y)]
    })
}

#[test]
fn every_keeper_has_a_stall_of_their_own_and_shape_eight_places() {
    let (_, plan) = planned();
    let social = &plan.social;
    let count = |kind| social.stations.iter().filter(|station| station.kind == kind).count();
    let kinds = [
        StationKind::Mage,
        StationKind::Armorsmith,
        StationKind::Weaponsmith,
        StationKind::Tailor,
        StationKind::Tack,
        StationKind::Stormcallers,
        StationKind::Lamplighters,
        StationKind::Veiled,
        StationKind::Harbourmaster,
        StationKind::Chandler,
    ];
    for kind in kinds {
        assert_eq!(count(kind), 1, "{kind:?} keeps one stall");
    }
    assert_eq!(count(StationKind::Vault), 2, "two vault houses");
    assert_eq!(social.visitor_spots.len(), 8, "Shape's eight places");
}

#[test]
fn every_counter_spawn_and_place_of_shapes_stands_inside_the_ring() {
    let (_, plan) = planned();
    let social = &plan.social;
    let inside = |[x, y]: [f64; 2]| {
        let mut inside = false;
        for at in 0..social.ring.len() {
            let ([x0, y0], [x1, y1]) = (social.ring[at], social.ring[(at + 1) % social.ring.len()]);
            if (y0 > y) != (y1 > y) && x < x0 + (y - y0) / (y1 - y0) * (x1 - x0) {
                inside = !inside;
            }
        }
        inside
    };
    let counters = social.stations.iter().map(|station| station.counter);
    for point in counters.chain(social.spawns.iter().copied()).chain(social.visitor_spots.iter().copied()) {
        assert!(inside(point), "{point:?} stands outside the hub");
    }
}

/// Walked with the movement rules over the plan's ground, every way keeps clear of every piece either side, and
/// every post is walked to: through the passages, into the Hall, down the Harbour Stair and the road to the pier.
#[test]
fn the_hubs_ways_are_walked_clear_from_the_seaward_walk_to_the_pier() {
    let (ground, plan) = planned();
    let social = &plan.social;
    let boxes = crate::collision::boxes_within(plan, ring_bounds(&social.ring));
    let faults = crate::life::check::faults(&social.ways, &social.posts, &social.ring, &boxes, &Ground(ground));
    assert!(faults.is_empty(), "{} faults:\n{}", faults.len(), faults.join("\n"));
}

/// The courts set as scenes, after the owner's "Populate everything" and "It needs to tell a story, and the pathway
/// needs to be a different texture from the ground": the ways laid as flagstone walks, and each court's own pieces
/// standing, each with a place for the walkers.
#[test]
fn every_court_is_set_as_a_scene_and_its_ways_are_walks() {
    let (_, plan) = planned();
    let social = &plan.social;
    let stood = |names: &[&str]| {
        social
            .solids
            .iter()
            .filter(|solid| {
                let crate::solids::Shape::Module { module, group: 0 } = solid.shape else { return false };
                crate::modules::all().get(module as usize).is_some_and(|found| names.contains(&found.name.as_str()))
            })
            .count()
    };
    let walks = social.solids.iter().filter(|solid| solid.material == crate::solids::Material::Path).count();
    assert!(walks >= 100, "{walks} lengths of walk");
    let ground = |material| social.solids.iter().filter(|solid| solid.material == material).count();
    let (lawn, earth) = (ground(crate::solids::Material::Lawn), ground(crate::solids::Material::Earth));
    assert!(lawn >= 40 && earth >= 20, "{lawn} lengths of lawn and {earth} of earth");
    for (names, least) in [
        (&["market-stall-cloth", "market-stall-bread", "market-stall-flowers"][..], 6),
        (&["court-tree"][..], 8),
        (&["lawn-bed"][..], 6),
        (&["table-benches", "parasol-table"][..], 5),
        (&["woodpile", "barrel-stack", "bale-stack"][..], 6),
    ] {
        assert!(stood(names) >= least, "{names:?} stand {} times", stood(names));
    }
    let visited = social.posts.iter().filter(|post| post.keep == crate::life::Keep::Visited).count();
    assert!(visited >= 60, "{visited} places for the walkers");
}
