//! A patrol's entrances: laid the same every time, keeping their distances, on dry and level ground, their doors
//! facing the patrol's middle, without moving its resource spots; the models agree with the forged props and the
//! blocks; a player joins before an entrance's door.

use super::*;
use crate::Section;
use combat::sight::off;
use movement::Heights;

/// A patrol 1.6 km square round the origin with two spawns, as a patrol area is about.
fn ring() -> Vec<[f64; 2]> {
    vec![[-800.0, -800.0], [800.0, -800.0], [800.0, 800.0], [-800.0, 800.0]]
}
const SPAWNS: [[f64; 2]; 2] = [[-700.0, 700.0], [700.0, -700.0]];

fn patrol(floor: Floor) -> Room {
    let mut room = Room::node(floor, Vec::new(), Section { ring: ring(), spawns: SPAWNS.to_vec(), falls_kill: false });
    room.start_patrol("saltgrass-downs", 2);
    room
}

/// Every distance an entrance keeps, and its door facing the ring's middle.
fn keeps_its_distances(room: &Room) {
    let spots: Vec<[f64; 2]> = room.resource_nodes.iter().map(|node| [node.x, node.y]).collect();
    for (number, entrance) in room.entrances().iter().enumerate() {
        let at = [entrance.at[0], entrance.at[1]];
        assert!(reach::inside(&ring(), at[0], at[1]) && distance_to_ring(&ring(), at[0], at[1]) >= 60.0, "{at:?}");
        assert!(SPAWNS.iter().all(|&spawn| apart(spawn, at) >= 60.0), "{at:?} is clear of the spawns");
        assert!(spots.iter().all(|&spot| apart(spot, at) >= 40.0), "{at:?} is clear of the resource spots");
        for other in &room.entrances()[number + 1..] {
            assert!(apart([other.at[0], other.at[1]], at) >= 300.0, "{at:?} and {:?} stand apart", other.at);
        }
        let (door, facing) = entrance.door();
        assert!(off(facing, bearing(door, [0.0, 0.0])) < 0.05, "entrance {number}'s door faces the middle");
        let (seed, style) = dungeon::of_patrol("saltgrass-downs", number);
        assert_eq!(entrance.model, crate::entrances::model_of(&style, seed), "its model is its dungeon's style's");
    }
}

#[test]
fn a_patrol_lays_its_three_entrances_the_same_every_time_keeping_their_distances() {
    let room = patrol(Floor::Flat);
    assert_eq!(room.entrances().len(), dungeon::PER_PATROL);
    assert_eq!(room.entrances(), patrol(Floor::Flat).entrances());
    // Where this patrol lays them, the same on every machine: x, y, the yaw's bits, the model.
    let laid = [
        (-219.78015985926243, -86.68886922122908, 1.946495638220125, 3),
        (-91.1984168814954, -715.9114353242533, 3.8002854059612905, 2),
        (-573.2086510065137, -182.53261888435497, 1.8790836256484815, 5),
    ];
    for (entrance, (x, y, yaw, model)) in room.entrances().iter().zip(laid) {
        assert_eq!(
            [entrance.at[0].to_bits(), entrance.at[1].to_bits(), entrance.yaw.to_bits()],
            [f64::to_bits(x), f64::to_bits(y), f64::to_bits(yaw)]
        );
        assert_eq!(entrance.model, model);
    }
    keeps_its_distances(&room);
    assert!(
        Room::node(Floor::Flat, Vec::new(), Section { ring: ring(), spawns: SPAWNS.to_vec(), falls_kill: false })
            .entrances()
            .is_empty()
    );
}

#[test]
fn the_resource_spots_stand_where_they_stood_before_the_entrances_came() {
    // The spots this patrol laid before its entrances were drawn.
    let before = [
        [240.30668825470298, 274.92657407516936],
        [120.17490382013261, -540.1392550261328],
        [702.8121399581639, -192.6550051856259],
        [241.42804877210483, -228.26806202135333],
        [-476.49823901667503, 796.6503985372174],
        [737.9196465510677, -20.140786204656365],
        [-575.5514251030984, -243.22165583070932],
        [-432.8531060672184, 282.052718111117],
        [-283.3621831612753, 102.20872336529908],
        [60.3615366452774, 432.0097115916776],
        [397.73217268192843, -672.3097744788658],
        [420.62568000957094, -510.0390770115986],
    ];
    let room = patrol(Floor::Flat);
    let spots: Vec<[f64; 2]> = room.resource_nodes.iter().map(|node| [node.x, node.y]).collect();
    assert_eq!(spots, before);
}

/// The patrol's land in cells of 100 m: sea (below 0 m) over its western half, then ground at 2 m that climbs a cliff
/// to 20 m between x 250 m and 350 m.
fn coast() -> Heights {
    let heights = (0..16 * 16)
        .map(|cell| {
            let x = -800.0 + (cell % 16) as f64 * 100.0 + 50.0;
            Some(if x < 0.0 {
                -5.0
            } else if x > 250.0 {
                20.0
            } else {
                2.0
            })
        })
        .collect();
    Heights::new(-800.0, -800.0, 100.0, 16, 16, heights).expect("a grid")
}

