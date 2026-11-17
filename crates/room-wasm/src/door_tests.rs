use super::*;
use movement::{Controls, Flat, TICK_SECONDS, standing, step_body};
use protocol::wire::overlook::wire as messages;
use room::sea::Ship;
use serde_json::{Value, json};

fn bytes_of(floats: &[f64]) -> Vec<u8> {
    floats.iter().flat_map(|value| value.to_le_bytes()).collect()
}

/// A node's file as the bake writes it: a section 100 m square on land 10 m up, round a terrace at 12 m with a wall
/// on it.
fn node_file() -> Value {
    let grid = |value: f64| {
        json!({ "width": 4, "height": 4, "left_m": -2000.0, "top_m": -2000.0, "cell_m": 1000.0,
            "first_column": 0, "first_row": 0, "data": vec![value; 16] })
    };
    json!({ "id": "glade", "kind": "patrol", "name": "The Glade", "continent": "square",
        "ring": [[-50.0, -50.0], [50.0, -50.0], [50.0, 50.0], [-50.0, 50.0]], "spawns": [[0.0, 0.0]],
        "bounds": [-150.0, -150.0, 150.0, 150.0],
        "ground": { "land": grid(10.0), "lake_level": vec![0.0; 16], "rivers": [], "roads": [], "towns": [],
            "coast": grid(5000.0), "across": grid(-50.0),
            "pads": [{ "bounds": [-10.0, -10.0, 10.0, 10.0], "level": 12.0 }], "seed": 7 },
        "boxes": [[-5.0, -8.0, 5.0, -7.0, 13.0]] })
}

/// The players in a snapshot, read back through the protocol crate's generated code.
fn players_in(bytes: &[u8]) -> Vec<(PlayerId, u32, movement::Body)> {
    let message = messages::root_as_from_room(bytes).unwrap();
    let players = message.snapshot().unwrap().players().unwrap();
    players
        .iter()
        .map(|seen| {
            let numbers: Vec<f64> = seen.fighter().unwrap().iter().take(22).collect();
            (seen.player(), seen.acknowledged(), protocol::body_of(&numbers).unwrap())
        })
        .collect()
}

/// An input that walks by these controls and asks nothing else.
fn walk_input(sequence: u32, walk: &[f64; 7]) -> Vec<u8> {
    let intent = combat::Intent { controls: Controls::from_floats(walk), ..combat::Intent::default() };
    protocol::input_bytes(&room::Input { sequence, intent, ..room::Input::default() })
}

#[test]
fn a_course_that_is_not_whole_blocks_does_not_open() {
    assert!(!open(&bytes_of(&[1.0])));
    assert!(!open(&bytes_of(&[0.0, 0.0, 1.0, 2.0])));
    assert!(open(&bytes_of(&[0.0, 2.0, -5.0, -4.0, 5.0, -1.0, 2.3])));
}

#[test]
fn players_join_send_inputs_and_are_seen_as_the_movement_rules_step_them() {
    let ledge = [-5.0, -4.0, 5.0, -1.0, 2.3];
    assert!(open(&bytes_of(&[0.0, 2.0, ledge[0], ledge[1], ledge[2], ledge[3], ledge[4]])));
    let (first, second) = (room_join(), room_join());
    let walk = [1.0, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0];
    assert_eq!(input(first, &walk_input(1, &walk)), TAKEN);
    assert_eq!(input(first, &walk_input(3, &walk)), OUT_OF_ORDER);
    assert_eq!(input(second, b"not an input"), NOT_AN_INPUT);
    assert_eq!(input(99, &walk_input(1, &walk)), NO_SUCH_PLAYER);
    room_tick();
    let course = [Block::from_floats(&ledge)];
    let walked = step_body(&standing(0.0, 2.0), &Controls::from_floats(&walk), &course, &Flat, TICK_SECONDS);
    assert_eq!(players_in(&snapshot()), vec![(first, 1, walked), (second, 0, standing(0.0, 2.0))]);
    let welcome = joined(first);
    assert_eq!(messages::root_as_from_room(&welcome).unwrap().joined().unwrap().node(), None, "a course is no node");
}

