//! Telegraphed blows: each shape's ground as DFO draws it, along our bearings; the wind-up a foe stands through, a
//! lunge turning after its target through the first half, a feint cut short, a charge crossing its lane and a leap
//! flying to its disc; an iron wind-up running longer; and a miss leaving its foe overreached.

mod common;

use combat::fighter::Action;
use combat::judge::overreached;
use combat::shapes::{IRON_EXTRA, Shape, Telegraph, TelegraphOrder};
use combat::{CombatInput, Happening, Intent, ticks};
use common::{foe_at, run};
use core::f64::consts::{FRAC_PI_2, PI};
use movement::Controls;

fn order(shape: Shape, windup: u32, bearing: f64, ahead: f64) -> TelegraphOrder {
    TelegraphOrder { shape, windup, iron: false, feint_at: None, bearing, ahead }
}

fn telegraph(shape: Shape, bearing: f64, ahead: f64) -> Telegraph {
    Telegraph::begin(&order(shape, 40, bearing, ahead), [0.0, 0.0, 0.0])
}

fn telegraphing(given: TelegraphOrder) -> Intent {
    Intent { controls: Controls::default(), combat: CombatInput { telegraph: Some(given), ..CombatInput::default() } }
}

#[test]
fn each_shapes_ground_lies_where_dfo_draws_it_along_our_bearings() {
    let east = FRAC_PI_2;
    let lunge = telegraph(Shape::Lunge, east, 0.0);
    assert!(lunge.holds(4.4, 0.5) && !lunge.holds(4.7, 0.0) && !lunge.holds(2.0, 0.7) && !lunge.holds(-1.0, 0.0));
    let sweep = telegraph(Shape::Sweep, 0.0, 0.0);
    assert!(sweep.holds(0.0, -3.0) && sweep.holds(2.5, -1.5) && !sweep.holds(0.0, 3.0) && !sweep.holds(0.0, -3.4));
    assert!(sweep.holds(0.2, 0.3), "at its feet a sweep catches anyone");
    let slam = telegraph(Shape::Slam, 0.0, 0.0);
    assert!(slam.holds(0.0, -2.9) && slam.holds(1.9, -1.0) && !slam.holds(0.0, 1.1));
    let ring = telegraph(Shape::Ring, 0.0, 0.0);
    assert!(!ring.holds(1.0, 0.0) && ring.holds(0.0, 3.0) && !ring.holds(4.2, 0.0), "safe at its feet");
    let leap = telegraph(Shape::Leap, PI, 6.0);
    assert!(leap.holds(0.0, 6.0) && leap.holds(1.5, 5.5) && !leap.holds(0.0, 3.0));
    let aimed = telegraph(Shape::Aimed, PI, 10.0);
    assert!(aimed.holds(0.1, 9.0) && !aimed.holds(0.5, 5.0) && !aimed.holds(0.0, 11.0));
    assert_eq!(leap.landing(), Some([libm::sin(PI) * 6.0, 6.0]));
}

#[test]
fn a_foe_stands_through_its_wind_up_and_the_blow_lands_as_it_ends() {
    let foe = foe_at(0.0, 0.0, 0.0);
    let (winding, happenings) = run(foe, telegraphing(order(Shape::Slam, 54, 0.0, 0.0)), 30, None);
    assert!(happenings.is_empty() && matches!(winding.action, Action::Telegraph(_)));
    assert!(winding.body.x.abs() < 1e-12 && winding.body.y.abs() < 1e-12, "it stands still");
    // The wind-up counts from the tick after the one it began on.
    let (_, landing) = run(winding, common::idle(0.0), 25, None);
    assert!(matches!(landing.as_slice(), [(24, Happening::Landed(telegraph))] if telegraph.shape == Shape::Slam));
    let iron = TelegraphOrder { iron: true, ..order(Shape::Slam, 54, 0.0, 0.0) };
    assert_eq!(Telegraph::begin(&iron, [0.0; 3]).windup, 54 + ticks(IRON_EXTRA));
}

#[test]
fn a_lunge_turns_after_its_target_through_the_first_half_then_holds() {
    let lunge = order(Shape::Lunge, 100, 0.0, 0.0);
    let (half, _) = run(foe_at(0.0, 0.0, 0.0), telegraphing(lunge), 50, Some([5.0, 0.0, 1.1]));
    let Action::Telegraph(turned) = half.action else { panic!("winding up") };
    assert!((turned.bearing - FRAC_PI_2).abs() < 1e-9, "turned east at 2 degrees a tick: {}", turned.bearing);
    let (late, _) = run(half, common::idle(0.0), 10, Some([0.0, 5.0, 1.1]));
    let Action::Telegraph(held) = late.action else { panic!("winding up") };
    assert!((held.bearing - FRAC_PI_2).abs() < 1e-9, "after half its wind-up it no longer turns");
}

#[test]
fn a_feint_is_cut_short_at_its_tick() {
    let feint = TelegraphOrder { feint_at: Some(20), ..order(Shape::Sweep, 50, 0.0, 0.0) };
    let (cut, happenings) = run(foe_at(0.0, 0.0, 0.0), telegraphing(feint), 21, None);
    assert!(matches!(happenings.as_slice(), [(20, Happening::Feinted(_))]));
    assert!(!matches!(cut.action, Action::Telegraph(_)));
}

