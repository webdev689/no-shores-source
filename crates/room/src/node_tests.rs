use super::*;
use movement::{Controls, Mode, Terrain};
use reach::{RESPAWN_TICKS, WARNING_TICKS};
use serde_json::json;
use std::f64::consts::PI;

const STILL: Controls = Controls {
    forward: 0.0,
    sideways: 0.0,
    yaw: 0.0,
    run: false,
    jump: false,
    crouch: false,
    mounted: false,
    boost: false,
};
/// Walking north, toward -y.
const NORTH: Controls = Controls { forward: 1.0, ..STILL };
const RUN_NORTH: Controls = Controls { run: true, ..NORTH };
const SOUTH: Controls = Controls { yaw: PI, ..NORTH };

/// A section 100 m square round the origin, with a spawn at its middle and one in its north-east.
fn section() -> Section {
    Section {
        ring: vec![[-50.0, -50.0], [50.0, -50.0], [50.0, 50.0], [-50.0, 50.0]],
        spawns: vec![[0.0, 0.0], [30.0, -40.0]],
        falls_kill: false,
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

    /// Sends `controls` `inputs` times, as a page whose inputs bunched on the way, then ticks once.
    fn play_bunched(&mut self, room: &mut Room, controls: Controls, inputs: u32) -> Seen {
        for _ in 1..inputs {
            self.sequence += 1;
            let intent = combat::Intent { controls, ..combat::Intent::default() };
            room.input(self.player, Input { sequence: self.sequence, intent, ..Input::default() }).unwrap();
        }
        self.play(room, controls, false)
    }

    /// Plays `controls` while `keep` holds of the standing; answers the ticks taken and the last seen.
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

/// Dead this tick by straying.
const STRAYED: Standing = Standing::Dead { ticks: 0, fell: false };

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
    assert_eq!(dead.standing, STRAYED, "600 ticks, 10 s, outside");
    let moved = walker.play(&mut room, SOUTH, false);
    let at = |seen: &Seen| (seen.fighter.body.x, seen.fighter.body.y, seen.fighter.body.z);
    assert_eq!(
        (at(&moved), moved.standing),
        (at(&dead), Standing::Dead { ticks: 1, fell: false }),
        "a body dead on the flat stays where it stands, whatever is asked"
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
    assert_eq!(dead.standing, STRAYED);
    assert!(outside + 1 < WARNING_TICKS, "dead after {outside} ticks outside, before the count ran out");
    assert!(dead.fighter.body.y <= -110.0, "60 m past the edge at {}", dead.fighter.body.y);
    assert!(to_edge > 0);
}

#[test]
fn a_respawn_is_refused_for_four_seconds_then_stands_the_body_at_the_nearest_spawn() {
    let mut room = flat_node();
    let mut runner = Driver::join(&mut room);
    let (_, dead) = runner.until(&mut room, RUN_NORTH, |standing| standing != STRAYED);
    assert_eq!(dead.standing, STRAYED);
    let mut lying = dead.fighter.body;
    for ticks in 1..=RESPAWN_TICKS {
        let asked = runner.play(&mut room, NORTH, true);
        assert_eq!(asked.standing, Standing::Dead { ticks, fell: false }, "refused at {ticks}");
        let body = asked.fighter.body;
        assert!(body.y >= lying.y - 0.2 && body.z == 0.0, "it slides to a stop on the floor, not walking on: {body:?}");
        lying = body;
    }
    assert_eq!((lying.vx, lying.vy), (0.0, 0.0), "at rest where it lies");
    room.take_events();
    let back = runner.play(&mut room, NORTH, true);
    assert_eq!(back.standing, Standing::Inside);
    let told = room.take_events();
    assert!(
        told.iter().any(|event| event.kind == EventKind::Respawned && event.defender == runner.player),
        "everyone is told it respawned, as a fight's death is: {told:?}"
    );
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
    let (_, dead) = runner.until(&mut room, RUN_NORTH, |standing| standing != STRAYED);
    assert_eq!(dead.standing, STRAYED);
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

/// Land at 0 m with a platform raised `high` metres over its north (y below 10), and a body's floor, the land, under
/// it: the platform's ground ends in a 1 m blend down to the land, as a city's terraces do.
fn raised(high: f64) -> Floor {
    let grid = |value: f64| {
        json!({ "width": 4, "height": 4, "left_m": -2000.0, "top_m": -2000.0, "cell_m": 1000.0,
            "first_column": 0, "first_row": 0, "data": vec![value; 16] })
    };
    let ground = json!({ "land": grid(0.0), "lake_level": vec![-5000.0; 16], "rivers": [], "roads": [], "towns": [],
        "coast": grid(5000.0), "across": grid(-50.0), "pads": [{ "bounds": [-50.0, -50.0, 50.0, 10.0], "level": high }],
        "seed": 7 });
    Floor::Land(Box::new(serde_json::from_value(ground).unwrap()))
}

/// A social space's room on a platform `high` metres up (`raised`) whose spawn is in its middle; or, for `social`
/// false, a patrol's.
fn ledge(high: f64, social: bool) -> Room {
    Room::node(raised(high), Vec::new(), Section { spawns: vec![[0.0, 0.0]], falls_kill: social, ..section() })
}

/// The land's height under the platform's edge, south of its blend.
const BELOW: f64 = 0.5;

/// Runs south off the platform's edge, then lets go of the controls; answers every tick seen until the body has lain on
/// the land below for 2 s.
fn run_off(room: &mut Room) -> Vec<Seen> {
    let mut runner = Driver::join(room);
    let mut seen: Vec<Seen> = Vec::new();
    for _ in 0..600 {
        let off = seen.last().is_some_and(|seen| seen.fighter.body.y > 12.0);
        seen.push(runner.play(room, if off { STILL } else { Controls { yaw: PI, ..RUN_NORTH } }, false));
        if seen.len() > 120 && seen.iter().rev().take(120).all(|seen| seen.fighter.body.z == BELOW) {
            break;
        }
    }
    seen
}

#[test]
fn in_a_social_space_running_off_a_ledge_kills_six_metres_down_and_the_body_falls_on_to_lie_on_the_floor() {
    let seen = run_off(&mut ledge(20.0, true));
    let died = seen.iter().position(|seen| seen.standing != Standing::Inside).expect("it died");
    let dead = &seen[died];
    assert_eq!(dead.standing, Standing::Dead { ticks: 0, fell: true }, "dead by a fall, inside the ring");
    let at = dead.fighter.body;
    assert!(at.mode == Mode::Air && at.z <= 14.0 && at.z > 13.7, "6 m below the platform, in the air: {at:?}");
    let before = seen[died - 1].fighter.body;
    assert!(before.z > 14.0, "alive until 6 m down: {before:?}");
    assert!(seen[..died].iter().all(|seen| seen.standing == Standing::Inside), "never warned, inside the ring");
    let lies = seen.last().unwrap();
    assert_eq!(lies.standing, Standing::Dead { ticks: u32::try_from(seen.len() - 1 - died).unwrap(), fell: true });
    let body = lies.fighter.body;
    assert_eq!((body.z, body.mode), (BELOW, Mode::Ground), "it lies on the land");
    assert!(body.y > at.y + 1.0, "carried on south as it fell, from {} to {}", at.y, body.y);
    let fell: Vec<f64> = seen[died..].iter().map(|seen| seen.fighter.body.z).collect();
    assert!(fell.windows(2).all(|pair| pair[1] <= pair[0]), "falling all the way down, never steered back up");
}

#[test]
fn a_drop_short_of_six_metres_lands_alive_and_one_past_it_does_not() {
    assert!(run_off(&mut ledge(5.5, true)).iter().all(|seen| seen.standing == Standing::Inside));
    assert!(run_off(&mut ledge(7.0, true)).iter().any(|seen| seen.standing == Standing::Dead { ticks: 0, fell: true }));
}

#[test]
fn away_from_a_social_space_a_long_fall_does_no_harm() {
    let seen = run_off(&mut ledge(20.0, false));
    assert!(seen.iter().all(|seen| seen.standing == Standing::Inside));
    assert_eq!(seen.last().unwrap().fighter.body.z, BELOW);
}

#[test]
fn jumping_on_the_flat_of_a_social_space_never_kills() {
    let mut room = ledge(20.0, true);
    let mut jumper = Driver::join(&mut room);
    for tick in 0..900 {
        let jump = Controls { jump: tick % 2 == 0, forward: 0.5, yaw: PI / 2.0, ..STILL };
        assert_eq!(jumper.play(&mut room, jump, false).standing, Standing::Inside, "at {tick}");
    }
}

#[test]
fn walking_down_stairs_and_down_a_long_slope_in_a_social_space_never_kills() {
    // Forty steps of 0.25 m south off the platform, 10 m in all, then the land falling away 0.2 m a metre.
    let step = |index: u32| {
        let (y, top) = (10.0 + 0.3 * f64::from(index), 10.0 - 0.25 * f64::from(index + 1));
        Block { min_x: -5.0, min_y: y, max_x: 5.0, max_y: y + 0.3, top, bottom: 0.0 }
    };
    let social = Section { spawns: vec![[0.0, 0.0]], falls_kill: true, ..section() };
    let mut room = Room::node(raised(10.0), (0..40).map(step).collect(), social.clone());
    let mut walker = Driver::join(&mut room);
    for tick in 0..450 {
        let seen = walker.play(&mut room, SOUTH, false);
        assert_eq!(seen.standing, Standing::Inside, "at {tick}, {:?}", seen.fighter.body);
    }
    assert_eq!(room.seen().next().unwrap().fighter.body.z, BELOW, "down the stairs to the land");
    let slope = |column: f64| 800.0 - 200.0 * column;
    let grid = |value: &dyn Fn(f64) -> f64| {
        let data: Vec<f64> = (0..16).map(|cell| value(f64::from(cell % 4))).collect();
        json!({ "width": 4, "height": 4, "left_m": -1000.0, "top_m": -2000.0, "cell_m": 1000.0,
            "first_column": 0, "first_row": 0, "data": data })
    };
    let ground = json!({ "land": grid(&slope), "lake_level": vec![-5000.0; 16], "rivers": [], "roads": [],
        "towns": [], "coast": grid(&|_| 5000.0), "across": grid(&|_| -50.0), "pads": [], "seed": 7 });
    let hill = Floor::Land(Box::new(serde_json::from_value(ground).unwrap()));
    let wide = Section { ring: vec![[-900.0, -900.0], [900.0, -900.0], [900.0, 900.0], [-900.0, 900.0]], ..social };
    let mut room = Room::node(hill, Vec::new(), Section { spawns: vec![[0.0, 0.0]], ..wide });
    let mut runner = Driver::join(&mut room);
    let east = Controls { yaw: PI / 2.0, ..RUN_NORTH };
    let start = room.seen().next().unwrap().fighter.body.z;
    for tick in 0..1800 {
        let seen = runner.play(&mut room, east, false);
        assert_eq!(seen.standing, Standing::Inside, "at {tick}, {:?}", seen.fighter.body);
    }
    let end = room.seen().next().unwrap().fighter.body;
    assert!(start - end.z > 20.0, "down the slope {} m, from {start} to {}", start - end.z, end.z);
}

#[test]
fn a_body_that_fell_and_whose_inputs_stopped_still_falls_to_the_floor() {
    let mut room = ledge(20.0, true);
    let mut runner = Driver::join(&mut room);
    let (_, dead) = runner.until(&mut room, Controls { yaw: PI, ..RUN_NORTH }, |standing| standing == Standing::Inside);
    assert_eq!(dead.standing, Standing::Dead { ticks: 0, fell: true });
    for _ in 0..300 {
        room.tick();
    }
    let body = room.seen().next().unwrap().fighter.body;
    assert_eq!((body.z, body.mode), (BELOW, Mode::Ground), "stepped as it waits, it lies on the land: {body:?}");
}

#[test]
fn a_body_the_section_killed_is_not_stood_again_by_the_fight_s_own_respawn() {
    let mut room = ledge(20.0, true);
    let player = Driver::join(&mut room).player;
    let found = room.players.get_mut(&player).unwrap();
    found.fighter.action = combat::fighter::Action::Dead { elapsed: combat::tuning::RESPAWN };
    found.standing = Standing::Dead { ticks: 0, fell: true };
    room.tick();
    let seen = room.seen().next().unwrap();
    assert_eq!(seen.standing, Standing::Dead { ticks: 1, fell: true }, "still dead, until it asks to respawn");
    assert!(seen.fighter.dead(), "not made whole behind the section's back");
}

#[test]
fn a_fall_just_past_six_metres_kills_however_the_inputs_bunched_on_the_way() {
    for inputs in [1, 3] {
        let mut room = ledge(7.2, true);
        let mut runner = Driver::join(&mut room);
        let mut died = false;
        for _ in 0..200 {
            let off = room.seen().next().is_some_and(|seen| seen.fighter.body.y > 12.0);
            let controls = if off { STILL } else { Controls { yaw: PI, ..RUN_NORTH } };
            died |=
                runner.play_bunched(&mut room, controls, inputs).standing == Standing::Dead { ticks: 0, fell: true };
        }
        assert!(died, "{inputs} inputs a tick: a fall of 6.2 m from the edge's foot kills");
    }
}

#[test]
fn a_player_stood_again_below_where_they_died_may_jump_at_once() {
    let below = Section { spawns: vec![[0.0, 30.0]], falls_kill: true, ..section() };
    let mut room = Room::node(raised(20.0), Vec::new(), below);
    let mut jumper = Driver::join(&mut room);
    let found = room.players.get_mut(&jumper.player).unwrap();
    found.fighter.body = Body { x: 0.0, y: 0.0, z: 20.0, ..found.fighter.body };
    room.tick();
    room.players.get_mut(&jumper.player).unwrap().fighter.action =
        combat::fighter::Action::Dead { elapsed: combat::tuning::RESPAWN };
    jumper.play(&mut room, STILL, true);
    let stood = room.seen().next().unwrap().fighter.body;
    assert!(stood.z < 1.0 && !room.seen().next().unwrap().fighter.dead(), "stood again on the land: {stood:?}");
    for tick in 0..60 {
        let jump = Controls { jump: tick % 2 == 0, ..STILL };
        assert_eq!(jumper.play(&mut room, jump, false).standing, Standing::Inside, "jump at {tick}");
    }
}
