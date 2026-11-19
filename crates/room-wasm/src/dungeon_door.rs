//! A patrol's dungeon for a browser: its layout as the `dungeon` crate lays it, so a page draws it and predicts a body
//! on it from the rules rather than from a copy of them.

use dungeon::{Cell, Dungeon, Side};
use serde::Deserialize;
use serde_json::{Value, json};

/// Which dungeon: its patrol's id and name, and its number among the patrol's.
#[derive(Deserialize)]
struct Asked {
    patrol: String,
    name: String,
    number: usize,
}

const fn side_number(side: Side) -> u8 {
    match side {
        Side::East => 0,
        Side::South => 1,
        Side::West => 2,
        Side::North => 3,
    }
}

/// The dungeon asked for as JSON, or null for an ask that does not read. Each cell is -2 for rock, -1 for a corridor
/// or its room's number; sides are 0 east, 1 south, 2 west, 3 north; points are x east, y south, z up from the
/// dungeon's north-west corner at its floor; a bearing is radians clockwise from north.
#[must_use]
pub fn dungeon_json(text: &[u8]) -> String {
    let Ok(asked) = serde_json::from_slice::<Asked>(text) else { return Value::Null.to_string() };
    let (seed, style) = dungeon::of_patrol(&asked.patrol, asked.number);
    let laid = Dungeon::forge(seed, style);
    let cells: Vec<i32> = laid
        .cells
        .iter()
        .map(|&cell| match cell {
            Cell::Rock => -2,
            Cell::Corridor => -1,
            Cell::Room(number) => i32::from(number),
        })
        .collect();
    let rooms: Vec<Value> = laid
        .rooms
        .iter()
        .map(|room| json!({ "x": room.x, "y": room.y, "width": room.width, "depth": room.depth, "height": room.height, "walk": room.walk }))
        .collect();
    let ([arrive_x, arrive_y], _) = laid.arrival();
    let [door_x, door_y] = laid.exit_door();
    let torches: Vec<[f64; 4]> = laid
        .torches
        .iter()
        .map(|torch| [torch.at[0], torch.at[1], torch.at[2], f64::from(side_number(torch.wall))])
        .collect();
    let frames: Vec<[f64; 3]> =
        laid.frames.iter().map(|frame| [frame.cell as f64, f64::from(side_number(frame.side)), frame.height]).collect();
    json!({
        "name": dungeon::name(&style, &asked.name),
        "pictures": style.pictures,
        "cell": dungeon::CELL_M,
        "columns": laid.columns,
        "rows": laid.rows,
        "cells": cells,
        "ceilings": laid.ceilings,
        "rooms": rooms,
        "end": laid.end(),
        "wayIn": { "cell": laid.way_in.cell, "side": side_number(laid.way_in.side), "room": laid.way_in.room },
        "arrival": { "x": arrive_x, "y": arrive_y, "bearing": laid.way_in.side.opposite().bearing() },
        "exitDoor": { "x": door_x, "y": door_y, "width": dungeon::EXIT_WIDTH_M, "height": dungeon::EXIT_HEIGHT_M },
        "torches": torches,
        "torchReach": dungeon::TORCH_REACH_M,
        "frames": frames,
        "doorway": { "half": dungeon::DOORWAY_HALF_M, "jambDepth": dungeon::JAMB_DEPTH_M, "lintel": dungeon::LINTEL_M },
        "pillars": laid.pillars,
        "pillarHalf": dungeon::PILLAR_HALF_M,
        "boxes": laid.boxes(),
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::dungeon_json;
    use serde_json::Value;

    #[test]
    fn a_dungeon_reads_as_its_layout_named_for_its_patrol() {
        let ask = br#"{"patrol":"saltgrass-downs","name":"The Saltgrass Downs","number":0}"#;
        let laid: Value = serde_json::from_str(&dungeon_json(ask)).unwrap();
        let columns = laid["columns"].as_u64().unwrap();
        let rows = laid["rows"].as_u64().unwrap();
        assert_eq!(laid["cells"].as_array().unwrap().len() as u64, columns * rows);
        assert!(laid["name"].as_str().unwrap().ends_with(" of the Saltgrass Downs"));
        assert_eq!(dungeon_json(ask), dungeon_json(ask), "the same ask, the same dungeon");
        let way_in = laid["wayIn"]["cell"].as_u64().unwrap() as usize;
        assert!(laid["cells"][way_in].as_i64().unwrap() >= 0, "the way in is a room's cell");
    }

    #[test]
    fn an_ask_that_does_not_read_is_null() {
        assert_eq!(dungeon_json(b"not json"), "null");
    }
}
