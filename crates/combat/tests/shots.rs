//! Shots: a quick shot from the hip at once, at the soft lock's foe; an aimed one half again as hard, a bow's charged
//! by its aiming; no guard behind a ranged weapon; an arrow flying and falling until a block, the ground or a body
//! stops it, on sloping ground as on level; a
//! player's gun's ball reaching its mark at once and a foe's flying at its gun's speed; and the number layout every
//! fighter crosses in.

mod common;

use combat::arms::{Arms, OffHand, Ranged, WeaponClass};
use combat::fighter::{Action, Side};
use combat::floats::{FIGHTER_FLOATS, INTENT_FLOATS};
use combat::shots::{AIMED_POWER, DRAW_FULL, Flight, fly, loose};
use combat::{CombatInput, Fighter, Happening, Intent, Stroke, player_tick};
use common::{asking, foe_at, guarding, idle, player_at, run};
use core::f64::consts::PI;
use movement::{Block, Controls, Flat, Terrain};

fn holding(ranged: Ranged) -> Fighter {
    let mut fighter = player_at(0.0, 0.0);
    fighter.arms = Arms { melee: WeaponClass::Fists, ranged: Some(ranged), off_hand: OffHand::Empty };
    fighter
}

fn archer() -> Fighter {
    holding(Ranged::Bow)
}

const TRIGGER: CombatInput = CombatInput {
    attack: None,
    guard: false,
    dodge: false,
    shoot: true,
    pitch: 0.0,
    aim: false,
    mark: None,
    telegraph: None,
};
const AIMING: CombatInput = CombatInput { shoot: false, aim: true, ..TRIGGER };

/// The one shot a run let go, and its tick.
fn only_shot(happenings: &[(u32, Happening)]) -> (u32, combat::Shot) {
    let [(tick, Happening::Loosed(shot))] = happenings else { panic!("one shot: {happenings:?}") };
    (*tick, *shot)
}

#[test]
fn a_bow_not_aimed_fires_a_quick_shot_at_once_and_again_as_it_reloads() {
    let (fired, happenings) = run(archer(), asking(0.0, TRIGGER), 1, None);
    let (tick, arrow) = only_shot(&happenings);
    assert_eq!(tick, 0, "no charging");
    assert!((arrow.damage - 18.0).abs() < 1e-9 && arrow.velocity[1] < -44.0, "a quick shot's power, north");
    assert!(matches!(fired.action, Action::Reload { .. }));
    let (_, held) = run(archer(), asking(0.0, TRIGGER), 40, None);
    assert_eq!(held.len(), 2, "holding the trigger shoots again once reloaded");
}

#[test]
fn an_aimed_bow_charges_to_half_again_over_a_second_and_fires_on_a_pull() {
    let (drawn, none) = run(archer(), asking(0.0, AIMING), 61, None);
    assert!(none.is_empty(), "aiming alone fires nothing");
    assert!(matches!(drawn.action, Action::Draw { elapsed } if elapsed == DRAW_FULL));
    let (_, happenings) = run(drawn, asking(0.0, CombatInput { shoot: true, ..AIMING }), 1, None);
    assert!((only_shot(&happenings).1.damage - 18.0 * AIMED_POWER).abs() < 1e-9);
    let (half, _) = run(archer(), asking(0.0, AIMING), DRAW_FULL / 2 + 1, None);
    let (_, happenings) = run(half, asking(0.0, CombatInput { shoot: true, ..AIMING }), 1, None);
    assert!((only_shot(&happenings).1.damage - 18.0 * (1.0 + (AIMED_POWER - 1.0) / 2.0)).abs() < 1e-9);
}