#[test]
fn a_node_opens_on_its_ground_and_welcomes_with_its_id_and_rect() {
    assert!(open_node(node_file().to_string().as_bytes()));
    let player = room_join();
    let welcome = joined(player);
    let joined = messages::root_as_from_room(&welcome).unwrap().joined().unwrap();
    assert_eq!(joined.node(), Some("glade"));
    assert_eq!(joined.bounds().unwrap().iter().collect::<Vec<_>>(), [-150.0, -150.0, 150.0, 150.0]);
    room_tick();
    let bodies = players_in(&snapshot());
    assert_eq!(bodies[0].2.z, 12.0, "on the terrace at the spawn");
    let walk = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    for sequence in 1..=300 {
        assert_eq!(input(player, &walk_input(sequence, &walk)), TAKEN);
        room_tick();
    }
    let blocked = players_in(&snapshot())[0].2;
    assert!(blocked.y > -7.0, "the box on the terrace stops the body walking north, at {}", blocked.y);
}

#[test]
fn every_node_file_the_bake_writes_opens_a_room_on_its_window_and_boxes() {
    let square = r#"{ "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] }"#;
    let edits = r#"{ "strokes": [],
        "city": { "id": "harbour", "name": "Harbour", "centre": [319000, 360000], "motif": "beacon" },
        "nodes": [{ "id": "glade", "kind": "patrol", "name": "The Glade",
            "ring": [[260000, 360000], [261000, 360000], [261000, 361000], [260000, 361000]], "spawns": [[260500, 360500]] }] }"#;
    let layout = world::layout::parse(square).unwrap();
    let edits = land::edits::parse(edits).unwrap();
    let nodes = bake::nodes_of(&layout.continents[0], edits, &city::rmb::Blocks::default()).unwrap();
    assert_eq!(nodes.iter().map(|node| node.id.as_str()).collect::<Vec<_>>(), ["glade", "harbour-social"]);
    for node in nodes {
        assert!(open_node(serde_json::to_string(&node).unwrap().as_bytes()), "{} opens", node.id);
        let player = room_join();
        let welcome = joined(player);
        let joined = messages::root_as_from_room(&welcome).unwrap().joined().unwrap();
        assert_eq!(joined.node(), Some(node.id.as_str()));
        assert_eq!(joined.bounds().unwrap().iter().collect::<Vec<_>>(), node.bounds);
        let blocks: Vec<Block> = node.boxes.iter().map(Block::from_floats).collect();
        let [x, y] = node.spawns[0];
        let floor = Floor::Land(Box::new(node.ground));
        assert_eq!(players_in(&snapshot())[0].2, room::standing_on(&floor, &blocks, x, y), "{} stands", node.id);
    }
}

#[test]
fn a_node_with_no_spawn_or_text_that_is_no_node_does_not_open() {
    let mut no_spawn = node_file();
    no_spawn["spawns"] = json!([]);
    assert!(!open_node(no_spawn.to_string().as_bytes()));
    assert!(!open_node(b"{}"));
    assert!(!open_node(b"not json"));
}

