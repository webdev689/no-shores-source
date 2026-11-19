use super::*;
use dungeon::{CELL_M, Dungeon, SIDES, STYLES, Side};
use movement::{Body, Controls, Mode, TICK_SECONDS, standing, step_body};

fn forged(seed: u32) -> (Dungeon, DungeonGround) {
    let dungeon = Dungeon::forge(seed, STYLES[seed as usize % STYLES.len()]);
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
    assert_eq!(ground.height_at(dungeon.pillars[0][0], dungeon.pillars[0][1]), SOLID_TOP_M);
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
