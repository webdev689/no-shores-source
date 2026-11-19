use crate::{
    BRAZIER_HALF_M, BRAZIER_TOP_M, CANDLES_OVER_M, CELL_M, CRYSTALS_TOP_M, Cell, Dungeon, Kind, LANTERN_M, Piece,
    SIDES, STYLES, prop_model,
};

fn every_dungeon(count: u32) -> impl Iterator<Item = Dungeon> {
    (0..count).map(|seed| Dungeon::forge(seed.wrapping_mul(2_654_435_761), STYLES[seed as usize % STYLES.len()]))
}

fn cell_at(dungeon: &Dungeon, x: f64, y: f64) -> usize {
    (y / CELL_M) as usize * dungeon.columns + (x / CELL_M) as usize
}

#[test]
fn every_room_is_lit_by_a_torch_or_a_fixture() {
    for dungeon in every_dungeon(1200) {
        let lit_cells: Vec<usize> = dungeon
            .torches
            .iter()
            .map(|torch| torch.at)
            .chain(dungeon.fixtures.iter().map(|fixture| fixture.at))
            .map(|at| cell_at(&dungeon, at[0], at[1]))
            .collect();
        for room in &dungeon.rooms {
            assert!(room.cells.iter().any(|cell| lit_cells.contains(cell)), "{} stands lit", room.name);
        }
    }
}

#[test]
fn each_fixture_burns_where_its_kind_does() {
    let mut kinds = [0; 5];
    for dungeon in every_dungeon(1200) {
        let torch_walls: Vec<(usize, crate::Side)> =
            dungeon.torches.iter().map(|torch| (cell_at(&dungeon, torch.at[0], torch.at[1]), torch.wall)).collect();
        for fixture in &dungeon.fixtures {
            kinds[usize::from(fixture.kind.number())] += 1;
            let [x, y, z] = fixture.at;
            let cell = cell_at(&dungeon, x, y);
            let room = dungeon.room_at(cell).expect("a fixture burns in a room");
            let look = dungeon.looks[dungeon.rooms[room].look].key;
            let [middle_x, middle_y] = dungeon.centre(cell);
            let rock =
                |side: crate::Side| dungeon.beside(cell, side).is_none_or(|next| dungeon.cells[next] == Cell::Rock);
            // Which wall of its cell a light hangs this far off, if any.
            let wall_off = |off: f64| {
                SIDES.into_iter().find(|&side| {
                    let [dx, dy] = side.unit();
                    let out = (x - middle_x) * dx + (y - middle_y) * dy;
                    rock(side) && (out - (CELL_M / 2.0 - off)).abs() < 1e-9
                })
            };
            match fixture.kind {
                Kind::Brazier => {
                    let [min_x, min_y, max_x, max_y, top] = fixture.solid.expect("a brazier is a solid");
                    assert!(
                        (max_x - min_x - 2.0 * BRAZIER_HALF_M).abs() < 1e-9
                            && (max_y - min_y - 2.0 * BRAZIER_HALF_M).abs() < 1e-9
                    );
                    assert!(((min_x + max_x) / 2.0 - x).abs() < 1e-9 && ((min_y + max_y) / 2.0 - y).abs() < 1e-9);
                    assert!((top - BRAZIER_TOP_M).abs() < 1e-12 && z > top, "its flame over its bowl");
                }
                Kind::Candles => {
                    assert!(fixture.solid.is_none());
                    let on = dungeon.props.iter().any(|prop| {
                        let Some([min_x, min_y, max_x, max_y, top]) = prop.solid else { return false };
                        let top_piece = prop_model(prop.model).is_some_and(|model| model.piece == Piece::Top);
                        top_piece
                            && ((min_x + max_x) / 2.0 - x).abs() < 1e-9
                            && ((min_y + max_y) / 2.0 - y).abs() < 1e-9
                            && (top + CANDLES_OVER_M - z).abs() < 1e-9
                    });
                    assert!(on, "candles stand on a table, a lectern, an altar or a coffin");
                }
                Kind::Crystals => {
                    assert_eq!(look, "caverns", "crystals glow in the caverns");
                    let [min_x, min_y, max_x, max_y, top] = fixture.solid.expect("a crystal cluster is a solid");
                    assert!(
                        x > min_x
                            && x < max_x
                            && y > min_y
                            && y < max_y
                            && z < top
                            && (top - CRYSTALS_TOP_M).abs() < 1e-12
                    );
                    let side = wall_off(0.3).expect("against a rock wall");
                    assert!(!torch_walls.contains(&(cell, side)), "never on a torch's wall");
                }
                Kind::Lantern => {
                    assert_eq!(look, "mines", "lanterns hang in the mines");
                    assert!(fixture.solid.is_none() && (z - LANTERN_M).abs() < 1e-12);
                    let on_post = dungeon.props.iter().any(|prop| {
                        let Some([min_x, min_y, max_x, max_y, _]) = prop.solid else { return false };
                        let post = prop_model(prop.model).is_some_and(|model| model.piece == Piece::Post);
                        let apart = ((min_x + max_x) / 2.0 - x).abs() + ((min_y + max_y) / 2.0 - y).abs();
                        post && (apart - 0.3).abs() < 1e-9
                    });
                    let on_wall = wall_off(0.25).is_some_and(|side| !torch_walls.contains(&(cell, side)));
                    assert!(on_post || on_wall, "on a post or on a rock wall no torch is on");
                }
                Kind::Hearth => {
                    let inside = dungeon.props.iter().any(|prop| {
                        let Some([min_x, min_y, max_x, max_y, top]) = prop.solid else { return false };
                        let hearth = prop_model(prop.model).is_some_and(|model| model.piece == Piece::Hearth);
                        hearth && x > min_x && x < max_x && y > min_y && y < max_y && z < top
                    });
                    assert!(inside && fixture.solid.is_none(), "a hearth's fire burns in its hearth");
                }
            }
        }
    }
    assert!(kinds.iter().all(|&count| count > 100), "every kind burns: {kinds:?}");
}