#[test]
fn the_sea_takes_a_course_refuses_one_across_land_and_shows_each_ship() {
    let layout = r#"{ "continents": [{ "id": "square", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(!open_sea(b"not a layout"));
    assert!(open_sea(layout.as_bytes()));
    let (first, second) = (room_join(), room_join());
    assert_eq!(input(first, &protocol::course_bytes(&[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 10)), TAKEN);
    assert_eq!(input(second, &protocol::course_bytes(&[[50_000.0, 150_000.0], [250_000.0, 150_000.0]], 10)), REFUSED);
    let off_the_steps = protocol::course_bytes(&[[50_000.0, 150_000.0]], 3);
    assert_eq!(input(second, &off_the_steps), TOO_SOON, "one course each half second, dropped as a flood");
    assert_eq!(input(second, b"no course"), NOT_AN_INPUT);
    for _ in 0..room::sea::COURSE_EVERY_TICKS {
        room_tick();
    }
    assert_eq!(input(second, &off_the_steps), REFUSED);
    let bytes = snapshot();
    let ships: Vec<(u32, Ship)> = messages::root_as_from_room(&bytes)
        .unwrap()
        .snapshot()
        .unwrap()
        .ships()
        .unwrap()
        .iter()
        .map(|ship| (ship.player(), Ship { x: ship.x(), y: ship.y(), heading: ship.heading(), pace: ship.pace() }))
        .collect();
    assert_eq!(ships.len(), 1, "only the ship whose course was taken is at sea");
    assert_eq!((ships[0].0, ships[0].1.x, ships[0].1.pace), (first, 50_000.0, 10));
    assert!(ships[0].1.y < 150_000.0);
}

#[test]
fn a_browser_predicts_a_fighter_exactly_as_the_room_steps_it_and_reads_its_arms() {
    assert!(set_course(&bytes_of(&[-5.0, -4.0, 5.0, -1.0, 2.3])));
    let fighter = combat::fighter::player(standing(0.0, 2.0), combat::arms::BARE_HANDS);
    let controls = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let intent = combat::Intent { controls, ..combat::Intent::default() };
    let mut numbers: Vec<f64> = fighter.to_floats().to_vec();
    numbers.extend(intent.to_floats());
    numbers.push(1.0);
    let sword = combat::arms_of("sword_iron", "shield_kite_steel", true);
    numbers.push(f64::from(sword.code()));
    let course = [Block::from_floats(&[-5.0, -4.0, 5.0, -1.0, 2.3])];
    let (expected, _) = combat::player_tick(1, &fighter.holding(sword), &intent, &[], &course, &Flat);
    let next = floats_of(&predict(&bytes_of(&numbers)));
    assert_eq!(Fighter::from_floats(next.as_slice().try_into().unwrap()), expected, "at rest, she takes up the sword");
    let guarding = Fighter { action: combat::Action::Guard { elapsed: 3, window: 0 }, ..fighter };
    let mut asked: Vec<f64> = guarding.to_floats().to_vec();
    asked.extend(intent.to_floats());
    asked.extend([1.0, f64::from(sword.code())]);
    let (kept, _) = combat::player_tick(1, &guarding, &intent, &[], &course, &Flat);
    let next = floats_of(&predict(&bytes_of(&asked)));
    let next = Fighter::from_floats(next.as_slice().try_into().unwrap());
    assert_eq!((next, next.arms.code()), (kept, combat::arms::BARE_HANDS.code()), "on guard, her arms stay");
    assert!(predict(&bytes_of(&[1.0, 2.0])).is_empty());
    assert_eq!(arms_code(b"sword_iron\nshield_kite_steel\ndrawn"), sword.code());
    assert_eq!(arms_code(b"sword_iron\nshield_kite_steel\nworn"), combat::arms::BARE_HANDS.code());
}

#[test]
fn a_course_is_furnished_and_each_players_gear_is_theirs_alone() {
    let mut numbers = vec![7.0, 15.0];
    numbers.extend([-6.0, 14.0, 0.0, -9.0, 17.0, 1.0]);
    assert!(open(&bytes_of(&[0.0, 10.0])));
    assert!(furnish(&bytes_of(&numbers)));
    assert!(!furnish(&bytes_of(&[7.0, 15.0, 1.0])), "a node is three numbers");
    let (first, second) = (room_join(), room_join());
    assert!(!gear(first).is_empty(), "sent once on joining");
    assert!(gear(first).is_empty(), "and not again until it changes");
    let bytes = gear(second);
    let message = messages::root_as_from_room(&bytes).unwrap();
    assert_eq!(message.gear().unwrap().items().unwrap().len(), 5, "the second player's own starting kit");
    assert!(open_sea(include_bytes!("../../../content/world/layout.json")));
    assert!(gear(first).is_empty(), "the sea keeps no gear");
    assert!(!furnish(&bytes_of(&[7.0, 15.0])));
}
