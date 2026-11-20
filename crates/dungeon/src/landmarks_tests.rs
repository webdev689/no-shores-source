use crate::{
    CELL_M, Cell, Dungeon, LANDMARKS, PER_PATROL, PILLAR_HALF_M, Placed, SIDES, STYLES, Side, of_patrol, posts_for,
    turned, turned_box,
};
use std::sync::LazyLock;

/// Every patrol's id, from the land's node files.
fn patrols() -> Vec<String> {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/world/land");
    let mut ids = Vec::new();
    for entry in std::fs::read_dir(folder).unwrap() {
        let land: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(entry.unwrap().path()).unwrap()).unwrap();
        for node in land["nodes"].as_array().into_iter().flatten() {
            if node["kind"] == "patrol" {
                ids.push(node["id"].as_str().unwrap().to_owned());
            }
        }
    }
    ids.sort();
    ids
}

/// The dungeons the placement tests read: 2,000 seeds over the six styles, then every patrol's three.
static DUNGEONS: LazyLock<Vec<Dungeon>> = LazyLock::new(|| {
    let seeds = (0..2000)
        .map(|seed: u32| Dungeon::forge(seed.wrapping_mul(2_654_435_761), STYLES[seed as usize % STYLES.len()]));
    let patrols = patrols().into_iter().flat_map(|patrol| {
        (0..PER_PATROL).map(move |number| {
            let (seed, style) = of_patrol(&patrol, number);
            Dungeon::forge(seed, style)
        })
    });
    seeds.chain(patrols).collect()
});

/// How many landmarks a dungeon's blocks ask for.
fn wanted(dungeon: &Dungeon) -> usize {
    if dungeon.squares.len() >= 4 { 2 } else { 1 }
}

/// A placed footprint's rectangle in metres: west, north, east, south.
fn rectangle(placed: &Placed) -> [f64; 4] {
    let [wide, deep] = placed.landmark.cells.map(|cells| cells as f64 * CELL_M);
    let (across, down) = if placed.turns.is_multiple_of(2) { (wide, deep) } else { (deep, wide) };
    [placed.origin[0], placed.origin[1], placed.origin[0] + across, placed.origin[1] + down]
}

/// The cell a point stands in.
fn cell_at(dungeon: &Dungeon, at: [f64; 2]) -> usize {
    (at[1] / CELL_M) as usize * dungeon.columns + (at[0] / CELL_M) as usize
}

/// Whether a cell is one of `cells` or beside one.
fn touches(dungeon: &Dungeon, cells: &[usize], at: usize) -> bool {
    cells.iter().any(|&cell| cell == at || SIDES.into_iter().any(|side| dungeon.beside(cell, side) == Some(at)))
}

fn doorway(dungeon: &Dungeon, cell: usize) -> bool {
    SIDES.into_iter().any(|side| dungeon.beside(cell, side).is_some_and(|next| dungeon.cells[next] == Cell::Corridor))
}

#[test]
fn the_table_is_landmarks_json() {
    let text =
        std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/dungeon/landmarks.json")).unwrap();
    let json: serde_json::Value = serde_json::from_str(&text).unwrap();
    let listed = json["landmarks"].as_array().unwrap();
    let kinds = json["glowKinds"].as_array().unwrap().len() as f64;
    let rows = |value: &serde_json::Value| -> Vec<Vec<f64>> {
        let rows = value.as_array().unwrap().iter();
        rows.map(|row| row.as_array().unwrap().iter().map(|number| number.as_f64().unwrap()).collect()).collect()
    };
    assert_eq!(listed.len(), LANDMARKS.len());
    for (entry, landmark) in listed.iter().zip(LANDMARKS) {
        for (key, own) in
            [("module", landmark.module), ("style", landmark.style), ("role", landmark.role), ("name", landmark.name)]
        {
            assert_eq!(entry[key], own, "{}'s {key}", landmark.module);
        }
        let cells: Vec<usize> =
            entry["cells"].as_array().unwrap().iter().map(|n| n.as_u64().unwrap() as usize).collect();
        assert_eq!(cells, landmark.cells, "{}'s cells", landmark.module);
        assert_eq!(entry["wall"], landmark.wall, "{}'s wall", landmark.module);
        assert_eq!(rows(&entry["solids"]), landmark.solids.iter().map(|solid| solid.to_vec()).collect::<Vec<_>>());
        assert_eq!(rows(&entry["glows"]), landmark.glows.iter().map(|glow| glow.to_vec()).collect::<Vec<_>>());
        assert!(STYLES.iter().any(|style| style.key == landmark.style), "{} is a style's", landmark.module);
        let [wide, deep] = landmark.cells.map(|cells| cells as f64 * CELL_M);
        for &[min_x, min_y, max_x, max_y, top] in landmark.solids {
            assert!(min_x >= 0.0 && min_y >= 0.0 && max_x <= wide && max_y <= deep && top > 0.0, "{}", landmark.module);
        }
        for &[x, y, _, kind] in landmark.glows {
            assert!(x >= 0.0 && y >= 0.0 && x <= wide && y <= deep, "{}'s glow on it", landmark.module);
            assert!(kind >= 0.0 && kind < kinds && kind == kind.floor(), "{}'s glow a kind", landmark.module);
        }
    }
}

