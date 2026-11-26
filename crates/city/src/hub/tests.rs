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
    assert_eq!(social.visitor_spots.len(), 8, "Shape's eight places, one a week by `gear::shape::place`");
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
/// every post is walked to: through the passages, into the Hall, along the Beacon Walk's market, into the Stair Yard.
#[test]
fn the_hubs_ways_are_walked_clear_from_the_seaward_walk_to_the_stair_yard() {
    let (ground, plan) = planned();
    let social = &plan.social;
    let boxes = crate::collision::boxes_within(plan, ring_bounds(&social.ring));
    let faults = crate::life::check::faults(&social.ways, &social.posts, &social.ring, &boxes, &Ground(ground));
    assert!(faults.is_empty(), "{} faults:\n{}", faults.len(), faults.join("\n"));
}

/// Walked or run from each spawn into the seaward parapet, straight and slantwise, a body stays on its feet at the
/// plaza's level: the floor beside the parapet does not sink, so it is never carried up and over to fall.
#[test]
fn a_body_walked_or_run_into_the_seaward_parapet_stays_on_the_plaza() {
    use movement::{Block, Blocks, Body, Controls, Mode, TICK_SECONDS, TUNING, standing, step_body};
    let (ground, plan) = planned();
    let social = &plan.social;
    let list = crate::collision::boxes_within(plan, ring_bounds(&social.ring))
        .into_iter()
        .map(|[min_x, min_y, max_x, max_y, top, bottom]| Block { min_x, min_y, max_x, max_y, top, bottom })
        .collect();
    let blocks = Blocks::new(list);
    // The spawns stand just inside the seaward parapet: seaward is from the plaza's middle toward them.
    let [west, north, east, south] = social.bounds;
    let count = social.spawns.len() as f64;
    let toward = [
        social.spawns.iter().map(|spawn| spawn[0]).sum::<f64>() / count - (west + east) / 2.0,
        social.spawns.iter().map(|spawn| spawn[1]).sum::<f64>() / count - (north + south) / 2.0,
    ];
    let seaward = libm::atan2(toward[0], -toward[1]);
    for &[x, y] in &social.spawns {
        for (turn, run) in [(0.0, false), (0.0, true), (0.6, false), (-0.6, true)] {
            let controls = Controls { forward: 1.0, yaw: seaward + turn, run, ..Controls::default() };
            let mut body = Body { z: social.level, ..standing(x, y) };
            for tick in 0..240 {
                body = step_body(&body, &controls, &blocks, &Ground(ground), TICK_SECONDS);
                assert!(
                    body.z > social.level - TUNING.step,
                    "from {:?}, turned {turn}, run {run}: {:.2} m under the plaza at tick {tick}, ({:.2}, {:.2})",
                    [x, y],
                    social.level - body.z,
                    body.x,
                    body.y,
                );
            }
            assert_eq!(body.mode, Mode::Ground, "from {:?}, turned {turn}, run {run}", [x, y]);
        }
    }
}

