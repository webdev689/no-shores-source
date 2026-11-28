use crate::models::FAMILIES;
use crate::{
    CELL_M, Cell, Dungeon, EVERY_STYLE, HUNG_M, PILLAR_HALF_M, POSTS_A_ROOM, Piece, Prop, SIDES, Side, posts_for,
    prop_model,
};

fn every_dungeon(count: u32) -> impl Iterator<Item = Dungeon> {
    (0..count)
        .map(|seed| Dungeon::forge(seed.wrapping_mul(2_654_435_761), EVERY_STYLE[seed as usize % EVERY_STYLE.len()]))
}

/// The cell a point stands in.
fn cell_at(dungeon: &Dungeon, x: f64, y: f64, z: f64) -> usize {
    dungeon.cell_at([x, y, z])
}

/// Where a prop's foot stands, absolute.
fn foot(prop: &crate::Prop) -> f64 {
    prop.at[2] + prop_model(prop.model).map_or(0.0, |model| model.min[1])
}

/// The side a yaw faces.
fn facing(yaw: f64) -> Side {
    SIDES.into_iter().find(|side| (side.bearing() - yaw).abs() < 1e-12).expect("a quarter turn")
}

/// Where a prop's box stands across the floor (min x, min y, max x, max y), from its model, its origin and its yaw:
/// the model's +z turned to its yaw, its +x a quarter clockwise of that.
fn plan(prop: &Prop) -> [f64; 4] {
    let model = prop_model(prop.model).expect("a model of the catalogue");
    let front = facing(prop.yaw);
    let [front_x, front_y] = front.unit();
    let [right_x, right_y] = [-front_y, front_x];
    let corner = |x: f64, z: f64| [prop.at[0] + right_x * x + front_x * z, prop.at[1] + right_y * x + front_y * z];
    let corners = [corner(model.min[0], model.min[2]), corner(model.max[0], model.max[2])];
    [
        corners[0][0].min(corners[1][0]),
        corners[0][1].min(corners[1][1]),
        corners[0][0].max(corners[1][0]),
        corners[0][1].max(corners[1][1]),
    ]
}

/// Every solid a room's furnishing stands, each its cell and its box.
fn solids(dungeon: &Dungeon) -> Vec<(usize, [f64; 5])> {
    let boxes = dungeon.props.iter().filter_map(|prop| prop.solid);
    let all = boxes.chain(dungeon.fixtures.iter().filter_map(|fixture| fixture.solid));
    all.map(|solid| (cell_at(dungeon, (solid[0] + solid[2]) / 2.0, (solid[1] + solid[3]) / 2.0, solid[4]), solid))
        .collect()
}

/// The cells a room's foes may not stand on: those holding a solid, and those under a landmark.
fn taken(dungeon: &Dungeon) -> Vec<usize> {
    let mut cells: Vec<usize> = solids(dungeon).into_iter().map(|(cell, _)| cell).collect();
    cells.extend(dungeon.landmarks.iter().flat_map(|placed| placed.cells.iter().copied()));
    cells
}

#[test]
fn the_catalogue_is_the_forged_models_measures_and_far_more_than_before() {
    let text =
        std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/forged/props.json")).unwrap();
    let forged: serde_json::Value = serde_json::from_str(&text).unwrap();
    let mut ids = Vec::new();
    for model in FAMILIES.iter().flat_map(|family| family.iter()) {
        let measured = &forged[model.id.to_string()];
        let read =
            |key: &str| -> Vec<f64> { measured[key].as_array().unwrap().iter().map(|n| n.as_f64().unwrap()).collect() };
        assert_eq!(read("min"), model.min, "{}'s least corner", model.id);
        assert_eq!(read("max"), model.max, "{}'s greatest corner", model.id);
        assert_eq!(prop_model(model.id).map(|found| found.piece), Some(model.piece), "{} is one piece", model.id);
        if !ids.contains(&model.id) {
            ids.push(model.id);
        }
    }
    assert!(ids.len() > 200, "{} models", ids.len());
}

