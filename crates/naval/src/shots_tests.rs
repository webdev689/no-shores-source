use super::*;
use crate::ballistics::{Ball, Block, launch_velocity};
use crate::damage::Zone;
use crate::guns::{SWIVEL, Shot};
use sailing::TICK_SECONDS;
use sailing::waters::{Spot, Waters};

/// Still water at 0 over a deep bed, a crest 1.5 m high at x = 21 falling to the still water 3 m either side (south of
/// y = 5 only), and dry ground rising past x = 60.
struct Sea;

fn crest(x: f64) -> f64 {
    1.5 * (1.0 - (x - 21.0).abs() / 3.0).max(0.0)
}

impl Waters for Sea {
    fn at(&self, x: f64, y: f64, _time: f64) -> Spot {
        if x > 60.0 {
            return Spot { bed: (x - 60.0) * 0.5, surface: None };
        }
        Spot { bed: -40.0, surface: Some(if y > 5.0 { crest(x) } else { 0.0 }) }
    }
}

fn east_ball(height: f64, elevation: f64, born: f64) -> Ball {
    Ball {
        start: [0.0, 0.0, height],
        launch: launch_velocity([1.0, 0.0], elevation, SWIVEL.speed, [0.0; 3]),
        born,
        shooter: 0,
        flag: Flag::Player,
        gun: SWIVEL,
        shot: Shot::Round,
        flown: 0.0,
        fired: false,
        rigged: Vec::new(),
    }
}

/// Ship `id` with her hull and canvas: the shooter's own (0) flies the players' flag, any other the pirates'.
fn ship(id: ShipId, hull: Block, rig: Vec<Block>) -> Target {
    let flag = if id == 0 { Flag::Player } else { Flag::Pirate };
    Target { id, flag, hull, rig, alive: true }
}

fn upright(centre: [f64; 3], half: [f64; 3]) -> Block {
    Block { centre, axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], half }
}

fn nobody() -> [Target; 2] {
    let far = upright([1e6, 0.0, 0.0], [1.0; 3]);
    [ship(0, far, Vec::new()), ship(1, far, Vec::new())]
}

/// Steps until the balls are spent, a second's ticks at a time; answers every event.
fn fly(balls: &mut Vec<Ball>, targets: &[Target], waters: &impl Waters) -> Vec<ShotEvent> {
    let mut events = Vec::new();
    for tick in 1..=700 {
        let clock = f64::from(tick) * TICK_SECONDS;
        events.extend(step_balls(balls, clock, targets, waters, clock));
        if balls.is_empty() {
            break;
        }
    }
    events
}

#[test]
fn a_ball_leaves_its_gun_the_tick_it_is_born_and_not_before() {
    let mut balls = vec![east_ball(1.1, 0.0, 0.05)];
    assert!(step_balls(&mut balls, 0.02, &nobody(), &Sea, 0.0).is_empty());
    assert_eq!(balls[0].flown, 0.0);
    let events = step_balls(&mut balls, 0.06, &nobody(), &Sea, 0.0);
    assert!(matches!(events[..], [ShotEvent::Muzzle { shooter: 0, .. }]), "{events:?}");
    assert!((balls[0].flown - 0.01).abs() < 1e-12);
}

#[test]
fn a_level_ball_from_1_1_metres_splashes_26_metres_out() {
    let mut balls = vec![east_ball(1.1, 0.0, 0.0)];
    let events = fly(&mut balls, &nobody(), &Sea);
    let splash = events.iter().find_map(|event| match event {
        ShotEvent::Splash { point, .. } => Some(*point),
        _ => None,
    });
    let point = splash.unwrap_or([0.0; 3]);
    assert!((point[0] - 26.0).abs() < 0.5 && point[2].abs() < 1e-9, "{point:?}");
}

#[test]
fn a_swell_crest_over_its_path_stops_it() {
    // Fired level from 1.2 m: past 19 m it is under 0.6 m, where the crest's face rises over it.
    let mut balls = vec![Ball { start: [0.0, 10.0, 1.2], ..east_ball(1.2, 0.0, 0.0) }];
    let events = fly(&mut balls, &nobody(), &Sea);
    let point = events.iter().find_map(|event| match event {
        ShotEvent::Splash { point, .. } => Some(*point),
        _ => None,
    });
    let point = point.unwrap_or([0.0; 3]);
    assert!((18.0..21.0).contains(&point[0]) && (point[2] - crest(point[0])).abs() < 1e-9, "{point:?}");
    assert!(point[2] > 0.3, "on the crest's face, not the still water past it");
}

#[test]
fn rising_ground_stops_a_ball_as_land() {
    let mut balls = vec![east_ball(1.1, 8f64.to_radians(), 0.0)];
    let events = fly(&mut balls, &nobody(), &Sea);
    let landed = events.iter().find_map(|event| match event {
        ShotEvent::Land { point, .. } => Some(*point),
        _ => None,
    });
    let point = landed.unwrap_or([0.0; 3]);
    assert!(point[0] > 60.0 && (point[2] - (point[0] - 60.0) * 0.5).abs() < 0.3, "{point:?}");
}

