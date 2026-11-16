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
