//! A patrol's dungeon for a browser: its layout as the `dungeon` crate lays it, so a page draws it and predicts a body
//! on it from the rules rather than from a copy of them. And the dungeon's room: opened from its patrol's node file,
//! and a patrol's room joined before one of its entrances.

use crate::{NodeFile, Opened, keep, with_open};
use dungeon::{Cell, Dungeon, Side};
use room::{NodeKind, PlayerId, Room};
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

/// The seed and style of the dungeon an ask names, or None for an ask that does not read or a number past the
/// patrol's dungeons.
pub(crate) fn asked(text: &[u8]) -> Option<(u32, dungeon::Style)> {
    let asked = serde_json::from_slice::<Asked>(text).ok()?;
    (asked.number < dungeon::PER_PATROL).then(|| dungeon::of_patrol(&asked.patrol, asked.number))
}

/// The dungeon asked for as JSON, or null for an ask that does not read. Its return portal stands on the end room's
/// wall as the exit door stands on the way in's, as wide and as high. Each cell is -2 for rock, -1 for a corridor
/// or its room's number, and wears a look by its number (-1 for rock); sides are 0 east, 1 south, 2 west, 3 north;
/// points are x east, y south, z up from the dungeon's north-west corner at its floor; a bearing is radians clockwise
/// from north. Each prop is its forged model's id, where its origin stands (x, y, z) and its yaw, which turns its +z
/// as an RMB block's yaw does; each fixture where its light burns and its kind. The boxes are the jambs, the pillars,
/// the props' solids (a hanging has none) and the fixtures' solids, in that order.
#[must_use]
pub fn dungeon_json(text: &[u8]) -> String {
    let (Ok(found), Some((seed, style))) = (serde_json::from_slice::<Asked>(text), asked(text)) else {
        return Value::Null.to_string();
    };
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
        .map(|room| {
            json!({
                "x": room.x,
                "y": room.y,
                "width": room.width,
                "depth": room.depth,
                "height": room.height,
                "walk": room.walk,
                "role": room.purpose.role,
                "name": room.name,
                "ceiling": room.ceiling.key(),
                "look": room.look,
            })
        })
        .collect();
    let looks: Vec<Value> =
        laid.looks.iter().map(|look| json!({ "style": look.key, "pictures": look.pictures })).collect();
    let cell_looks: Vec<i64> = (0..laid.cells.len())
        .map(|cell| laid.look_at(cell).and_then(|look| i64::try_from(look).ok()).unwrap_or(-1))
        .collect();
    let fixtures: Vec<[f64; 4]> = laid
        .fixtures
        .iter()
        .map(|fixture| [fixture.at[0], fixture.at[1], fixture.at[2], f64::from(fixture.kind.number())])
        .collect();
    let ([arrive_x, arrive_y], _) = laid.arrival();
    let [door_x, door_y] = laid.exit_door();
    let [portal_x, portal_y] = laid.portal_door();
    let torches: Vec<[f64; 4]> = laid
        .torches
        .iter()
        .map(|torch| [torch.at[0], torch.at[1], torch.at[2], f64::from(side_number(torch.wall))])
        .collect();
    let props: Vec<[f64; 5]> =
        laid.props.iter().map(|prop| [f64::from(prop.model), prop.at[0], prop.at[1], prop.at[2], prop.yaw]).collect();
    let frames: Vec<[f64; 3]> =
        laid.frames.iter().map(|frame| [frame.cell as f64, f64::from(side_number(frame.side)), frame.height]).collect();
    json!({
        "name": dungeon::name(&style, &found.name),
        "style": style.key,
        "pictures": style.pictures,
        "looks": looks,
        "cellLooks": cell_looks,
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
        "portal": {
            "x": portal_x,
            "y": portal_y,
            "side": side_number(laid.portal.side),
            "width": dungeon::EXIT_WIDTH_M,
            "height": dungeon::EXIT_HEIGHT_M,
        },
        "torches": torches,
        "torchReach": dungeon::TORCH_REACH_M,
        "fixtures": fixtures,
        "frames": frames,
        "doorway": { "half": dungeon::DOORWAY_HALF_M, "jambDepth": dungeon::JAMB_DEPTH_M, "lintel": dungeon::LINTEL_M },
        "pillars": laid.pillars,
        "pillarHalf": dungeon::PILLAR_HALF_M,
        "boxes": laid.boxes(),
        "props": props,
    })
    .to_string()
}

/// Opens the room of a patrol's dungeon by its number, from the patrol's node file's text: its garrison at the patrol's
/// island band. Answers whether the text was a patrol's and the number one of its dungeons.
pub fn open_dungeon(text: &[u8], number: usize) -> bool {
    let Ok(node) = serde_json::from_slice::<NodeFile>(text) else { return false };
    if node.kind != NodeKind::Patrol {
        return false;
    }
    let Some(room) = Room::dungeon(&node.id, number, gear::world::island_levels(&node.continent)) else { return false };
    keep(Opened::Land { room: Box::new(room), node: None });
    true
}

/// Opens a patrol's dungeon's room from the patrol's node file's text written at `address`, `length` bytes long, by
/// its number; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_dungeon(address: *const u8, length: usize, number: u32) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let text = unsafe { std::slice::from_raw_parts(address, length) };
    u32::from(usize::try_from(number).is_ok_and(|number| open_dungeon(text, number)))
}

