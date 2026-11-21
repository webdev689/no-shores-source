//! The Fissure: its foes drop shards where they fall, a player carries one at a time to the lip and sets it, the seal
//! closes it and shatters its foes; a shard fades, a carrier who falls drops theirs; its countdown run out, it fails
//! and its foes sink back; its growth broken in time turns it heroic and brings out the Warden.

use super::fissure::{GROWTH_TICKS, SHARD_TICKS, SHARDS_FIRST, SHARDS_PER_PLAYER, WARDEN_NAME};
use super::fixture::{FISSURE_AT, FISSURE_MINUTE, place, room_at, running, running_mut, standing, strike, ticks, told};
use super::{COUNTDOWN_TICKS, Heroic, Phase, Play};
use crate::{Dropped, EventKind, PlayerId, Room};
use combat::fighter::FighterId;

fn fissure(room: &Room) -> &super::fissure::Fissure {
    let Play::Fissure(fissure) = &running(room).play else { panic!("a Fissure") };
    fissure
}

/// The event's foes standing but its growth and its Warden.
fn lesser(room: &Room) -> Vec<FighterId> {
    let (growth, warden) = (fissure(room).growth, fissure(room).warden);
    standing(room).into_iter().filter(|id| Some(*id) != growth && Some(*id) != warden).collect()
}

/// A player fells one of the Fissure's lesser foes, walks onto the shard it dropped and carries it to the lip.
fn seal_one(room: &mut Room, player: PlayerId) {
    // Off the lip, where the foes pour out, so the shard is not taken as it falls.
    place(room, player, [FISSURE_AT[0] + 20.0, FISSURE_AT[1]]);
    let foe = lesser(room)[0];
    strike(room, player, foe, 1.0e6);
    room.tick();
    let shard = fissure(room).shards.last().expect("a shard dropped").at;
    place(room, player, [shard[0], shard[1]]);
    room.tick();
    assert!(fissure(room).carried.contains_key(&player), "taken");
    place(room, player, [FISSURE_AT[0] + 3.0, FISSURE_AT[1]]);
    room.tick();
}

fn chests(room: &Room, player: PlayerId) -> Vec<u8> {
    let tier = |drop: &crate::Drop| if let Dropped::Chest { tier, .. } = drop.what { Some(tier) } else { None };
    room.drops_for(player).filter_map(tier).collect()
}

#[test]
fn felled_foes_drop_shards_and_a_player_sealing_them_quickly_wins_the_bonus_chest_and_shatters_the_rest() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    let player = players[0];
    room.tick();
    assert_eq!(told(&mut room, EventKind::PublicBegun).len(), 1);
    assert_eq!(fissure(&room).needed(), SHARDS_FIRST, "alone, eight");
    assert!(standing(&room).len() >= 3, "the first wave poured out");
    for _ in 0..SHARDS_FIRST {
        seal_one(&mut room, player);
    }
    assert_eq!(running(&room).phase, Phase::Won);
    assert!(running(&room).bonus, "sealed with more than half the countdown left");
    assert_eq!(chests(&room, player), [2], "a won chest with the bonus");
    assert!(standing(&room).is_empty(), "every foe of it shattered");
    let events = room.take_events();
    assert_eq!(events.iter().filter(|event| event.kind == EventKind::ShardSet).count(), usize::from(SHARDS_FIRST));
    assert!(events.iter().any(|event| event.kind == EventKind::PublicWon));
    ticks(&mut room, super::RESULT_TICKS);
    assert!(room.public.as_ref().unwrap().running.is_none(), "the result shown its time");
    assert_eq!(room.public_seen().unwrap().kind, 0);
}

#[test]
fn an_elite_drops_two_shards_a_shard_fades_and_a_carrier_who_falls_drops_theirs() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 2);
    room.tick();
    let foe = lesser(&room)[0];
    room.foes.get_mut(&foe).unwrap().brain.rank = ::foes::Rank::Elite;
    strike(&mut room, players[0], foe, 1.0e6);
    room.tick();
    assert_eq!(fissure(&room).shards.len(), 2, "an Elite drops two");
    ticks(&mut room, SHARD_TICKS);
    assert!(fissure(&room).shards.is_empty(), "faded");
    seal_one(&mut room, players[0]);
    let foe = lesser(&room)[0];
    strike(&mut room, players[1], foe, 1.0e6);
    room.tick();
    let shard = fissure(&room).shards.last().unwrap().at;
    place(&mut room, players[1], [shard[0], shard[1]]);
    room.tick();
    assert!(fissure(&room).carried.contains_key(&players[1]));
    let fell = room.players.get_mut(&players[1]).unwrap();
    fell.fighter.health = 0.0;
    fell.fighter.action = combat::fighter::Action::Dead { elapsed: 0 };
    room.tick();
    assert!(fissure(&room).carried.is_empty() && fissure(&room).shards.len() == 1, "dropped where they fell");
    assert_eq!(fissure(&room).set, 1);
}