#[test]
fn a_foe_archers_drawn_arrow_strikes_as_a_quick_shot() {
    let mut foe = foe_at(0.0, 0.0, 0.0);
    foe.arms = archer().arms;
    let (drawn, _) = run(foe, asking(0.0, AIMING), 61, None);
    assert!(matches!(drawn.action, Action::Draw { elapsed } if elapsed == DRAW_FULL), "{:?}", drawn.action);
    let (_, happenings) = run(drawn, asking(0.0, CombatInput { shoot: true, ..AIMING }), 1, None);
    assert!((only_shot(&happenings).1.damage - 18.0).abs() < 1e-9, "a quick shot's 18, never half again");
    let mighty = Fighter { might: 1.5, ..drawn };
    let (_, happenings) = run(mighty, asking(0.0, CombatInput { shoot: true, ..AIMING }), 1, None);
    assert!((only_shot(&happenings).1.damage - 27.0).abs() < 1e-9, "times its might, as its blows are");
}

#[test]
fn an_aimed_gun_or_crossbow_hits_half_again_at_once_onto_the_aims_mark() {
    for (ranged, damage) in [(Ranged::Pistolet, 30.0), (Ranged::Crossbow, 26.0)] {
        let mark = Some([20.0, 0.0, combat::tuning::CHEST]);
        let (raised, _) = run(holding(ranged), asking(0.0, CombatInput { mark, ..AIMING }), 2, None);
        assert!(raised.aim.abs() < 1e-9, "the fighter faces the look, its shot alone turned to the mark");
        let (_, happenings) = run(raised, asking(0.0, CombatInput { shoot: true, mark, ..AIMING }), 1, None);
        let shot = only_shot(&happenings).1;
        assert!((shot.damage - damage * AIMED_POWER).abs() < 1e-9, "{ranged:?}");
        assert!(shot.velocity[0] > 0.0 && shot.velocity[1].abs() < 1e-6, "east, onto the mark");
    }
}

#[test]
fn an_aimed_weapon_faces_the_look_through_its_reload_while_its_shot_flies_onto_a_near_mark_aside() {
    // Over the shoulder, the crosshair's point on a foe 2 m off lies right of the look.
    let near = [0.8, -2.0, combat::tuning::CHEST];
    let aimed = CombatInput { mark: Some(near), ..AIMING };
    let (raised, _) = run(holding(Ranged::Pistolet), asking(0.0, aimed), 2, None);
    assert!(raised.aim.abs() < 1e-9 && raised.body.facing.abs() < 1e-9, "it faces the look: {}", raised.aim);
    let (fired, happenings) = run(raised, asking(0.0, CombatInput { shoot: true, ..aimed }), 1, None);
    let ball = only_shot(&happenings).1;
    assert!((ball.velocity[0] / -ball.velocity[1] - 0.4).abs() < 1e-6, "onto the mark: {:?}", ball.velocity);
    assert!(matches!(fired.action, Action::Reload { .. }) && fired.aim.abs() < 1e-9, "its reload faces the look");
    let (quick, _) = run(holding(Ranged::Pistolet), asking(0.0, TRIGGER), 1, Some(near));
    assert!(matches!(quick.action, Action::Reload { .. }) && quick.aim > 0.3, "a quick shot points where it fired");
}

#[test]
fn an_aimed_arrow_laid_on_a_mark_comes_down_on_it() {
    let mark = [0.0, -30.0, 1.0];
    let (drawn, _) = run(archer(), asking(0.0, CombatInput { mark: Some(mark), ..AIMING }), 30, None);
    let pull = CombatInput { shoot: true, mark: Some(mark), ..AIMING };
    let mut arrow = only_shot(&run(drawn, asking(0.0, pull), 1, None).1).1;
    let came = loop {
        match fly(&arrow, &[], &Flat, &[]) {
            Flight::Flying(next) if next.at[1] > mark[1] => arrow = next,
            Flight::Flying(next) => break next.at,
            Flight::Stopped { at, .. } => break at,
        }
    };
    assert!((came[2] - mark[2]).abs() < 0.2, "it falls onto the mark's height: {came:?}");
}