/// A new player's number, standing before the door of the open patrol's entrance numbered `number`, facing away from
/// it; 0 when the room is no patrol, has no such entrance or is full.
#[unsafe(no_mangle)]
pub extern "C" fn room_join_at(number: u32) -> PlayerId {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => usize::try_from(number).ok().and_then(|number| room.join_at(number)),
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
    .unwrap_or(0)
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

    /// The asks the browser's agreement test makes too (client/src/rules/dungeonRules.test.ts), and the FNV-1a hash of
    /// their answers' text, one after another: a dungeon laid anywhere is these bytes.
    const AGREED_ASKS: [&[u8]; 3] = [
        br#"{"patrol":"saltgrass-downs","name":"The Saltgrass Downs","number":0}"#,
        br#"{"patrol":"highwater-glen","name":"The Highwater Glen","number":1}"#,
        br#"{"patrol":"aurora-wastes","name":"The Aurora Wastes","number":2}"#,
    ];
    const AGREED_HASH: u64 = 0x59a0_33c6_4d95_5038;

    #[test]
    fn the_agreed_dungeons_read_as_the_bytes_the_browser_checks() {
        let hash = AGREED_ASKS
            .iter()
            .flat_map(|ask| dungeon_json(ask).into_bytes())
            .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3));
        assert_eq!(format!("{hash:016x}"), format!("{AGREED_HASH:016x}"));
    }

    /// A JSON object's keys, in order.
    fn keys(value: &Value) -> Vec<&str> {
        value.as_object().unwrap().keys().map(String::as_str).collect()
    }

    #[test]
    fn a_dungeon_answers_every_field_of_the_pages_layout_each_consistent_with_the_rest() {
        let mut deeper = 0;
        for nth in 0..60 {
            for number in 0..dungeon::PER_PATROL {
                let patrol = format!("patrol-{nth}");
                let ask = format!(r#"{{"patrol":"{patrol}","name":"The Patrol","number":{number}}}"#);
                let laid: Value = serde_json::from_str(&dungeon_json(ask.as_bytes())).unwrap();
                let mut want = vec![
                    "arrival",
                    "boxes",
                    "cell",
                    "cellLooks",
                    "ceilings",
                    "cells",
                    "columns",
                    "doorway",
                    "end",
                    "exitDoor",
                    "fixtures",
                    "frames",
                    "looks",
                    "name",
                    "pictures",
                    "pillarHalf",
                    "pillars",
                    "portal",
                    "props",
                    "rooms",
                    "rows",
                    "style",
                    "torchReach",
                    "torches",
                    "wayIn",
                ];
                want.sort_unstable();
                assert_eq!(keys(&laid), want);
                let (seed, style) = dungeon::of_patrol(&patrol, number);
                let native = dungeon::Dungeon::forge(seed, style);
                let looks = laid["looks"].as_array().unwrap();
                assert_eq!(laid["style"], style.key);
                assert_eq!(looks[0]["style"], style.key, "the first look is the first block's");
                assert_eq!(laid["pictures"], looks[0]["pictures"]);
                assert!(looks.iter().all(|look| keys(look) == ["pictures", "style"]));
                deeper += usize::from(looks.len() == 2);
                let cells = laid["cells"].as_array().unwrap();
                let cell_looks = laid["cellLooks"].as_array().unwrap();
                assert_eq!(cell_looks.len(), cells.len());
                for (kind, look) in cells.iter().zip(cell_looks) {
                    let look = look.as_i64().unwrap();
                    assert_eq!(look == -1, kind.as_i64() == Some(-2), "rock alone wears no look");
                    assert!(look < looks.len() as i64);
                }
                for (number, room) in laid["rooms"].as_array().unwrap().iter().enumerate() {
                    let room_keys = ["ceiling", "depth", "height", "look", "name", "role", "walk", "width", "x", "y"];
                    assert_eq!(keys(room), room_keys);
                    assert!(["flat", "vault", "dome", "cave"].contains(&room["ceiling"].as_str().unwrap()));
                    assert!(room["name"].as_str().unwrap().starts_with("the "));
                    let look = room["look"].as_u64().unwrap() as usize;
                    assert!(look < looks.len());
                    let first = native.rooms[number].cells[0];
                    assert_eq!(cell_looks[first].as_u64(), Some(look as u64), "a room wears its cells' look");
                }
                for fixture in laid["fixtures"].as_array().unwrap() {
                    let numbers = fixture.as_array().unwrap();
                    assert_eq!(numbers.len(), 4);
                    assert!((0.0..=4.0).contains(&numbers[3].as_f64().unwrap()), "a kind of the five");
                }
                assert_eq!(laid["boxes"].as_array().unwrap().len(), native.boxes().len());
                assert_eq!(laid["props"].as_array().unwrap().len(), native.props.len());
            }
        }
        assert!(deeper > 30 && deeper < 150, "{deeper} of 180 break into the style below");
    }

    #[test]
    fn an_ask_that_does_not_read_or_names_no_dungeon_is_null() {
        assert_eq!(dungeon_json(b"not json"), "null");
        assert_eq!(dungeon_json(br#"{"patrol":"saltgrass-downs","name":"The Saltgrass Downs","number":3}"#), "null");
    }
}
