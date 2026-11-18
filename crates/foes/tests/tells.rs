//! Telegraphed blows and shots: a brute winds up iron slams and never guards; a captain as a Miniboss closes with
//! charges and leaps, feints and chains, and roars into its second phase once with an iron ring, striking harder after;
//! Thule roars into each of his three phases and calls his crew into the last, Corvane calls his own into each later
//! one; a Minor throws no telegraphed blow;
//! an archer kites a player who comes too close, draws and looses, and aims a shot now and then; every shooter draws
//! its own weapon as long as that weapon takes.

mod common;

use combat::Happening;
use combat::shapes::Shape;
use common::{ARCHER, BRUTE, CAPTAIN, Room, SKIRMISHER, SWORDSMAN, still, watching};
use core::f64::consts::PI;
use foes::Rank::{Boss, Major, Miniboss, Minor};
use foes::roster::HIGH_ASSESSOR;
use foes::{Call, Place};

const PLAYER: u32 = 1;

#[test]
fn a_brute_winds_up_iron_slams_and_never_guards_or_dodges() {
    let mut room = Room::new(21).player(PLAYER, 0.0, 0.0, 0.0).foe(10, BRUTE, Major, 0.0, -4.0, PI);
    room.run(3600, &mut still(0.0));
    let orders = room.orders(10);
    assert!(orders.iter().any(|(_, order)| order.shape == Shape::Slam && order.iron), "{orders:?}");
    assert!(orders.iter().all(|(_, order)| (order.shape == Shape::Slam) == order.iron), "only its slams are iron");
    assert!(orders.iter().all(|(_, order)| matches!(order.shape, Shape::Slam | Shape::Sweep)));
    assert!(room.foe_intents(10).iter().all(|(_, intent)| !intent.combat.guard && !intent.combat.dodge));
    let gaps: Vec<u64> = orders.windows(2).map(|pair| pair[1].0 - pair[0].0).collect();
    assert!(gaps.iter().all(|gap| *gap >= 8 * 60), "at least its cooldown apart: {gaps:?}");
}

#[test]
fn a_miniboss_captain_throws_its_whole_set_closing_from_afar_feinting_and_chaining() {
    let (mut closers, mut feints, mut chains) = (0, 0, 0);
    for seed in 1..=6 {
        let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0).foe(10, CAPTAIN, Miniboss, 0.0, -9.0, PI);
        let mut script = |room: &Room, me: u32| {
            // A player who backs off for the first half draws the gap-closers, then stands to be fought up close.
            let mut intent = common::standing_still(room.toward(me, 10));
            let backing = room.tick < 1800 && room.distance(me, 10) < 6.0;
            intent.controls.forward = if backing { -1.0 } else { 0.0 };
            intent
        };
        room.run(3600, &mut script);
        let orders = room.orders(10);
        closers += orders.iter().filter(|(_, order)| matches!(order.shape, Shape::Charge | Shape::Leap)).count();
        feints += orders.iter().filter(|(_, order)| order.feint_at.is_some()).count();
        chains += orders.windows(2).filter(|pair| pair[1].0 - pair[0].0 < 90).count();
        for (_, order) in &orders {
            if order.shape == Shape::Leap {
                assert!((3.0..=9.0).contains(&order.ahead), "a leap lands at its target's feet: {}", order.ahead);
            }
            if let Some(cut) = order.feint_at {
                assert!(cut < order.windup, "a feint is cut before its blow would land");
            }
        }
    }
    assert!(closers > 0 && feints > 0 && chains > 0, "closers {closers}, feints {feints}, chains {chains}");
}