#[test]
fn a_turn_maps_the_footprints_corners_as_the_turn_rule_says() {
    let (wide, deep) = (6.4, 3.2);
    let corners = [[0.0, 0.0], [wide, 0.0], [wide, deep], [0.0, deep]];
    // 0: (x, y); 1: (D - y, x); 2: (W - x, D - y); 3: (y, W - x).
    let want = [
        corners,
        [[deep, 0.0], [deep, wide], [0.0, wide], [0.0, 0.0]],
        [[wide, deep], [0.0, deep], [0.0, 0.0], [wide, 0.0]],
        [[0.0, wide], [0.0, 0.0], [deep, 0.0], [deep, wide]],
    ];
    for (turns, corners_turned) in want.iter().enumerate() {
        for (corner, wanted) in corners.iter().zip(corners_turned) {
            assert_eq!(turned(*corner, turns as u8, [wide, deep]), *wanted, "turn {turns} of {corner:?}");
        }
    }
    // The north edge's strip goes east, then south, then west: a quarter turn clockwise each time.
    let strip = [0.0, 0.0, wide, 0.5, 1.0];
    let close = |solid: [f64; 5], want: [f64; 5]| solid.iter().zip(want).all(|(own, want)| (own - want).abs() < 1e-12);
    assert!(close(turned_box(strip, 1, [wide, deep]), [deep - 0.5, 0.0, deep, wide, 1.0]));
    assert!(close(turned_box(strip, 2, [wide, deep]), [0.0, deep - 0.5, wide, deep, 1.0]));
    assert!(close(turned_box(strip, 3, [wide, deep]), [0.0, 0.0, 0.5, wide, 1.0]));
}

#[test]
fn as_many_landmarks_as_the_blocks_say_none_twice_each_of_its_rooms_style_never_the_way_ins_or_the_ends() {
    for dungeon in DUNGEONS.iter() {
        assert!(
            dungeon.landmarks.len() <= wanted(dungeon),
            "{} for {} blocks",
            dungeon.landmarks.len(),
            dungeon.squares.len()
        );
        for (nth, placed) in dungeon.landmarks.iter().enumerate() {
            let others = &dungeon.landmarks[..nth];
            assert!(others.iter().all(|other| other.landmark.module != placed.landmark.module), "none twice");
            assert!(others.iter().all(|other| other.room != placed.room), "one a room");
            assert!(
                placed.room != dungeon.way_in.room && placed.room != dungeon.end(),
                "never the way in's or the end"
            );
            let room = &dungeon.rooms[placed.room];
            assert_eq!(dungeon.looks[room.look].key, placed.landmark.style, "its room's look's style");
            assert_eq!(room.role, placed.landmark.role, "the room takes its role");
            let base = placed.landmark.name.strip_prefix("the ").unwrap();
            assert!(room.name.starts_with("the ") && room.name.ends_with(base), "{} named for {base}", room.name);
        }
    }
}

#[test]
fn at_least_95_percent_of_dungeons_place_one() {
    let placing = DUNGEONS.iter().filter(|dungeon| !dungeon.landmarks.is_empty()).count();
    let share = placing as f64 / DUNGEONS.len() as f64;
    assert!(share >= 0.95, "{placing} of {} place a landmark", DUNGEONS.len());
}

