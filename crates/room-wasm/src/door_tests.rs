use super::*;
use crate::gear_door::{NodeCounter, counter_of};
use combat::Fighter;
use combat::sight::apart;
use movement::{Controls, Flat, TICK_SECONDS, Terrain, standing, step_body};
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
        "boxes": [[-5.0, -8.0, 5.0, -7.0, 13.0, 12.0]] })
}

/// The players in a snapshot, read back through the protocol crate's generated code.
fn players_in(bytes: &[u8]) -> Vec<(PlayerId, u32, movement::Body)> {
    let message = messages::root_as_from_room(bytes).unwrap();
    let players = message.snapshot().unwrap().players().unwrap();
    players
        .iter()
        .map(|seen| {
            // The player the snapshot is for has their fighter whole; everyone else's is packed.
            let numbers: Vec<f64> = seen.fighter().map_or_else(
                || {
                    protocol::pack::unpack(seen.packed().unwrap().bytes(), protocol::UNTRIMMED_FLOATS, [0.0; 2])
                        .unwrap()
                },
                |fighter| fighter.iter().collect(),
            );
            (seen.player(), seen.acknowledged(), protocol::body_of(&numbers[..movement::floats::BODY_FLOATS]).unwrap())
        })
        .collect()
}

/// An input that walks by these controls and asks nothing else.
fn walk_input(sequence: u32, walk: &[f64; 8]) -> Vec<u8> {
    let intent = combat::Intent { controls: Controls::from_floats(walk), ..combat::Intent::default() };
    protocol::input_bytes(&room::Input { sequence, intent, ..room::Input::default() })
}

#[test]
fn a_course_that_is_not_whole_blocks_does_not_open() {
    assert!(!open(&bytes_of(&[1.0])));
    assert!(!open(&bytes_of(&[0.0, 0.0, 1.0, 2.0])));
    assert!(open(&bytes_of(&[0.0, 2.0, -5.0, -4.0, 5.0, -1.0, 2.3, 0.0])));
}

#[test]
fn players_join_send_inputs_and_are_seen_as_the_movement_rules_step_them() {
    let ledge = [-5.0, -4.0, 5.0, -1.0, 2.3, 0.0];
    assert!(open(&bytes_of(&[0.0, 2.0, ledge[0], ledge[1], ledge[2], ledge[3], ledge[4], ledge[5]])));
    let (first, second) = (room_join(), room_join());
    let walk = [1.0, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0];
    assert_eq!(input(first, &walk_input(1, &walk)), TAKEN);
    assert_eq!(input(first, &walk_input(3, &walk)), OUT_OF_ORDER);
    assert_eq!(input(second, b"not an input"), NOT_AN_INPUT);
    assert_eq!(input(99, &walk_input(1, &walk)), NO_SUCH_PLAYER);
    room_tick();
    let course = [Block::from_floats(&ledge)];
    let walked = step_body(&standing(0.0, 2.0), &Controls::from_floats(&walk), &course, &Flat, TICK_SECONDS);
    let seen = players_in(&snapshot(first));
    assert_eq!(seen[0], (first, 1, walked), "the player the snapshot is for, whole");
    // Everyone else crosses packed, within half a thousandth: a standing body faces π as 3.142.
    let (other, stood) = (seen[1].2, standing(0.0, 2.0));
    assert_eq!((seen[1].0, seen[1].1, other.x, other.y, other.z), (second, 0, stood.x, stood.y, stood.z));
    assert!((other.facing - stood.facing).abs() <= 0.0005);
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
    let bodies = players_in(&snapshot(player));
    assert_eq!(bodies[0].2.z, 12.0, "on the terrace at the spawn");
    let walk = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    for sequence in 1..=300 {
        assert_eq!(input(player, &walk_input(sequence, &walk)), TAKEN);
        room_tick();
    }
    let blocked = players_in(&snapshot(player))[0].2;
    assert!(blocked.y > -7.0, "the box on the terrace stops the body walking north, at {}", blocked.y);
}