#[test]
fn a_miniboss_roars_into_its_second_phase_once_with_its_poise_refilled_and_strikes_harder_after() {
    let mut room = Room::new(5).player(PLAYER, 0.0, 0.0, 0.0).foe(10, CAPTAIN, Miniboss, 0.0, -2.0, PI);
    room.run(30, &mut still(0.0));
    let might = 1.2 * 1.25;
    assert!((room.brain(10).might() - might).abs() < 1e-12 && room.brain(10).phase() == 1);
    room.set(10, |captain| captain.health = 0.36 * captain.health_max);
    room.run(30, &mut still(0.0));
    assert!(room.orders(10).iter().all(|(_, order)| order.shape != Shape::Ring), "not above its threshold");
    // Struck down to it while winding up or swinging, it roars as soon as it is free.
    room.set(10, |captain| {
        captain.health = 0.34 * captain.health_max;
        captain.poise = 0.5 * captain.poise_max;
    });
    let free = (room.tick..room.tick + 120).find(|_| {
        let idle = matches!(room.fighter(10).action, combat::fighter::Action::Idle);
        room.step(&mut still(0.0));
        idle
    });
    room.run(600, &mut still(0.0));
    let (tick, roar) = room.orders(10).into_iter().find(|(tick, _)| *tick >= 60).expect("it roars");
    assert_eq!(Some(tick), free, "at once");
    assert!(roar.shape == Shape::Ring && roar.iron, "an iron ring: {roar:?}");
    assert_eq!(roar.windup + combat::ticks(combat::shapes::IRON_EXTRA), 72, "a roar of 1.2 s");
    assert!((room.brain(10).might() - might * 1.25).abs() < 1e-12 && room.brain(10).phase() == 2);
    assert!((room.fighter(10).might - might * 1.25).abs() < 1e-12, "its blows strike harder");
    assert!(room.fighter(10).poise < 0.5 * room.fighter(10).poise_max, "its poise refilled as it roared");
    let rings = room.orders(10).iter().filter(|(_, order)| order.shape == Shape::Ring).count();
    assert_eq!(rings, 1, "once");
    assert!(room.crew_calls.is_empty(), "a Miniboss calls no crew");
}

#[test]
fn an_archer_kites_a_player_too_close_then_draws_and_looses_and_sometimes_aims() {
    let mut room = Room::new(9).player(PLAYER, 0.0, 0.0, 0.0).foe(10, ARCHER, Major, 0.0, -4.0, PI);
    room.run(150, &mut watching(10));
    assert!(room.distance(PLAYER, 10) > 6.0, "it walked out of reach: {}", room.distance(PLAYER, 10));
    room.run(1800, &mut watching(10));
    let intents = room.foe_intents(10);
    let held = intents.windows(2).filter(|pair| pair[0].1.combat.aim && pair[1].1.combat.aim).count();
    let pulled = intents.windows(2).filter(|pair| !pair[0].1.combat.shoot && pair[1].1.combat.shoot).count();
    let loosed =
        room.happenings.iter().filter(|(_, by, happening)| *by == 10 && matches!(happening, Happening::Loosed(_)));
    assert!(held > 100 && pulled >= 5 && loosed.count() >= 5, "it aims its bow, holds it drawn and pulls");
    assert!(room.verdicts.iter().any(|(_, by, on, _)| *by == 10 && *on == PLAYER), "and its arrows find the player");
    let aimed = room.orders(10);
    assert!(!aimed.is_empty() && aimed.iter().all(|(_, order)| order.shape == Shape::Aimed), "{aimed:?}");
    assert!(aimed.iter().all(|(_, order)| (order.ahead - room.distance(PLAYER, 10)).abs() < 3.0));
}

/// The tick of each roar a foe ordered: an iron ring wound up the roar's 1.2 s.
fn roars(room: &Room, id: u32) -> Vec<u64> {
    let roar = |order: &combat::TelegraphOrder| {
        order.shape == Shape::Ring && order.iron && order.windup + combat::ticks(combat::shapes::IRON_EXTRA) == 72
    };
    room.orders(id).iter().filter(|(_, order)| roar(order)).map(|(tick, _)| *tick).collect()
}

