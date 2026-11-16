//! Shots: a bow drawn and loosed, too soon and nothing leaves; an arrow flying and falling until a block or a body
//! stops it; a gun's ball reaching its mark at once; and the number layout every fighter crosses in.

mod common;

use combat::arms::{Arms, OffHand, Ranged, WeaponClass};
use combat::fighter::Action;
use combat::floats::{FIGHTER_FLOATS, INTENT_FLOATS};
use combat::shots::{Flight, fly, loose};
use combat::{CombatInput, Fighter, Happening, Intent, Stroke};
use common::{idle, player_at, run};
use core::f64::consts::PI;
use movement::{Block, Controls};

fn archer() -> Fighter {
    let mut fighter = player_at(0.0, 0.0);
    fighter.arms = Arms { melee: WeaponClass::Fists, ranged: Some(Ranged::Bow), off_hand: OffHand::Empty };
    fighter
}

fn drawing() -> Intent {
    Intent { controls: Controls::default(), combat: CombatInput { shoot: true, ..CombatInput::default() } }
}

#[test]
fn a_bow_drawn_long_enough_looses_at_its_power_when_let_go_and_too_soon_looses_nothing() {
    let (drawn, _) = run(archer(), drawing(), 61, None);
    assert!(matches!(drawn.action, Action::Draw { elapsed: 60 }));
    let (_, happenings) = run(drawn, idle(0.0), 1, None);
    let [(0, Happening::Loosed(arrow))] = happenings.as_slice() else { panic!("one arrow: {happenings:?}") };
    assert!((arrow.damage - 18.0).abs() < 1e-9 && arrow.velocity[1] < -44.0, "full power, north");
    let (early, _) = run(archer(), drawing(), 10, None);
    assert!(run(early, idle(0.0), 1, None).1.is_empty());
}

#[test]
fn an_arrow_falls_as_it_flies_and_stops_at_a_block_or_the_first_body_on_its_line() {
    let arrow = loose(1, Ranged::Bow, [0.0, 0.0, 1.1], 0.0, 0.0, 1.0);
    let mut flying = arrow;
    for _ in 0..10 {
        let Flight::Flying(next) = fly(&flying, &[], &[]) else { panic!("open air") };
        flying = next;
    }
    assert!(flying.at[2] < 1.1 && flying.at[1] < -7.0);
    let wall = [Block { min_x: -2.0, min_y: -4.2, max_x: 2.0, max_y: -4.0, top: 3.0 }];
    let bodies = [(2, [0.0, -6.0, 0.0]), (3, [0.0, -3.0, 0.0]), (1, [0.0, -0.5, 0.0])];
    let mut stop = None;
    let mut shot = arrow;
    for _ in 0..20 {
        match fly(&shot, &wall, &bodies) {
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
        match fly(&shot, &wall, &behind) {
            Flight::Flying(next) => shot = next,
            Flight::Stopped { at, struck } => break (at, struck),
        }
    };
    assert_eq!(walled.1, None);
    assert!((walled.0[1] + 4.0).abs() < 1e-6, "stopped at the wall's face");
}

#[test]
fn a_ball_reaches_its_mark_along_its_line_in_one_tick() {
    let ball = loose(1, Ranged::Pistolet, [0.0, 0.0, 1.1], PI, 0.0, 1.0);
    let far = [(2, [0.0, 40.0, 0.0])];
    assert!(matches!(fly(&ball, &[], &far), Flight::Stopped { struck: Some(2), .. }));
    assert!(matches!(fly(&ball, &[], &[(2, [0.0, 70.0, 0.0])]), Flight::Stopped { struck: None, .. }));
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
    let intent = Intent {
        controls: Controls { forward: 1.0, sideways: -0.5, yaw: 2.0, run: true, ..Controls::default() },
        combat: CombatInput {
            attack: Some(Stroke::Up),
            guard: true,
            dodge: false,
            shoot: true,
            pitch: -0.25,
            telegraph: None,
        },
    };
    assert_eq!(intent.to_floats().len(), INTENT_FLOATS);
    assert_eq!(Intent::from_floats(&intent.to_floats()), intent);
    let nonsense = Fighter::from_floats(&[f64::NAN; FIGHTER_FLOATS]);
    assert!(matches!(nonsense.action, Action::Idle) && nonsense.target.is_none());
}
