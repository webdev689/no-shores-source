use super::*;
use dungeon::{CELL_M, Dungeon, SIDES, STYLES, Side};
use movement::{Body, Controls, Mode, TICK_SECONDS, standing, step_body};

/// A dungeon of one storey: these pin the ground within a storey (`dungeon_storeys_tests.rs` the ground across them).
fn forged(seed: u32) -> (Dungeon, DungeonGround) {
    let dungeon = Dungeon::forge_storeys(seed, STYLES[seed as usize % STYLES.len()], dungeon::BLOCKS, 1);
    let ground = DungeonGround::of(&dungeon).unwrap();
    (dungeon, ground)
}

/// A body stepped `ticks` ticks running the way `side` faces, on the ground alone, as a room steps it.
fn run(ground: &DungeonGround, from: [f64; 2], side: Side, ticks: u32) -> Body {
    let controls = Controls { forward: 1.0, yaw: side.bearing(), run: true, ..Controls::default() };
    (0..ticks).fold(standing(from[0], from[1]), |body, _| step_body(&body, &controls, &[], ground, TICK_SECONDS))
}

fn past(dungeon: &Dungeon, cell: usize, side: Side, body: &Body) -> f64 {
    let ([x, y], [dx, dy]) = (dungeon.centre(cell), side.unit());
    (body.x - x) * dx + (body.y - y) * dy
}

#[test]
fn a_body_run_at_a_wall_stops_its_half_width_off_it_on_the_floor() {
    let tick = TUNING.run * TICK_SECONDS;
    for seed in 0..40 {
        let (dungeon, ground) = forged(seed);
        for (cell, _) in dungeon.cells.iter().enumerate().filter(|(_, kind)| **kind != dungeon::Cell::Rock).step_by(7) {
            for side in SIDES.into_iter().filter(|&side| {
                dungeon.beside(cell, side).is_none_or(|next| dungeon.cells[next] == dungeon::Cell::Rock)
            }) {
                let body = run(&ground, dungeon.centre(cell), side, 90);
                let into = past(&dungeon, cell, side, &body);
                let wall = CELL_M / 2.0 - TUNING.radius;
                let furnished = solids_of(&dungeon).into_iter().any(|[min_x, min_y, max_x, max_y, _]| {
                    let [x, y] = dungeon.centre(cell);
                    (min_x + max_x) / 2.0 - x < CELL_M / 2.0
                        && x - (min_x + max_x) / 2.0 < CELL_M / 2.0
                        && (min_y + max_y) / 2.0 - y < CELL_M / 2.0
                        && y - (min_y + max_y) / 2.0 < CELL_M / 2.0
                });
                // A prop, a fixture or a landmark may stand over the cell's middle: their own tests run at them.
                if furnished || dungeon.under_landmark(cell) {
                    continue;
                }
                // A doorway's jamb stops it sooner.
                if dungeon.frames.iter().any(|frame| frame.cell == cell) {
                    assert!(into <= wall + 1e-9, "seed {seed}: never nearer the rock than its half-width");
                } else {
                    assert!(into <= wall + 1e-9 && into > wall - tick, "seed {seed}: {into} m toward the wall");
                }
                assert!(body.z.abs() < 1e-9 && body.mode == Mode::Ground, "seed {seed}: on the floor");
            }
        }
    }
}

#[test]
fn a_body_passes_every_doorway_between_its_jambs_and_never_climbs_one() {
    for seed in 0..40 {
        let (dungeon, ground) = forged(seed);
        for frame in &dungeon.frames {
            let body = run(&ground, dungeon.centre(frame.cell), frame.side, 30);
            assert!(past(&dungeon, frame.cell, frame.side, &body) > CELL_M / 2.0, "seed {seed}: through the doorway");
            let [dx, dy] = frame.side.unit();
            let [x, y] = dungeon.centre(frame.cell);
            // Straight at a jamb, from the room, beside the opening.
            let beside_opening = [x - dy * 1.25, y + dx * 1.25];
            let body = run(&ground, beside_opening, frame.side, 240);
            assert!(past(&dungeon, frame.cell, frame.side, &body) <= CELL_M / 2.0 - TUNING.radius + 1e-9);
            assert!(body.z.abs() < 1e-9 && body.mode == Mode::Ground, "seed {seed}: a jamb is never climbed");
        }
    }
}