#[test]
fn the_boss_roars_into_each_of_its_three_phases_and_calls_its_crew_once_into_the_last() {
    const THULE: u8 = 12;
    let mut room = Room::new(8).player(PLAYER, 0.0, 0.0, 0.0).foe(10, THULE, Boss, 0.0, -2.5, PI);
    room.run(30, &mut still(0.0));
    let might = 1.2 * 1.35;
    assert_eq!(room.brain(10).phase(), 1);
    assert!((room.brain(10).might() - might).abs() < 1e-12);
    room.set(10, |boss| boss.health = 0.7 * boss.health_max);
    room.run(120, &mut still(0.0));
    assert!(roars(&room, 10).is_empty(), "not above two thirds");
    room.set(10, |boss| boss.health = 0.6 * boss.health_max);
    room.run(240, &mut still(0.0));
    assert_eq!((roars(&room, 10).len(), room.brain(10).phase()), (1, 2), "the boarding, roared once");
    assert!((room.brain(10).might() - might).abs() < 1e-12, "no harder yet");
    assert!(room.crew_calls.is_empty());
    room.set(10, |boss| boss.health = 0.3 * boss.health_max);
    room.run(240, &mut still(0.0));
    assert_eq!((roars(&room, 10).len(), room.brain(10).phase()), (2, 3), "the last stand, roared once");
    assert!((room.brain(10).might() - might * 1.25).abs() < 1e-12, "a quarter harder");
    assert_eq!(room.crew_calls.len(), 1, "its crew called");
    assert_eq!(room.crew_calls[0].0, roars(&room, 10)[1] + 1, "as its roar begins");
    room.run(1800, &mut still(0.0));
    assert_eq!(roars(&room, 10).len(), 2, "each phase roared once");
    assert_eq!(room.crew_calls.len(), 1, "and its crew called once");
    let orders = room.orders(10);
    assert!(orders.iter().any(|(_, order)| order.shape == Shape::Slam && order.iron), "iron slams: {orders:?}");
}

#[test]
fn corvane_holds_his_shield_up_then_summons_crossbowmen_behind_him_and_collectors_to_his_sides() {
    let mut room = Room::new(8).player(PLAYER, 0.0, 0.0, 0.0).foe(10, HIGH_ASSESSOR, Boss, 0.0, -2.5, PI);
    room.run(900, &mut still(0.0));
    let might = 1.2 * 1.35;
    assert_eq!(room.brain(10).phase(), 1);
    let guarded = room.foe_intents(10).iter().filter(|(_, intent)| intent.combat.guard).count();
    assert!(guarded > 60, "the levy: his shield up while he waits, though no blow comes ({guarded} ticks)");
    let levy = room.orders(10);
    assert!(levy.iter().all(|(_, order)| matches!(order.shape, Shape::Sweep | Shape::Lunge)), "{levy:?}");
    room.set(10, |boss| boss.health = 0.6 * boss.health_max);
    room.run(240, &mut still(0.0));
    assert_eq!((roars(&room, 10).len(), room.brain(10).phase()), (1, 2), "the summons, roared once");
    let crossbowmen = Call { foe_type: 3, rank: Minor, count: 2, place: Place::Behind };
    assert_eq!(room.crew_calls.iter().map(|call| call.2).collect::<Vec<_>>(), [crossbowmen]);
    assert_eq!(room.crew_calls[0].0, roars(&room, 10)[0] + 1, "as its roar begins");
    assert!((room.brain(10).might() - might).abs() < 1e-12, "no harder yet");
    room.run(1800, &mut still(0.0));
    let summons = room.orders(10);
    assert!(summons.iter().any(|(_, order)| order.shape == Shape::Slam && order.iron), "iron slams: {summons:?}");
    room.set(10, |boss| boss.health = 0.3 * boss.health_max);
    room.run(240, &mut still(0.0));
    assert_eq!((roars(&room, 10).len(), room.brain(10).phase()), (2, 3), "the seizure, roared once");
    let collectors = Call { foe_type: 2, rank: Major, count: 2, place: Place::Beside };
    assert_eq!(room.crew_calls.iter().map(|call| call.2).collect::<Vec<_>>(), [crossbowmen, collectors]);
    assert!((room.brain(10).might() - might * 1.25).abs() < 1e-12, "a quarter harder");
}

