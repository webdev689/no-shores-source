//! A fighter's gear trims the fight's numbers: what its swings and dodges cost, how fast its stamina comes back, what
//! a guard lets through and pays, how long a stagger it causes lasts, and how blows land on it. Nothing trimmed is
//! combat's own.

mod common;

use combat::arms::{Arms, OffHand, WeaponClass, weapon};
use combat::fighter::{Action, Cause};
use combat::floats::FIGHTER_FLOATS;
use combat::judge::{Blow, BlowKind, judge, suffer};
use combat::tuning::{DODGE_STAMINA, STAMINA, STAMINA_PER_TICK};
use combat::{Fighter, Shape, Stroke, Surroundings, Trim, Verdict, step_fighter};
use common::{dodging, guarding, idle, player_at, swinging};

const AROUND: Surroundings<'static> = Surroundings { blocks: &[], terrain: &movement::Flat, target_at: None };
const SWORD: Arms = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Empty };

fn armed(trim: Trim) -> Fighter {
    Fighter { arms: SWORD, trim, ..player_at(0.0, 0.0) }
}

fn blow(kind: BlowKind) -> Blow {
    Blow {
        striker: 9,
        kind,
        from: [0.0, -1.0],
        damage: 10.0,
        poise: 10.0,
        guard: 10.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
    }
}

#[test]
fn a_trimmed_swing_and_dodge_cost_less_stamina() {
    let plain = step_fighter(&armed(Trim::PLAIN), &swinging(0.0, Stroke::Down), &AROUND).0;
    let light =
        step_fighter(&armed(Trim { swing_stamina: 0.85, ..Trim::PLAIN }), &swinging(0.0, Stroke::Down), &AROUND).0;
    let cost = weapon(WeaponClass::Sword).stamina;
    assert!((STAMINA - plain.stamina - cost).abs() < 1e-9);
    assert!((STAMINA - light.stamina - cost * 0.85).abs() < 1e-9, "Light Grip: 15% less");
    let footing = Trim { dodge_stamina: 0.85, drawn_dodge_stamina: 0.9, ..Trim::PLAIN };
    let drawn = step_fighter(&armed(footing), &dodging(0.0, 0.0, 1.0), &AROUND).0;
    assert!((STAMINA - drawn.stamina - DODGE_STAMINA * 0.85 * 0.9).abs() < 1e-9, "Sure Footing, and Balanced drawn");
    let bare = Fighter { arms: combat::arms::BARE_HANDS, trim: footing, ..player_at(0.0, 0.0) };
    let sheathed = step_fighter(&bare, &dodging(0.0, 0.0, 1.0), &AROUND).0;
    assert!((STAMINA - sheathed.stamina - DODGE_STAMINA * 0.85).abs() < 1e-9, "Balanced only while drawn");
}

#[test]
fn stamina_comes_back_faster_trimmed_and_faster_again_below_half_health() {
    let rested = |trim: Trim, health: f64| {
        let tired = Fighter { stamina: 10.0, stamina_rest: 100, health, trim, ..player_at(0.0, 0.0) };
        step_fighter(&tired, &idle(0.0), &AROUND).0.stamina - 10.0
    };
    assert!((rested(Trim::PLAIN, 100.0) - STAMINA_PER_TICK).abs() < 1e-12);
    let wind = Trim { regen: 1.15, regen_low: 1.5, ..Trim::PLAIN };
    assert!((rested(wind, 100.0) - STAMINA_PER_TICK * 1.15).abs() < 1e-12, "Second Wind");
    assert!((rested(wind, 40.0) - STAMINA_PER_TICK * 1.15 * 1.5).abs() < 1e-12, "and Deep Breath below half");
}

#[test]
fn a_guard_lets_a_keen_edge_through_and_a_bulwark_pays_less() {
    let mut guarding_fighter = armed(Trim { guard_stamina: 0.85, ..Trim::PLAIN });
    guarding_fighter = step_fighter(&guarding_fighter, &guarding(0.0), &AROUND).0;
    for _ in 0..20 {
        guarding_fighter = step_fighter(&guarding_fighter, &guarding(0.0), &AROUND).0;
    }
    let plain = judge(&blow(BlowKind::Swing(Stroke::Down)), &guarding_fighter);
    let keen = judge(&Blow { through: 1.5, ..blow(BlowKind::Swing(Stroke::Down)) }, &guarding_fighter);
    let (Verdict::Blocked { damage: plain_damage, stamina }, Verdict::Blocked { damage: keen_damage, .. }) =
        (plain, keen)
    else {
        panic!("both blocked: {plain:?} {keen:?}");
    };
    assert!((keen_damage - plain_damage * 1.5).abs() < 1e-9, "Keen Edge: half again through");
    let unguarded = armed(Trim::PLAIN);
    let mut plain_guard = step_fighter(&unguarded, &guarding(0.0), &AROUND).0;
    for _ in 0..20 {
        plain_guard = step_fighter(&plain_guard, &guarding(0.0), &AROUND).0;
    }
    let Verdict::Blocked { stamina: plain_stamina, .. } = judge(&blow(BlowKind::Swing(Stroke::Down)), &plain_guard)
    else {
        panic!("blocked");
    };
    assert!((stamina - plain_stamina * 0.85).abs() < 1e-9, "Bulwark: 15% less");
}

