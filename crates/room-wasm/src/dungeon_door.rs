//! A dungeon for a browser, a patrol's, an Elite Dungeon's or one laid by a seed: its layout as the `dungeon` crate
//! lays it, so a page draws it and predicts a body on it from the rules rather than from a copy of them. And the
//! dungeon's room: opened from its patrol's node file, and a node's room joined before one of its entrances.

use crate::{NodeFile, Opened, keep, with_open};
use dungeon::{BLOCKS, Cell, Dungeon, ELITE_BLOCKS, Side};
use room::{NodeKind, PlayerId, Room};
use serde::Deserialize;
use serde_json::{Value, json};

/// Which dungeon: its place's name, and either its patrol's id and its number among the patrol's, an Elite Dungeon's
/// place (its node's id), or the seed and the style's key it is laid by where no patrol lays it (a sea island's).
#[derive(Deserialize)]
struct Asked {
    patrol: Option<String>,
    name: String,
    #[serde(default)]
    number: usize,
    place: Option<String>,
    seed: Option<u32>,
    style: Option<String>,
}

const fn side_number(side: Side) -> u8 {
    match side {
        Side::East => 0,
        Side::South => 1,
        Side::West => 2,
        Side::North => 3,
    }
}

/// The seed and style of the dungeon an ask names and the blocks it is laid within, or None for an ask that does not
/// read, a number past the patrol's dungeons, a place that is no Elite Dungeon, or a seed without a style that is one.
pub(crate) fn asked(text: &[u8]) -> Option<(u32, dungeon::Style, (usize, usize))> {
    let asked = serde_json::from_slice::<Asked>(text).ok()?;
    let (seed, style) = match (asked.patrol, asked.place, asked.seed, asked.style) {
        (_, Some(place), None, None) => {
            return room::elite_laid(&place).map(|(seed, style)| (seed, style, ELITE_BLOCKS));
        }
        (_, None, Some(seed), Some(key)) => (seed, dungeon::style_of(&key)?),
        (Some(patrol), None, None, None) => {
            (asked.number < dungeon::PER_PATROL).then(|| dungeon::of_patrol(&patrol, asked.number))?
        }
        _ => return None,
    };
    Some((seed, style, BLOCKS))
}

/// The dungeon asked for as JSON, or null for an ask that does not read. Its return portal stands on the end room's
/// wall as the exit door stands on the way in's, as wide and as high. Each cell is -2 for rock, -1 for a corridor
/// or its room's number, and wears a look by its number (-1 for rock); sides are 0 east, 1 south, 2 west, 3 north;
/// points are x east, y south, z up from the dungeon's north-west corner at its floor; a bearing is radians clockwise
/// from north. Each prop is its forged model's id, where its origin stands (x, y, z) and its yaw, which turns its +z
/// as an RMB block's yaw does; each fixture where its light burns and its kind; each landmark its module, its turned
/// footprint's north-west corner (x, y) and its quarter turns clockwise; each glow x, y, z and its kind. The boxes
/// are the jambs, the pillars, then the props', the fixtures' and the landmarks' solids (a hanging has none).
#[must_use]
pub fn dungeon_json(text: &[u8]) -> String {
    let (Ok(found), Some((seed, style, blocks))) = (serde_json::from_slice::<Asked>(text), asked(text)) else {
        return Value::Null.to_string();
    };
    let laid = Dungeon::forge_within(seed, style, blocks);
    // An Elite Dungeon has a name of its own; any other is named for its style and its place.
    let name = if found.place.is_some() { found.name } else { dungeon::name(&style, &found.name) };
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
                "role": room.role,
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
    let landmarks: Vec<Value> = laid
        .landmarks
        .iter()
        .map(|placed| json!([placed.landmark.module, placed.origin[0], placed.origin[1], placed.turns]))
        .collect();
    let glows: Vec<[f64; 4]> = laid.landmarks.iter().flat_map(|placed| placed.glows.iter().copied()).collect();
    let frames: Vec<[f64; 3]> =
        laid.frames.iter().map(|frame| [frame.cell as f64, f64::from(side_number(frame.side)), frame.height]).collect();
    json!({
        "name": name,
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
        "landmarks": landmarks,
        "glows": glows,
    })
    .to_string()
}

/// Opens the room of a patrol's dungeon by its number, from the patrol's node file's text: its garrison at the patrol's
/// island band, and locked while its patrol is. Answers whether the text was a patrol's and the number one of its
/// dungeons.
pub fn open_dungeon(text: &[u8], number: usize) -> bool {
    let Ok(node) = serde_json::from_slice::<NodeFile>(text) else { return false };
    if node.kind != NodeKind::Patrol {
        return false;
    }
    let Some(room) = Room::dungeon(&node.id, number, gear::world::island_levels(&node.continent)) else { return false };
    let refusal = crate::lock_words(node.locked, &node.name);
    keep(Opened::Land { room: Box::new(room), node: None, refusal, sent: Box::default() });
    true
}

