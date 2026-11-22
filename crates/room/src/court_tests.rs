//! The Court: the Boss's wards holding its health at two thirds and one third until its anchors are each stood on
//! three seconds, with foes at each ward; the Reckoning harming only those outside its light; and Fury's weight.

use super::*;
use crate::encounters::SealState;
use crate::encounters::encounters_tests::{elite_room, hardy, put, ticks, told};
use crate::{How, PlayerId};
use combat::judge::{Blow, BlowKind};
use combat::{Action, Stroke, Verdict};

/// A room whose seals are broken and whose Boss has woken, a hardy player in it, its waves and band gone.
fn court() -> (Room, PlayerId, FighterId) {
    let mut room = elite_room("krakens-grotto");
    let player = hardy(&mut room);
    for seal in &mut room.encounters.as_mut().expect("encounters").seals {
        seal.state = SealState::Broken;
    }
    room.tick();
    let boss = room.boss().expect("woken");
    room.take_events();
    (room, player, boss)
}

/// Lands `damage` of the player's swing on a foe, as the room settles a blow it judged a hit.
fn strike(room: &mut Room, player: PlayerId, foe: FighterId, damage: f64) {
    let blow = Blow {
        striker: player,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage,
        poise: 0.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    };
    room.settle(&blow, How::Swing, foe, Verdict::Hit { damage, poise: 0.0 }, Some(gear::Slot::Melee));
}

fn anchors(room: &Room) -> Vec<[f64; 3]> {
    room.encounters.as_ref().expect("encounters").plan.anchors.clone()
}

/// Stands the player on each anchor in turn for ANCHOR_TICKS.
fn stand_anchors(room: &mut Room, player: PlayerId) {
    for anchor in anchors(room) {
        for _ in 0..ANCHOR_TICKS {
            put(room, player, anchor);
            room.tick();
        }
    }
}

#[test]
fn the_boss_is_warded_at_two_thirds_and_one_third_until_each_anchor_is_stood_on_three_seconds() {
    let (mut room, player, boss) = court();
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    assert_eq!(room.foes[&boss].fighter.health, most * WARDS[0], "a killing blow held at two thirds");
    assert!(!room.foes[&boss].fighter.dead());
    let foes = room.foes.len();
    room.tick();
    assert_eq!(told(&room.take_events(), EventKind::WardRaised), 1);
    assert_eq!(room.foes.len(), foes + WARD_FOES, "two foes at the ward");
    strike(&mut room, player, boss, most / 10.0);
    assert_eq!(room.foes[&boss].fighter.health, most * WARDS[0], "nothing passes the ward");
    let seen = room.encounter_seen().expect("seen");
    assert_eq!((seen.ward, seen.wards_broken), (1, 0));
    // Two anchors are not enough.
    let laid = anchors(&room);
    for anchor in &laid[..2] {
        for _ in 0..ANCHOR_TICKS {
            put(&mut room, player, *anchor);
            room.tick();
        }
    }
    assert_eq!(room.encounter_seen().expect("seen").wards_broken, 0);
    for _ in 0..ANCHOR_TICKS {
        put(&mut room, player, laid[2]);
        room.tick();
    }
    assert_eq!(told(&room.take_events(), EventKind::WardBroken), 1);
    assert_eq!(room.encounter_seen().expect("seen").wards_broken, 1);
    strike(&mut room, player, boss, most / 10.0);
    assert!(room.foes[&boss].fighter.health < most * WARDS[0], "harmed again past the broken ward");
    strike(&mut room, player, boss, most);
    assert_eq!(room.foes[&boss].fighter.health, most * WARDS[1], "the second ward at one third");
    room.tick();
    stand_anchors(&mut room, player);
    assert_eq!(room.encounter_seen().expect("seen").wards_broken, 2);
    strike(&mut room, player, boss, most);
    assert!(room.foes[&boss].fighter.dead(), "no ward is left");
}