#[test]
fn each_piece_stands_inside_its_cell_on_the_floor_under_the_ceiling_its_box_its_model_s() {
    let mut used = Vec::new();
    for dungeon in every_dungeon(600) {
        for prop in &dungeon.props {
            let model = prop_model(prop.model).unwrap();
            let [min_x, min_y, max_x, max_y] = plan(prop);
            let cell = cell_at(&dungeon, (min_x + max_x) / 2.0, (min_y + max_y) / 2.0, foot(prop));
            let [middle_x, middle_y] = dungeon.centre(cell);
            let half = CELL_M / 2.0 + 1e-9;
            let inside = min_x >= middle_x - half
                && max_x <= middle_x + half
                && min_y >= middle_y - half
                && max_y <= middle_y + half;
            assert!(inside, "{} inside its cell", prop.model);
            let room = dungeon.room_at(cell).expect("in a room");
            let floor = crate::storey_floor(dungeon.rooms[room].storey);
            let height = dungeon.rooms[room].height + floor;
            if model.piece == Piece::Hung {
                assert!(prop.solid.is_none(), "a hanging fills nothing");
                assert!((prop.at[2] + model.min[1] - floor - HUNG_M).abs() < 1e-9, "hung over head height");
                assert!(prop.at[2] + model.max[1] <= height - 0.3 + 1e-9, "under the ceiling");
            } else {
                let solid = prop.solid.expect("a standing piece is a solid");
                for (own, want) in solid[..4].iter().zip([min_x, min_y, max_x, max_y]) {
                    assert!((own - want).abs() < 1e-9, "{}'s solid is its model's box where it stands", prop.model);
                }
                assert!((prop.at[2] + model.min[1] - floor).abs() < 1e-12, "its foot on the floor");
                assert!((solid[4] - floor - model.height()).abs() < 1e-9 && solid[4] <= height - 0.3 + 1e-9);
            }
            if !used.contains(&prop.model) {
                used.push(prop.model);
            }
        }
    }
    assert!(used.len() > 200, "{} models stand", used.len());
}

