use super::*;
use movement::{Controls, Mode};
use reach::{RESPAWN_TICKS, WARNING_TICKS};
use serde_json::json;
use std::f64::consts::PI;

const STILL: Controls =
    Controls { forward: 0.0, sideways: 0.0, yaw: 0.0, run: false, jump: false, crouch: false, mounted: false };
/// Walking north, toward -y.
const NORTH: Controls = Controls { forward: 1.0, ..STILL };
const RUN_NORTH: Controls = Controls { run: true, ..NORTH };
const SOUTH: Controls = Controls { yaw: PI, ..NORTH };

/// A section 100 m square round the origin, with a spawn at its middle and one in its north-east.
fn section() -> Section {
    Section {
        ring: vec![[-50.0, -50.0], [50.0, -50.0], [50.0, 50.0], [-50.0, 50.0]],
        spawns: vec![[0.0, 0.0], [30.0, -40.0]],
    }
}

/// Land 10 m up, with a grain, over 4 km square round the origin, and a terrace 20 m square at 12 m in its middle.
fn land() -> Floor {
    let grid = |value: f64| {
        json!({ "width": 4, "height": 4, "left_m": -2000.0, "top_m": -2000.0, "cell_m": 1000.0,
            "first_column": 0, "first_row": 0, "data": vec![value; 16] })
    };
    let ground = json!({ "land": grid(10.0), "lake_level": vec![0.0; 16], "rivers": [], "roads": [], "towns": [],
        "coast": grid(5000.0), "across": grid(-50.0), "pads": [{ "bounds": [-10.0, -10.0, 10.0, 10.0], "level": 12.0 }],
        "seed": 7 });
    Floor::Land(Box::new(serde_json::from_value(ground).unwrap()))
}

/// A player in a test, numbering their own inputs.
struct Driver {
    player: PlayerId,
    sequence: u32,
}

impl Driver {
    fn join(room: &mut Room) -> Self {
        Driver { player: room.join().unwrap(), sequence: 0 }
    }

    /// Sends one input and ticks the room once.
    fn play(&mut self, room: &mut Room, controls: Controls, respawn: bool) -> Seen {
        self.sequence += 1;
        let intent = combat::Intent { controls, ..combat::Intent::default() };
        room.input(self.player, Input { sequence: self.sequence, intent, respawn, ..Input::default() }).unwrap();
        room.tick();
        room.seen().find(|seen| seen.player == self.player).unwrap()
    }

    /// Plays `controls` until the standing is no longer `while_standing`; answers the ticks taken and the last seen.
    fn until(&mut self, room: &mut Room, controls: Controls, keep: impl Fn(Standing) -> bool) -> (u32, Seen) {
        let mut ticks = 0;
        loop {
            let seen = self.play(room, controls, false);
            ticks += 1;
            if !keep(seen.standing) || ticks > 10_000 {
                return (ticks, seen);
            }
        }
    }
}

fn flat_node() -> Room {
    Room::node(Floor::Flat, Vec::new(), section())
}

#[test]
fn a_body_that_walks_out_is_warned_and_dies_ten_seconds_later() {
    let mut room = flat_node();
    let mut walker = Driver::join(&mut room);
    let (_, out) = walker.until(&mut room, NORTH, |standing| standing == Standing::Inside);
    assert!(out.fighter.body.y < -50.0 && out.fighter.body.y > -51.0, "just past the edge at {}", out.fighter.body.y);
    assert_eq!(out.standing, Standing::Warned { ticks_left: WARNING_TICKS - 1 });
    for left in (1..WARNING_TICKS - 1).rev() {
        assert_eq!(walker.play(&mut room, STILL, false).standing, Standing::Warned { ticks_left: left });
    }
    let dead = walker.play(&mut room, STILL, false);
    assert_eq!(dead.standing, Standing::Dead { ticks: 0 }, "600 ticks, 10 s, outside");
    let moved = walker.play(&mut room, SOUTH, false);
    assert_eq!(
        (moved.fighter.body, moved.standing),
        (dead.fighter.body, Standing::Dead { ticks: 1 }),
        "a dead body is still"
    );
    assert_eq!(moved.acknowledged, dead.acknowledged + 1, "its inputs are still taken");
}