#[test]
fn a_trigger_held_as_the_aim_begins_waits_for_a_pull_and_letting_the_aim_go_lowers_it_unfired() {
    let (raised, happenings) = run(archer(), asking(0.0, CombatInput { shoot: true, ..AIMING }), 5, None);
    assert!(happenings.is_empty(), "only a fresh pull fires an aimed shot");
    assert!(matches!(raised.action, Action::Draw { .. }));
    let (lowered, happenings) = run(raised, idle(0.0), 1, None);
    assert!(happenings.is_empty() && matches!(lowered.action, Action::Idle));
}

#[test]
fn a_ranged_weapon_raises_no_guard() {
    for ranged in [Ranged::Bow, Ranged::Crossbow, Ranged::Pistolet, Ranged::Thunderlock] {
        let (held, happenings) = run(holding(ranged), guarding(0.0), 20, None);
        assert!(happenings.is_empty() && matches!(held.action, Action::Idle), "{ranged:?}");
    }
    let (sword, _) = run(player_at(0.0, 0.0), guarding(0.0), 2, None);
    assert!(matches!(sword.action, Action::Guard { .. }), "a sword still guards");
}

#[test]
fn a_quick_shot_takes_the_lock_and_flies_at_its_foe_and_aiming_lets_the_lock_go() {
    // A foe 6 m off, north-east of north; the look due north, within the lock's arc of it.
    let foe = foe_at(3.0, -5.2, PI);
    let view = [(2, foe)];
    let (fired, happening) =
        player_tick(1, &holding(Ranged::Pistolet), &asking(0.0, TRIGGER), &view, &[], &movement::Flat);
    assert_eq!(fired.target, Some(2), "the quick shot takes the lock");
    let Some(Happening::Loosed(ball)) = happening else { panic!("a shot: {happening:?}") };
    let (bearing, way) = (libm::atan2(3.0, 5.2), libm::atan2(ball.velocity[0], -ball.velocity[1]));
    assert!((way - bearing).abs() < 1e-9, "at the foe, not along the look: {way} against {bearing}");
    let arrow = player_tick(1, &archer(), &asking(0.0, TRIGGER), &view, &[], &movement::Flat).1;
    let Some(Happening::Loosed(arrow)) = arrow else { panic!("an arrow") };
    assert!(arrow.velocity[2] > 0.0, "an arrow at a foe level with it is loosed a little high, for its fall");
    let (aiming, _) = player_tick(1, &fired, &asking(0.0, AIMING), &view, &[], &movement::Flat);
    assert_eq!(aiming.target, None, "aiming lets the lock go");
}

#[test]
fn a_quick_shot_flies_along_the_look_when_the_look_has_turned_from_the_locked_foe() {
    // Locked on a foe 6 m due south, the look turned due north: the lock lets go at once, and the shot goes ahead.
    let view = [(2, foe_at(0.0, 6.0, 0.0))];
    let locked = Fighter { target: Some(2), ..holding(Ranged::Pistolet) };
    let (fired, happening) = player_tick(1, &locked, &asking(0.0, TRIGGER), &view, &[], &movement::Flat);
    assert_eq!(fired.target, None, "the look is past the lock's arc");
    let Some(Happening::Loosed(ball)) = happening else { panic!("a shot: {happening:?}") };
    assert!(ball.velocity[1] < 0.0 && ball.velocity[0].abs() < 1e-6, "north, along the look: {:?}", ball.velocity);
}

#[test]
fn an_aimed_shot_laid_on_a_mark_at_its_own_feet_keeps_the_looks_bearing() {
    // Looking east and straight down, the crosshair's point lies a hair off the feet: no bearing of its own.
    let mark = Some([0.03, -0.02, 0.0]);
    let (raised, _) = run(holding(Ranged::Pistolet), asking(PI / 2.0, CombatInput { mark, ..AIMING }), 2, None);
    assert!((raised.aim - PI / 2.0).abs() < 1e-9, "it points along the look: {}", raised.aim);
    let pull = CombatInput { shoot: true, mark, ..AIMING };
    let ball = only_shot(&run(raised, asking(PI / 2.0, pull), 1, None).1).1;
    assert!(ball.velocity[0] > 0.0 && ball.velocity[2] < 0.0, "east and down, at the feet: {:?}", ball.velocity);
}

