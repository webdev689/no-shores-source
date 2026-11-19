//! Statuses: a crit deals half again, an Exposed fighter takes more from everyone, a Linked one deals more; a Charge
//! holds its fighter still for its rank's time and then not again for a while; Haste speeds a body; a Veiled striker's
//! blow on a back crits, and its own blow ends the veil. Each runs down as its fighter steps, and crosses whole.

mod common;

use combat::fighter::{Action, Cause};
use combat::floats::FIGHTER_FLOATS;
use combat::judge::{Blow, BlowKind};
use combat::status::{
    CHARGE_IMMUNE, CRIT_TIMES, EXPOSE_TIMES, HASTE_TIMES, LINKED_TIMES, Status, charge_ticks, crits, times,
};
use combat::{Fighter, Happening, Ranged, Stroke, give};
use common::{foe_at, idle, player_at, run, swinging};
use movement::Controls;

const CLOSE: f64 = 1e-9;

/// A blow of `kind` struck from `from` by fighter 9.
fn blow_from(kind: BlowKind, from: [f64; 2]) -> Blow {
    Blow {
        striker: 9,
        kind,
        from,
        damage: 10.0,
        poise: 10.0,
        guard: 10.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    }
}

fn given(fighter: &Fighter, status: Status, ticks: u32) -> Fighter {
    give(fighter, status, ticks, Some(9)).expect("the status takes")
}

const SWING: BlowKind = BlowKind::Swing(Stroke::Down);

#[test]
fn a_crit_deals_half_again_whether_its_striker_holds_crit_or_the_blow_is_marked_one() {
    let (striker, defender) = (player_at(0.0, 1.0), foe_at(0.0, 0.0, 0.0));
    let blow = blow_from(SWING, [0.0, -1.0]);
    assert!((times(&blow, Some(&striker), &defender) - 1.0).abs() < CLOSE, "nothing held weighs nothing");
    let critting = given(&striker, Status::Crit, 300);
    assert!((times(&blow, Some(&critting), &defender) - CRIT_TIMES).abs() < CLOSE);
    let marked = Blow { crit: true, ..blow };
    assert!((times(&marked, Some(&striker), &defender) - CRIT_TIMES).abs() < CLOSE);
    assert!((times(&marked, None, &defender) - CRIT_TIMES).abs() < CLOSE, "a marked blow crits from anyone");
    assert!(crits(&blow_from(BlowKind::Shot(Ranged::Bow), [0.0, -1.0]), Some(&critting), &defender));
}

#[test]
fn an_exposed_fighter_takes_more_from_everyone_and_a_linked_one_deals_more() {
    let (striker, defender) = (player_at(0.0, 1.0), foe_at(0.0, 0.0, 0.0));
    let blow = blow_from(BlowKind::Shot(Ranged::Pistolet), [0.0, -1.0]);
    let exposed = given(&defender, Status::Expose, 360);
    assert!((times(&blow, Some(&striker), &exposed) - EXPOSE_TIMES).abs() < CLOSE);
    assert!((times(&blow, None, &exposed) - EXPOSE_TIMES).abs() < CLOSE, "from anyone at all");
    let linked = given(&striker, Status::Linked, 180);
    assert!((times(&blow, Some(&linked), &defender) - LINKED_TIMES).abs() < CLOSE);
    let all = given(&linked, Status::Crit, 300);
    let expected = CRIT_TIMES * LINKED_TIMES * EXPOSE_TIMES;
    assert!((times(&blow, Some(&all), &exposed) - expected).abs() < CLOSE, "each multiplies the others");
}

#[test]
fn a_veiled_striker_s_swing_crits_within_sixty_degrees_of_its_target_s_back_and_nowhere_else() {
    // The defender faces north (-y); its back is south.
    let defender = foe_at(0.0, 0.0, 0.0);
    let veiled = given(&player_at(0.0, 1.0), Status::Veiled, 240);
    let from_off = |degrees: f64| {
        let radians = degrees.to_radians();
        [libm::sin(radians), -libm::cos(radians)]
    };
    for (degrees, crit) in [(180.0, true), (125.0, true), (235.0, true), (115.0, false), (90.0, false), (0.0, false)] {
        let blow = blow_from(SWING, from_off(degrees));
        assert_eq!(crits(&blow, Some(&veiled), &defender), crit, "{degrees} degrees off its facing");
    }
    let shot = blow_from(BlowKind::Shot(Ranged::Bow), from_off(180.0));
    assert!(!crits(&shot, Some(&veiled), &defender), "a shot in the back is no backstab");
    assert!(!crits(&blow_from(SWING, from_off(180.0)), Some(&player_at(0.0, 1.0)), &defender), "unveiled, none");
}