/// A dungeon as JSON (`dungeon_json`), asked for by the JSON written at `address`, `length` bytes long: its patrol's
/// id and name and its number, an Elite Dungeon's place and name, or a seed, a style and a name.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_dungeon(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    crate::hand_over(dungeon_json(unsafe { std::slice::from_raw_parts(address, length) }).into_bytes())
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
/// it; 0 when the room is no patrol, has no such entrance, is full or its node is locked.
#[unsafe(no_mangle)]
pub extern "C" fn room_join_at(number: u32) -> PlayerId {
    with_open(|opened| match opened {
        Opened::Land { room, refusal: None, .. } => {
            usize::try_from(number).ok().and_then(|number| room.join_at(number))
        }
        Opened::Land { .. } | Opened::Sea(_) | Opened::Fleet(_) => None,
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
    /// their answers' text, one after another: a dungeon laid anywhere is these bytes. The fourth lays five blocks, its
    /// last a style deeper, and the fifth is laid by a seed and a style where no patrol lays it.
    const AGREED_ASKS: [&[u8]; 5] = [
        br#"{"patrol":"saltgrass-downs","name":"The Saltgrass Downs","number":0}"#,
        br#"{"patrol":"highwater-glen","name":"The Highwater Glen","number":1}"#,
        br#"{"patrol":"aurora-wastes","name":"The Aurora Wastes","number":2}"#,
        br#"{"patrol":"gullwing-vale","name":"The Gullwing Vale","number":0}"#,
        br#"{"seed":4242,"style":"caverns","name":"The Gull Cove"}"#,
    ];
    const AGREED_HASH: u64 = 0x77bb_f751_6bd7_1735;

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
        let (mut deeper, mut placing) = (0, 0);
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
                    "glows",
                    "landmarks",
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
                    assert!((0.0..=5.0).contains(&numbers[3].as_f64().unwrap()), "a kind of the six");
                }
                assert_eq!(laid["boxes"].as_array().unwrap().len(), native.boxes().len());
                assert_eq!(laid["props"].as_array().unwrap().len(), native.props.len());
                let landmarks = laid["landmarks"].as_array().unwrap();
                assert_eq!(landmarks.len(), native.landmarks.len());
                for (read, placed) in landmarks.iter().zip(&native.landmarks) {
                    let want =
                        serde_json::json!([placed.landmark.module, placed.origin[0], placed.origin[1], placed.turns]);
                    assert_eq!(*read, want, "a landmark is its module, its corner and its turns");
                    assert_eq!(laid["rooms"][placed.room]["role"], placed.landmark.role, "its room takes its role");
                }
                let glows: usize = native.landmarks.iter().map(|placed| placed.glows.len()).sum();
                assert_eq!(laid["glows"].as_array().unwrap().len(), glows);
                placing += usize::from(!landmarks.is_empty());
            }
        }
        assert!(deeper > 30 && deeper < 150, "{deeper} of 180 break into the style below");
        assert!(placing > 170, "{placing} of 180 place a landmark");
    }

    #[test]
    fn an_ask_that_does_not_read_or_names_no_dungeon_is_null() {
        assert_eq!(dungeon_json(b"not json"), "null");
        assert_eq!(dungeon_json(br#"{"patrol":"saltgrass-downs","name":"The Saltgrass Downs","number":3}"#), "null");
        assert_eq!(dungeon_json(br#"{"name":"The Cove","number":0}"#), "null", "neither a patrol nor a seed");
        assert_eq!(dungeon_json(br#"{"name":"The Cove","seed":7}"#), "null", "a seed with no style");
        assert_eq!(dungeon_json(br#"{"name":"The Cove","seed":7,"style":"grotto"}"#), "null", "no such style");
    }

    #[test]
    fn a_dungeon_asked_by_its_seed_and_style_is_the_one_a_patrol_lays_by_them() {
        let (seed, style) = dungeon::of_patrol("saltgrass-downs", 1);
        let by_patrol = br#"{"patrol":"saltgrass-downs","name":"The Saltgrass Downs","number":1}"#;
        let by_seed = format!(r#"{{"name":"The Saltgrass Downs","seed":{seed},"style":"{}"}}"#, style.key);
        assert_eq!(dungeon_json(by_seed.as_bytes()), dungeon_json(by_patrol));
        let cove = dungeon_json(br#"{"name":"The Gull Cove","seed":4242,"style":"caverns"}"#);
        let laid: Value = serde_json::from_str(&cove).unwrap();
        assert_eq!(laid["style"], "caverns");
        assert!(laid["name"].as_str().unwrap().ends_with(" of the Gull Cove"));
    }
}