#[test]
fn a_pillar_keeps_a_body_its_half_width_off_and_is_never_climbed() {
    let (dungeon, ground) = (0..).map(forged).find(|(dungeon, _)| !dungeon.pillars.is_empty()).unwrap();
    for &[x, y, _] in &dungeon.pillars {
        let from = [x - 2.0, y];
        let body = run(&ground, from, Side::East, 240);
        assert!(body.x <= x - dungeon::PILLAR_HALF_M - TUNING.radius + 1e-9, "{} short of the pillar", x - body.x);
        assert!(body.z.abs() < 1e-9 && body.mode == Mode::Ground);
    }
    let [x, y, top] = dungeon.pillars[0];
    assert_eq!(ground.height_at(x, y), top, "a pillar stands to its own top, the ceiling");
}

#[test]
fn a_body_run_slantwise_into_a_wall_slides_along_it() {
    let rock_north = |dungeon: &Dungeon, cell: usize| {
        dungeon.beside(cell, Side::North).is_none_or(|next| dungeon.cells[next] == dungeon::Cell::Rock)
    };
    let (dungeon, ground, cell) = (0..)
        .find_map(|seed| {
            let (dungeon, ground) = forged(seed);
            let cell = (0..dungeon.cells.len()).find(|&cell| {
                let east = dungeon.beside(cell, Side::East);
                dungeon.room_at(cell).is_some()
                    && east.is_some_and(|east| {
                        dungeon.room_at(east) == dungeon.room_at(cell) && rock_north(&dungeon, east)
                    })
                    && rock_north(&dungeon, cell)
            })?;
            Some((dungeon, ground, cell))
        })
        .unwrap();
    let [x, y] = dungeon.centre(cell);
    // Half a turn east of north: into the wall to the north, and along it to the east.
    let controls = Controls { forward: 1.0, yaw: 0.5, ..Controls::default() };
    let body = (0..40).fold(standing(x, y), |body, _| step_body(&body, &controls, &[], &ground, TICK_SECONDS));
    assert!(body.x > x + 0.5, "it slid east along the wall, {} m", body.x - x);
    assert!(past(&dungeon, cell, Side::North, &body) <= CELL_M / 2.0 - TUNING.radius + 1e-9);
}

/// The props' and the fixtures' solids.
fn solids_of(dungeon: &Dungeon) -> Vec<[f64; 5]> {
    let props = dungeon.props.iter().filter_map(|prop| prop.solid);
    props.chain(dungeon.fixtures.iter().filter_map(|fixture| fixture.solid)).collect()
}

/// A dungeon's solids as its ground holds them, without their bottoms: each stands on the top storey's floor.
fn tops_of(ground: &DungeonGround) -> Vec<[f64; 5]> {
    ground.solids().iter().map(|&[min_x, min_y, max_x, max_y, _, top]| [min_x, min_y, max_x, max_y, top]).collect()
}

/// A solid's cell, and the side of it toward a neighbouring cell of its room that holds no solid, if one does.
fn way_out(dungeon: &Dungeon, solid: &[f64; 5]) -> Option<(usize, Side)> {
    let solids = solids_of(dungeon);
    let cell_of = |solid: &[f64; 5]| {
        let middle = [(solid[0] + solid[2]) / 2.0, (solid[1] + solid[3]) / 2.0];
        (middle[1] / CELL_M) as usize * dungeon.columns + (middle[0] / CELL_M) as usize
    };
    let cell = cell_of(solid);
    let side = SIDES.into_iter().find(|&side| {
        dungeon.beside(cell, side).is_some_and(|next| {
            dungeon.room_at(cell).is_some()
                && dungeon.room_at(next) == dungeon.room_at(cell)
                && solids.iter().all(|other| cell_of(other) != next)
        })
    })?;
    Some((cell, side))
}

