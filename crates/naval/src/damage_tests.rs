use super::*;
use crate::arms::{LARGE_BOAT, PIRATE_SLOOP};
use crate::guns::{SWIVEL, Shot, loaded};

fn hurt(hull: f64, sail: f64, crew: f64) -> Hurt {
    Hurt { hull, sail, crew, fire: false }
}

#[test]
fn a_round_ball_into_a_captains_hull_does_4_to_6_and_takes_1_or_2_men() {
    let harm = |zone: Zone, roll: f64| shot_harm(&SWIVEL, zone, false, roll, SHIP_TOUGHNESS);
    assert_eq!(harm(Zone::Hull, 0.0), hurt(4.0, 0.0, 1.0));
    assert_eq!(harm(Zone::Hull, 0.74), hurt(5.0, 1.0, 1.0));
    assert_eq!(harm(Zone::Hull, 0.75), hurt(5.0, 1.0, 2.0));
    assert_eq!(harm(Zone::Hull, 1.0), hurt(6.0, 1.0, 2.0));
    assert_eq!(harm(Zone::Holed, 0.0).hull, 6.0);
    assert_eq!(harm(Zone::Holed, 1.0).hull, 8.0);
    assert_eq!(harm(Zone::Rig, 0.0), hurt(0.0, 3.0, 0.0));
    assert_eq!(harm(Zone::Rig, 0.375), hurt(0.0, 4.0, 1.0));
    assert_eq!(harm(Zone::Rig, 1.0).sail, 5.0);
}

#[test]
fn a_brace_halves_hull_and_canvas_but_never_men() {
    let braced = shot_harm(&SWIVEL, Zone::Hull, true, 1.0, SHIP_TOUGHNESS);
    assert_eq!(braced, hurt(3.0, 0.0, 2.0));
}

#[test]
fn chain_tears_canvas_and_grape_takes_men() {
    let chain = shot_harm(&loaded(&SWIVEL, Shot::Chain), Zone::Rig, false, 0.5, SHIP_TOUGHNESS);
    assert_eq!(chain.sail, 16.0);
    let grape = shot_harm(&loaded(&SWIVEL, Shot::Grape), Zone::Hull, false, 0.0, SHIP_TOUGHNESS);
    assert_eq!(grape.crew, 5.0);
    let player = shot_harm(&SWIVEL, Zone::Hull, false, 0.5, PLAYER_CREW_TOUGHNESS);
    assert_eq!(player.crew, 1.0, "floor(2 / 3.2 + 0.5)");
}

#[test]
fn the_waterline_band_is_1_1_metres_over_the_water() {
    assert_eq!(zone_at(1.1), Zone::Holed);
    assert_eq!(zone_at(-0.3), Zone::Holed);
    assert_eq!(zone_at(1.11), Zone::Hull);
}

#[test]
fn a_captain_strikes_at_a_quarter_of_her_hull_and_sinks_at_none() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    assert_eq!(damage.apply(hurt(197.0, 0.0, 0.0), 1.0, 0.0), None);
    assert_eq!(damage.apply(hurt(1.0, 0.0, 0.0), 2.0, 0.0), Some(State::Struck), "66 of 264 left");
    assert!(!damage.fighting());
    assert_eq!(damage.apply(hurt(100.0, 0.0, 0.0), 3.0, 0.0), Some(State::Sinking));
    assert_eq!(damage.step(21.9, 25.0), None);
    assert_eq!(damage.step(0.2, 25.2), Some(State::Sunk));
    assert_eq!(damage.apply(hurt(5.0, 0.0, 0.0), 30.0, 0.0), None, "a sunk ship takes no more");
}

#[test]
fn a_crew_with_every_man_down_strikes() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    assert_eq!(damage.apply(hurt(5.0, 0.0, 9.0), 1.0, 0.0), None);
    assert_eq!(damage.apply(hurt(5.0, 0.0, 1.0), 2.0, 0.0), Some(State::Struck));
    assert_eq!(damage.crew_share(), 0.0);
}

#[test]
fn the_rest_of_the_volley_that_struck_her_cannot_sink_her() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    damage.apply(hurt(200.0, 0.0, 0.0), 1.0, 0.0);
    assert_eq!(damage.state, State::Struck);
    damage.apply(hurt(100.0, 0.0, 0.0), 1.1, 1.0);
    assert_eq!((damage.hull, damage.state), (1.0, State::Struck));
}

#[test]
fn the_players_sloop_is_wrecked_never_sunk() {
    let mut damage = Damage::new(&LARGE_BOAT, true);
    assert_eq!(damage.apply(hurt(200.0, 0.0, 0.0), 1.0, 0.0), None, "a player's boat never strikes");
    assert_eq!(damage.apply(hurt(50.0, 0.0, 0.0), 2.0, 0.0), Some(State::Wrecked));
    assert_eq!(damage.step(30.0, 40.0), None);
    assert_eq!(damage.state, State::Wrecked);
}