#[test]
fn walking_back_in_ends_the_warning() {
    let mut room = flat_node();
    let mut walker = Driver::join(&mut room);
    walker.until(&mut room, NORTH, |standing| standing == Standing::Inside);
    let (ticks, back) = walker.until(&mut room, SOUTH, |standing| matches!(standing, Standing::Warned { .. }));
    assert_eq!(back.standing, Standing::Inside);
    assert!(ticks < 10, "back over the edge within a few steps, not {ticks}");
    let (_, again) = walker.until(&mut room, NORTH, |standing| standing == Standing::Inside);
    assert_eq!(again.standing, Standing::Warned { ticks_left: WARNING_TICKS - 1 }, "a new warning counts from 10 s");
}

#[test]
fn sixty_metres_past_the_edge_kills_at_once() {
    let mut room = flat_node();
    let mut runner = Driver::join(&mut room);
    let (to_edge, _) = runner.until(&mut room, RUN_NORTH, |standing| standing == Standing::Inside);
    let (outside, dead) = runner.until(&mut room, RUN_NORTH, |standing| matches!(standing, Standing::Warned { .. }));
    assert_eq!(dead.standing, Standing::Dead { ticks: 0 });
    assert!(outside + 1 < WARNING_TICKS, "dead after {outside} ticks outside, before the count ran out");
    assert!(dead.fighter.body.y <= -110.0, "60 m past the edge at {}", dead.fighter.body.y);
    assert!(to_edge > 0);
}

#[test]
fn a_respawn_is_refused_for_four_seconds_then_stands_the_body_at_the_nearest_spawn() {
    let mut room = flat_node();
    let mut runner = Driver::join(&mut room);
    let (_, dead) = runner.until(&mut room, RUN_NORTH, |standing| standing != Standing::Dead { ticks: 0 });
    assert_eq!(dead.standing, Standing::Dead { ticks: 0 });
    for ticks in 1..=RESPAWN_TICKS {
        let asked = runner.play(&mut room, NORTH, true);
        assert_eq!(
            (asked.standing, asked.fighter.body),
            (Standing::Dead { ticks }, dead.fighter.body),
            "refused at {ticks}"
        );
    }
    let back = runner.play(&mut room, NORTH, true);
    assert_eq!(back.standing, Standing::Inside);
    assert_eq!(
        back.fighter.body,
        standing_on(&Floor::Flat, &[], 30.0, -40.0),
        "the spawn nearest where it died, north"
    );
    let walked = runner.play(&mut room, NORTH, false);
    assert!(walked.fighter.body.y < back.fighter.body.y, "alive again, it walks");
}

#[test]
fn a_body_dead_and_silent_still_stands_a_tick_at_a_time_so_the_time_is_not_banked() {
    let mut room = flat_node();
    let mut runner = Driver::join(&mut room);
    let (_, dead) = runner.until(&mut room, RUN_NORTH, |standing| standing != Standing::Dead { ticks: 0 });
    assert_eq!(dead.standing, Standing::Dead { ticks: 0 });
    for _ in 0..600 {
        room.tick();
    }
    let found = &room.players[&runner.player];
    let behind = room.clock() - found.joined - found.stepped;
    assert!(behind <= VIEW_LAG + 1, "{behind} ticks banked to catch up on at 3 a tick");
}