#[test]
fn a_body_run_at_a_landmark_from_its_room_stops_its_half_width_off_its_solids_and_never_climbs_one() {
    let mut run_at = 0;
    for seed in 0..60 {
        let (dungeon, ground) = forged(seed);
        for placed in &dungeon.landmarks {
            for (cell, side) in placed.cells.iter().flat_map(|&cell| SIDES.into_iter().map(move |side| (cell, side))) {
                // From the middle of a free cell of its room beside the footprint, straight at it.
                let Some(from) = dungeon.beside(cell, side) else { continue };
                if dungeon.room_at(from) != Some(placed.room) || dungeon.holds_solid(from) {
                    continue;
                }
                let body = run(&ground, dungeon.centre(from), side.opposite(), 120);
                for &[min_x, min_y, max_x, max_y, _] in &placed.solids {
                    let [near_x, near_y] = [body.x.clamp(min_x, max_x), body.y.clamp(min_y, max_y)];
                    let apart = ((body.x - near_x) * (body.x - near_x) + (body.y - near_y) * (body.y - near_y)).sqrt();
                    assert!(apart >= TUNING.radius - 1e-9, "seed {seed}: {apart} m from {}", placed.landmark.module);
                }
                assert!(body.z.abs() < 1e-9 && body.mode == Mode::Ground, "seed {seed}: never on it");
                run_at += 1;
            }
        }
    }
    assert!(run_at > 50, "{run_at} runs at a landmark");
}

#[test]
fn a_body_run_at_a_prop_from_the_room_stops_its_half_width_off_it() {
    let (mut run_at, mut seed) = (0, 0);
    while run_at < 40 {
        let (dungeon, ground) = forged(seed);
        seed += 1;
        for solid in solids_of(&dungeon) {
            let Some((cell, side)) = way_out(&dungeon, &solid) else { continue };
            let [min_x, min_y, max_x, max_y, _] = solid;
            // From the free cell's middle beside it, straight at its cell.
            let start = dungeon.centre(dungeon.beside(cell, side).unwrap());
            let body = run(&ground, start, side.opposite(), 120);
            let [near_x, near_y] = [body.x.clamp(min_x, max_x), body.y.clamp(min_y, max_y)];
            let apart = ((body.x - near_x) * (body.x - near_x) + (body.y - near_y) * (body.y - near_y)).sqrt();
            assert!(apart >= TUNING.radius - 1e-9, "seed {seed}: {apart} m from a solid");
            assert!(body.z.abs() < 1e-9 && body.mode == Mode::Ground, "never on it");
            run_at += 1;
        }
    }
}

#[test]
fn a_body_shoved_inside_a_prop_walks_out_of_it_toward_the_room() {
    let (mut shoved, mut seed) = (0, 0);
    while shoved < 40 {
        let (dungeon, ground) = forged(seed);
        seed += 1;
        for solid in solids_of(&dungeon) {
            let Some((_, side)) = way_out(&dungeon, &solid) else { continue };
            let [min_x, min_y, max_x, max_y, _] = solid;
            let middle = [(min_x + max_x) / 2.0, (min_y + max_y) / 2.0];
            let body = run(&ground, middle, side, 60);
            let out = body.x < min_x || body.x > max_x || body.y < min_y || body.y > max_y;
            assert!(out, "seed {seed}: out of a solid toward the room");
            shoved += 1;
        }
    }
}