#[test]
fn a_roar_knocked_out_of_a_boss_before_it_begins_is_still_owed_and_roared_once_it_stands() {
    let mut room = Room::new(8).player(PLAYER, 0.0, 0.0, 0.0).foe(10, 12, Boss, 0.0, -2.5, PI);
    room.run(30, &mut still(0.0));
    room.set(10, |boss| boss.health = 0.6 * boss.health_max);
    while roars(&room, 10).is_empty() {
        room.step(&mut still(0.0));
    }
    // Knocked down by a foe of another side before its brain saw the wind-up begin.
    room.set(10, |boss| boss.action = combat::fighter::Action::Down { left: 40 });
    room.run(240, &mut still(0.0));
    assert_eq!((roars(&room, 10).len(), room.brain(10).phase()), (2, 2), "the boarding's roar, ordered again once up");
    assert!(room.crew_calls.is_empty());
}

#[test]
fn a_boss_cut_from_its_first_phase_to_its_last_at_one_blow_still_roars_twice() {
    let mut room = Room::new(3).player(PLAYER, 0.0, 0.0, 0.0).foe(10, 12, Boss, 0.0, -2.5, PI);
    room.run(30, &mut still(0.0));
    room.set(10, |boss| boss.health = 0.2 * boss.health_max);
    room.run(600, &mut still(0.0));
    assert_eq!((roars(&room, 10).len(), room.brain(10).phase(), room.crew_calls.len()), (2, 3, 1));
}

#[test]
fn a_minor_throws_no_telegraphed_blow_and_a_minor_archer_never_aims() {
    for number in [SKIRMISHER, SWORDSMAN] {
        let mut room = Room::new(4).player(PLAYER, 0.0, 0.0, 0.0).foe(10, number, Minor, 0.0, -3.0, PI);
        room.run(3600, &mut still(0.0));
        assert!(room.orders(10).is_empty(), "type {number}: {:?}", room.orders(10));
        assert!(!room.swings(10).is_empty(), "type {number} fights all the same");
    }
    let mut room = Room::new(9).player(PLAYER, 0.0, 0.0, 0.0).foe(10, ARCHER, Minor, 0.0, -12.0, PI);
    room.run(1800, &mut watching(10));
    let loosed =
        room.happenings.iter().filter(|(_, by, happening)| *by == 10 && matches!(happening, Happening::Loosed(_)));
    assert!(loosed.count() >= 5, "it shoots plainly");
    assert!(room.orders(10).is_empty(), "and never aims");
}

#[test]
fn each_shooter_draws_its_own_weapon_for_as_long_as_it_takes_and_a_gunner_s_ball_flies_to_be_dodged() {
    for (number, rank, drawn, speed) in [(ARCHER, Major, 60, 45.0), (3, Major, 78, 55.0), (9, Major, 72, 70.0)] {
        let mut room = Room::new(6).player(PLAYER, 0.0, 0.0, 0.0).foe(10, number, rank, 0.0, -12.0, PI);
        room.run(600, &mut watching(10));
        let intents = room.foe_intents(10);
        let raised = intents.windows(2).find(|pair| !pair[0].1.combat.aim && pair[1].1.combat.aim);
        let raised = raised.expect("it raises its weapon")[1].0;
        let pulled = intents.iter().find(|(tick, intent)| *tick > raised && intent.combat.shoot).expect("and shoots");
        assert_eq!(pulled.0 - raised, drawn + 1, "type {number} draws {drawn} ticks");
        let shot = room
            .happenings
            .iter()
            .find_map(|(_, by, happening)| match happening {
                Happening::Loosed(shot) if *by == 10 => Some(*shot),
                _ => None,
            })
            .expect("a shot");
        let [east, south, up] = shot.velocity;
        assert!(((east * east + south * south + up * up).sqrt() - speed).abs() < 1e-9, "type {number}: {shot:?}");
    }
}
