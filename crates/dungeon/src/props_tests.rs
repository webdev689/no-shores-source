use crate::props::POSTS_A_ROOM;
use crate::{CELL_M, CELLS_PROPS, CRYPT_PROPS, Cell, Dungeon, HALLS_PROPS, SANCTUM_PROPS, SIDES, STYLES};

fn every_dungeon(count: u32) -> impl Iterator<Item = Dungeon> {
    (0..count).map(|seed| Dungeon::forge(seed.wrapping_mul(2_654_435_761), STYLES[seed as usize % STYLES.len()]))
}

#[test]
fn the_props_table_is_the_forged_models_measures() {
    let text =
        std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/forged/props.json")).unwrap();
    let forged: serde_json::Value = serde_json::from_str(&text).unwrap();
    for model in [CRYPT_PROPS, HALLS_PROPS, CELLS_PROPS, SANCTUM_PROPS].into_iter().flatten() {
        let measured = &forged[model.id.to_string()];
        let read =
            |key: &str| -> Vec<f64> { measured[key].as_array().unwrap().iter().map(|n| n.as_f64().unwrap()).collect() };
        assert_eq!(read("min"), model.min, "{}'s least corner", model.id);
        assert_eq!(read("max"), model.max, "{}'s greatest corner", model.id);
    }
}

#[test]
fn each_prop_stands_alone_against_a_rock_wall_on_a_quiet_cell_its_foot_on_the_floor_under_the_ceiling() {
    let mut laid = 0;
    for dungeon in every_dungeon(600) {
        let models = dungeon.style.props;
        let mut cells = Vec::new();
        for prop in &dungeon.props {
            let model = models.iter().find(|model| model.id == prop.model).expect("a prop of the dungeon's style");
            let [min_x, min_y, max_x, max_y, top] = prop.solid;
            let cell =
                ((min_y + max_y) / 2.0 / CELL_M) as usize * dungeon.columns + ((min_x + max_x) / 2.0 / CELL_M) as usize;
            let [middle_x, middle_y] = dungeon.centre(cell);
            let half = CELL_M / 2.0;
            assert!(
                min_x >= middle_x - half
                    && max_x <= middle_x + half
                    && min_y >= middle_y - half
                    && max_y <= middle_y + half,
                "inside its cell"
            );
            let room = dungeon.room_at(cell).expect("in a room");
            assert!(dungeon.rooms[room].quiet.contains(&cell), "on a quiet cell");
            let against = SIDES.into_iter().any(|side| {
                let rock = dungeon.beside(cell, side).is_none_or(|next| dungeon.cells[next] == Cell::Rock);
                let [dx, dy] = side.unit();
                let face = if dx > 0.0 {
                    max_x
                } else if dx < 0.0 {
                    min_x
                } else if dy > 0.0 {
                    max_y
                } else {
                    min_y
                };
                let wall = if dx != 0.0 { middle_x + dx * half } else { middle_y + dy * half };
                rock && (wall - face).abs() - 0.1 < 1e-9
            });
            assert!(against, "its back 0.1 m off a rock wall");
            assert!(top <= dungeon.rooms[room].height - 0.3 + 1e-9, "under the ceiling");
            assert!((prop.at[2] + model.min[1]).abs() < 1e-12, "its foot on the floor");
            assert!(!cells.contains(&cell), "one prop to a cell");
            cells.push(cell);
            assert!(cell != dungeon.way_in.cell && cell != dungeon.portal.cell, "never at the way in or the portal");
            assert!(!dungeon.nearest_middle(room, POSTS_A_ROOM).contains(&cell), "never where the room's foes stand");
            let wide = (max_x - min_x).max(max_y - min_y);
            let deep = (max_x - min_x).min(max_y - min_y);
            let (model_wide, model_deep) = {
                let (x, z) = (model.max[0] - model.min[0], model.max[2] - model.min[2]);
                (x.max(z), x.min(z))
            };
            assert!((wide - model_wide).abs() < 1e-9 && (deep - model_deep).abs() < 1e-9, "its box is the model's");
        }
        laid += dungeon.props.len();
        for (number, room) in dungeon.rooms.iter().enumerate() {
            let own = dungeon.props.iter().filter(|prop| {
                let [min_x, min_y, max_x, max_y, _] = prop.solid;
                let cell = ((min_y + max_y) / 2.0 / CELL_M) as usize * dungeon.columns
                    + ((min_x + max_x) / 2.0 / CELL_M) as usize;
                dungeon.room_at(cell) == Some(number)
            });
            assert!(own.count() <= (room.cells.len() / 10).max(1), "one for each ten cells");
        }
    }
    assert!(laid > 600 * 4, "the dungeons are furnished: {laid} props");
}

#[test]
fn the_reeves_post_and_the_cells_round_it_hold_no_prop() {
    for dungeon in every_dungeon(600) {
        let post = dungeon.nearest_middle(dungeon.end(), 1)[0];
        let [x, y] = dungeon.centre(post);
        for prop in &dungeon.props {
            let [min_x, min_y, max_x, max_y, _] = prop.solid;
            let (middle_x, middle_y) = ((min_x + max_x) / 2.0, (min_y + max_y) / 2.0);
            let off = (middle_x - x).abs().max((middle_y - y).abs());
            assert!(off > CELL_M * 1.5 - 1e-9, "a prop {off} m from the Reeve's post");
        }
    }
}