#[test]
fn every_open_node_file_the_bake_writes_opens_a_room_on_its_window_and_boxes() {
    let square = r#"{ "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] }"#;
    let edits = r#"{ "strokes": [],
        "city": { "id": "sunspire", "name": "Sunspire", "centre": [319000, 360000], "motif": "beacon" },
        "nodes": [{ "id": "glade", "kind": "patrol", "name": "The Glade",
            "ring": [[260000, 360000], [261000, 360000], [261000, 361000], [260000, 361000]], "spawns": [[260500, 360500]] }] }"#;
    let layout = world::layout::parse(square).unwrap();
    let edits = land::edits::parse(edits).unwrap();
    let nodes = bake::nodes_of(&layout.continents[0], edits, &city::rmb::Blocks::default(), &bake::Builders::default())
        .unwrap();
    assert_eq!(nodes.iter().map(|node| node.id.as_str()).collect::<Vec<_>>(), ["glade", "sunspire-social"]);
    for mut node in nodes {
        // A social space still locked takes no player, as a locked patrol area does; opened, it stands as any other.
        let locked = node.id == "sunspire-social";
        assert_eq!(node.locked, locked, "{} is locked: only Overlook's social space is open", node.id);
        assert!(open_node(serde_json::to_string(&node).unwrap().as_bytes()), "{} opens", node.id);
        assert_eq!(room_join() == 0, locked, "{} takes a player only once open", node.id);
        node.locked = false;
        assert!(open_node(serde_json::to_string(&node).unwrap().as_bytes()), "{} opens", node.id);
        // Every counter the bake writes is one the room serves: a name it does not know would drop its counter.
        let written: Vec<NodeCounter> = serde_json::from_value(serde_json::to_value(&node.counters).unwrap()).unwrap();
        assert_eq!(written.iter().filter_map(counter_of).count(), written.len(), "{}'s counters", node.id);
        assert_eq!(
            written.len(),
            if locked { 11 } else { 0 },
            "every keeper but the chandler's, and the Harbourmaster's"
        );
        let player = room_join();
        let welcome = joined(player);
        let joined = messages::root_as_from_room(&welcome).unwrap().joined().unwrap();
        assert_eq!(joined.node(), Some(node.id.as_str()));
        assert_eq!(joined.bounds().unwrap().iter().collect::<Vec<_>>(), node.bounds);
        let blocks: Vec<Block> = node.boxes.iter().map(Block::from_floats).collect();
        let [x, y] = node.spawns[0];
        let floor = Floor::Land(Box::new(node.ground));
        assert_eq!(players_in(&snapshot(player))[0].2, room::standing_on(&floor, &blocks, x, y), "{} stands", node.id);
    }
}

