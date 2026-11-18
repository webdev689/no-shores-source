use super::*;
use crate::arms::{LARGE_BOAT, PIRATE_SLOOP, SLOOP_ARMS};

fn pirate(hull_share: f64, crew_share: f64) -> Power {
    Power::captain(&PIRATE_SLOOP, hull_share, crew_share)
}

#[test]
fn a_better_gunner_hits_more_often_at_a_duels_range() {
    let good = hit_share(&SLOOP_ARMS, 0.75);
    let poor = hit_share(&SLOOP_ARMS, 0.25);
    assert!(good > poor && good <= 1.0 && poor > 0.0, "{good} {poor}");
}

#[test]
fn the_odds_either_way_are_each_others_inverse() {
    let player = Power::player(&LARGE_BOAT, 1.0);
    let her = pirate(1.0, 1.0);
    let ours = odds(&player, &her, &SLOOP_ARMS);
    assert!((ours * odds(&her, &player, &SLOOP_ARMS) - 1.0).abs() < 1e-12);
}

#[test]
fn a_sound_sloop_outguns_a_pirate_sloop_whose_crew_strikes_first() {
    let player = Power::player(&LARGE_BOAT, 1.0);
    assert!(odds(&player, &pirate(1.0, 1.0), &SLOOP_ARMS) > 1.0);
    // Her men are what she strikes by: fewer of them, sooner.
    assert!(
        strike_time(&player, &pirate(1.0, 0.5), &SLOOP_ARMS) < strike_time(&player, &pirate(1.0, 1.0), &SLOOP_ARMS)
    );
    // A player's boat is reckoned by her hull alone, to a quarter.
    assert_eq!(strike_time(&pirate(1.0, 1.0), &Power::player(&LARGE_BOAT, 0.25), &SLOOP_ARMS), 0.0);
}

#[test]
fn the_odds_count_her_guns_harm_and_reload_by_her_rank() {
    let major = pirate(1.0, 1.0);
    let target = Power::player(&LARGE_BOAT, 1.0);
    let hard = Power { might: 1.3, ..major };
    let quick = Power { reload: 0.7, ..major };
    let alone = strike_time(&major, &target, &SLOOP_ARMS);
    assert!((strike_time(&hard, &target, &SLOOP_ARMS) * 1.3 - alone).abs() < 1e-9, "harder balls, sooner");
    assert!(strike_time(&quick, &target, &SLOOP_ARMS) < alone, "a quicker reload, sooner");
    assert!(odds(&hard, &major, &SLOOP_ARMS) > 1.0 && odds(&quick, &major, &SLOOP_ARMS) > 1.0);
}