#[test]
fn an_arrow_falls_as_it_flies_and_stops_at_a_block_or_the_first_body_on_its_line() {
    let arrow = loose(1, Ranged::Bow, [0.0, 0.0, 1.1], 0.0, 0.0, 1.0);
    let mut flying = arrow;
    for _ in 0..10 {
        let Flight::Flying(next) = fly(&flying, &[], &Flat, &[]) else { panic!("open air") };
        flying = next;
    }
    assert!(flying.at[2] < 1.1 && flying.at[1] < -7.0);
    let wall = [Block { min_x: -2.0, min_y: -4.2, max_x: 2.0, max_y: -4.0, top: 3.0, bottom: 0.0 }];
    let bodies = [(2, [0.0, -6.0, 0.0]), (3, [0.0, -3.0, 0.0]), (1, [0.0, -0.5, 0.0])];
    let mut stop = None;
    let mut shot = arrow;
    for _ in 0..20 {
        match fly(&shot, &wall, &Flat, &bodies) {
            Flight::Flying(next) => shot = next,
            Flight::Stopped { struck, .. } => {
                stop = Some(struck);
                break;
            }
        }
    }
    assert_eq!(stop, Some(Some(3)), "the body before the wall, never its own shooter");
    let behind = [(2, [0.0, -6.0, 0.0])];
    let mut shot = arrow;
    let walled = loop {
        match fly(&shot, &wall, &Flat, &behind) {
            Flight::Flying(next) => shot = next,
            Flight::Stopped { at, struck } => break (at, struck),
        }
    };
    assert_eq!(walled.1, None);
    assert!((walled.0[1] + 4.0).abs() < 1e-6, "stopped at the wall's face");
}

/// Ground rising northward a fifth of a metre each metre, flat to the south.
struct Rising;

impl movement::Terrain for Rising {
    fn height_at(&self, _x: f64, y: f64) -> f64 {
        (-y * 0.2).max(0.0)
    }
}

/// Where a shot stops on the rising ground, flown tick by tick.
fn stopped_on_the_rise(mut shot: combat::Shot) -> [f64; 3] {
    loop {
        match fly(&shot, &[], &Rising, &[]) {
            Flight::Flying(next) => shot = next,
            Flight::Stopped { at, .. } => break at,
        }
    }
}

#[test]
fn a_shot_stops_where_it_meets_sloping_ground_and_never_flies_through_a_hill() {
    for ranged in [Ranged::Bow, Ranged::Crossbow] {
        let at = stopped_on_the_rise(loose(1, ranged, [0.0, 0.0, 1.1], 0.0, 0.0, 1.0));
        assert!(at[1] > -5.6 && at[1] < -4.0, "{ranged:?} stops into the rise, not 50 m on: {at:?}");
        assert!((at[2] - Rising.height_at(at[0], at[1])).abs() < 1e-6, "{ranged:?} on the ground: {at:?}");
    }
    let foes = combat::shots::by_foe(&loose(1, Ranged::Thunderlock, [0.0, 0.0, 1.1], 0.0, 0.0, 1.0));
    let players = loose(1, Ranged::Pistolet, [0.0, 0.0, 1.1], 0.0, 0.0, 1.0);
    for ball in [foes, players] {
        let at = stopped_on_the_rise(ball);
        assert!(
            (at[1] + 5.5).abs() < 1e-6 && (at[2] - 1.1).abs() < 1e-6,
            "a level ball meets the rise at 5.5 m: {at:?}"
        );
    }
}

#[test]
fn a_ball_reaches_its_mark_along_its_line_in_one_tick() {
    let ball = loose(1, Ranged::Pistolet, [0.0, 0.0, 1.1], PI, 0.0, 1.0);
    let far = [(2, [0.0, 40.0, 0.0])];
    assert!(matches!(fly(&ball, &[], &Flat, &far), Flight::Stopped { struck: Some(2), .. }));
    assert!(matches!(fly(&ball, &[], &Flat, &[(2, [0.0, 70.0, 0.0])]), Flight::Stopped { struck: None, .. }));
}