#[test]
fn a_line_is_walled_by_the_rock_and_every_solid_but_crosses_bare_floor() {
    for seed in 0..40 {
        let (dungeon, ground) = forged(seed);
        let solids = tops_of(&ground);
        for &[min_x, min_y, max_x, max_y, _] in &solids {
            let middle_y = (min_y + max_y) / 2.0;
            let low = [min_x - 0.1, middle_y, 0.1];
            assert!(ground.line_walled(low, [max_x + 0.1, middle_y, 0.1]), "seed {seed}: a solid");
        }
        for cell in (0..dungeon.cells.len()).filter(|&cell| dungeon.cells[cell] != dungeon::Cell::Rock) {
            let [x, y] = dungeon.centre(cell);
            let half = CELL_M / 2.0;
            let bare = solids.iter().all(|&[min_x, min_y, max_x, max_y, _]| {
                max_x < x - half || min_x > x + half || max_y < y - half || min_y > y + half
            });
            let chest = 1.3;
            let across = ground.line_walled([x - half / 2.0, y, chest], [x + half / 2.0, y, chest]);
            assert!(!bare || !across, "seed {seed}: bare floor");
            for side in SIDES {
                let rock = dungeon.beside(cell, side).is_none_or(|next| dungeon.cells[next] == dungeon::Cell::Rock);
                let [dx, dy] = side.unit();
                let into = [x + dx * CELL_M, y + dy * CELL_M, chest];
                assert!(!rock || ground.line_walled([x, y, chest], into), "seed {seed}: the rock {side:?} of {cell}");
            }
        }
    }
}

/// Whether no taller solid stands on any of a solid's floor, as a landmark's tomb stands on its dais.
fn uncovered(solids: &[[f64; 5]], solid: &[f64; 5]) -> bool {
    solids.iter().all(|other| {
        other[4] <= solid[4]
            || other[2] <= solid[0]
            || other[0] >= solid[2]
            || other[3] <= solid[1]
            || other[1] >= solid[3]
    })
}

#[test]
fn a_line_passes_over_a_solid_lower_than_itself_and_meets_one_where_it_is_lower_than_the_top() {
    let mut low_props = 0;
    for seed in 0..40 {
        let (_, ground) = forged(seed);
        let solids = tops_of(&ground);
        for &[min_x, min_y, max_x, max_y, top] in solids.iter().filter(|solid| uncovered(&solids, solid)) {
            // Inside the solid's own sides, so no other solid or rock is crossed.
            let (middle_y, inset) = ((min_y + max_y) / 2.0, (max_x - min_x) / 4.0);
            let line = |z: f64| ground.line_walled([min_x + inset, middle_y, z], [max_x - inset, middle_y, z]);
            assert!(!line(top + 0.05), "seed {seed}: a line just over a solid's top passes");
            assert!(line(top - 0.05), "seed {seed}: a line just under it is walled");
            assert!(ground.line_walled([min_x + inset, middle_y, top + 1.0], [max_x - inset, middle_y, top - 0.2]));
            assert_eq!(ground.height_at((min_x + max_x) / 2.0, middle_y), top, "seed {seed}: the ground is its top");
            low_props += usize::from(top < 1.3);
        }
    }
    assert!(low_props > 0, "some solid stands lower than a chest, so a look passes over it");
}

#[test]
fn a_shot_enters_rock_at_its_cell_side_and_a_solid_by_its_face_below_its_top_and_passes_over_it() {
    for seed in 0..30 {
        let (dungeon, ground) = forged(seed);
        let solids = tops_of(&ground);
        for cell in (0..dungeon.cells.len()).filter(|&cell| dungeon.cells[cell] != dungeon::Cell::Rock).step_by(5) {
            let [x, y] = dungeon.centre(cell);
            for side in SIDES {
                let rock = dungeon.beside(cell, side).is_none_or(|next| dungeon.cells[next] == dungeon::Cell::Rock);
                let [dx, dy] = side.unit();
                let entered = ground.wall_entry([x, y, 1.3], [x + dx * CELL_M, y + dy * CELL_M, 1.3]);
                if rock {
                    assert!(
                        entered.is_some_and(|share| share <= 0.5 + 1e-9),
                        "seed {seed}: the rock {side:?} of {cell}"
                    );
                }
            }
        }
        for &[min_x, min_y, max_x, max_y, top] in solids.iter().filter(|solid| uncovered(&solids, solid)) {
            let (middle_y, z) = ((min_y + max_y) / 2.0, top / 2.0);
            let across = ground.wall_entry([min_x - 1.0, middle_y, z], [min_x + 3.0, middle_y, z]);
            assert!(across.is_some_and(|share| share <= 0.25 + 1e-9), "seed {seed}: stopped no later than its face");
            let inset = (max_x - min_x) / 4.0;
            let over = ground.wall_entry([min_x + inset, middle_y, top + 0.1], [max_x - inset, middle_y, top + 0.1]);
            assert!(over.is_none(), "seed {seed}: a shot passes over a solid lower than itself");
        }
    }
}