#[test]
fn a_ball_strikes_the_hull_in_its_way_holed_low_and_above_the_band_high() {
    let hull = |z: f64| ship(1, upright([15.0, 0.0, z], [1.0, 2.0, 1.0]), Vec::new());
    let mut balls = vec![east_ball(1.1, 0.0, 0.0)];
    let events = fly(&mut balls, &[nobody()[0].clone(), hull(0.5)], &Sea);
    let hit = events.iter().find_map(|event| match event {
        ShotEvent::Hit { target, zone, point, .. } => Some((*target, *zone, *point)),
        _ => None,
    });
    let (target, zone, point) = hit.unwrap_or((9, Zone::Rig, [0.0; 3]));
    assert_eq!((target, zone), (1, Zone::Holed));
    assert!((point[0] - (14.0 - SWIVEL.radius_m)).abs() < 1e-9, "met by the ball's edge");
    assert!(!events.iter().any(|event| matches!(event, ShotEvent::Splash { .. })), "the hull stopped it");
    let mut high = vec![east_ball(2.5, 0.0, 0.0)];
    let events = fly(&mut high, &[nobody()[0].clone(), hull(2.0)], &Sea);
    assert!(events.iter().any(|event| matches!(event, ShotEvent::Hit { zone: Zone::Hull, .. })));
}

#[test]
fn a_ball_never_meets_its_own_ship_nor_a_ship_gone_down() {
    let own = ship(0, upright([10.0, 0.0, 1.0], [5.0, 5.0, 5.0]), Vec::new());
    let mut balls = vec![east_ball(1.1, 0.0, 0.0)];
    let events = fly(&mut balls, &[own.clone(), nobody()[1].clone()], &Sea);
    assert!(!events.iter().any(|event| matches!(event, ShotEvent::Hit { .. })));
    let mut again = vec![east_ball(1.1, 0.0, 0.0)];
    let gone = Target { id: 1, flag: Flag::Pirate, alive: false, ..own };
    let events = fly(&mut again, &[nobody()[0].clone(), gone], &Sea);
    assert!(!events.iter().any(|event| matches!(event, ShotEvent::Hit { .. })));
}

#[test]
fn a_ball_flies_through_a_ship_of_its_own_flag_into_the_other_flag_beyond() {
    let friend =
        Target { id: 2, flag: Flag::Player, ..ship(2, upright([10.0, 0.0, 1.0], [1.0, 2.0, 1.0]), Vec::new()) };
    let pirate = ship(1, upright([20.0, 0.0, 0.5], [1.0, 2.0, 1.0]), Vec::new());
    let mut balls = vec![east_ball(1.1, 0.0, 0.0)];
    let events = fly(&mut balls, &[nobody()[0].clone(), pirate, friend], &Sea);
    let struck: Vec<ShipId> = events
        .iter()
        .filter_map(|event| match event {
            ShotEvent::Hit { target, .. } => Some(*target),
            _ => None,
        })
        .collect();
    assert_eq!(struck, [1], "another player's ship is no mark for a player's ball");
}

#[test]
fn a_ball_tears_through_canvas_once_and_flies_on_into_the_hull() {
    let target = ship(
        1,
        upright([20.0, 0.0, 0.5], [1.0, 2.0, 1.0]),
        vec![upright([10.0, 0.0, 1.0], [0.01, 3.0, 3.0]), upright([12.0, 0.0, 1.0], [0.01, 3.0, 3.0])],
    );
    let mut balls = vec![east_ball(1.1, 0.0, 0.0)];
    let events = fly(&mut balls, &[nobody()[0].clone(), target], &Sea);
    let zones: Vec<Zone> = events
        .iter()
        .filter_map(|event| match event {
            ShotEvent::Hit { zone, .. } => Some(*zone),
            _ => None,
        })
        .collect();
    assert_eq!(zones, [Zone::Rig, Zone::Holed]);
}

#[test]
fn a_ball_still_aloft_after_9_seconds_is_gone() {
    let west = launch_velocity([-1.0, 0.0], 0.0, SWIVEL.speed, [0.0; 3]);
    let mut balls = vec![Ball { launch: west, ..east_ball(500.0, 0.0, 0.0) }];
    let events = fly(&mut balls, &nobody(), &Sea);
    assert!(matches!(events.last(), Some(ShotEvent::Gone { .. })));
    assert!(balls.is_empty());
}

#[test]
fn a_ball_fired_from_under_a_crest_splashes_at_its_muzzle() {
    struct Crest;
    impl Waters for Crest {
        fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
            Spot { bed: -40.0, surface: Some(1.0) }
        }
    }
    let mut balls = vec![east_ball(0.5, 0.0, 0.0)];
    let events = fly(&mut balls, &nobody(), &Crest);
    let splash = events.iter().find_map(|event| match event {
        ShotEvent::Splash { point, .. } => Some(*point),
        _ => None,
    });
    assert_eq!(splash, Some([0.0, 0.0, 1.0]));
}