#[test]
fn blows_land_softer_from_behind_or_telegraphed_and_a_tolling_stagger_lasts_longer() {
    let hide =
        Fighter { trim: Trim { behind_taken: 2.0 / 3.0, telegraph_taken: 0.9, ..Trim::PLAIN }, ..player_at(0.0, 0.0) };
    // Facing north, struck from the south: behind.
    let behind = Blow { from: [0.0, 1.0], ..blow(BlowKind::Swing(Stroke::Down)) };
    let Verdict::Hit { damage, .. } = judge(&behind, &Fighter { aim: 0.0, ..hide }) else { panic!("a hit") };
    assert!((damage - 10.0 * 2.0 / 3.0).abs() < 1e-9, "Barnacle");
    let Verdict::Hit { damage, .. } = judge(&blow(BlowKind::Telegraph(Shape::Slam)), &hide) else { panic!("a hit") };
    assert!((damage - 9.0).abs() < 1e-9, "Hardy");
    let mut guarded = armed(hide.trim);
    let mut plain_guard = armed(Trim::PLAIN);
    for _ in 0..20 {
        guarded = step_fighter(&guarded, &guarding(0.0), &AROUND).0;
        plain_guard = step_fighter(&plain_guard, &guarding(0.0), &AROUND).0;
    }
    let chip = |fighter: &Fighter, kind: BlowKind| match judge(&blow(kind), fighter) {
        Verdict::Blocked { damage, .. } => damage,
        other => panic!("blocked, not {other:?}"),
    };
    let slam = BlowKind::Telegraph(Shape::Slam);
    assert!((chip(&guarded, slam) - chip(&plain_guard, slam) * 0.9).abs() < 1e-9, "Hardy through a guard");
    let swing = BlowKind::Swing(Stroke::Down);
    assert!((chip(&guarded, swing) - chip(&plain_guard, swing)).abs() < 1e-12, "and only on a telegraph");
    let full = Fighter { poise: 999.0, poise_max: 10.0, ..player_at(0.0, 0.0) };
    let struck = |stagger: f64| {
        let tolling = Blow { stagger, ..blow(BlowKind::Swing(Stroke::Down)) };
        match suffer(&full, &tolling, &Verdict::Hit { damage: 1.0, poise: 1.0 }).action {
            Action::Staggered { left, cause: Cause::Poise } => left,
            other => panic!("staggered, not {other:?}"),
        }
    };
    assert_eq!(f64::from(struck(1.5)), (f64::from(struck(1.0)) * 1.5).round(), "Tolling: half again as long");
}

#[test]
fn unshaken_and_steady_fill_poise_less() {
    let open = Fighter { arms: SWORD, poise_max: 100.0, ..player_at(0.0, 0.0) };
    let filled = |trim: Trim, arms: Arms| {
        let fighter = Fighter { trim, arms, ..open };
        suffer(&fighter, &blow(BlowKind::Swing(Stroke::Down)), &Verdict::Hit { damage: 1.0, poise: 20.0 }).poise
    };
    let trim = Trim { poise_taken: 1.0 / 1.15, drawn_poise_taken: 0.9, ..Trim::PLAIN };
    assert!((filled(Trim::PLAIN, SWORD) - 20.0).abs() < 1e-9);
    assert!((filled(trim, SWORD) - 20.0 / 1.15 * 0.9).abs() < 1e-9, "Unshaken, and Steady drawn");
    assert!((filled(trim, combat::arms::BARE_HANDS) - 20.0 / 1.15).abs() < 1e-9, "Steady only while drawn");
}

#[test]
fn a_trim_crosses_with_its_fighter_to_the_bit() {
    let trim = Trim { swing_stamina: 0.85, kill_stamina: 25.0, kill_reload: true, on_low: 1.3, ..Trim::PLAIN };
    let fighter = armed(trim);
    let floats: [f64; FIGHTER_FLOATS] = fighter.to_floats();
    assert_eq!(Fighter::from_floats(&floats), fighter);
    let mut broken = floats;
    broken[FIGHTER_FLOATS - 29] = f64::NAN;
    assert_eq!(Fighter::from_floats(&broken).trim.swing_stamina, 1.0, "a factor that is not a number trims nothing");
}

#[test]
fn every_number_of_a_trim_crosses_to_its_own_place() {
    // Each number distinct, so two swapped in packing or unpacking would not cross back the same.
    let mut numbers = [0.0; combat::trim::TRIM_FLOATS];
    for (nth, number) in numbers.iter_mut().enumerate() {
        *number = 1.0 + 0.01 * (nth as f64 + 1.0);
    }
    numbers[combat::trim::TRIM_FLOATS - 1] = 1.0;
    let trim = Trim::from_floats(&numbers);
    assert_eq!(trim.to_floats(), numbers);
    assert!(trim.kill_reload);
}

#[test]
fn a_fighter_seen_at_a_glance_reads_as_untrimmed() {
    let seen = Fighter::from_glance(&armed(Trim { swing_stamina: 0.85, ..Trim::PLAIN }).glance());
    assert_eq!(seen.trim, Trim::PLAIN);
}