#[test]
fn a_charge_crosses_its_lane_and_a_leap_flies_to_its_disc_as_their_wind_ups_end() {
    let (charged, _) = run(foe_at(0.0, 0.0, 0.0), telegraphing(order(Shape::Charge, 54, FRAC_PI_2, 0.0)), 54, None);
    assert!((charged.body.x - 9.0).abs() < 1e-6 && charged.body.y.abs() < 1e-6, "{:?}", charged.body);
    let leap = order(Shape::Leap, 60, PI, 6.0);
    let (flying, _) = run(foe_at(0.0, 0.0, 0.0), telegraphing(leap), 50, None);
    assert!(flying.body.z > 0.5, "in the air near its end: {}", flying.body.z);
    let (landed, _) = run(flying, common::idle(PI), 10, None);
    assert!((landed.body.y - 6.0).abs() < 1e-6 && landed.body.z.abs() < 1e-6);
}

#[test]
fn a_missed_blow_leaves_its_foe_overreached_longer_for_iron_and_for_a_perfect_dodge() {
    let foe = foe_at(0.0, 0.0, 0.0);
    let plain = telegraph(Shape::Lunge, 0.0, 0.0);
    assert!(matches!(overreached(&foe, &plain, false).action, Action::Overreach { left: 60 }));
    assert_eq!(overreached(&foe, &plain, true).punished, 90);
    let iron = Telegraph { iron: true, ..telegraph(Shape::Slam, 0.0, 0.0) };
    assert_eq!(overreached(&foe, &iron, false).punished, 72 + 18);
}

#[test]
fn a_quick_charge_runs_its_lane_and_no_further() {
    // Wound up 40 ticks, it turns after a target that walks off its line; it must still run 9 m from where it set off.
    let mut foe = foe_at(0.0, 0.0, FRAC_PI_2);
    let mut start = None;
    for tick in 0..40 {
        let target = [2.0 + f64::from(tick) * 0.2, f64::from(tick) * 0.1, 1.1];
        let intent = telegraphing(order(Shape::Charge, 40, FRAC_PI_2, 0.0));
        let around = combat::Surroundings { blocks: &[], terrain: &movement::Flat, target_at: Some(target) };
        foe = combat::step_fighter(&foe, &intent, &around).0;
        if let Action::Telegraph(telegraph) = foe.action
            && f64::from(telegraph.elapsed) >= f64::from(telegraph.windup - telegraph.travel_ticks())
        {
            start.get_or_insert(telegraph.origin);
        }
    }
    let start = start.expect("it set off");
    let run = combat::sight::apart([foe.body.x, foe.body.y], [start[0], start[1]]);
    assert!(run <= 9.0 + 1e-6, "ran {run} m");
}

#[test]
fn a_shapes_blow_stops_at_a_wall_and_does_not_reach_a_body_high_above() {
    let ring = Telegraph::begin(&order(Shape::Ring, 40, 0.0, 0.0), [0.0, 0.0, 0.0]);
    assert!(ring.strikes([0.0, -3.0, 0.0], &[]));
    let wall = [movement::Block { min_x: -1.0, min_y: -2.2, max_x: 1.0, max_y: -2.0, top: 3.0, bottom: 0.0 }];
    assert!(!ring.strikes([0.0, -3.0, 0.0], &wall), "behind a wall");
    assert!(!ring.strikes([0.0, -3.0, 3.0], &[]), "up on a block three metres high");
}

#[test]
fn a_charge_or_a_leap_off_a_drop_never_sets_its_foe_down_inside_the_block_it_left() {
    let platform = movement::Block { min_x: -8.0, min_y: -3.0, max_x: 2.0, max_y: 3.0, top: 1.6, bottom: 0.0 };
    let radius = movement::TUNING.radius;
    for (shape, ahead) in [(Shape::Charge, 0.0), (Shape::Leap, 6.0)] {
        for start in 0..10 {
            let mut foe = foe_at(f64::from(start) * 0.1 - 4.0, 0.0, FRAC_PI_2);
            foe.body.z = platform.top;
            for _ in 0..60 {
                let (next, _) =
                    common::run_on(foe, telegraphing(order(shape, 60, FRAC_PI_2, ahead)), 1, None, &[platform]);
                foe = next;
                let body = foe.body;
                let over = body.x < platform.max_x + radius && body.y.abs() < platform.max_y + radius;
                assert!(!over || body.z >= platform.top - movement::TUNING.step, "{shape:?} inside it: {body:?}");
            }
        }
    }
}

#[test]
fn a_leap_off_a_block_strikes_from_where_it_lands_not_from_where_it_set_off() {
    let platform = movement::Block { min_x: -8.0, min_y: -3.0, max_x: 2.0, max_y: 3.0, top: 1.6, bottom: 0.0 };
    let mut foe = foe_at(-1.0, 0.0, FRAC_PI_2);
    foe.body.z = platform.top;
    let (_, happenings) =
        common::run_on(foe, telegraphing(order(Shape::Leap, 60, FRAC_PI_2, 6.0)), 70, None, &[platform]);
    let landed = happenings.iter().find_map(|(_, happening)| match happening {
        Happening::Landed(telegraph) => Some(*telegraph),
        _ => None,
    });
    let landed = landed.expect("it landed");
    let [x, y] = landed.landing().expect("a leap lands");
    assert!(landed.origin[2].abs() < 1e-9, "it came down on the ground: {landed:?}");
    assert!(landed.strikes([x, y, 0.0], &[platform]), "a body on the ground where it lands is struck");
}