#[test]
fn no_piece_stands_on_a_doorway_the_way_in_the_portal_the_reeves_post_or_a_torchs_wall_nor_a_solid_near_the_post() {
    for dungeon in every_dungeon(600) {
        let post = dungeon.nearest_middle(dungeon.end(), 1)[0];
        let [post_x, post_y] = dungeon.centre(post);
        let torch_walls: Vec<(usize, Side)> =
            dungeon.torches.iter().map(|torch| (dungeon.cell_at(torch.at), torch.wall)).collect();
        let mut cells = Vec::new();
        let mut walls = Vec::new();
        let pieces = dungeon.props.iter().map(|prop| (plan(prop), prop.solid, foot(prop)));
        let fixtures = dungeon
            .fixtures
            .iter()
            .filter_map(|fixture| fixture.solid)
            // Braziers flanking a doorway from its corridor stand outside every room's furnishing.
            .filter(|solid| {
                dungeon
                    .room_at(dungeon.cell_at([(solid[0] + solid[2]) / 2.0, (solid[1] + solid[3]) / 2.0, solid[4]]))
                    .is_some()
            })
            .map(|solid| ([solid[0], solid[1], solid[2], solid[3]], Some(solid), solid[4]));
        for ([min_x, min_y, max_x, max_y], solid, z) in pieces.chain(fixtures) {
            let cell = cell_at(&dungeon, (min_x + max_x) / 2.0, (min_y + max_y) / 2.0, z);
            let storey = dungeon.storey_of(cell);
            let room = dungeon.room_at(cell).expect("in a room");
            assert!(dungeon.rooms[room].quiet.contains(&cell), "never on a doorway's cell");
            assert!(cell != dungeon.way_in.cell && cell != dungeon.portal.cell, "never at the way in or the portal");
            let [x, y] = dungeon.centre(cell);
            assert!(cell != post, "never on the Reeve's post");
            if let Some([low_x, low_y, high_x, high_y, _]) = solid.filter(|_| room == dungeon.end()) {
                let (dx, dy) =
                    ((low_x - post_x).max(post_x - high_x).max(0.0), (low_y - post_y).max(post_y - high_y).max(0.0));
                let apart = (dx * dx + dy * dy).sqrt();
                assert!(apart >= CELL_M - 1e-9, "a solid {apart} m from the Reeve's post");
            }
            assert!(!cells.contains(&cell), "one piece to a cell");
            cells.push(cell);
            let half = CELL_M / 2.0;
            for side in SIDES {
                let [dx, dy] = side.unit();
                let face = [max_x, max_y, min_x, min_y][SIDES.iter().position(|&found| found == side).unwrap()];
                let wall = if dx != 0.0 { x + dx * half } else { y + dy * half };
                // A piece stands against a wall when its back is 0.1 m off it and it is centred along it.
                let along = if dx != 0.0 { (min_y + max_y) / 2.0 - y } else { (min_x + max_x) / 2.0 - x };
                let rock = dungeon.beside(cell, side).is_none_or(|next| dungeon.cells[next] == Cell::Rock);
                if (wall - face).abs() <= 0.1 + 1e-9 && along.abs() < 1e-9 && rock {
                    assert!(!torch_walls.contains(&(cell, side)), "never against a torch's wall");
                    assert!(!walls.contains(&(cell, side)), "one piece to a wall");
                    walls.push((cell, side));
                }
            }
            if solid.is_some() {
                for torch in
                    dungeon.torches.iter().filter(|torch| dungeon.storey_of(dungeon.cell_at(torch.at)) == storey)
                {
                    let dx = (min_x - torch.at[0]).max(torch.at[0] - max_x).max(0.0);
                    let dy = (min_y - torch.at[1]).max(torch.at[1] - max_y).max(0.0);
                    assert!(dx * dx + dy * dy >= 0.25 - 1e-9, "half a metre from a torch's flame");
                }
                let pillars = dungeon.pillars.iter().filter(|pillar| dungeon.storey_under(pillar[2]) == storey);
                for &[pillar_x, pillar_y, _] in pillars {
                    let apart = (pillar_x - (min_x + max_x) / 2.0).abs() - (max_x - min_x) / 2.0 - PILLAR_HALF_M;
                    let across = (pillar_y - (min_y + max_y) / 2.0).abs() - (max_y - min_y) / 2.0 - PILLAR_HALF_M;
                    assert!(apart > 0.0 || across > 0.0, "clear of every pillar");
                }
            }
        }
    }
}

#[test]
fn a_furnished_rooms_free_cells_are_one_walk_joining_its_doorways_and_enough_for_its_foes() {
    for dungeon in every_dungeon(600) {
        let taken = taken(&dungeon);
        for (number, room) in dungeon.rooms.iter().enumerate() {
            let free: Vec<usize> = room.cells.iter().copied().filter(|cell| !taken.contains(cell)).collect();
            assert!(free.len() >= posts_for(room.cells.len()), "room {number}: {} free", free.len());
            let doorways = room.cells.iter().copied().filter(|cell| !room.quiet.contains(cell));
            let doors = [dungeon.way_in.cell, dungeon.portal.cell].into_iter().filter(|cell| room.cells.contains(cell));
            for cell in doorways.chain(doors) {
                assert!(free.contains(&cell), "every doorway, the way in and the portal stay free");
            }
            let mut reached = vec![free[0]];
            let mut todo = vec![free[0]];
            while let Some(cell) = todo.pop() {
                for side in SIDES {
                    if let Some(next) = dungeon.beside(cell, side)
                        && free.contains(&next)
                        && !reached.contains(&next)
                    {
                        reached.push(next);
                        todo.push(next);
                    }
                }
            }
            assert_eq!(reached.len(), free.len(), "room {number}'s free cells are one walk");
        }
    }
}