/// The pads blend a seam toward another level at most a body's step, so no floor sinks past what a body steps.
#[test]
fn a_seam_blends_at_most_a_body_s_step() {
    assert_eq!(land::pads::BLEND_MOST_M, movement::TUNING.step);
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
fn the_bounty_board_stands_on_its_landing_facing_the_court_read_clear_of_every_counter() {
    let (_, plan) = planned();
    let social = &plan.social;
    let board = social.board.expect("Overlook's hub holds the bounty board");
    let [_, wide, long, high] = super::BOARD_LANDING_M;
    let sized = |solid: &&crate::solids::Solid| {
        let mut size = [solid.size[0], solid.size[1]];
        size.sort_by(f64::total_cmp);
        (size[0] - wide).abs() < 1e-9 && (size[1] - long).abs() < 1e-9 && (solid.size[2] - high).abs() < 1e-9
    };
    let landing = social.solids.iter().find(sized).expect("the landing").bounds();
    let on = |[x, y]: [f64; 2], inset: f64| {
        x > landing[0] + inset && x < landing[2] - inset && y > landing[1] + inset && y < landing[3] - inset
    };
    assert!(on(board.at, 0.5) && on(board.front, 0.5), "the board and where it is read on the landing");
    let pieces: Vec<_> = social
        .solids
        .iter()
        // The range's banner hangs over it on the wall behind.
        .filter(|solid| !matches!(solid.shape, crate::solids::Shape::Module { .. }))
        .map(crate::solids::Solid::bounds)
        .filter(|piece| {
            let apart =
                libm::hypot((piece[0] + piece[2]) / 2.0 - board.at[0], (piece[1] + piece[3]) / 2.0 - board.at[1]);
            apart < 2.2 && piece[4] > landing[4] + 1e-9
        })
        .collect();
    assert_eq!(pieces.len(), 11, "its posts, face, six notices, lamp and roof");
    assert!(pieces.iter().all(|piece| piece[4] >= landing[5] - 1e-9), "standing on its top");
    let middle = [(social.bounds[0] + social.bounds[2]) / 2.0, (social.bounds[1] + social.bounds[3]) / 2.0];
    let from = |[x, y]: [f64; 2]| libm::hypot(x - middle[0], y - middle[1]);
    assert!(from(board.front) < from(board.at) - 1.9, "its face toward the court");
    // Twice a counter's reach (the room's 4 m) apart, so where the board serves no other counter does: every
    // station's, the Harbourmaster's among them, and every spot Shape may stand at.
    let counters = social.stations.iter().map(|station| station.counter).chain(social.visitor_spots.iter().copied());
    for [x, y] in counters {
        let apart = libm::hypot(board.front[0] - x, board.front[1] - y);
        assert!(apart > 8.0, "a counter {apart:.1} m from where the board is read");
    }
}

#[test]
fn the_postmasters_counter_stands_in_the_watch_court_clear_of_every_other_counter_the_board_and_the_arrivals() {
    let (_, plan) = planned();
    let social = &plan.social;
    let mail: Vec<_> = social.stations.iter().filter(|station| station.kind == StationKind::Mail).collect();
    assert_eq!(mail.len(), 1, "one mail counter, Overlook's");
    let at = mail[0].counter;
    let board = social.board.expect("the bounty board").front;
    let others =
        social.stations.iter().filter(|station| station.kind != StationKind::Mail).map(|station| station.counter);
    let spots = social.visitor_spots.iter().chain(&social.spawns).copied();
    // Twice a counter's reach (the room's 4 m) apart, so where the mail serves no other counter does.
    for [x, y] in others.chain(spots).chain([board]) {
        let apart = libm::hypot(at[0] - x, at[1] - y);
        assert!(apart > 8.0, "something {apart:.1} m from the mail counter");
    }
    // Served before the counter, as a stall is, its keeper behind it: the ring round where it is served clears the rack
    // 3 m behind the counter.
    let keeper = mail[0].keeper;
    assert!(libm::hypot(keeper[0] - at[0], keeper[1] - at[1]) > 2.4, "its keeper behind the counter");
}

#[test]
fn the_hubs_places_are_named_inside_its_ring() {
    let (_, plan) = planned();
    let social = &plan.social;
    let names: Vec<&str> = social.areas.iter().map(|area| area.name.as_str()).collect();
    for name in
        ["Seaward Walk", "Watch Court", "West Court", "Forge Yard", "Beacon Walk", "Hall of the Arts", "Stair Yard"]
    {
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
    // Each where its name puts it: the West Court west of the Watch Court and the Forge Yard east of it; from the sea
    // inland, the Seaward Walk, the Watch Court, the Beacon Walk and the Hall of the Arts.
    let at = |name: &str| social.areas.iter().find(|area| area.name == name).expect("named").at;
    assert!(at("West Court")[0] < at("Watch Court")[0] && at("Watch Court")[0] < at("Forge Yard")[0]);
    let inland = ["Seaward Walk", "Watch Court", "Beacon Walk", "Hall of the Arts"].map(|name| at(name)[1]);
    assert!(inland.windows(2).all(|pair| pair[0] < pair[1]), "{inland:?}");
}

/// Shape stands where no one walks or stands: each of his places is over a metre clear of every walker, who keeps 0.7 m
/// right of a way's middle and of the walk to a post (the page's `KEEP_RIGHT_M`), and of every post.
#[test]
fn shapes_places_stand_clear_of_the_townsfolks_ways_and_posts() {
    let (_, plan) = planned();
    let social = &plan.social;
    let ways = &social.ways;
    let mut near = Vec::new();
    // The ways' links, and the walk from each post to the way point it is reached from.
    let links = ways.links.iter().map(|&[one, two]| [ways.points[one as usize].at, ways.points[two as usize].at]);
    let to_posts = social.posts.iter().map(|post| [ways.points[post.reached_from as usize].at, post.at]);
    let walks: Vec<[[f64; 2]; 2]> = links.chain(to_posts).collect();
    for &spot in &social.visitor_spots {
        for &link in &walks {
            let apart = super::dress::point_to_segment(spot, link);
            if apart < 1.7 {
                near.push(format!("{spot:?} {apart:.2} m from the way {link:?}"));
            }
        }
        for post in &social.posts {
            let apart = libm::hypot(post.at[0] - spot[0], post.at[1] - spot[1]);
            if apart <= 1.0 {
                near.push(format!("{spot:?} {apart:.2} m from the post at {:?}", post.at));
            }
        }
    }
    assert!(near.is_empty(), "{}", near.join("\n"));
}

/// A talker and whoever they talk with, kept at posts side by side, face each other.
#[test]
fn a_pair_at_posts_side_by_side_face_each_other() {
    let (_, plan) = planned();
    let posts = &plan.social.posts;
    let faces = |from: &crate::life::Post, to: &crate::life::Post| {
        let toward = [to.at[0] - from.at[0], to.at[1] - from.at[1]];
        libm::sin(from.facing) * toward[0] - libm::cos(from.facing) * toward[1] > 0.0
    };
    let mut away = Vec::new();
    for (nth, one) in posts.iter().enumerate() {
        for two in &posts[nth + 1..] {
            let apart = libm::hypot(two.at[0] - one.at[0], two.at[1] - one.at[1]);
            let talking = one.task == crate::life::Task::Gesture || two.task == crate::life::Task::Gesture;
            if talking && apart < 2.5 && !(faces(one, two) && faces(two, one)) {
                away.push(format!("{:?} at {:?} and {:?} at {:?}", one.task, one.at, two.task, two.at));
            }
        }
    }
    assert!(away.is_empty(), "{}", away.join("\n"));
}

/// The harbour way is sealed at its head: the ring takes in none of the city's ramps, no counter, place of Shape's or
/// way's point stands on one, and a body walked from the Stair Yard at the switchback's head, straight or slantwise,
/// never sets foot on it, stopped by the gate and its wall.
#[test]
fn the_harbour_way_is_sealed_at_its_head_and_nothing_walked_or_used_lies_past_it() {
    use movement::{Block, Blocks, Body, Controls, TICK_SECONDS, standing, step_body};
    let (ground, plan) = planned();
    let social = &plan.social;
    let on = |[x, y]: [f64; 2], [west, north, east, south]: [f64; 4]| x > west && x < east && y > north && y < south;
    // Each pad taken in half a metre, where the switchback's top meets the platform's edge.
    let inset = |[west, north, east, south]: [f64; 4]| [west + 0.5, north + 0.5, east - 0.5, south - 0.5];
    let pads: Vec<([f64; 4], f64)> = plan.ramps.iter().map(|ramp| (inset(ramp.pad.bounds), ramp.pad.level)).collect();
    assert!(!pads.is_empty(), "the city lays its ramps");
    let used = social.stations.iter().map(|station| station.counter);
    let points = social.ways.points.iter().map(|point| point.at);
    for point in used.chain(social.visitor_spots.iter().copied()).chain(points).chain(social.ring.iter().copied()) {
        assert!(!pads.iter().any(|&(pad, _)| on(point, pad)), "{point:?} stands on the harbour way");
    }
    let list = crate::collision::boxes_within(plan, ring_bounds(&social.ring))
        .into_iter()
        .map(|[min_x, min_y, max_x, max_y, top, bottom]| Block { min_x, min_y, max_x, max_y, top, bottom })
        .collect();
    let blocks = Blocks::new(list);
    let head = plan
        .ramps
        .iter()
        .filter(|ramp| ramp.piece == crate::ramps::Piece::Landing)
        .max_by(|one, two| one.pad.level.total_cmp(&two.pad.level))
        .expect("the switchback's head");
    let [west, north, east, south] = head.pad.bounds;
    let middle = [f64::midpoint(west, east), f64::midpoint(north, south)];
    let yard = social.areas.iter().find(|area| area.name == "Stair Yard").expect("named").at;
    let toward = libm::atan2(middle[0] - yard[0], -(middle[1] - yard[1]));
    for along in [-12.0, -6.0, 0.0, 6.0, 12.0, 18.0] {
        let start = [middle[0] + (yard[0] - middle[0]) * 0.25, middle[1] + along];
        for turn in [0.0, 0.5, -0.5] {
            let controls = Controls { forward: 1.0, yaw: toward + turn, run: true, ..Controls::default() };
            let mut body = Body { z: social.level, ..standing(start[0], start[1]) };
            for _ in 0..600 {
                body = step_body(&body, &controls, &blocks, &Ground(ground), TICK_SECONDS);
                // On the way's floor; a body may still climb the wall, as any of the hub's sealed gates.
                let reached = pads.iter().any(|&(pad, level)| on([body.x, body.y], pad) && body.z < level + 2.0);
                assert!(!reached, "from {start:?}, turned {turn}: on the harbour way at ({}, {})", body.x, body.y);
            }
        }
    }
}

/// The Harbourmaster's stall and the chandlery stand in the Beacon Walk's market, among the market's stalls.
#[test]
fn the_harbourmaster_and_the_chandler_keep_stalls_in_the_beacon_walks_market() {
    let (_, plan) = planned();
    let social = &plan.social;
    let walk = social.areas.iter().find(|area| area.name == "Beacon Walk").expect("named").at;
    let market: Vec<[f64; 2]> = social
        .posts
        .iter()
        .filter(|post| post.task == crate::life::Task::Gesture)
        .map(|post| post.at)
        .filter(|at| libm::hypot(at[0] - walk[0], at[1] - walk[1]) < 110.0)
        .collect();
    assert!(market.len() >= 3, "the market's keepers: {market:?}");
    for kind in [StationKind::Harbourmaster, StationKind::Chandler] {
        let station = social.stations.iter().find(|station| station.kind == kind).expect("a stall");
        let nearest = market
            .iter()
            .map(|at| libm::hypot(at[0] - station.counter[0], at[1] - station.counter[1]))
            .fold(f64::INFINITY, f64::min);
        assert!(nearest < 30.0, "{kind:?} stands {nearest:.1} m from the nearest market stall");
        let from_walk = libm::hypot(station.counter[0] - walk[0], station.counter[1] - walk[1]);
        assert!(from_walk < 100.0, "{kind:?} stands {from_walk:.1} m from the Beacon Walk's middle");
    }
}

#[test]
fn the_platform_round_the_plaza_is_floored_as_the_plaza_is_never_left_to_the_land() {
    // The city's plate is drawn a few centimetres under its level, where the land's grass stands: a walk floored by
    // the plate alone shows the two in turn as the eye moves. Every walked point needs a floor of the hub's own, its top
    // at the level or over it, or a piece standing on it.
    use crate::solids::Shape;
    let (_, plan) = planned();
    let social = &plan.social;
    let level = social.level;
    let floors: Vec<_> = social
        .solids
        .iter()
        .filter(|solid| {
            matches!(solid.shape, Shape::Block | Shape::Module { .. }) && solid.lean == 0.0 && solid.roll == 0.0
        })
        .filter(|solid| solid.at[2] <= level + 0.01 && solid.at[2] + solid.size[2] >= level - 1e-9)
        .collect();
    let floored = |[x, y]: [f64; 2]| {
        floors.iter().any(|solid| {
            let ([dx, dy], (sine, cosine)) = ([x - solid.at[0], y - solid.at[1]], libm::sincos(solid.turn));
            let (across, along) = (dx * cosine + dy * sine, -dx * sine + dy * cosine);
            across.abs() <= solid.size[0] / 2.0 + 1e-6 && along.abs() <= solid.size[1] / 2.0 + 1e-6
        })
    };
    let [west, north, east, south] = ring_bounds(&social.ring);
    let mut bare = Vec::new();
    let mut y = north + 0.25;
    while y < south {
        let mut x = west + 0.25;
        while x < east {
            if super::dress::inside(&social.ring, [x, y]) && !floored([x, y]) {
                bare.push([x, y]);
            }
            x += 2.0;
        }
        y += 2.0;
    }
    assert!(
        bare.is_empty(),
        "{} points of the platform floored by the plate alone, e.g. {:?}",
        bare.len(),
        &bare[..bare.len().min(4)]
    );
}

#[test]
fn where_a_walk_overlaps_another_piece_of_flagstones_one_of_another_grain_lies_under_it() {
    // A walk's strip wears its flags along it, every other piece of flagstones the world's grain (`solidMesh.ts`):
    // two of a different grain level with each other would show both in turn.
    use crate::solids::{Material, Shape};
    let (_, plan) = planned();
    let social = &plan.social;
    let flags: Vec<_> = social.solids.iter().filter(|solid| solid.material == Material::Path).collect();
    // A strip's grain: its way and the line it runs along; every other piece's the world's.
    let grain = |solid: &crate::solids::Solid| {
        let (sine, cosine) = libm::sincos(solid.turn);
        let strip = matches!(solid.shape, Shape::Block) && solid.size[0] > 3.0;
        strip.then(|| {
            ((solid.turn * 1e3).round() as i64, ((solid.at[0] * cosine + solid.at[1] * sine) * 1e2).round() as i64)
        })
    };
    let covers = |solid: &crate::solids::Solid, [x, y]: [f64; 2]| {
        let ([dx, dy], (sine, cosine)) = ([x - solid.at[0], y - solid.at[1]], libm::sincos(solid.turn));
        let (across, along) = (dx * cosine + dy * sine, -dx * sine + dy * cosine);
        match solid.shape {
            Shape::Column { .. } => libm::hypot(across, along) < solid.size[0] / 2.0 - 0.01,
            _ => across.abs() < solid.size[0] / 2.0 - 0.01 && along.abs() < solid.size[1] / 2.0 - 0.01,
        }
    };
    let [west, north, east, south] = ring_bounds(&social.ring);
    let mut level = Vec::new();
    let mut y = north;
    while y < south {
        let mut x = west;
        while x < east {
            let over: Vec<_> = flags.iter().filter(|solid| covers(solid, [x, y])).collect();
            let top = over.iter().map(|solid| solid.at[2] + solid.size[2]).fold(f64::MIN, f64::max);
            let topmost: Vec<_> = over.iter().filter(|solid| solid.at[2] + solid.size[2] > top - 0.001).collect();
            if topmost.iter().any(|solid| grain(solid) != grain(topmost[0])) {
                level.push([x, y]);
            }
            x += 0.5;
        }
        y += 0.5;
    }
    assert!(
        level.is_empty(),
        "{} points where two grains lie level, e.g. {:?}",
        level.len(),
        &level[..level.len().min(4)]
    );
}