#[test]
fn a_veil_holds_through_the_tick_its_fighter_s_blow_lands_and_is_gone_the_next() {
    let veiled = given(&player_at(0.0, 0.0), Status::Veiled, 240);
    let (_, happenings) = run(veiled, swinging(0.0, Stroke::Down), 60, None);
    let struck = happenings.iter().find(|(_, each)| matches!(each, Happening::Struck(_))).expect("a blow lands").0;
    let (at_blow, _) = run(veiled, swinging(0.0, Stroke::Down), struck + 1, None);
    assert_eq!(at_blow.statuses.left(Status::Veiled), 1, "judged Veiled as it lands");
    let (after, _) = run(veiled, swinging(0.0, Stroke::Down), struck + 2, None);
    assert!(!after.statuses.has(Status::Veiled), "and gone the tick after");
}

#[test]
fn a_charge_cuts_a_swing_and_holds_its_fighter_still_for_its_time_then_not_again_while_immune() {
    let (swinging_foe, happenings) = run(foe_at(0.0, 0.0, 0.0), swinging(0.0, Stroke::Down), 2, None);
    assert!(matches!(swinging_foe.action, Action::Attack(_)), "{happenings:?}");
    let ticks = charge_ticks(1);
    let charged = give(&swinging_foe, Status::Charge, ticks, Some(9)).expect("a Charge takes");
    assert_eq!(charged.action, Action::Staggered { left: ticks, cause: Cause::Charged });
    let pushing = combat::Intent {
        controls: Controls { forward: 1.0, run: true, ..Controls::default() },
        combat: swinging(0.0, Stroke::Down).combat,
    };
    let (held, happenings) = run(charged, pushing, ticks - 1, None);
    assert!(happenings.is_empty(), "no blow, no new swing: {happenings:?}");
    assert!((held.body.x, held.body.y) == (charged.body.x, charged.body.y), "not a step");
    let (freed, happenings) = run(charged, pushing, ticks + 1, None);
    assert!(happenings.iter().any(|(_, each)| matches!(each, Happening::Swung(_))), "free once it ends");
    assert!(freed.body.y < charged.body.y, "and walking");
    assert!(give(&freed, Status::Charge, ticks, None).is_none(), "immune once it ends");
    let (immune, _) = run(freed, idle(0.0), CHARGE_IMMUNE - 2, None);
    assert!(give(&immune, Status::Charge, ticks, None).is_none(), "immune through its time");
    let (open, _) = run(immune, idle(0.0), 2, None);
    assert!(give(&open, Status::Charge, ticks, None).is_some(), "and open again after it");
}

#[test]
fn a_charge_lasts_by_rank_a_minor_s_longest_and_a_player_s_as_a_minor_s() {
    assert_eq!([1, 2, 3, 4, 5].map(charge_ticks), [120, 90, 60, 36, 24]);
    assert_eq!(charge_ticks(0), charge_ticks(1));
    assert_eq!(Status::Charge.ticks(), charge_ticks(1));
}

#[test]
fn haste_moves_its_fighter_faster_by_its_share() {
    let running = combat::Intent {
        controls: Controls { forward: 1.0, run: true, ..Controls::default() },
        combat: combat::CombatInput::default(),
    };
    let start = player_at(0.0, 0.0);
    let (plain, _) = run(start, running, 60, None);
    let (hasted, _) = run(given(&start, Status::Haste, 360), running, 60, None);
    let ratio = hasted.body.y / plain.body.y;
    assert!((ratio - HASTE_TIMES).abs() < 1e-9, "{ratio}");
}

#[test]
fn statuses_refresh_to_the_longer_never_stack_run_down_and_the_dead_take_none() {
    let fighter = given(&player_at(0.0, 0.0), Status::Expose, 100);
    assert_eq!(given(&fighter, Status::Expose, 50).statuses.left(Status::Expose), 100);
    assert_eq!(given(&fighter, Status::Expose, 400).statuses.left(Status::Expose), 400);
    let (later, _) = run(fighter, idle(0.0), 30, None);
    assert_eq!(later.statuses.left(Status::Expose), 70);
    assert_eq!(later.statuses.giver(Status::Expose), Some(9));
    let (gone, _) = run(fighter, idle(0.0), 100, None);
    assert_eq!(gone.statuses.giver(Status::Expose), None);
    let dead = Fighter { action: Action::Dead { elapsed: 0 }, ..player_at(0.0, 0.0) };
    assert!(give(&dead, Status::Haste, 360, None).is_none());
    assert!(give(&player_at(0.0, 0.0), Status::Haste, 0, None).is_none(), "nothing for no time");
}

#[test]
fn a_fighter_s_statuses_cross_its_numbers_whole() {
    let mut fighter = given(&given(&player_at(0.0, 0.0), Status::Linked, 180), Status::Veiled, 240);
    fighter.statuses.charge_immune = 33;
    let numbers: [f64; FIGHTER_FLOATS] = fighter.to_floats();
    assert_eq!(Fighter::from_floats(&numbers), fighter);
    let glanced = Fighter::from_glance(&fighter.glance());
    assert_eq!(glanced.statuses, combat::Statuses::NONE, "a glance carries none");
}