#[test]
fn a_foes_ball_flies_at_its_guns_own_speed_so_it_can_be_dodged() {
    for (ranged, speed) in [(Ranged::Pistolet, 70.0), (Ranged::Thunderlock, 110.0)] {
        let mut gunner = foe_at(0.0, 0.0, PI);
        gunner.arms = Arms { melee: WeaponClass::Fists, ranged: Some(ranged), off_hand: OffHand::Empty };
        let (drawn, _) = run(gunner, asking(PI, AIMING), 30, None);
        let (_, happenings) = run(drawn, asking(PI, CombatInput { shoot: true, ..AIMING }), 1, None);
        let mut ball = only_shot(&happenings).1;
        let [east, south, up] = ball.velocity;
        assert!(((east * east + south * south + up * up).sqrt() - speed).abs() < 1e-9, "{ranged:?}: {ball:?}");
        let target = [(2, [0.0, 30.0, 0.0])];
        let mut ticks = 0;
        let struck = loop {
            ticks += 1;
            match fly(&ball, &[], &Flat, &target) {
                Flight::Flying(next) => ball = next,
                Flight::Stopped { struck, .. } => break struck,
            }
        };
        assert_eq!(struck, Some(2), "{ranged:?}");
        let flown = 30.0 / speed * 60.0;
        assert!((f64::from(ticks) - flown).abs() <= 1.0, "{ranged:?} took {ticks} ticks to fly 30 m, not {flown}");
    }
    let mut ball = combat::shots::by_foe(&loose(1, Ranged::Pistolet, [0.0, 0.0, 1.1], PI, 0.0, 1.0));
    let mut ticks = 0;
    while let Flight::Flying(next) = fly(&ball, &[], &Flat, &[]) {
        ball = next;
        ticks += 1;
    }
    assert!((50..=52).contains(&ticks), "it falls spent at its reach of 60 m: {ticks} ticks");
}

#[test]
fn a_fighter_and_an_intent_cross_as_numbers_with_every_bit_and_nonsense_reads_as_plain() {
    let (mut fighter, _) =
        run(player_at(1.25, -3.5), common::swinging(0.3, Stroke::DownLeft), 7, Some([2.0, -5.0, 1.1]));
    fighter.target = Some(9);
    fighter.riposte = Some((4, 11));
    let floats = fighter.to_floats();
    assert_eq!(floats.len(), FIGHTER_FLOATS);
    assert_eq!(Fighter::from_floats(&floats), fighter);
    let telegraphing = Fighter {
        action: Action::Telegraph(combat::Telegraph::begin(
            &combat::TelegraphOrder {
                shape: combat::Shape::Leap,
                windup: 50,
                iron: true,
                feint_at: Some(3),
                bearing: 1.0,
                ahead: 4.0,
            },
            [1.0, 2.0, 0.5],
        )),
        ..fighter
    };
    assert_eq!(Fighter::from_floats(&telegraphing.to_floats()), telegraphing);
    for side in [Side::Players, Side::Faction(1), Side::Faction(2)] {
        let sided = Fighter { side, ..telegraphing };
        assert_eq!(Fighter::from_floats(&sided.to_floats()), sided, "a side crosses as one number");
        assert_eq!(Fighter::from_glance(&sided.glance()).side, side);
    }
    let intent = Intent {
        controls: Controls { forward: 1.0, sideways: -0.5, yaw: 2.0, run: true, ..Controls::default() },
        combat: CombatInput {
            attack: Some(Stroke::Up),
            guard: true,
            dodge: false,
            shoot: true,
            pitch: -0.25,
            aim: true,
            mark: Some([3.0, -4.0, 1.5]),
            telegraph: None,
        },
    };
    assert_eq!(intent.to_floats().len(), INTENT_FLOATS);
    assert_eq!(Intent::from_floats(&intent.to_floats()), intent);
    let nonsense = Fighter::from_floats(&[f64::NAN; FIGHTER_FLOATS]);
    assert!(matches!(nonsense.action, Action::Idle) && nonsense.target.is_none());
}

