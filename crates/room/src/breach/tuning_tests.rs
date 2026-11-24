//! The great foes' health as the company stands: matched to every player in the run however many lie down as each
//! stands, a Keeper to half the company, then each its own times; and lasting, against a company of eight, long
//! enough for their rules to come round.

use super::breach_tests::{at, breach, fell, run, stand_at};
use super::fights_tests::{begin_at, kill, put_at, won_to};
use super::*;
use crate::PlayerId;

/// What a company of eight takes off a great foe a second, in health at the foe's level as players matched to it strike
/// it: 90, a sword's rate for each of the eight with a share of its blows landing.
const COMPANY_HARM: f64 = 90.0;

/// A second of a fight in one tick of the room: the company's harm taken off `foe` (none sticks while the room holds
/// its health), every lesser foe struck down as the company clears them (the bells too, if `bells`), and the fallen
/// stood again at the stage. Answers whether `foe` still stands.
fn a_second(room: &mut Room, foe: FighterId, bells: bool) -> bool {
    room.clock += 59;
    room.tick();
    let harm = COMPANY_HARM * gear::power::foe_health_times(breach(room).tier.foes_at());
    let lesser: Vec<FighterId> = room
        .foes
        .iter()
        .filter(|(id, found)| **id != foe && !found.fighter.dead())
        .filter(|(_, found)| bells || found.brain.foe_type.number != ::foes::roster::BELL)
        .map(|(id, _)| *id)
        .collect();
    for id in lesser {
        kill(room, id);
    }
    let fallen: Vec<PlayerId> = room.players.iter().filter(|(_, found)| !found.living()).map(|(id, _)| *id).collect();
    let (stage, _) = room.stage_at(breach(room));
    for id in fallen {
        room.stand_whole(id, stage);
    }
    let Some(found) = room.foes.get_mut(&foe).filter(|found| !found.fighter.dead()) else { return false };
    found.fighter.health -= harm;
    if found.fighter.health <= 0.0 {
        kill(room, foe);
    }
    true
}

#[test]
fn against_a_company_of_eight_the_scrivener_lasts_ninety_seconds_and_the_steward_three_takings() {
    let (mut room, players) = won_to(Tier::Normal, 8, CHOIR);
    begin_at(&mut room, &players, "choir", "lectern-2");
    let mut breach_box = room.breach.take().expect("run");
    let mut fight = std::mem::take(&mut breach_box.fights.choir);
    room.wake_scrivener(&mut breach_box, &mut fight);
    breach_box.fights.choir = fight;
    room.breach = Some(breach_box);
    let scrivener = breach(&room).fights.choir.scrivener.expect("it stands");
    // Its ward broken at once and every desk it marks blotted, so the company's harm lands from the first second.
    let plinth = at(&room, "choir", "plinth");
    stand_at(&mut room, players[0], plinth);
    assert!(room.take_lodestone(players[0]));
    let body = room.foes[&scrivener].fighter.body;
    stand_at(&mut room, players[0], [body.x + 3.0, body.y, body.z]);
    assert!(room.ground_lodestone(players[0]));
    let mut seconds = 0;
    while a_second(&mut room, scrivener, true) {
        if let Some((desk, _)) = breach(&room).fights.choir.marked_desk {
            let (at, _) = breach(&room).plan.numbered("choir", "lectern")[desk];
            stand_at(&mut room, players[1], at);
        }
        seconds += 1;
    }
    assert!(seconds >= 90, "the Scrivener fell after {seconds} s");
    let (mut room, players) = won_to(Tier::Normal, 8, STEWARD);
    begin_at(&mut room, &players, "court", "chest");
    let boss = breach(&room).fights.steward.boss.expect("the Steward stands");
    // Never laid bare, it outlasts its last toll: the company must use the Lodestone to win.
    let last_toll = (steward::FIRST_TAKING + steward::TAKING_EVERY.0 * u64::from(steward::TAKINGS_MOST)) as f64 / 60.0;
    let harm = COMPANY_HARM * gear::power::foe_health_times(Tier::Normal.foes_at());
    assert!(room.foes[&boss].fighter.health_max > harm * last_toll, "beaten before its last toll, never laid bare");
    let mut seconds = 0;
    while breach(&room).fights.steward.takings < 3 {
        let takings = breach(&room).fights.steward.takings;
        assert!(a_second(&mut room, boss, false), "the Steward fell after {seconds} s and {takings} takings");
        seconds += 1;
    }
}

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

#[test]
fn the_mender_and_the_warden_stand_half_again_their_match() {
    let company = 1.0 + waves::HEALTH_PER_PLAYER;
    let brute = bare_health(::foes::roster::BULWARK, ::foes::Rank::Miniboss, Tier::Normal) * company * 1.5;
    let (mut room, players) = run(Tier::Normal, 2);
    begin_at(&mut room, &players, "mending", "mender");
    for _ in 1..=3 {
        room.clock += mending::STAGE_TICKS;
        room.tick();
    }
    let mender = breach(&room).fights.mending.mender.expect("the Mender stands");
    assert!((room.foes[&mender].fighter.health_max - brute).abs() < 1e-6, "the Mender");
    let (mut room, players) = won_to(Tier::Normal, 2, SHORES);
    begin_at(&mut room, &players, "hall", "plinth");
    let warden = breach(&room).fights.shores.warden.expect("the Warden stands");
    assert!((room.foes[&warden].fighter.health_max - brute).abs() < 1e-6, "the Warden");
}

#[test]
fn a_great_foe_is_matched_to_everyone_who_played_in_the_run_and_grows_with_those_who_come_after_it_stands() {
    let steward = |room: &mut Room, standing: PlayerId| {
        put_at(room, standing, "court", "chest");
        room.tick();
        breach(room).fights.steward.boss.expect("the Steward stands")
    };
    let (mut whole, players) = won_to(Tier::Normal, 8, STEWARD);
    whole.tick();
    let boss = steward(&mut whole, players[7]);
    let matched = whole.foes[&boss].fighter.health_max;
    // Seven leave before it stands: it is matched to all eight still.
    let (mut room, players) = won_to(Tier::Normal, 8, STEWARD);
    room.tick();
    for &player in &players[..7] {
        room.leave(player);
    }
    let boss = steward(&mut room, players[7]);
    assert!((room.foes[&boss].fighter.health_max - matched).abs() < 1e-6, "seven gone, matched to eight");
    // One stands it alone, and seven come in after: it grows to the eight's match, keeping its share.
    let (mut room, players) = won_to(Tier::Normal, 1, STEWARD);
    let boss = steward(&mut room, players[0]);
    room.foes.get_mut(&boss).expect("it").fighter.health /= 2.0;
    for _ in 0..7 {
        crate::encounters::encounters_tests::hardy(&mut room);
    }
    room.tick();
    let grown = room.foes[&boss].fighter;
    assert!((grown.health_max - matched).abs() < 1e-6, "eight came in: {} against {matched}", grown.health_max);
    assert!((grown.health / grown.health_max - 0.5).abs() < 0.01, "its share kept");
}