#[test]
fn the_reckoning_comes_from_the_second_ward_and_harms_only_those_outside_its_light() {
    let (mut room, player, boss) = court();
    let other = hardy(&mut room);
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    room.tick();
    assert!(room.reckoning_seen().is_none(), "none at the first ward");
    stand_anchors(&mut room, player);
    strike(&mut room, player, boss, most);
    room.tick();
    let (left, at) = room.reckoning_seen().expect("shown at the second ward");
    assert_eq!(u64::from(left), RECKONING_WARNING, "its whole warning shown");
    let light = anchors(&room)[usize::from(at)];
    let whole = room.players[&player].fighter.health_max;
    let healths = |room: &Room| [room.players[&player].fighter.health, room.players[&other].fighter.health];
    let before = healths(&room);
    // By the Boss's post, in the Court but at least ANCHOR_FROM_POST_M from every anchor's light.
    let post = room.garrison[0].at;
    for _ in 0..RECKONING_WARNING {
        put(&mut room, player, light);
        put(&mut room, other, post);
        room.tick();
    }
    let after = healths(&room);
    // The Boss and its ward's foes strike too, a sliver of so hardy a health beside the Reckoning's share.
    assert!(before[0] - after[0] < whole * 0.01, "in the light: untouched by it");
    let lost = before[1] - after[1];
    assert!(lost >= whole * RECKONING_SHARE && lost < whole * (RECKONING_SHARE + 0.01), "outside: seven tenths");
    assert_eq!(told(&room.take_events(), EventKind::ReckoningLanded), 2, "told to each player");
    assert!(room.reckoning_seen().is_none(), "until the next");
    ticks(&mut room, RECKONING_EVERY - RECKONING_WARNING);
    let (_, next) = room.reckoning_seen().expect("fifty seconds on");
    assert_eq!(usize::from(next), (usize::from(at) + 1) % crate::encounter_plan::ANCHORS, "at the next anchor");
}

#[test]
fn fury_weighs_the_foes_blows_a_tenth_more_every_thirty_seconds_from_eight_minutes_to_three_times() {
    let (mut room, player, boss) = court();
    let woke = room.encounters.as_ref().expect("encounters").court.woke_at.expect("woken");
    assert_eq!(room.fury_times(), 1.0);
    let blow = Blow {
        striker: boss,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage: 10.0,
        poise: 0.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    };
    room.clock = woke + FURY_FROM - 1;
    assert_eq!(room.modded_blow(&blow, player), 1.0, "not before eight minutes");
    room.clock = woke + FURY_FROM;
    assert!((room.modded_blow(&blow, player) - 1.1).abs() < 1e-12, "a tenth more at eight minutes");
    room.clock = woke + FURY_FROM + FURY_EVERY * 5;
    assert!((room.fury_times() - 1.6).abs() < 1e-12);
    room.clock = woke + FURY_FROM + FURY_EVERY * 1000;
    assert!((room.fury_times() - FURY_MOST).abs() < 1e-12, "three times at the most");
    assert_eq!(room.encounter_seen().expect("seen").fury, 20);
    let swing = Blow { striker: player, ..blow };
    assert_eq!(room.modded_blow(&swing, boss), 1.0, "a player's blow is not the Boss's company's");
}

#[test]
fn a_fallen_boss_never_stands_again_in_its_run() {
    let (mut room, player, boss) = court();
    let found = room.foes.get_mut(&boss).expect("standing");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    room.tick();
    assert!(room.boss().is_none(), "fallen");
    // No player near its post, as a company farming the other rooms leaves it.
    room.leave(player);
    ticks(&mut room, crate::garrison::GREAT_STAND_AGAIN + 60);
    let standing = &room.garrison[0].standing;
    assert!(standing.iter().all(|id| room.foes.get(id).is_none_or(|foe| foe.fighter.dead())), "never again");
}

#[test]
fn the_reckoning_reaches_only_the_courts_room() {
    let (mut room, player, boss) = court();
    let elsewhere = hardy(&mut room);
    let most = room.foes[&boss].fighter.health_max;
    strike(&mut room, player, boss, most);
    room.tick();
    stand_anchors(&mut room, player);
    strike(&mut room, player, boss, most);
    room.tick();
    let (_, at) = room.reckoning_seen().expect("shown at the second ward");
    let light = anchors(&room)[usize::from(at)];
    // A seal's room lies outside the Court, as the way in a player stands again at does.
    let away = room.encounters.as_ref().expect("encounters").plan.seals[0].pieces[0];
    let before = room.players[&elsewhere].fighter.health;
    for _ in 0..RECKONING_WARNING {
        put(&mut room, player, light);
        put(&mut room, elsewhere, away);
        room.tick();
    }
    assert_eq!(room.players[&elsewhere].fighter.health, before, "not reached outside the Court");
}