#[test]
fn a_fire_burns_hull_canvas_and_men_for_15_seconds() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    damage.apply(Hurt { fire: true, ..hurt(0.0, 0.0, 0.0) }, 0.0, 0.0);
    for tick in 1..=600 {
        damage.step(0.025, f64::from(tick) * 0.025);
    }
    assert!((damage.hull - (264.0 - 21.0)).abs() < 1e-9, "{}", damage.hull);
    assert!((damage.sail - (96.0 - 7.5)).abs() < 1e-9);
    assert_eq!(damage.crew, 10.0, "one fire alone takes no whole man");
    assert_eq!(damage.fires(), 0);
    assert_eq!(damage.last_hit_at, 15.0, "a burning ship is under fire");
}

#[test]
fn three_fires_burn_at_once_and_overlapping_ones_take_men() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    for _ in 0..4 {
        damage.apply(Hurt { fire: true, ..hurt(0.0, 0.0, 0.0) }, 0.0, 0.0);
    }
    assert_eq!(damage.fires(), 3);
    damage.step(15.0, 15.0);
    // 45 s of burning: four men's worth of harm, 0.625 of a man each.
    assert_eq!(damage.crew, 8.0);
}

#[test]
fn a_ship_that_strikes_has_her_fires_doused() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    damage.apply(Hurt { fire: true, ..hurt(0.0, 0.0, 0.0) }, 0.0, 0.0);
    damage.apply(hurt(200.0, 0.0, 0.0), 1.0, 0.0);
    assert_eq!((damage.state, damage.fires()), (State::Struck, 0));
}

#[test]
fn her_way_falls_with_her_canvas_to_bare_poles() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    assert_eq!(damage.way_share(), 1.0);
    damage.apply(hurt(0.0, 48.0, 0.0), 0.0, 0.0);
    assert!((damage.way_share() - 0.675).abs() < 1e-12);
    damage.apply(hurt(0.0, 99.0, 0.0), 0.0, 0.0);
    assert_eq!(damage.way_share(), BARE_POLES);
}

#[test]
fn her_hands_mend_her_only_in_quiet_waters_and_to_half() {
    let mut damage = Damage::new(&LARGE_BOAT, true);
    damage.apply(hurt(240.0, 96.0, 0.0), 0.0, 0.0);
    assert_eq!(damage.state, State::Wrecked);
    assert!(!damage.mend(1.0, 10.0, false, false), "struck 10 s ago");
    assert!(!damage.mend(1.0, 20.0, true, false), "a hostile ship near");
    assert!(damage.mend(1.0, 20.0, false, false));
    assert!((damage.hull - 240.0 * 0.002).abs() < 1e-12, "{}", damage.hull);
    let mut now = 20.0;
    while damage.state == State::Wrecked {
        now += 1.0;
        damage.mend(1.0, now, false, false);
    }
    assert!(damage.hull > 240.0 * FIELD_REFLOAT, "afloat again past 15%");
    for _ in 0..400 {
        now += 1.0;
        damage.mend(1.0, now, false, false);
    }
    assert_eq!((damage.hull, damage.sail), (120.0, 48.0), "mended to half at most");
}

#[test]
fn going_down_she_lists_and_trims_by_her_seed_and_settles_slow_then_fast() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    damage.apply(hurt(264.0, 0.0, 0.0), 0.0, 0.0);
    damage.step(11.0, 11.0);
    let (drop, pitch, roll) = founder(&damage, 0b01, 6.0);
    assert!((roll - (SINK_LIST_DEG / 2.0).to_radians()).abs() < 1e-12, "seed bit 0: one way");
    assert!((pitch - (SINK_PITCH_DEG / 2.0).to_radians()).abs() < 1e-12);
    assert!((drop - 1.5).abs() < 1e-12, "a quarter of the way down at half the time");
    let (_, other_pitch, other_roll) = founder(&damage, 0b10, 6.0);
    assert!(other_roll < 0.0 && other_pitch < 0.0);
    let afloat = Damage::new(&PIRATE_SLOOP, false);
    assert_eq!(founder(&afloat, 1, 6.0), (0.0, 0.0, 0.0));
}

#[test]
fn hurt_she_lists_to_the_side_she_will_go_down_on() {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    damage.apply(hurt(200.0, 0.0, 0.0), 0.0, 0.0);
    for _ in 0..600 {
        damage.step(0.05, 1.0);
    }
    let want = DAMAGE_LIST_MAX_DEG * (0.4 - 64.0 / 264.0) / 0.4;
    assert!((damage.list_deg - want).abs() < 1e-4, "{}", damage.list_deg);
    let (_, _, roll) = founder(&damage, 1, 6.0);
    assert!((roll - want.to_radians()).abs() < 1e-5);
}