#[test]
fn a_shot_strikes_only_bodies_ahead_of_it_and_one_through_the_top_of_a_head() {
    let north = loose(1, Ranged::Bow, [0.0, 0.0, 1.1], 0.0, 0.0, 1.0);
    let behind = [(2, [0.0, 2.0, 0.0])];
    assert!(matches!(fly(&north, &[], &Flat, &behind), Flight::Flying(_)), "a body behind the archer is not struck");
    let ball = loose(1, Ranged::Thunderlock, [0.0, 0.0, 1.1], 0.0, 0.0, 1.0);
    let (behind_far, ahead) = ([(2, [0.0, 30.0, 0.0])], [(2, [0.0, -30.0, 0.0])]);
    assert!(matches!(fly(&ball, &[], &Flat, &behind_far), Flight::Stopped { struck: None, .. }));
    assert!(matches!(fly(&ball, &[], &Flat, &ahead), Flight::Stopped { struck: Some(2), .. }));
    // An arrow coming down steeply over the body: above its head as it crosses into its round, inside it soon after.
    let falling = combat::shots::Shot { at: [0.0, -0.6, 1.95], velocity: [0.0, 72.0, -39.0], ..north };
    let Flight::Stopped { struck, at } = fly(&falling, &[], &Flat, &[(2, [0.0, 0.0, 0.0])]) else { panic!("it stops") };
    assert_eq!(struck, Some(2));
    assert!((at[2] - 1.8).abs() < 0.05, "it meets the head's top: {at:?}");
}

#[test]
fn a_trimmed_bow_draws_sooner_strikes_harder_aimed_and_reloads_faster() {
    let trimmed = combat::Fighter {
        trim: combat::Trim { draw: 0.5, aimed: 1.1, reload: 0.85, ..combat::Trim::PLAIN },
        ..archer()
    };
    let (half, _) = run(trimmed, asking(0.0, AIMING), DRAW_FULL / 2 + 1, None);
    let (fired, happenings) = run(half, asking(0.0, CombatInput { shoot: true, ..AIMING }), 1, None);
    assert!((only_shot(&happenings).1.damage - 18.0 * AIMED_POWER * 1.1).abs() < 1e-9, "Updraft and Steady Draw");
    let (_, plain) = run(archer(), asking(0.0, TRIGGER), 1, None);
    let (plain_fired, _) = run(archer(), asking(0.0, TRIGGER), 1, None);
    let (Action::Reload { left: quick }, Action::Reload { left: slow }) = (fired.action, plain_fired.action) else {
        panic!("both reload: {plain:?}");
    };
    assert_eq!(f64::from(quick), (f64::from(slow) * 0.85).round(), "Quick Hands");
}

/// A wall a tenth of a metre thin across the way 3 m north, 4 m high, which only `wall_entry` tells of.
struct ThinWall;

impl movement::Terrain for ThinWall {
    fn height_at(&self, _x: f64, _y: f64) -> f64 {
        0.0
    }

    fn wall_entry(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        let step = to[1] - from[1];
        let share = if step == 0.0 { return None } else { (-3.0 - from[1]) / step };
        ((0.0..=1.0).contains(&share) && from[2] + (to[2] - from[2]) * share < 4.0).then_some(share)
    }
}

#[test]
fn a_shot_stops_at_a_thin_wall_however_far_it_flies_in_a_tick() {
    let mut shot = loose(1, Ranged::Crossbow, [0.0, 0.0, 1.1], 0.0, 0.0, 1.0);
    let at = loop {
        match fly(&shot, &[], &ThinWall, &[]) {
            Flight::Flying(next) => shot = next,
            Flight::Stopped { at, .. } => break at,
        }
    };
    assert!((at[1] + 3.0).abs() < 1e-6, "stopped at the wall: {at:?}");
}