#[test]
fn every_footprint_lies_on_its_rooms_cells_clear_of_its_rim_or_backed_on_rock_its_solids_and_glows_on_it() {
    for dungeon in DUNGEONS.iter() {
        for placed in &dungeon.landmarks {
            let [west, north, east, south] = rectangle(placed);
            let (column, row) = ((west / CELL_M).round() as usize, (north / CELL_M).round() as usize);
            assert!(column as f64 * CELL_M == west && row as f64 * CELL_M == north, "on whole cells");
            let (across, down) =
                (((east - west) / CELL_M).round() as usize, ((south - north) / CELL_M).round() as usize);
            let want: Vec<usize> = (row..row + down)
                .flat_map(|y| (column..column + across).map(move |x| y * dungeon.columns + x))
                .collect();
            assert_eq!(placed.cells, want, "its cells, row by row");
            let back =
                placed.landmark.wall.then(|| [Side::North, Side::East, Side::South, Side::West][placed.turns as usize]);
            for &cell in &placed.cells {
                assert_eq!(dungeon.room_at(cell), Some(placed.room), "on its room");
                for side in SIDES {
                    let next = dungeon.beside(cell, side);
                    if next.is_some_and(|next| placed.cells.contains(&next)) {
                        continue;
                    }
                    let rock = next.is_none_or(|next| dungeon.cells[next] == Cell::Rock);
                    let inside = next.and_then(|next| dungeon.room_at(next)) == Some(placed.room);
                    if back == Some(side) {
                        assert!(rock, "its back on rock");
                    } else if back.is_some() {
                        assert!(inside, "a wall piece's other edges inside the room");
                    } else {
                        assert!(inside || rock, "a free piece's edges inside the room or on its rock");
                    }
                }
            }
            let inside =
                |x: f64, y: f64| x >= west - 1e-9 && x <= east + 1e-9 && y >= north - 1e-9 && y <= south + 1e-9;
            assert_eq!(placed.solids.len(), placed.landmark.solids.len());
            assert!(placed.solids.iter().all(|solid| inside(solid[0], solid[1]) && inside(solid[2], solid[3])));
            assert_eq!(placed.glows.len(), placed.landmark.glows.len());
            assert!(placed.glows.iter().all(|glow| inside(glow[0], glow[1])));
        }
    }
}

#[test]
fn each_landmarks_room_stays_one_walk_to_every_doorway_with_its_band_free() {
    for dungeon in DUNGEONS.iter() {
        for placed in &dungeon.landmarks {
            let room = &dungeon.rooms[placed.room];
            let rest: Vec<usize> = room.cells.iter().copied().filter(|cell| !placed.cells.contains(cell)).collect();
            let (mut reached, mut todo) = (vec![rest[0]], vec![rest[0]]);
            while let Some(at) = todo.pop() {
                for next in SIDES.into_iter().filter_map(|side| dungeon.beside(at, side)) {
                    if rest.contains(&next) && !reached.contains(&next) {
                        reached.push(next);
                        todo.push(next);
                    }
                }
            }
            assert_eq!(reached.len(), rest.len(), "one walk round it");
            let doorways: Vec<usize> = room.cells.iter().copied().filter(|&cell| doorway(dungeon, cell)).collect();
            assert!(!doorways.is_empty() && doorways.iter().all(|cell| reached.contains(cell)), "to every doorway");
            let band = posts_for(room.cells.len());
            let posts = dungeon.nearest_middle(placed.room, band);
            assert_eq!(posts.len(), band, "its band's posts free");
            assert!(posts.iter().all(|post| !placed.cells.contains(post)), "no post on it");
        }
    }
}

#[test]
fn no_prop_fixture_pillar_torch_doorway_arrival_or_portal_stands_on_a_footprint() {
    for dungeon in DUNGEONS.iter() {
        let (arrival, _) = dungeon.arrival();
        for placed in &dungeon.landmarks {
            let footprint = &placed.cells;
            for prop in &dungeon.props {
                let at = prop.solid.map_or([prop.at[0], prop.at[1]], |solid| {
                    [(solid[0] + solid[2]) / 2.0, (solid[1] + solid[3]) / 2.0]
                });
                assert!(!footprint.contains(&cell_at(dungeon, at)), "a prop on {}", placed.landmark.module);
            }
            for fixture in &dungeon.fixtures {
                assert!(!footprint.contains(&cell_at(dungeon, [fixture.at[0], fixture.at[1]])), "a fixture on it");
            }
            for torch in &dungeon.torches {
                assert!(!footprint.contains(&cell_at(dungeon, [torch.at[0], torch.at[1]])), "a torch's wall on it");
            }
            let [west, north, east, south] = rectangle(placed);
            for &[x, y, _] in &dungeon.pillars {
                let apart = x + PILLAR_HALF_M <= west
                    || x - PILLAR_HALF_M >= east
                    || y + PILLAR_HALF_M <= north
                    || y - PILLAR_HALF_M >= south;
                assert!(apart, "a pillar in {}", placed.landmark.module);
            }
            let room = &dungeon.rooms[placed.room];
            assert!(!room.cells.iter().any(|&cell| doorway(dungeon, cell) && touches(dungeon, footprint, cell)));
            for cell in [dungeon.way_in.cell, dungeon.portal.cell, cell_at(dungeon, arrival)] {
                assert!(!touches(dungeon, footprint, cell), "the way in, the arrival or the portal by it");
            }
        }
    }
}

#[test]
fn the_boxes_end_with_the_landmarks_solids() {
    for dungeon in DUNGEONS.iter().take(300) {
        let solids: Vec<[f64; 5]> = dungeon.landmarks.iter().flat_map(|placed| placed.solids.clone()).collect();
        let boxes = dungeon.boxes();
        assert_eq!(boxes[boxes.len() - solids.len()..], solids[..]);
    }
}
