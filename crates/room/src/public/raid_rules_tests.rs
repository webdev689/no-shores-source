//! The raid's rules one by one: a Runner more for each player beyond the first and a small party's waves eased; each
//! Collector's post and the store it is sent to, again once its store falls; the tithe-taker's round, its counts, its
//! time and his never striking; and its foes marching back out at a walk once it fails.

use super::fixture::{RAID_MINUTE, place, room_at, running, running_mut, strike, ticks};
use super::raid::{COUNT_TICKS, PLUNDER_TICKS, TITHE_TAKER_TICKS};
use super::raid_tests::{break_wave, raid, taker};
use super::{Heroic, Phase};
use crate::Room;
use ::foes::Rank;
use ::foes::roster::{COLLECTOR, RUNNER};
use combat::sight::apart;

/// A raid begun with `players` on its ground.
fn begun(players: usize) -> (Room, Vec<crate::PlayerId>) {
    let (mut room, joined) = room_at(RAID_MINUTE, players);
    for player in &joined {
        place(&mut room, *player, [100.0, 0.0]);
    }
    room.tick();
    (room, joined)
}

#[test]
fn each_player_beyond_the_first_brings_a_runner_more_to_three_and_two_or_fewer_meet_their_waves_eased() {
    for players in 1..=5 {
        let (room, _) = begun(players);
        let wave: Vec<(u8, Rank)> = raid(&room)
            .wave_foes
            .iter()
            .map(|id| (room.foes[id].brain.foe_type.number, room.foes[id].brain.rank))
            .collect();
        let runners = wave.iter().filter(|(number, _)| *number == RUNNER).count();
        assert_eq!(runners, 2 + (players - 1).min(3), "{players} players: their Runners");
        let majors = wave.iter().filter(|(_, rank)| *rank == Rank::Major).count();
        let collectors = wave.iter().filter(|member| **member == (COLLECTOR, Rank::Major)).count();
        if players <= 2 {
            assert_eq!(majors, 0, "{players} players: no Major, the Collectors and Runners eased to Minors");
        } else {
            assert_eq!((collectors, majors), (2, 2 + (players - 1).min(3)), "{players} players: none eased");
        }
    }
}

#[test]
fn a_collector_holds_a_post_by_its_store_toward_the_approach_and_is_sent_to_the_nearest_standing_once_it_falls() {
    let (mut room, _) = begun(1);
    let approach = raid(&room).approach;
    for (store, post) in raid(&room).stores.iter().zip(&raid(&room).posts) {
        let at = store.0;
        assert!((apart([post[0], post[1]], [at[0], at[1]]) - 1.9).abs() < 1e-9, "1.9 m from its store's middle");
        let nearer = apart([post[0], post[1]], [approach[0], approach[1]]);
        assert!(nearer < apart([at[0], at[1]], [approach[0], approach[1]]), "on the raiders' side of it");
    }
    let (collector, store) = raid(&room).collectors.iter().map(|(id, store)| (*id, *store)).next().unwrap();
    let post = raid(&room).posts[store];
    let found = room.foes.get_mut(&collector).unwrap();
    (found.fighter.body.x, found.fighter.body.y) = (post[0], post[1]);
    running_mut(&mut room).play_mut().stores[store].1 = 0.5 / PLUNDER_TICKS;
    room.tick();
    assert!(raid(&room).stores[store].1 <= 0.0, "plundered");
    let body = room.foes[&collector].fighter.body;
    let nearest = (0..3).filter(|other| *other != store).min_by(|one, two| {
        let far = |at: &usize| apart([body.x, body.y], [raid(&room).posts[*at][0], raid(&room).posts[*at][1]]);
        far(one).total_cmp(&far(two))
    });
    assert_eq!(raid(&room).collectors.get(&collector).copied(), nearest, "sent to the nearest store standing");
}

#[test]
fn the_tithe_taker_walks_to_the_nearest_store_first_counts_each_ten_seconds_and_is_gone_at_fifty_seconds() {
    let (mut room, players) = begun(1);
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker came with the second wave");
    let round: Vec<([f64; 3], bool)> = raid(&room).taker.as_ref().unwrap().round.clone();
    let (formed, posts) = (raid(&room).formed, raid(&room).posts.clone());
    // Nearest first from where he forms, each the nearest of those left from the last, then back out.
    let (mut at, mut left, mut wanted) = (formed, posts.clone(), Vec::new());
    while !left.is_empty() {
        let next = (0..left.len())
            .min_by(|one, two| {
                let far = |nth: &usize| apart([at[0], at[1]], [left[*nth][0], left[*nth][1]]);
                far(one).total_cmp(&far(two))
            })
            .unwrap();
        at = left.remove(next);
        wanted.push((at, true));
    }
    wanted.push((formed, false));
    assert_eq!(round, wanted);
    assert_eq!(running(&room).heroic_ticks, TITHE_TAKER_TICKS);
    let mut counted = None;
    for _ in 0..TITHE_TAKER_TICKS {
        room.tick();
        if let Some(until) = raid(&room).taker.as_ref().and_then(|taker| taker.counting) {
            counted = Some(until - room.clock);
            break;
        }
    }
    assert!(counted.is_some_and(|left| left + 1 >= COUNT_TICKS && left <= COUNT_TICKS), "ten seconds, {counted:?}");
    let since = TITHE_TAKER_TICKS - running(&room).heroic_ticks;
    ticks(&mut room, TITHE_TAKER_TICKS - since - 30);
    assert_eq!(taker(&room), Some(found), "still on his round");
    ticks(&mut room, 32);
    assert!(taker(&room).is_none() && !room.foes.contains_key(&found), "gone at fifty seconds");
    assert_eq!(running(&room).heroic, Heroic::Missed);
}

#[test]
fn the_tithe_taker_never_strikes_a_player_standing_beside_him() {
    let (mut room, players) = begun(1);
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker came with the second wave");
    for foe in raid(&room).wave_foes.clone() {
        strike(&mut room, players[0], foe, 1.0e7);
    }
    let health = room.players[&players[0]].fighter.health;
    for _ in 0..4 * 60 {
        let body = room.foes[&found].fighter.body;
        place(&mut room, players[0], [body.x + 1.0, body.y]);
        room.tick();
    }
    assert_eq!(room.players[&players[0]].fighter.health, health, "never struck");
}

#[test]
fn failed_its_foes_march_back_out_at_four_metres_a_second() {
    let (mut room, _) = begun(1);
    ticks(&mut room, 10 * 60);
    running_mut(&mut room).ticks_left = 1;
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    let (foe, to, _) = running(&room).withdrawing[0];
    assert_eq!(to, raid(&room).formed, "back to where they formed");
    let out = |room: &Room| {
        let body = room.foes[&foe].fighter.body;
        apart([body.x, body.y], [to[0], to[1]])
    };
    let mut was = out(&room);
    assert!(was > 15.0, "come in {was} m");
    for second in 0..3 {
        ticks(&mut room, 60);
        let now = out(&room);
        assert!((3.6..=4.4).contains(&(was - now)), "second {second}: {} m nearer, at a walk", was - now);
        was = now;
    }
}

impl super::Running {
    fn play_mut(&mut self) -> &mut super::raid::Raid {
        let super::Play::Raid(raid) = &mut self.play else { panic!("a raid") };
        raid
    }
}