#[test]
fn more_players_need_more_shards_and_one_who_stood_by_too_briefly_gets_no_chest() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 3);
    for (nth, player) in players.iter().enumerate() {
        place(&mut room, *player, [FISSURE_AT[0] + nth as f64, FISSURE_AT[1] + 10.0]);
    }
    room.tick();
    assert_eq!(fissure(&room).needed(), SHARDS_FIRST + 2 * SHARDS_PER_PLAYER);
    place(&mut room, players[2], [0.0, 150.0]);
    let needed = fissure(&room).needed();
    for _ in 0..needed {
        seal_one(&mut room, players[0]);
        if running(&room).phase == Phase::Won {
            break;
        }
    }
    assert_eq!(running(&room).phase, Phase::Won);
    assert_eq!(chests(&room, players[0]).len(), 1, "they set the shards");
    assert!(chests(&room, players[2]).is_empty(), "stood by for a moment, struck nothing, set nothing");
}

#[test]
fn its_countdown_run_out_it_fails_its_foes_sink_back_into_the_crack_and_no_one_gets_a_chest() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    seal_one(&mut room, players[0]);
    running_mut(&mut room).ticks_left = 2;
    ticks(&mut room, 2);
    assert_eq!(running(&room).phase, Phase::Failed);
    assert!(!running(&room).bonus);
    assert!(told(&mut room, EventKind::PublicFailed).len() == 1 && chests(&room, players[0]).is_empty());
    let withdrawing = running(&room).withdrawing.len();
    assert!(withdrawing >= 1, "its foes withdraw");
    ticks(&mut room, 8 * 60 + 1);
    assert!(standing(&room).is_empty(), "gone into the crack");
    let seen = room.public_seen().unwrap();
    assert_eq!((seen.kind, seen.phase), (1, Phase::Failed as u8));
}

#[test]
fn the_growth_broken_in_time_turns_it_heroic_and_the_warden_must_fall_to_win_the_best_chest() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    let player = players[0];
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, player);
    }
    assert_eq!(fissure(&room).set * 100, 4 * 100, "at 40 % of eight, the fourth shard");
    let growth = fissure(&room).growth.expect("the growth rose");
    assert_eq!(running(&room).heroic_ticks, GROWTH_TICKS);
    let before = room.foes[&growth].fighter.body;
    ticks(&mut room, 60);
    assert_eq!(room.foes[&growth].fighter.body.x, before.x, "it never moves");
    strike(&mut room, player, growth, 1.0e6);
    room.tick();
    assert_eq!(running(&room).heroic, Heroic::Met);
    assert_eq!(told(&mut room, EventKind::HeroicMet)[0].striker, player);
    assert_eq!(fissure(&room).needed(), SHARDS_FIRST + (SHARDS_FIRST - 4) / 2, "half of what was still needed");
    while fissure(&room).warden.is_none() {
        seal_one(&mut room, player);
    }
    let warden = fissure(&room).warden.unwrap();
    assert_eq!(room.foes_seen().find(|foe| foe.foe == warden).unwrap().name, WARDEN_NAME);
    assert_eq!((running(&room).stage, running(&room).phase), (2, Phase::Running), "sealed, but the Warden stands");
    strike(&mut room, player, warden, 1.0e7);
    room.tick();
    assert_eq!(running(&room).phase, Phase::Won);
    assert_eq!(chests(&room, player), [4], "heroic, with the bonus");
    assert!(standing(&room).is_empty());
}

#[test]
fn the_growth_left_standing_sinks_back_and_the_heroic_task_is_missed_and_late_sealing_loses_the_bonus() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let growth = fissure(&room).growth.unwrap();
    ticks(&mut room, GROWTH_TICKS);
    assert_eq!(running(&room).heroic, Heroic::Missed);
    assert!(!room.foes.contains_key(&growth), "sunk back");
    running_mut(&mut room).ticks_left = COUNTDOWN_TICKS / 2 - 10;
    while running(&room).phase == Phase::Running {
        seal_one(&mut room, players[0]);
    }
    assert_eq!(chests(&room, players[0]), [1], "won, the bonus lost");
}

#[test]
fn the_growth_never_holds_back_a_wave_two_lesser_foes_left_beside_it_bring_the_next() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    let player = players[0];
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, player);
    }
    assert!(fissure(&room).growth.is_some(), "the growth stands");
    room.tick();
    let standing_lesser = lesser(&room);
    assert!(standing_lesser.len() > 2, "a wave stands to thin: {}", standing_lesser.len());
    let waves = fissure(&room).waves;
    for foe in &standing_lesser[2..] {
        strike(&mut room, player, *foe, 1.0e6);
    }
    room.tick();
    assert_eq!(fissure(&room).waves, waves + 1, "two lesser foes and the growth standing: the next wave comes");
}
