use super::*;
use serde_json::Value;

fn open_world() -> Value {
    let layout = include_str!("../../../content/world/layout.json");
    let ports: Vec<Value> = (1..=9)
        .map(|n| {
            let path = format!("{}/../../content/world/land/continent-{n}.json", env!("CARGO_MANIFEST_DIR"));
            let file: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
            let city = &file["city"];
            json!({ "id": city["id"], "name": city["name"], "continent": format!("continent-{n}"), "centre": city["centre"] })
        })
        .collect();
    let request = format!(r#"{{"layout":{layout},"ports":{}}}"#, Value::Array(ports));
    serde_json::from_str(&open_waters(request.as_bytes())).unwrap()
}

#[test]
fn the_table_names_each_water_its_holder_and_its_levels() {
    let table = open_world();
    let waters = table["waters"].as_array().unwrap();
    assert_eq!(waters.len(), 9);
    assert_eq!(waters[0]["name"], "The Lantern Sea");
    assert_eq!(waters[0]["holder"], "home");
    assert_eq!(waters[0]["levels"], json!([1, 4]));
    assert_eq!(waters[3]["holder"], "pirates");
    assert_eq!(waters[8]["levels"], json!([26, 30]));
    assert_eq!(table["borders"].as_array().unwrap().len(), 17);
    assert_eq!(table["routes"].as_array().unwrap().len(), 9, "three courses between each pair of the port cities");
    assert_eq!(table["main_ports"], json!(["overlook", "sunspire", "rimeholt"]));
    let ports: Vec<&Value> = table["ports"].as_array().unwrap().iter().map(|port| &port["id"]).collect();
    assert_eq!(ports, [&json!("overlook"), &json!("sunspire"), &json!("rimeholt")], "only the port cities sail");
}

#[test]
fn the_door_answers_waters_grid_and_ships() {
    open_world();
    let overlook = [2_809_214.0, 1_201_477.0];
    assert_eq!(water_byte(overlook[0], overlook[1]), 255, "the city stands on land");
    assert_eq!(water_byte(2_400_000.0, 1_100_000.0) & 0x7f, 0, "the sea west of Overlook is the Lantern Sea");
    let grid = grid_bytes(48_000.0);
    let columns = u32::from_le_bytes(grid[0..4].try_into().unwrap());
    let rows = u32::from_le_bytes(grid[4..8].try_into().unwrap());
    assert_eq!((columns, rows, grid.len()), (103, 64, 8 + 103 * 64));
    for cell in [10.0, f64::INFINITY, f64::NAN, -48_000.0] {
        assert!(grid_bytes(cell).is_empty(), "a grid of {cell} m cells is refused");
    }
    let time = 1_795_000_000.0;
    let ships = ships_near_bytes(overlook[0], overlook[1], 600_000.0, time);
    assert!(!ships.is_empty() && ships.len().is_multiple_of(SHIP_FLOATS * 8));
    let first_id = f64::from_le_bytes(ships[0..8].try_into().unwrap()) as u64;
    assert_eq!(ship_by_id_bytes(first_id, time), ships[0..SHIP_FLOATS * 8]);
    assert!(ship_by_id_bytes(first_id, 0.0).is_empty(), "not sailing in 1970");
}

#[test]
fn a_request_that_does_not_read_answers_its_error() {
    let answer: Value = serde_json::from_str(&open_waters(b"{\"layout\":{}}")).unwrap();
    assert!(answer["error"].is_string());
}

/// Points from Overlook's roadstead out to the open sea west of it, fractions of a metre off the grid.
pub fn sea_points() -> Vec<f64> {
    (0..40)
        .flat_map(|step| [2_790_000.125 - 9_000.5 * f64::from(step), 1_199_000.75 + 1_250.25 * f64::from(step)])
        .collect()
}

/// The deep sea's height under the weather at `sea_points` at a moment of 2026 (watersRules.test.ts asks the built
/// module for the same).
pub const WORLD_SEA_HASH: &str = "aa8b7cd0624a292d";

#[test]
fn the_sea_by_weather_is_calm_in_a_roadstead_and_holds_to_its_fingerprint() {
    use crate::sea_door::{sea_hash, shelter_bytes, swell_json};
    let table = open_world();
    let time = 1_790_000_123.25;
    let roadstead = &table["ports"][0]["roadstead"];
    let (x, y) = (roadstead[0].as_f64().unwrap(), roadstead[1].as_f64().unwrap());
    let swell: Value = serde_json::from_str(&swell_json(x, y, time)).unwrap();
    assert_eq!(swell["harbour"], 1.0, "{swell}");
    assert_eq!(swell["height"], world::weather::HARBOUR_SHARE);
    assert!(swell["waves"].as_array().unwrap().len() <= land::sea::MOST_WAVES);
    let grid = shelter_bytes(x - 2_000.0, y - 2_000.0, 1_000.0, 4, 4, time);
    assert_eq!(grid.len(), 4 * 4 * 4);
    assert!(shelter_bytes(x, y, 0.5, 4, 4, time).is_empty() && shelter_bytes(x, y, 9.0, 65, 1, time).is_empty());
    let bytes: Vec<u8> = sea_points().iter().flat_map(|number| number.to_le_bytes()).collect();
    assert_eq!(format!("{:016x}", sea_hash(&bytes, time)), WORLD_SEA_HASH);
}