#[test]
fn players_join_at_the_spawns_in_turn_standing_on_the_land_and_walk_on_it() {
    let floor = land();
    let mut room = Room::node(floor.clone(), Vec::new(), section());
    let mut walkers: Vec<Driver> = (0..3).map(|_| Driver::join(&mut room)).collect();
    let bodies: Vec<Body> = room.seen().map(|seen| seen.fighter.body).collect();
    assert_eq!((bodies[0].x, bodies[0].y, bodies[0].z), (0.0, 0.0, 12.0), "on the terrace");
    assert_eq!((bodies[1].x, bodies[1].y), (30.0, -40.0));
    assert_eq!(bodies[1].z.to_bits(), floor.height_at(30.0, -40.0).to_bits(), "on the land");
    assert_eq!((bodies[2].x, bodies[2].y), (0.0, 0.0), "the spawns come round again");
    let second = &mut walkers[1];
    for _ in 0..60 {
        let seen = second.play(&mut room, Controls { yaw: PI, ..NORTH }, false);
        assert_eq!(seen.fighter.body.mode, Mode::Ground);
        assert_eq!(seen.fighter.body.z.to_bits(), floor.height_at(seen.fighter.body.x, seen.fighter.body.y).to_bits());
    }
}

#[test]
fn a_room_with_no_section_never_judges_its_bodies() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let mut walker = Driver::join(&mut room);
    for _ in 0..2000 {
        assert_eq!(walker.play(&mut room, RUN_NORTH, false).standing, Standing::Inside);
    }
    let seen = room.seen().next().unwrap();
    assert!(seen.fighter.body.y < -200.0);
}

#[test]
fn a_node_s_room_stands_no_foe_a_player_asks_for_where_a_course_s_room_does() {
    let foes_after_asking = |mut room: Room| {
        let player = room.join().unwrap();
        let spawn = Some(SpawnAsk::Foe { foe_type: 13, rank: 2, shield: 0 });
        room.input(player, Input { sequence: 1, spawn, ..Input::default() }).unwrap();
        room.tick();
        room.foes_seen().count()
    };
    assert_eq!(foes_after_asking(Room::node(land(), Vec::new(), section())), 0);
    assert_eq!(foes_after_asking(Room::new(Vec::new(), (0.0, 0.0))), 1);
}

#[test]
fn a_node_s_room_told_to_take_asks_stands_each_foe_on_its_land_and_it_stays_there() {
    let floor = land();
    let mut room = Room::node(floor.clone(), Vec::new(), section());
    room.take_foe_asks();
    let mut asker = Driver::join(&mut room);
    // Off the terrace, so the foe stands 5 m ahead on the land 10 m up.
    for _ in 0..240 {
        asker.play(&mut room, Controls { yaw: PI, ..RUN_NORTH }, false);
    }
    asker.sequence += 1;
    let spawn = Some(SpawnAsk::Foe { foe_type: 2, rank: 1, shield: 0 });
    let input = Input {
        sequence: asker.sequence,
        intent: combat::Intent { controls: STILL, ..combat::Intent::default() },
        spawn,
        ..Input::default()
    };
    room.input(asker.player, input).unwrap();
    room.tick();
    let foe = room.foes_seen().next().expect("the foe asked for").fighter.body;
    assert_eq!(foe.z.to_bits(), floor.height_at(foe.x, foe.y).to_bits(), "stood on the land at {foe:?}");
    for _ in 0..60 {
        asker.play(&mut room, STILL, false);
    }
    let foe = room.foes_seen().next().expect("the foe still there").fighter.body;
    assert!((foe.z - floor.height_at(foe.x, foe.y)).abs() < 1e-9, "still on the land at {foe:?}");
}

#[test]
fn a_node_s_room_bakes_its_paths_and_firing_spots_on_its_land() {
    use ::foes::Spots;
    let floor = land();
    let room = Room::node(floor.clone(), Vec::new(), section());
    let on_land = |x: f64, y: f64| [x, y, floor.height_at(x, y)];
    let route = room.nav.find_path(on_land(20.0, 20.0), on_land(-20.0, 15.0)).expect("a way across the land");
    let spots = room.spots().near([20.0, 20.0, 0.0], 5.0);
    assert!(!spots.is_empty(), "spots on the open land");
    for [x, y, z] in route.iter().copied().chain(spots.iter().map(|spot| spot.point)) {
        assert!((z - floor.height_at(x, y)).abs() < 0.05, "{x}, {y} at {z} m stands on the land");
    }
}