/// Where a crossbow bolt loosed from `from` at `bearing`, level, comes to rest on the ground alone, and what it struck.
fn bolt(ground: &DungeonGround, from: [f64; 3], bearing: f64, bodies: &[(u32, [f64; 3])]) -> ([f64; 3], Option<u32>) {
    use combat::shots::{Flight, fly, loose};
    let mut shot = loose(9, combat::arms::Ranged::Crossbow, from, bearing, 0.0, 1.0);
    loop {
        match fly(&shot, &[], ground, bodies) {
            Flight::Flying(next) => shot = next,
            Flight::Stopped { at, struck } => return (at, struck),
        }
    }
}

#[test]
fn a_bolt_stops_at_the_face_of_rock_or_a_tall_solid_and_strikes_a_foe_pressed_to_the_wall() {
    for seed in 0..12 {
        let (dungeon, ground) = forged(seed);
        for cell in (0..dungeon.cells.len()).filter(|&cell| dungeon.cells[cell] != dungeon::Cell::Rock).step_by(3) {
            let [x, y] = dungeon.centre(cell);
            for side in SIDES {
                if dungeon.beside(cell, side).is_some_and(|next| dungeon.cells[next] != dungeon::Cell::Rock) {
                    continue;
                }
                let [dx, dy] = side.unit();
                // Loosed 0.6 m back from the cell's middle, with no solid between it and the rock's face.
                let back = [x - dx * 0.6, y - dy * 0.6, 1.3];
                let face = [x + dx * (CELL_M / 2.0 - 0.01), y + dy * (CELL_M / 2.0 - 0.01), 1.3];
                if ground.line_walled(back, face) || ground.clearance(back[0], back[1], 0) <= 0.0 {
                    continue;
                }
                let (at, _) = bolt(&ground, back, side.bearing(), &[]);
                let short = CELL_M / 2.0 - ((at[0] - x) * dx + (at[1] - y) * dy);
                assert!(short.abs() < 1e-6, "seed {seed}: {short} m short of the {side:?} rock of {cell}");
                let foe = [x + dx * (CELL_M / 2.0 - 0.36), y + dy * (CELL_M / 2.0 - 0.36), 0.0];
                assert_eq!(bolt(&ground, back, side.bearing(), &[(4, foe)]).1, Some(4), "seed {seed}: the foe");
            }
        }
        for &[min_x, min_y, _, max_y, top] in tops_of(&ground).iter().filter(|solid| solid[4] > 1.6) {
            let middle_y = (min_y + max_y) / 2.0;
            let from = [min_x - 1.0, middle_y, 1.3];
            // Loosed from open floor clear of every solid, with nothing between it and the solid's face.
            let open = ground.column_at(from[0], from[1]).is_some_and(|column| ground.open[column]);
            if !open
                || ground.clearance(from[0], from[1], 0) <= 0.0
                || ground.line_walled(from, [min_x - 0.01, middle_y, 1.3])
            {
                continue;
            }
            let (at, _) = bolt(&ground, from, Side::East.bearing(), &[]);
            assert!((at[0] - min_x).abs() < 1e-6, "seed {seed}: {} m short of a solid {top} m tall", min_x - at[0]);
        }
    }
}
