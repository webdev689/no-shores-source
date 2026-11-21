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

/// The courts set as scenes: the ways laid as flagstone walks, and each court's own pieces standing, each with a place
/// for the walkers.
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

/// The group-0 solids of the modules named `name`, as the plan stands them.
fn stood_named<'plan>(plan: &'plan Plan, name: &str) -> Vec<&'plan crate::solids::Solid> {
    plan.social
        .solids
        .iter()
        .filter(|solid| {
            let crate::solids::Shape::Module { module, group: 0 } = solid.shape else { return false };
            crate::modules::all().get(module as usize).is_some_and(|found| found.name == name)
        })
        .collect()
}

/// The way a stood module's front faces, east and south.
fn front_of(solid: &crate::solids::Solid, name: &str) -> [f64; 2] {
    let module = &crate::modules::all()[crate::modules::number_of(name).expect("baked") as usize];
    let facing = module.sockets.iter().find(|socket| socket.name == "front").expect("a front").facing;
    let (sine, cosine) = (libm::sin(solid.turn), libm::cos(solid.turn));
    [facing[0] * cosine - facing[1] * sine, facing[0] * sine + facing[1] * cosine]
}

#[test]
fn every_stall_wears_its_keepers_sign_the_harbours_as_well() {
    let (_, plan) = planned();
    let signs: usize = ["mage", "vault", "weaponsmith", "armorsmith", "tailor", "tack", "harbourmaster", "chandler"]
        .iter()
        .map(|keeper| stood_named(plan, &format!("shop-sign-{keeper}")).len())
        .sum();
    assert_eq!(signs, 9, "eight stalls' signs, the vault's twice");
}

#[test]
fn drinkers_sit_at_every_table_and_the_fountains_benches_look_at_it() {
    let (_, plan) = planned();
    for table in stood_named(plan, "table-benches") {
        let drinkers = plan.social.posts.iter().filter(|post| {
            post.task == crate::life::Task::Drink
                && libm::hypot(post.at[0] - table.at[0], post.at[1] - table.at[1]) < 2.5
        });
        assert!(drinkers.count() >= 2, "drinkers at the table at {:?}", table.at);
    }
    let fountain = stood_named(plan, "fountain")[0].at;
    let benches: Vec<_> = stood_named(plan, "bench")
        .into_iter()
        .filter(|bench| libm::hypot(bench.at[0] - fountain[0], bench.at[1] - fountain[1]) < 16.0)
        .collect();
    assert!(benches.len() >= 4, "{} benches round the fountain", benches.len());
    for bench in benches {
        let [x, y] = front_of(bench, "bench");
        let to = [fountain[0] - bench.at[0], fountain[1] - bench.at[1]];
        let cosine = (x * to[0] + y * to[1]) / libm::hypot(to[0], to[1]);
        assert!(cosine > libm::cos(30f64.to_radians()), "the bench at {:?} looks {cosine} toward it", bench.at);
    }
}

#[test]
fn the_ways_round_the_obelisk_keep_to_the_flat_clear_of_its_plinth() {
    let (_, plan) = planned();
    let social = &plan.social;
    let shaft = social.solids.iter().find(|solid| solid.shape == crate::solids::Shape::Pyramid { top: 0.55 });
    let middle = shaft.expect("the obelisk stands").at;
    let near = |at: [f64; 2]| libm::hypot(at[0] - middle[0], at[1] - middle[1]) < 15.0;
    let boxes = crate::collision::boxes_within(plan, ring_bounds(&social.ring));
    let mut round = 0;
    for &[from, to] in &social.ways.links {
        let [one, two] = [social.ways.points[from as usize].at, social.ways.points[to as usize].at];
        if !(near(one) && near(two)) {
            continue;
        }
        round += 1;
        for &[west, north, east, south, top, _] in &boxes {
            let under = (0..=200).any(|step| {
                let share = f64::from(step) / 200.0;
                let [x, y] = [one[0] + (two[0] - one[0]) * share, one[1] + (two[1] - one[1]) * share];
                x > west && x < east && y > north && y < south
            });
            assert!(!under || top - social.level < 0.05, "{one:?} to {two:?} climbs {:.2} m", top - social.level);
        }
    }
    assert!(round >= 4, "{round} ways round the obelisk");
}

#[test]
fn every_market_keeper_is_reached_from_a_way_point_near_their_stall() {
    let (_, plan) = planned();
    let social = &plan.social;
    let keepers: Vec<_> = social.posts.iter().filter(|post| post.task == crate::life::Task::Gesture).collect();
    assert!(keepers.len() >= 12, "{} market keepers", keepers.len());
    for post in keepers {
        let from = social.ways.points[post.reached_from as usize].at;
        let away = libm::hypot(from[0] - post.at[0], from[1] - post.at[1]);
        assert!(away < 25.0, "the keeper at {:?} is reached from {away} m off", post.at);
    }
}

#[test]
fn the_hubs_places_are_named_inside_its_ring_the_quay_among_them() {
    let (_, plan) = planned();
    let social = &plan.social;
    let names: Vec<&str> = social.areas.iter().map(|area| area.name.as_str()).collect();
    for name in [
        "Seaward Walk",
        "Watch Court",
        "West Court",
        "Forge Yard",
        "Beacon Walk",
        "Hall of the Arts",
        "Stair Yard",
        "Quay",
    ] {
        assert!(names.contains(&name), "{name} is named: {names:?}");
    }
    let inside = |[x, y]: [f64; 2]| {
        (0..social.ring.len()).fold(false, |inside, at| {
            let ([x0, y0], [x1, y1]) = (social.ring[at], social.ring[(at + 1) % social.ring.len()]);
            inside ^ ((y0 > y) != (y1 > y) && x < x0 + (y - y0) / (y1 - y0) * (x1 - x0))
        })
    };
    for area in &social.areas {
        assert!(inside(area.at), "{} at {:?} stands in the hub", area.name, area.at);
    }
    // Each where its name puts it: the West Court west of the Watch Court and the Forge Yard east of it; from the quay
    // inland, the Seaward Walk, the Watch Court, the Beacon Walk and the Hall of the Arts.
    let at = |name: &str| social.areas.iter().find(|area| area.name == name).expect("named").at;
    assert!(at("West Court")[0] < at("Watch Court")[0] && at("Watch Court")[0] < at("Forge Yard")[0]);
    let inland = ["Quay", "Seaward Walk", "Watch Court", "Beacon Walk", "Hall of the Arts"].map(|name| at(name)[1]);
    assert!(inland.windows(2).all(|pair| pair[0] < pair[1]), "{inland:?}");
}
