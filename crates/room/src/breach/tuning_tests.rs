//! The great foes' health as the company stands: matched to every player in the run however many lie down as each
//! stands, a Keeper to half the company.

use super::breach_tests::{breach, fell};
use super::fights_tests::{begin_at, kill, put_at, won_to};
use super::*;

/// A foe's health at the tier's level, as its type stands at a rank, before it is matched to the company.
fn bare_health(number: u8, rank: ::foes::Rank, tier: Tier) -> f64 {
    let numbers = ::foes::foe_type(number).expect("its type").numbers(rank, 1);
    numbers.health * gear::power::foe_health_times(tier.foes_at())
}

#[test]
fn a_great_foe_is_matched_to_the_whole_company_however_many_lie_down_as_it_stands() {
    let stood = |down: usize| {
        let (mut room, players) = won_to(Tier::Normal, 8, STEWARD);
        for &player in &players[..down] {
            fell(&mut room, player);
        }
        put_at(&mut room, players[7], "court", "chest");
        room.tick();
        let boss = breach(&room).fights.steward.boss.expect("the Steward stands");
        room.foes[&boss].fighter.health_max
    };
    assert_eq!(stood(7), stood(0), "seven down as it stands");
}

#[test]
fn a_keeper_is_matched_to_half_the_company_rounded_up() {
    let (mut room, players) = won_to(Tier::Normal, 7, SHORES);
    begin_at(&mut room, &players, "hall", "plinth");
    let warden = breach(&room).fights.shores.warden.expect("the Warden stands");
    kill(&mut room, warden);
    room.tick();
    put_at(&mut room, players[0], "hall-was", "arrival");
    room.tick();
    let keeper = breach(&room).fights.shores.keepers[0].expect("its Keeper stands");
    let half = 1.0 + waves::HEALTH_PER_PLAYER * 3.0;
    let expected = bare_health(::foes::roster::BULWARK, ::foes::Rank::Miniboss, Tier::Normal) * half;
    let health = room.foes[&keeper].fighter.health_max;
    assert!((health - expected).abs() < 1e-6, "four of seven: {health:.1} against {expected:.1}");
}