#[test]
fn a_locked_nodes_room_takes_no_player_and_says_why_and_any_other_takes_them() {
    let mut locked = node_file();
    locked["locked"] = json!(true);
    assert!(open_node(locked.to_string().as_bytes()));
    assert_eq!(room_join(), 0, "no player joins a locked node");
    assert_eq!(refusal().as_deref(), Some("The Glade is locked"));
    assert!(open_node(node_file().to_string().as_bytes()));
    assert_ne!(room_join(), 0);
    assert_eq!(refusal(), None);
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
fn an_open_sea_holds_the_unix_minute_it_is_set_to() {
    let layout = r#"{ "continents": [{ "id": "square", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(open_sea(layout.as_bytes(), 7));
    assert!(set_minute(29_891_520), "a sea takes the minute as a land room does");
    with_open(|opened| {
        let Opened::Sea(sea) = opened else { panic!("a sea is open") };
        assert_eq!(sea.minute, 29_891_520);
    });
}

#[test]
fn an_open_sea_takes_the_hosts_own_loot_and_world_seeds() {
    let layout = r#"{ "continents": [{ "id": "square", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(open_sea(layout.as_bytes(), 7));
    assert!(crate::gear_door::reseed([1, 2, 3, 4]), "a sea is reseeded as a room on land is");
}

#[test]
fn the_sea_takes_a_course_refuses_one_across_land_and_shows_each_ship() {
    let layout = r#"{ "continents": [{ "id": "square", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(!open_sea(b"not a layout", 7));
    assert!(open_sea(layout.as_bytes(), 7));
    let (first, second) = (room_join(), room_join());
    assert_eq!(input(first, &protocol::course_bytes(&[[50_000.0, 150_000.0], [50_000.0, 50_000.0]], 10)), TAKEN);
    assert_eq!(input(second, &protocol::course_bytes(&[[50_000.0, 150_000.0], [250_000.0, 150_000.0]], 10)), REFUSED);
    let off_the_steps = protocol::course_bytes(&[[50_000.0, 150_000.0]], 3);
    assert_eq!(input(second, &off_the_steps), TOO_SOON, "one course each half second, dropped as a flood");
    assert_eq!(input(second, b"no course"), NOT_AN_INPUT);
    assert_eq!(input(second, &protocol::chase_bytes(3)), TAKEN, "a chase is taken, whoever it is");
    assert_eq!(input(second, &protocol::chase_bytes(0)), TAKEN, "and let go");
    for _ in 0..room::sea::COURSE_EVERY_TICKS {
        room_tick();
    }
    assert_eq!(input(second, &off_the_steps), REFUSED);
    let bytes = snapshot(first);
    let ships: Vec<(u32, Ship)> = messages::root_as_from_room(&bytes)
        .unwrap()
        .snapshot()
        .unwrap()
        .ships()
        .unwrap()
        .iter()
        .map(|ship| {
            (
                ship.player(),
                Ship { x: ship.x(), y: ship.y(), heading: ship.heading(), pace: ship.pace(), rate: ship.pace() },
            )
        })
        .collect();
    assert_eq!(ships.len(), 1, "only the ship whose course was taken is at sea");
    assert_eq!((ships[0].0, ships[0].1.x, ships[0].1.pace), (first, 50_000.0, 10));
    assert!(ships[0].1.y < 150_000.0);
}

#[test]
fn the_sea_opens_on_a_layout_with_its_ports_whose_lanes_the_tithe_patrols() {
    let layout = include_str!("../../../content/world/layout.json");
    let ports: Vec<serde_json::Value> = (1..=9)
        .map(|n| {
            let path = format!("{}/../../content/world/land/continent-{n}.json", env!("CARGO_MANIFEST_DIR"));
            let file: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
            let city = &file["city"];
            json!({ "id": city["id"], "name": city["name"], "continent": format!("continent-{n}"), "centre": city["centre"] })
        })
        .collect();
    let request = format!(r#"{{"layout":{layout},"ports":{}}}"#, serde_json::Value::Array(ports));
    assert!(open_sea(request.as_bytes(), 7));
    assert!(!open_sea(format!(r#"{{"layout":{layout}}}"#).as_bytes(), 7), "a layout wrapped with no ports");
    assert!(open_sea(layout.as_bytes(), 7), "a layout alone, with no lanes");
}

/// Both tests hold this value: roomDoor.test.ts runs the same sea through WebAssembly, as the servers and the page do.
pub const SEA_CLASH_HASH: &str = "8aa4922bbf32e293";

/// A new player handed the Sloop, as the Harbourmaster hands it over in the welcome: one the sea lets in.
fn sailor() -> gear::Character {
    let mut character = gear::Character::starting();
    assert!(character.give_first_ship());
    character
}
/// The world time the sea opens at, so the weather its fights sail in is the same every run.
pub const CLASH_START_S: f64 = 1_790_153_100.0;

#[test]
fn a_sea_where_a_tithe_ship_attacks_a_friendly_ship_and_a_player_joins_them_snapshots_to_its_pinned_fingerprint() {
    // On this seed a bold Tithe ship comes out by the lane as the player sails from Sunspire, and attacks a friendly ship
    // there half a minute out; the player turns for them and joins the fight beside the friendly ship.
    assert!(open_sea(TRAFFIC_SEA.as_bytes(), 6));
    room_world_start(CLASH_START_S);
    let player = room_join();
    assert_eq!(input(player, &protocol::course_bytes(&[[450_000.0, 97_000.0], [340_000.0, 92_000.0]], 10)), TAKEN);
    let (mut hash, mut clashed, mut three) = (0xcbf2_9ce4_8422_2325_u64, false, false);
    for tick in 1..=16_000 {
        if tick == 1_831 {
            assert_eq!(input(player, &protocol::course_bytes(&[[441_700.0, 96_800.0]], 10)), TAKEN);
        }
        room_tick();
        with_open(|opened| {
            if let Opened::Sea(sea) = opened {
                clashed |= !sea.clashes().is_empty();
                let beside = |fought: &room::sea::SeaFight| fought.fight.ships.len() == 3 && !fought.friends.is_empty();
                three |= sea.fights().any(|(_, fought)| beside(fought));
            }
        });
        if tick % 60 == 0 {
            hash = snapshot(player)
                .iter()
                .fold(hash, |hash, byte| (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3));
        }
    }
    assert!(clashed && three, "the Tithe ship attacked, and the player joined beside the friendly ship");
    assert_eq!(format!("{hash:016x}"), SEA_CLASH_HASH);
}

#[test]
fn a_browser_predicts_a_fighter_exactly_as_the_room_steps_it_and_reads_its_arms() {
    assert!(set_course(&bytes_of(&[-5.0, -4.0, 5.0, -1.0, 2.3, 0.0])));
    let fighter = combat::fighter::player(standing(0.0, 2.0), combat::arms::BARE_HANDS);
    let controls = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let intent = combat::Intent { controls, ..combat::Intent::default() };
    let mut numbers: Vec<f64> = fighter.to_floats().to_vec();
    numbers.extend(intent.to_floats());
    numbers.push(1.0);
    let sword = combat::arms_of("sword_iron", "shield_kite_steel", true);
    numbers.push(f64::from(sword.code()));
    let course = [Block::from_floats(&[-5.0, -4.0, 5.0, -1.0, 2.3, 0.0])];
    let (expected, _) = combat::player_tick(1, &fighter.holding(sword), &intent, &[], &course, &Flat);
    let next = floats_of(&predict(&bytes_of(&numbers)));
    assert_eq!(Fighter::from_floats(next.as_slice().try_into().unwrap()), expected, "at rest, they take up the sword");
    let guarding = Fighter { action: combat::Action::Guard { elapsed: 3, window: 0 }, ..fighter };
    let mut asked: Vec<f64> = guarding.to_floats().to_vec();
    asked.extend(intent.to_floats());
    asked.extend([1.0, f64::from(sword.code())]);
    let (kept, _) = combat::player_tick(1, &guarding, &intent, &[], &course, &Flat);
    let next = floats_of(&predict(&bytes_of(&asked)));
    let next = Fighter::from_floats(next.as_slice().try_into().unwrap());
    assert_eq!((next, next.arms.code()), (kept, combat::arms::BARE_HANDS.code()), "on guard, their arms stay");
    assert!(predict(&bytes_of(&[1.0, 2.0])).is_empty());
    assert_eq!(arms_code(b"sword_iron\nshield_kite_steel\ndrawn"), sword.code());
    assert_eq!(arms_code(b"sword_iron\nshield_kite_steel\nworn"), combat::arms::BARE_HANDS.code());
}

#[test]
fn a_browser_predicts_a_fighter_on_a_node_s_ground_as_its_room_steps_it() {
    let file = node_file();
    let ground = file["ground"].to_string();
    assert!(!set_ground(b"not ground"));
    assert!(set_ground(ground.as_bytes()));
    assert!(set_course(&bytes_of(&[-5.0, -8.0, 5.0, -7.0, 13.0, 0.0])));
    let floor = Floor::Land(Box::new(serde_json::from_str(&ground).unwrap()));
    let fighter = combat::fighter::player(room::standing_on(&floor, &[], 30.0, -40.0), combat::arms::BARE_HANDS);
    let controls = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let intent = combat::Intent { controls, ..combat::Intent::default() };
    let mut numbers: Vec<f64> = fighter.to_floats().to_vec();
    numbers.extend(intent.to_floats());
    numbers.extend([1.0, f64::from(combat::arms::BARE_HANDS.code())]);
    let course = [Block::from_floats(&[-5.0, -8.0, 5.0, -7.0, 13.0, 0.0])];
    let (expected, _) = combat::player_tick(1, &fighter, &intent, &[], &course, &floor);
    let next = Fighter::from_floats(floats_of(&predict(&bytes_of(&numbers))).as_slice().try_into().unwrap());
    assert_eq!(next, expected, "stepped on the land, 10 m up");
    assert_eq!(next.body.z.to_bits(), floor.height_at(next.body.x, next.body.y).to_bits());
    assert!(set_ground(b""));
    let flat = Fighter::from_floats(floats_of(&predict(&bytes_of(&numbers))).as_slice().try_into().unwrap());
    assert_ne!(flat.body.z.to_bits(), next.body.z.to_bits(), "open ground again once the ground is let go");
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
    assert_eq!(
        message.gear().unwrap().items().unwrap().len(),
        9,
        "the second player's own starting kit and its modules"
    );
    assert!(open_sea(include_bytes!("../../../content/world/layout.json"), 7));
    assert!(gear(first).is_empty(), "the sea keeps no gear");
    assert!(set_difficulty(1), "a sea takes its tier, as a node's room does");
    assert!(!furnish(&bytes_of(&[7.0, 15.0])));
}

#[test]
fn a_patrol_on_overlooks_island_stands_its_foes_at_the_voyages_seas_and_sends_its_nodes() {
    let mut patrol = node_file();
    patrol["continent"] = json!("continent-1");
    patrol["ring"] = json!([[-400.0, -400.0], [400.0, -400.0], [400.0, 400.0], [-400.0, 400.0]]);
    patrol["bounds"] = json!([-500.0, -500.0, 500.0, 500.0]);
    // Its layout's twelve resource places, as the bake writes them.
    let places: Vec<[f64; 2]> =
        (0..12).map(|at| [f64::from(at % 4) * 80.0 - 120.0, f64::from(at / 4) * 80.0 - 80.0]).collect();
    patrol["resources"] = json!(places);
    assert!(open_node(patrol.to_string().as_bytes()));
    assert!(set_difficulty(2), "Abyss");
    assert!(!set_difficulty(3), "no such seas");
    let player = room_join();
    room_tick();
    let bytes = snapshot(player);
    let foes = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap().foes().unwrap();
    assert!(foes.len() >= 2, "its camps stand at once");
    for foe in foes {
        let numbers = protocol::pack::unpack(foe.packed().unwrap().bytes(), protocol::land::FOE_NUMBERS, [0.0; 2]);
        let level = numbers.unwrap()[combat::floats::GLANCE_FLOATS + 6];
        assert!((4.0..=7.0).contains(&level), "the island's 1 to 4, three higher at Abyss: {level}");
    }
    let sent = gear(player);
    let nodes: Vec<f64> = messages::root_as_from_room(&sent).unwrap().gear().unwrap().nodes().unwrap().iter().collect();
    assert_eq!(nodes.len(), 12 * 4, "every one of its twelve places, four numbers each");
    assert!(nodes.chunks(4).all(|node| node[3] == 0.0), "Brineglass, the island's own");
}

#[test]
fn a_social_space_shows_the_days_wares_and_sells_them_for_aurem_at_the_vendors_counter() {
    let mut social = node_file();
    social["id"] = json!("harbour-social");
    social["kind"] = json!("social");
    // The Weaponsmith's counter where the player stands, as the bake writes a social space's counters.
    social["counters"] = json!([{ "kind": "weaponsmith", "at": social["spawns"][0].clone() }]);
    assert!(open_node(social.to_string().as_bytes()));
    assert!(set_minute(20_400 * 1_440));
    let player = room_join();
    room_tick();
    let sent = gear(player);
    let message = messages::root_as_from_room(&sent).unwrap();
    let wares = message.gear().unwrap().wares().unwrap();
    let starter = gear::vendor::Vendor::ALL.map(|vendor| vendor.starter_kinds().len());
    assert_eq!(starter, [4, 2, 0], "the Armorsmith's four pieces, the Weaponsmith's two");
    assert_eq!(wares.len(), 3 * gear::vendor::WARES + 6, "the Armorsmith's, the Weaponsmith's and the Shipwright's");
    assert_eq!((wares.get(0).price(), wares.get(5).price()), (2_000, 600), "Rare, then Magic");
    let head = wares.get(gear::vendor::WARES);
    assert_eq!((head.id(), head.price(), head.rarity()), (6, 50, 0), "the starter stock after, numbered on, at 50");
    assert_eq!(wares.get(gear::vendor::WARES + 4).id(), 0, "the Weaponsmith's numbered from none again");
    assert_eq!(message.gear().unwrap().day(), 20_400, "the day the wares are of, which a ware is asked by");
    // Too poor to buy: refused, and the wares stay.
    let ask = room::Asked::Gear(gear::Ask::Vend { vendor: gear::vendor::Vendor::Weaponsmith, ware: 4, day: 20_400 });
    let bytes = protocol::input_bytes(&room::Input { sequence: 1, ask: Some(ask), ..room::Input::default() });
    assert_eq!(input(player, &bytes), 0);
    // The answer goes out once the room may send this player's gear again.
    for _ in 0..room::GEAR_EVERY_TICKS {
        room_tick();
    }
    let answered = gear(player);
    let gear_now = messages::root_as_from_room(&answered).unwrap().gear().unwrap();
    assert_eq!(gear_now.answer(), gear::Refusal::Short as u8 + 1, "no Aurem yet");
}

#[test]
fn a_browser_predicts_a_fighter_on_a_nodes_ground_as_its_room_steps_it() {
    let window = serde_json::to_vec(&node_file()["ground"]).unwrap();
    let floor = Floor::Land(Box::new(serde_json::from_slice::<Ground>(&window).unwrap()));
    let fighter = combat::fighter::player(room::standing_on(&floor, &[], 30.0, 30.0), combat::arms::BARE_HANDS);
    let controls = Controls { forward: 1.0, ..Controls::default() };
    let intent = combat::Intent { controls, ..combat::Intent::default() };
    let mut numbers: Vec<f64> = fighter.to_floats().to_vec();
    numbers.extend(intent.to_floats());
    numbers.extend([1.0, f64::from(combat::arms::BARE_HANDS.code())]);
    let stepped = || Fighter::from_floats(floats_of(&predict(&bytes_of(&numbers))).as_slice().try_into().unwrap());
    let (expected, _) = combat::player_tick(1, &fighter, &intent, &[], &[], &floor);
    assert!(!set_ground(b"not a window"), "anything else is open ground");
    assert_ne!(stepped(), expected, "on open ground, a body on the land is not stepped as the node's room steps it");
    assert!(set_ground(&window));
    assert_eq!(stepped(), expected, "on the node's window, the same step as its room's");
    let land = movement::Terrain::height_at(&floor, expected.body.x, expected.body.y);
    assert!(land > 1.0 && (expected.body.z - land).abs() < 1e-6, "walking on the land, well above 0 m");
}

#[test]
fn a_patrols_dungeon_opens_from_its_node_file_with_its_cache_shut_and_a_player_at_its_way_in() {
    let patrol = node_file().to_string();
    let mut mission = node_file();
    mission["kind"] = json!("mission");
    assert!(!open_dungeon(mission.to_string().as_bytes(), 0), "a mission has no dungeons");
    assert!(!open_dungeon(patrol.as_bytes(), 3), "a patrol has three");
    assert!(!open_dungeon(b"not a node", 0));
    for number in 0..3 {
        assert!(open_dungeon(patrol.as_bytes(), number));
        let player = room_join();
        room_tick();
        let bytes = snapshot(player);
        let message = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        let cache: Vec<f64> = message.cache().expect("a dungeon's cache").iter().collect();
        assert_eq!((cache.len(), cache[4]), (5, 0.0), "shut while the Reeve stands");
        let (seed, style) = dungeon::of_patrol("glade", number);
        let ([x, y], _) = dungeon::Dungeon::forge(seed, style).arrival();
        let body = players_in(&bytes).into_iter().find(|(id, ..)| *id == player).expect("in").2;
        assert_eq!([body.x, body.y], [x, y], "at the way in");
        assert_eq!(dungeon_door::room_join_at(0), 0, "a dungeon has no entrances");
    }
    let mut locked = node_file();
    locked["locked"] = json!(true);
    assert!(open_dungeon(locked.to_string().as_bytes(), 0));
    assert_eq!(room_join(), 0, "a locked patrol's dungeon takes no player");
    assert_eq!(refusal().as_deref(), Some("The Glade is locked"));
    assert!(open_node(locked.to_string().as_bytes()));
    assert_eq!(dungeon_door::room_join_at(0), 0, "nor does its entrance");
}

#[test]
fn a_patrols_room_is_joined_before_an_entrance_and_sends_its_entrances() {
    let mut patrol = node_file();
    patrol["continent"] = json!("continent-1");
    patrol["ring"] = json!([[-800.0, -800.0], [800.0, -800.0], [800.0, 800.0], [-800.0, 800.0]]);
    patrol["bounds"] = json!([-900.0, -900.0, 900.0, 900.0]);
    assert!(open_node(patrol.to_string().as_bytes()));
    let player = dungeon_door::room_join_at(1);
    assert_ne!(player, 0);
    assert_eq!(dungeon_door::room_join_at(3), 0, "no such entrance");
    room_tick();
    let sent = gear(player);
    let entrances: Vec<f64> =
        messages::root_as_from_room(&sent).unwrap().gear().unwrap().dungeons().expect("its entrances").iter().collect();
    assert_eq!(entrances.len(), 15, "three entrances, five numbers each");
    let body = players_in(&snapshot(player)).into_iter().find(|(id, ..)| *id == player).expect("in").2;
    assert!(apart([body.x, body.y], [entrances[5], entrances[6]]) < 15.0, "by the second entrance: {body:?}");
    let mut mission = node_file();
    mission["kind"] = json!("mission");
    assert!(open_node(mission.to_string().as_bytes()));
    assert_eq!(dungeon_door::room_join_at(0), 0, "a mission has no entrances");
}

#[test]
fn a_node_says_why_its_gate_shuts_to_a_kept_character_or_a_new_one() {
    assert!(open_node(node_file().to_string().as_bytes()));
    assert!(set_difficulty(1));
    assert_eq!(shut(0, b""), "This place opens after the prologue.");
    let mut past = gear::Character::starting();
    past.story.prologue = true;
    assert_eq!(shut(0, past.to_json().as_bytes()), "Elite seas open at level 10.");
    assert_eq!(shut(0, b"not a character"), "", "left for the restore to refuse");
    let mut social = node_file();
    social["kind"] = json!("social");
    assert!(open_node(social.to_string().as_bytes()));
    assert_eq!(shut(0, b""), "");
}

#[test]
fn an_elite_dungeon_is_laid_for_a_browser_by_its_place_and_its_node_sends_its_one_entrance() {
    let ask = br#"{"place":"krakens-grotto","name":"Kraken's Grotto"}"#;
    let laid: Value = serde_json::from_str(&dungeon_door::dungeon_json(ask)).unwrap();
    assert_eq!((laid["name"].as_str(), laid["style"].as_str()), (Some("Kraken's Grotto"), Some("caverns")));
    let (seed, style) = room::elite_laid("krakens-grotto").unwrap();
    let native = dungeon::Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS);
    assert_eq!(
        (laid["columns"].as_u64(), laid["rows"].as_u64()),
        (Some(native.columns as u64), Some(native.rows as u64))
    );
    assert_eq!(dungeon_door::dungeon_json(br#"{"place":"saltgrass-downs","name":"x"}"#), "null");
    assert!(fighter_door::set_dungeon(ask));
    let mut node = node_file();
    node["id"] = json!("krakens-grotto");
    node["kind"] = json!("dungeon");
    node["continent"] = json!("continent-1");
    node["ring"] = json!([[-800.0, -800.0], [800.0, -800.0], [800.0, 800.0], [-800.0, 800.0]]);
    node["bounds"] = json!([-900.0, -900.0, 900.0, 900.0]);
    assert!(open_node(node.to_string().as_bytes()));
    let player = dungeon_door::room_join_at(0);
    assert_ne!(player, 0);
    assert_eq!(dungeon_door::room_join_at(1), 0, "one entrance");
}

#[test]
fn a_social_space_with_the_bounty_board_serves_its_asks_at_its_counter_and_one_without_has_none() {
    let boards = || {
        with_open(|opened| match opened {
            Opened::Land { room, .. } => {
                room.counters.iter().flatten().filter(|counter| counter.kind == CounterKind::Board).count()
            }
            Opened::Sea(_) | Opened::Fleet(_) => 0,
        })
    };
    let mut social = node_file();
    social["kind"] = json!("social");
    social["board"] = json!([5.0, 0.0]);
    assert!(open_node(social.to_string().as_bytes()));
    assert_eq!(boards(), Some(1));
    social.as_object_mut().expect("an object").remove("board");
    assert!(open_node(social.to_string().as_bytes()), "every other city's file, which holds no board");
    assert_eq!(boards(), Some(0));
}

#[test]
fn what_the_sea_tells_a_player_goes_to_them_alone() {
    let layout = r#"{ "continents": [{ "id": "continent-2", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(open_sea(layout.as_bytes(), 66));
    let (first, second) = (room_join(), room_join());
    for player in [first, second] {
        assert_eq!(input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), TAKEN);
    }
    room_tick();
    let mut character = sailor();
    character.ship_at = Some([60_000, 50_000]);
    assert!(gear_door::restore_character(first, character.to_json().as_bytes()));
    snapshot_door::prepare();
    let told = |player| {
        let bytes = snapshot_door::snapshot_for(player);
        let snapshot = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        snapshot.told().map_or(0, |told| told.len())
    };
    assert_eq!((told(first), told(second)), (1, 0), "their ship moored where it was kept is their word alone");
}

#[test]
fn the_sea_takes_a_boarding_and_the_boarder_fights_on_its_deck() {
    let layout = r#"{ "continents": [{ "id": "continent-2", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(open_sea(layout.as_bytes(), 66));
    let player = room_join();
    assert_eq!(input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), TAKEN);
    assert_eq!(input(player, &protocol::ask_bytes(2)), REFUSED, "no captain has struck");
    let commission = naval::ranks::Commission { faction: naval::ranks::GREY_TITHE, rank: naval::ranks::Rank::Minor };
    let hostile = room::hostiles::Hostile::standing(1, 7, commission, [50_000.0, 49_980.0], 0.0, true);
    with_open(|opened| {
        if let Opened::Sea(sea) = opened {
            sea.put_to_sea(hostile)
        }
    });
    room_tick();
    // Its colours come down alongside, and it lies still.
    with_open(|opened| {
        let Opened::Sea(sea) = opened else { panic!("a sea is open") };
        let fought = sea.fight_mut(player).expect("the hostile met their ship");
        let clock = fought.fight.clock;
        let vessel = fought.fight.ships.get_mut(&naval::fight::CAPTAIN).unwrap();
        let hurt = naval::damage::Hurt { hull: vessel.damage.max_hull * 0.8, sail: 0.0, crew: 0.0, fire: false };
        vessel.damage.apply(hurt, clock, 0.0);
        vessel.ship.ahead = 0.0;
        if let naval::fight::Sailor::Captain(command) = &mut vessel.sailor {
            command.struck_at = Some(clock);
        }
    });
    assert_eq!(input(player, &protocol::ask_bytes(2)), TAKEN, "boarded");
    // A land input now goes to its deck room, as the page's deck fight sends it.
    let controls = Controls { forward: 1.0, ..Controls::default() };
    let intent = combat::Intent { controls, ..combat::Intent::default() };
    let walk = protocol::input_bytes(&room::Input { sequence: 1, intent, ..room::Input::default() });
    assert_eq!(input(player, &walk), TAKEN);
    room_tick();
    snapshot_door::prepare();
    let bytes = snapshot_door::snapshot_for(player);
    let snapshot = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
    let deck = snapshot.decks().expect("its deck is sent").get(0);
    assert_eq!(deck.players().unwrap().iter().collect::<Vec<_>>(), vec![player]);
    assert_eq!(deck.hold_left(), -1, "its crew still fights");
    let boarder = deck.boarders().unwrap().get(0);
    let room = messages::root_as_from_room(deck.snapshot().unwrap().bytes()).unwrap().snapshot().unwrap();
    let seen = room.players().unwrap().iter().find(|seen| seen.player() == boarder).expect("the boarder stands there");
    assert_eq!(seen.acknowledged(), 1, "its deck room took the boarder's step");
    assert!(seen.fighter().is_some() && seen.packed().is_none(), "the boarder's own fighter whole, to predict from");
    let foe = room.foes().unwrap().get(0);
    assert!(foe.packed().is_some() && foe.changed().is_none(), "its crew packed, each whole");
    assert_eq!(room.foes().map_or(0, |foes| foes.len()), 3, "a Minor's three hands stand to meet them");
}

/// A sea round one square continent 100 km a side, its north-west corner 100 km from the frame's.
fn small_sea() {
    let layout = r#"{ "continents": [{ "id": "continent-2", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    assert!(open_sea(layout.as_bytes(), 66));
}

/// The ships and hostile ships a player is sent in the prepared snapshot, by their numbers.
fn seen_at_sea(player: PlayerId) -> (Vec<PlayerId>, Vec<u32>) {
    let bytes = snapshot_door::snapshot_for(player);
    let snapshot = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
    let ships = snapshot.ships().map_or(Vec::new(), |ships| ships.iter().map(|ship| ship.player()).collect());
    let hostiles =
        snapshot.hostiles().map_or(Vec::new(), |hostiles| hostiles.iter().map(|hostile| hostile.id()).collect());
    (ships, hostiles)
}

#[test]
fn a_sea_that_keeps_characters_holds_a_players_course_until_the_keeper_says_none_is_kept() {
    small_sea();
    assert_eq!(gear_door::room_keep_characters(), 1);
    let player = room_join();
    assert_eq!(input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), TAKEN, "held, not refused");
    room_tick();
    snapshot_door::prepare();
    assert_eq!(seen_at_sea(player).0, Vec::<PlayerId>::new(), "not at sea before the keeper answered");
    gear_door::room_none_kept(player);
    room_tick();
    snapshot_door::prepare();
    assert_eq!(seen_at_sea(player).0, vec![player]);
}

#[test]
fn at_sea_a_players_gear_is_sent_from_the_character_the_sea_keeps_once_it_changes() {
    small_sea();
    let player = room_join();
    assert_eq!(input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), TAKEN);
    room_tick();
    assert!(gear_door::gear(player).is_empty(), "no character held yet");
    // A Friday's 09:00 UTC, the sea's minute: a bounty held that day is counted on it.
    let minute = 20_778 * 1_440 + 540;
    with_open(|opened| {
        if let Opened::Sea(sea) = opened {
            sea.minute = minute;
        }
    });
    let mut character = sailor();
    character.materials.add_aurem(777);
    character.activity.today.day = gear::clock::day_of(minute);
    character.activity.today.bounties.insert(2, 1);
    assert!(gear_door::restore_character(player, character.to_json().as_bytes()));
    let bytes = gear_door::gear(player);
    let gear = messages::root_as_from_room(&bytes).unwrap().gear().expect("their gear");
    assert_eq!(gear.aurem(), character.materials.aurem, "the character given back");
    assert_eq!(u64::from(gear.day()), gear::clock::day_of(minute), "the sea's day");
    let held = gear.bounties().expect("the board").get(2);
    assert_eq!((held.held(), held.count()), (true, 1), "the bounty counted at sea, today's");
    assert!(gear_door::gear(player).is_empty(), "sent once until it changes again");
}

#[test]
fn at_sea_each_sailors_gear_carries_their_own_characters_story_alone() {
    small_sea();
    let (done, new) = (room_join(), room_join());
    for player in [done, new] {
        assert_eq!(input(player, &protocol::course_bytes(&[[50_000.0, 50_000.0]], 10)), TAKEN);
    }
    room_tick();
    let mut past = sailor();
    past.story.prologue = true;
    assert!(gear_door::restore_character(done, past.to_json().as_bytes()));
    assert!(gear_door::restore_character(new, sailor().to_json().as_bytes()));
    let prologue = |player| {
        let bytes = gear_door::gear(player);
        messages::root_as_from_room(&bytes).unwrap().gear().expect("their gear").prologue_done()
    };
    // Written one after the other, as the sea writes each sailor's.
    assert_eq!((prologue(done), prologue(new)), (true, false), "one's prologue is not another's");
}

#[test]
fn each_player_at_sea_is_sent_the_hostile_ships_within_their_keeping_sight_and_the_players_within_60_km() {
    small_sea();
    let (one, near, far) = (room_join(), room_join(), room_join());
    for (player, at) in [(one, [50_000.0, 50_000.0]), (near, [50_000.0, 90_000.0]), (far, [300_000.0, 50_000.0])] {
        assert_eq!(input(player, &protocol::course_bytes(&[at], 10)), TAKEN);
    }
    let commission = naval::ranks::Commission { faction: naval::ranks::GREY_TITHE, rank: naval::ranks::Rank::Minor };
    // Wary Minors that leave a sound Sloop be, each kept at sea by the player within 1.1 times the Minor's 5 km sight
    // of it: the first player, and the near one.
    for (id, at) in [(1, [50_000.0, 44_600.0]), (2, [50_000.0, 95_400.0])] {
        let hostile = room::hostiles::Hostile::standing(id, 7, commission, at, 0.0, false);
        with_open(|opened| {
            if let Opened::Sea(sea) = opened {
                sea.put_to_sea(hostile)
            }
        });
    }
    room_tick();
    snapshot_door::prepare();
    assert_eq!(seen_at_sea(one), (vec![one, near], vec![1]));
    assert_eq!(seen_at_sea(near), (vec![one, near], vec![2]), "40 km off, within the page's farthest view");
    assert_eq!(seen_at_sea(far), (vec![far], vec![]), "250 km off, they see no one");
}

#[test]
fn each_player_at_sea_is_sent_only_those_walking_the_decks_of_the_ships_they_are_sent() {
    small_sea();
    let (one, near, far) = (room_join(), room_join(), room_join());
    for (player, at) in [(one, [50_000.0, 50_000.0]), (near, [50_000.0, 90_000.0]), (far, [300_000.0, 50_000.0])] {
        assert_eq!(input(player, &protocol::course_bytes(&[at], 10)), TAKEN);
    }
    room_tick();
    with_open(|opened| {
        if let Opened::Sea(sea) = opened {
            for player in [one, near, far] {
                assert_eq!(sea.leave_helm(player), Ok(()));
            }
        }
    });
    room_tick();
    snapshot_door::prepare();
    let walking = |player: PlayerId| {
        let bytes = snapshot_door::snapshot_for(player);
        let snapshot = messages::root_as_from_room(&bytes).unwrap().snapshot().unwrap();
        snapshot.players().map_or(Vec::new(), |seen| seen.iter().map(|each| each.player()).collect::<Vec<_>>())
    };
    assert_eq!(walking(one), vec![one, near]);
    assert_eq!(walking(far), vec![far], "250 km off, no one else's deck");
}

#[test]
fn the_sea_says_why_its_tier_shuts_to_a_kept_character_or_a_new_one() {
    small_sea();
    assert_eq!(shut(0, b""), gear::gate::NO_SHIP, "a new one keeps no ship yet");
    assert_eq!(shut(0, sailor().to_json().as_bytes()), "", "the Normal sea is open to anyone who keeps a ship");
    assert!(set_difficulty(2));
    assert_eq!(shut(0, sailor().to_json().as_bytes()), "Abyss seas open at level 20.");
    let mut seasoned = sailor();
    seasoned.xp = gear::power::xp_for_level(20);
    assert_eq!(shut(0, seasoned.to_json().as_bytes()), "", "a character of level 20 sails it");
}

#[test]
fn a_leaving_players_vestige_still_lying_is_in_their_character_before_the_room_lets_them_go() {
    assert!(open(&bytes_of(&[0.0, 0.0])));
    let player = room_join();
    let vestige = gear::Vestige::new(0, gear::Rarity::Rare, gear::Slot::Legs, 5);
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.lay_drop(player, room::Dropped::Vestige(vestige), [3.0, 0.0, 0.0]),
        Opened::Sea(_) | Opened::Fleet(_) => unreachable!("a course is on land"),
    });
    gear_door::room_mail_lying(player);
    let kept = String::from_utf8(gear_door::character(player)).expect("text");
    let character = gear::Character::from_json(&kept).expect("a character");
    assert_eq!(character.mail.len(), 1, "read for the last save with the Vestige in the mail");
    assert_eq!(character.mail[0].vestige.as_ref().map(|kept| kept.rarity), Some(gear::Rarity::Rare));
    room_leave(player);
}

/// Two islands of the traffic, Overlook's and Sunspire's, 100 km squares 200 km apart on the line y = 150 km, their
/// ports in their middles: the lane between them runs east through the Grey Tithe's waters past x = 300 km.
pub const TRAFFIC_SEA: &str = r#"{ "layout": { "continents": [
    { "id": "continent-1", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] },
    { "id": "continent-4", "outline": [[400000, 100000], [500000, 100000], [500000, 200000], [400000, 200000]] }
  ], "isles": [] }, "ports": [
    { "id": "overlook", "name": "Overlook", "continent": "continent-1", "centre": [150000, 150000] },
    { "id": "sunspire", "name": "Sunspire", "continent": "continent-4", "centre": [450000, 150000] }
  ] }"#;