#[test]
fn an_entrance_stands_on_dry_level_ground() {
    let floor = coast();
    let entrances = laid("saltgrass-downs", &floor, &|x, y| floor.height_at(x, y) >= 0.0, &ring(), &SPAWNS, &[]);
    assert!(!entrances.is_empty(), "the dry land takes some");
    for entrance in &entrances {
        let [x, y, z] = entrance.at;
        assert!(z >= 0.0 && x > 0.0, "{:?} is above the sea", entrance.at);
        assert!(level(&floor, x, y), "{:?} is level", entrance.at);
        assert_eq!(z.to_bits(), floor.height_at(x, y).to_bits());
    }
    assert!(!level(&floor, 300.0, 0.0), "the cliff is not level");
}

#[test]
fn a_player_joins_before_an_entrances_door_facing_away_from_it() {
    let mut room = patrol(Floor::Flat);
    for number in 0..dungeon::PER_PATROL {
        let player = room.join_at(number).expect("an entrance and room for a player");
        let body = room.players[&player].fighter.body;
        let (door, facing) = room.entrances()[number].door();
        assert!((apart(door, [body.x, body.y]) - BEFORE_DOOR_M).abs() < 1e-9, "1.5 m before the door");
        assert!(off(bearing(door, [body.x, body.y]), facing) < 1e-9, "out of the door's face");
        assert!((body.facing - facing).abs() < 1e-12, "facing away from the door");
    }
    assert_eq!(room.join_at(dungeon::PER_PATROL), None, "no such entrance");
    let mut plain =
        Room::node(Floor::Flat, Vec::new(), Section { ring: ring(), spawns: SPAWNS.to_vec(), falls_kill: false });
    assert_eq!(plain.join_at(0), None, "no patrol, no entrance");
}

/// A content file's JSON.
fn content(path: &str) -> serde_json::Value {
    let file = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content").join(path);
    serde_json::from_str(&std::fs::read_to_string(file).expect("the content file")).expect("its JSON")
}

#[test]
fn the_entrance_models_are_the_forged_props_doors_raised_as_the_dungeon_blocks_raise_them() {
    let props = content("forged/props.json");
    let places = content("world/rmb/places.json");
    let near = |first: f64, second: &serde_json::Value| (first - second.as_f64().expect("a number")).abs() < 1e-9;
    for model in MODELS {
        let prop = &props[model.id.to_string()];
        let door = &prop["doors"][0];
        for (corner, name) in model.door.iter().zip(["a", "b", "c"]) {
            assert!(
                corner.iter().zip(door[name].as_array().expect("a corner")).all(|(own, theirs)| near(*own, theirs))
            );
        }
        let normal = door["n"].as_array().expect("a normal");
        assert!(model.normal.iter().zip(normal).all(|(own, theirs)| near(*own, theirs)), "{}'s normal", model.id);
        let mut stood = 0;
        for block in places.as_array().expect("blocks") {
            if !block["name"].as_str().is_some_and(|name| name.starts_with("DUNG") || name.starts_with("RUIN")) {
                continue;
            }
            for row in ["buildings", "props"].iter().flat_map(|rows| block[rows].as_array().into_iter().flatten()) {
                if row[0].as_u64() == Some(u64::from(model.id)) {
                    assert!(near(model.lift, &row[3]), "{} stands {} up in {}", model.id, row[3], block["name"]);
                    stood += 1;
                }
            }
        }
        assert!(stood > 0, "a dungeon or a ruin block stands {}", model.id);
    }
    let first = |name: &str| {
        let block = places.as_array().expect("blocks").iter().find(|block| block["name"] == name).expect(name);
        block["buildings"][0][0].as_u64()
    };
    assert_eq!((first("DUNGAA00.RMB"), first("DUNGAA01.RMB")), (Some(42000), Some(42001)));
}

#[test]
fn every_style_lays_entrances_of_its_own_kind_each_a_model_with_a_door() {
    use crate::entrances::{MODELS, model_of};
    for style in dungeon::STYLES {
        let caves = matches!(style.key, "caverns" | "mines");
        for &id in style.entrances {
            assert!(MODELS.iter().any(|model| model.id == u32::from(id)), "{} {id} has a door", style.key);
            assert_eq!([43603, 43604].contains(&id), caves, "{}: a cave mouth only for a cave or a mine", style.key);
        }
        let drawn: std::collections::BTreeSet<u32> = (0..64).map(|seed| MODELS[model_of(&style, seed)].id).collect();
        let own: std::collections::BTreeSet<u32> = style.entrances.iter().map(|&id| u32::from(id)).collect();
        assert_eq!(drawn, own, "{} draws each of its own", style.key);
    }
}