#[test]
fn essentially_every_room_is_furnished_and_every_pattern_is_laid() {
    let (mut rooms, mut furnished) = (0, 0);
    let (mut against, mut centred, mut scattered, mut hung) = (0, 0, 0, 0);
    for dungeon in every_dungeon(2000) {
        let mut holding = vec![false; dungeon.rooms.len()];
        for prop in &dungeon.props {
            let [min_x, min_y, max_x, max_y] = plan(prop);
            let cell = cell_at(&dungeon, (min_x + max_x) / 2.0, (min_y + max_y) / 2.0, foot(prop));
            holding[dungeon.room_at(cell).unwrap()] = true;
            let [x, y] = dungeon.centre(cell);
            let (off_x, off_y) = ((min_x + max_x) / 2.0 - x, (min_y + max_y) / 2.0 - y);
            if prop.solid.is_none() {
                hung += 1;
            } else if off_x.abs() < 1e-9 && off_y.abs() < 1e-9 {
                centred += 1;
            } else if [min_x, max_x].iter().any(|&edge| (edge - x).abs() > CELL_M / 2.0 - 0.1 - 1e-9)
                || [min_y, max_y].iter().any(|&edge| (edge - y).abs() > CELL_M / 2.0 - 0.1 - 1e-9)
            {
                against += 1;
            } else {
                scattered += 1;
            }
        }
        rooms += dungeon.rooms.len();
        furnished += holding.iter().filter(|&&holds| holds).count();
    }
    let share = furnished as f64 / rooms as f64;
    assert!(share > 0.96, "{furnished} of {rooms} rooms furnished: {share}");
    assert!(against > 0 && centred > 0 && scattered > 0 && hung > 0, "{against} {centred} {scattered} {hung}");
}

#[test]
fn a_rooms_foes_stand_on_its_free_cells_nearest_its_middle_quiet_first_each_count_the_start_of_the_next() {
    for dungeon in every_dungeon(400) {
        let taken = taken(&dungeon);
        for (number, room) in dungeon.rooms.iter().enumerate() {
            let most = dungeon.nearest_middle(number, POSTS_A_ROOM);
            let free = room.cells.iter().filter(|cell| !taken.contains(cell)).count();
            assert_eq!(most.len(), POSTS_A_ROOM.min(free));
            assert!(
                most.iter().all(|cell| !taken.contains(cell) && room.cells.contains(cell)),
                "free cells of its own"
            );
            for count in 1..POSTS_A_ROOM {
                assert_eq!(dungeon.nearest_middle(number, count), most[..count.min(most.len())], "nested");
            }
            let quiet_first =
                most.windows(2).all(|pair| room.quiet.contains(&pair[0]) || !room.quiet.contains(&pair[1]));
            assert!(quiet_first, "its quiet cells first");
            let middle = [
                (room.x as f64 + room.width as f64 / 2.0) * CELL_M,
                (room.y as f64 + room.depth as f64 / 2.0) * CELL_M,
            ];
            let far = |cell: usize| {
                let [x, y] = dungeon.centre(cell);
                (x - middle[0]) * (x - middle[0]) + (y - middle[1]) * (y - middle[1])
            };
            if let Some(&last) = most.last() {
                let quiet = room.quiet.contains(&last);
                for &cell in room.cells.iter().filter(|cell| !taken.contains(cell) && !most.contains(cell)) {
                    let nearer_kind = room.quiet.contains(&cell) && !quiet;
                    let same_kind = room.quiet.contains(&cell) == quiet;
                    assert!(!nearer_kind && (!same_kind || far(cell) >= far(last) - 1e-9), "none nearer is left out");
                }
            }
        }
    }
}

#[test]
fn the_loose_boxes_are_the_props_and_the_fixtures_solids_and_nothing_built_in() {
    for dungeon in every_dungeon(16) {
        let (boxes, (jambs, loose)) = (dungeon.boxes(), dungeon.jamb_and_loose_boxes());
        assert_eq!(jambs, 0..dungeon.frames.len() * 2, "two jambs a doorway, first");
        let expected: Vec<[f64; 5]> = (dungeon.props.iter().filter_map(|prop| prop.solid))
            .chain(dungeon.fixtures.iter().filter_map(|fixture| fixture.solid))
            .collect();
        assert_eq!(loose.len(), expected.len());
        for (solid, wanted) in boxes[loose].iter().zip(&expected) {
            assert_eq!([solid[0], solid[1], solid[2], solid[3], solid[5]], *wanted);
        }
    }
}
