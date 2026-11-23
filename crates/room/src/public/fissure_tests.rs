//! The Fissure: its foes drop shards where they fall, a player carries one at a time to the lip and sets it, the seal
//! closes it and shatters its foes; a shard fades, a carrier who falls drops theirs; its countdown run out, it fails
//! and its foes sink back; its growth broken in time turns it heroic and brings out the Warden.

use super::fissure::{
    GROWTH_TICKS, HEROIC_AT_PERCENT, SHARD_TICKS, SHARDS_FIRST, SHARDS_PER_PLAYER, WARDEN_NAME, WAVE_SOONEST,
};
use super::fixture::{
    FISSURE_AT, FISSURE_MINUTE, killed_by_a_foe, place, recovers_from_a_stagger, room_at, running, running_mut,
    standing, strike, ticks, told,
};
use super::{COUNTDOWN_TICKS, Heroic, Phase, Play};
use crate::{Dropped, EventKind, PlayerId, Room};
use combat::fighter::FighterId;

pub(super) fn fissure(room: &Room) -> &super::fissure::Fissure {
    let Play::Fissure(fissure) = &running(room).play else { panic!("a Fissure") };
    fissure
}

pub(super) fn fissure_mut(room: &mut Room) -> &mut super::fissure::Fissure {
    let Play::Fissure(fissure) = &mut running_mut(room).play else { panic!("a Fissure") };
    fissure
}

/// The event's foes standing but its growth and its Warden.
pub(super) fn lesser(room: &Room) -> Vec<FighterId> {
    let (growth, warden) = (fissure(room).growth, fissure(room).warden);
    standing(room).into_iter().filter(|id| Some(*id) != growth && Some(*id) != warden).collect()
}

/// A player fells one of the Fissure's lesser foes, walks onto the shard it dropped and carries it to the lip.
pub(super) fn seal_one(room: &mut Room, player: PlayerId) {
    // Off the lip, where the foes pour out, so the shard is not taken as it falls.
    place(room, player, [FISSURE_AT[0] + 20.0, FISSURE_AT[1]]);
    // A wave comes WAVE_SOONEST after the last at the soonest: wait for one if none stands.
    for _ in 0..60 * 60 {
        if !lesser(room).is_empty() {
            break;
        }
        room.tick();
    }
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

pub(super) fn chests(room: &Room, player: PlayerId) -> Vec<u8> {
    let tier = |drop: &crate::Drop| if let Dropped::Chest { tier, .. } = drop.what { Some(tier) } else { None };
    room.drops_for(player).filter_map(tier).collect()
}

#[test]
fn felled_foes_drop_shards_and_a_player_sealing_them_quickly_wins_the_bonus_chest_and_shatters_the_rest() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    let player = players[0];
    let blocks = room.blocks.len();
    room.tick();
    assert_eq!(told(&mut room, EventKind::PublicBegun).len(), 1);
    assert_eq!(fissure(&room).needed(), SHARDS_FIRST, "alone, sixteen");
    assert!(standing(&room).len() >= 3, "the first wave poured out");
    for _ in 0..SHARDS_FIRST {
        seal_one(&mut room, player);
    }
    assert_eq!(running(&room).phase, Phase::Won);
    assert!(running(&room).bonus, "sealed with more than half the countdown left");
    assert_eq!(chests(&room, player), [2], "a won chest with the bonus");
    assert!(standing(&room).is_empty(), "every foe of it shattered");
    assert_eq!(room.blocks.len(), blocks, "sealed, its spires gone");
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
    let set = fissure(&room).set;
    assert_eq!(u32::from(set), (u32::from(SHARDS_FIRST) * HEROIC_AT_PERCENT).div_ceil(100), "at 40 % of the needed");
    let growth = fissure(&room).growth.expect("the growth rose");
    assert_eq!(running(&room).heroic_ticks, GROWTH_TICKS);
    let before = room.foes[&growth].fighter.body;
    ticks(&mut room, 60);
    assert_eq!(room.foes[&growth].fighter.body.x, before.x, "it never moves");
    strike(&mut room, player, growth, 1.0e6);
    room.tick();
    assert_eq!(running(&room).heroic, Heroic::Met);
    assert_eq!(told(&mut room, EventKind::HeroicMet)[0].striker, player);
    assert_eq!(fissure(&room).needed(), SHARDS_FIRST + (SHARDS_FIRST - set) / 2, "half of what was still needed");
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
    room.tick();
    assert_eq!(lesser(&room).len(), 3, "the first wave");
    // One shard short of the growth: setting one fells a foe, so two lesser foes stand as it rises.
    let short = (u32::from(fissure(&room).needed()) * HEROIC_AT_PERCENT).div_ceil(100) - 1;
    fissure_mut(&mut room).set = u16::try_from(short).unwrap();
    seal_one(&mut room, players[0]);
    assert!(fissure(&room).growth.is_some(), "the growth stands");
    assert_eq!(lesser(&room).len(), 2);
    // The last wave now, and the room as long after it as a wave may follow at the soonest (the growth stands longer).
    let waves = fissure(&room).waves;
    fissure_mut(&mut room).last_wave = room.clock;
    room.clock += WAVE_SOONEST;
    room.tick();
    assert!(fissure(&room).growth.is_some(), "the growth still stands");
    // Counted with the growth, three would stand, and the wave would wait for WAVE_EVERY.
    assert_eq!(fissure(&room).waves, waves + 1, "two lesser foes and the growth standing: the next wave comes");
}

#[test]
fn sealed_with_half_the_countdown_left_keeps_the_bonus_though_the_warden_falls_later() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    let player = players[0];
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, player);
    }
    let growth = fissure(&room).growth.unwrap();
    strike(&mut room, player, growth, 1.0e6);
    room.tick();
    while fissure(&room).warden.is_none() {
        seal_one(&mut room, player);
    }
    assert!(running(&room).bonus, "sealed with more than half the countdown left");
    running_mut(&mut room).ticks_left = COUNTDOWN_TICKS / 2 - 10;
    ticks(&mut room, 20);
    let warden = fissure(&room).warden.unwrap();
    strike(&mut room, player, warden, 1.0e7);
    room.tick();
    assert_eq!(running(&room).phase, Phase::Won);
    assert_eq!(chests(&room, player), [4], "heroic, and the bonus earned when it sealed");
}

/// Where each of `kinds` first comes among the events told since the room was last asked.
fn told_order(room: &mut Room, kinds: [EventKind; 2]) -> [Option<usize>; 2] {
    let events = room.take_events();
    kinds.map(|kind| events.iter().position(|event| event.kind == kind))
}

#[test]
fn won_or_failed_with_the_growth_standing_tells_the_heroic_task_missed_before_the_result() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let needed = fissure(&room).needed();
    fissure_mut(&mut room).set = needed - 1;
    room.take_events();
    seal_one(&mut room, players[0]);
    assert_eq!(running(&room).phase, Phase::Won);
    let [missed, won] = told_order(&mut room, [EventKind::HeroicMissed, EventKind::PublicWon]);
    assert!(missed.is_some() && missed < won, "missed told before won: {missed:?} {won:?}");

    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    running_mut(&mut room).ticks_left = 1;
    room.take_events();
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    let [missed, failed] = told_order(&mut room, [EventKind::HeroicMissed, EventKind::PublicFailed]);
    assert!(missed.is_some() && missed < failed, "missed told before failed: {missed:?} {failed:?}");
}

#[test]
fn a_status_on_the_growth_wears_off_though_the_room_moves_it_itself() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let growth = fissure(&room).growth.unwrap();
    let foe = room.foes.get_mut(&growth).unwrap();
    foe.fighter = combat::status::give(&foe.fighter, combat::status::Status::Expose, 60, None).expect("exposed");
    ticks(&mut room, 61);
    assert!(!room.foes[&growth].fighter.statuses.has(combat::status::Status::Expose), "worn off");
}

#[test]
fn a_named_foe_gone_from_the_room_takes_its_name_with_it() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    let foe = lesser(&room)[0];
    room.names.insert(foe, WARDEN_NAME);
    strike(&mut room, players[0], foe, 1.0e6);
    ticks(&mut room, u64::from(combat::tuning::FOE_GONE) + 2);
    assert!(!room.foes.contains_key(&foe), "its body gone");
    assert!(!room.names.contains_key(&foe), "and its name");
}

#[test]
fn once_sealed_the_seal_holds_though_more_players_come_while_the_warden_stands() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 3);
    let player = players[0];
    for late in &players[1..] {
        place(&mut room, *late, [0.0, 150.0]);
    }
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, player);
    }
    let growth = fissure(&room).growth.unwrap();
    strike(&mut room, player, growth, 1.0e6);
    room.tick();
    while fissure(&room).warden.is_none() {
        seal_one(&mut room, player);
    }
    let needed = fissure(&room).needed();
    for (nth, late) in players[1..].iter().enumerate() {
        place(&mut room, *late, [FISSURE_AT[0] + 10.0 + nth as f64, FISSURE_AT[1]]);
    }
    running_mut(&mut room).ticks_left = COUNTDOWN_TICKS / 2 - 10;
    ticks(&mut room, 20);
    assert_eq!(fissure(&room).needed(), needed, "the seal needs no more once it is complete");
    let seen = room.public_seen().unwrap();
    assert_eq!((seen.progress, seen.needed), (needed, needed), "its progress stays full");
    assert!(running(&room).bonus, "the bonus earned when it sealed holds");
    assert!(fissure(&room).warden.is_some() && running(&room).phase == Phase::Running);
}

#[test]
fn on_harder_seas_the_growth_stands_at_the_events_raised_level_and_its_chest_is_of_that_level() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.public.as_mut().unwrap().level = 5;
    room.difficulty = gear::Difficulty::Abyss;
    let raised = gear::Difficulty::Abyss.raise(5);
    room.tick();
    assert!(lesser(&room).iter().all(|id| room.foes[id].level == raised), "its waves at the raised level");
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let growth = fissure(&room).growth.unwrap();
    assert_eq!(room.foes[&growth].level, raised, "the growth too");
    running_mut(&mut room).heroic = Heroic::Missed;
    while running(&room).phase == Phase::Running {
        seal_one(&mut room, players[0]);
    }
    let level = |drop: &crate::Drop| if let Dropped::Chest { level, .. } = drop.what { Some(level) } else { None };
    assert_eq!(room.drops_for(players[0]).filter_map(level).collect::<Vec<_>>(), [raised], "its chest too");
}

#[test]
fn the_growth_left_standing_sinks_for_as_long_as_the_page_sinks_it_before_it_is_gone() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let growth = fissure(&room).growth.unwrap();
    let state = |room: &Room| {
        let marks = room.public_seen().unwrap().marks;
        marks.iter().find(|mark| mark.kind == super::seen::GROWTH).map(|mark| mark.state)
    };
    assert_eq!(state(&room), Some(super::seen::RISING));
    ticks(&mut room, super::fissure::GROWTH_RISE);
    assert_eq!(state(&room), Some(super::seen::STANDING), "risen as the page raises it, 2.4 s");
    let left = running(&room).heroic_ticks;
    ticks(&mut room, left - super::fissure::GROWTH_SINK);
    assert_eq!(state(&room), Some(super::seen::SINKING));
    ticks(&mut room, super::fissure::GROWTH_SINK - 1);
    assert!(room.foes.contains_key(&growth), "still sinking");
    room.tick();
    assert!(!room.foes.contains_key(&growth), "gone once sunk, 3 s after it began");
}

#[test]
fn its_foes_fight_a_player_shooting_from_past_its_ground_without_giving_them_up() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    // Fifteen metres past the edge of its ground, as a player shoots into the fight from.
    let edge = super::fixture::grounds().fissure.unwrap().radius;
    place(&mut room, players[0], [FISSURE_AT[0] + edge + 15.0, FISSURE_AT[1]]);
    room.tick();
    let foes = lesser(&room);
    ticks(&mut room, 60);
    for foe in foes {
        let brain = &room.foes[&foe].brain;
        assert!(!brain.returning(), "{foe} gave up on them");
        assert_eq!(brain.target(), Some(players[0]), "{foe} hunts them");
    }
}

#[test]
fn a_player_who_leaves_and_comes_back_keeps_their_part_by_their_account() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 2);
    let (sealer, back) = (players[0], players[1]);
    let hardy = |room: &mut Room, player: PlayerId| {
        let fighter = &mut room.players.get_mut(&player).expect("the player").fighter;
        (fighter.health, fighter.health_max) = (1.0e9, 1.0e9);
    };
    let aside = [FISSURE_AT[0] - 25.0, FISSURE_AT[1]];
    let stint = u64::from(super::PRESENT_TICKS) / 2 + 1;
    assert!(room.own(back, "returning-account"));
    place(&mut room, back, aside);
    hardy(&mut room, back);
    place(&mut room, sealer, [0.0, 150.0]);
    ticks(&mut room, stint);
    room.leave(back);
    let again = room.join().expect("room to come back");
    assert!(room.own(again, "returning-account"));
    place(&mut room, again, aside);
    hardy(&mut room, again);
    ticks(&mut room, stint);
    let present = running(&room).parts[&super::Who::Account("returning-account".to_owned())].present;
    assert!(present >= super::PRESENT_TICKS, "both stints count as one part: {present}");
    place(&mut room, again, [0.0, 150.0]);
    while running(&room).phase == Phase::Running {
        seal_one(&mut room, sealer);
    }
    assert_eq!(chests(&room, again).len(), 1, "they took part");
}

#[test]
fn its_growth_and_warden_stand_more_health_for_more_players_at_it() {
    let great = |count: usize| {
        let (mut room, players) = room_at(FISSURE_MINUTE, count);
        for (nth, player) in players.iter().enumerate().skip(1) {
            place(&mut room, *player, [FISSURE_AT[0] - 20.0, FISSURE_AT[1] + nth as f64]);
            let fighter = &mut room.players.get_mut(player).unwrap().fighter;
            (fighter.health, fighter.health_max) = (1.0e9, 1.0e9);
        }
        room.tick();
        while running(&room).heroic == Heroic::NotYet {
            seal_one(&mut room, players[0]);
        }
        let growth = fissure(&room).growth.unwrap();
        let health = room.foes[&growth].fighter.health_max;
        strike(&mut room, players[0], growth, 1.0e9);
        room.tick();
        fissure_mut(&mut room).set = fissure(&room).needed() - 1;
        seal_one(&mut room, players[0]);
        let warden = fissure(&room).warden.expect("the Warden");
        (health, room.foes[&warden].fighter.health_max)
    };
    let (alone, three) = (great(1), great(3));
    assert!((three.0 / alone.0 - 2.0).abs() < 1e-9, "the growth: {alone:?} {three:?}");
    assert!((three.1 / alone.1 - 2.0).abs() < 1e-9, "the Warden: {alone:?} {three:?}");
}

#[test]
fn every_foe_that_pours_out_has_its_arrival_told_for_the_page_to_raise_it_out_of_the_crack() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    let spawned: Vec<FighterId> = told(&mut room, EventKind::Spawned).iter().map(|event| event.defender).collect();
    assert_eq!(spawned, running(&room).foes, "each of the first wave told as it stands");
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let growth = fissure(&room).growth.unwrap();
    let all: Vec<FighterId> = running(&room).foes.clone();
    let told_now: Vec<FighterId> = room
        .take_events()
        .iter()
        .filter(|event| event.kind == EventKind::Spawned)
        .map(|event| event.defender)
        .collect();
    assert!(told_now.contains(&growth), "the growth's rising told");
    assert!(all.iter().all(|id| spawned.contains(id) || told_now.contains(id)), "every foe of it told");
}

#[test]
fn its_spires_stand_as_tools_modules_draws_them_and_a_body_runs_into_them_while_it_stands_open() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = std::fs::read_to_string(root.join("content/modules/modules.json")).expect("the modules' manifest");
    let manifest: serde_json::Value = serde_json::from_str(&read).expect("it parses");
    let modules = manifest["modules"].as_array().expect("its modules");
    let fissure_module = modules.iter().find(|module| module["name"] == "lattice-fissure").expect("lattice-fissure");
    let parts: Vec<[f64; 6]> = serde_json::from_value(fissure_module["parts"].clone()).expect("its parts");
    assert_eq!(parts, super::fissure::SPIRES, "the room's spires are the module's parts");

    let (mut room, _) = room_at(FISSURE_MINUTE, 1);
    let before = room.blocks.len();
    room.tick();
    assert_eq!(room.blocks.len(), before + 4, "its spires stand");
    // Nothing passes through a spire, a body or a blow.
    let spire = super::fissure::SPIRES[2];
    let (at, mid) = ([FISSURE_AT[0] + spire[3], FISSURE_AT[1] + spire[1], 0.0], spire[5] / 2.0);
    assert!(!combat::sight::clear_line(
        &room.blocks,
        &room.floor,
        [at[0] + 2.0, at[1] + 0.2, mid],
        [at[0] - 2.0, at[1] + 0.2, mid]
    ));
    running_mut(&mut room).ticks_left = 1;
    room.tick();
    assert_eq!(room.blocks.len(), before, "failed, the fissure closing: its spires gone");
}

#[test]
fn a_part_taken_before_the_host_tells_a_players_account_is_kept_as_their_accounts() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    place(&mut room, players[0], [FISSURE_AT[0] - 25.0, FISSURE_AT[1]]);
    ticks(&mut room, 10);
    assert!(room.own(players[0], "late-told"));
    let parts = &running(&room).parts;
    assert!(!parts.contains_key(&super::Who::Player(players[0])));
    assert_eq!(parts[&super::Who::Account("late-told".to_owned())].present, 10);
}

#[test]
fn the_growth_staggered_comes_out_of_it_though_the_room_moves_it_itself() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let growth = fissure(&room).growth.unwrap();
    recovers_from_a_stagger(&mut room, growth);
}

#[test]
fn a_player_the_section_killed_raises_no_shards_gains_no_part_and_drops_the_shard_they_carried() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 2);
    // Both on the ground, apart, so the living one takes no shard the other drops.
    place(&mut room, players[0], [FISSURE_AT[0], FISSURE_AT[1] + 15.0]);
    place(&mut room, players[1], [FISSURE_AT[0], FISSURE_AT[1] + 10.0]);
    room.players.get_mut(&players[1]).unwrap().standing = crate::Standing::Dead { ticks: 0, fell: true };
    fissure_mut_or_begin(&mut room);
    fissure_mut(&mut room).carried.insert(players[1], [FISSURE_AT[0], FISSURE_AT[1] + 10.0, 0.0]);
    let shards = fissure(&room).shards.len();
    room.tick();
    assert_eq!(fissure(&room).players_most, 1, "one living player on the ground");
    assert_eq!(running(&room).parts.get(&room.who(players[1])).map_or(0, |part| part.present), 0, "no presence");
    assert!(!fissure(&room).carried.contains_key(&players[1]), "their shard dropped");
    assert_eq!(fissure(&room).shards.len(), shards + 1, "where they stood");
}

/// The room's first tick, which begins its Fissure.
fn fissure_mut_or_begin(room: &mut Room) {
    if room.public.as_ref().is_none_or(|public| public.running.is_none()) {
        room.tick();
    }
}

#[test]
fn a_player_back_while_its_result_shows_is_laid_the_chest_their_account_earned_and_only_once() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 2);
    assert!(room.own(players[1], "came-back"));
    room.tick();
    // A blow on one of its foes takes part.
    let foe = lesser(&room)[0];
    strike(&mut room, players[1], foe, 1.0);
    room.tick();
    room.part(players[1]);
    while running(&room).phase == Phase::Running {
        seal_one(&mut room, players[0]);
    }
    assert_eq!(running(&room).phase, Phase::Won);
    // Back with a new number, won while it had none: told its account, it is laid the chest the account earned.
    let back = room.join().expect("room to come back");
    room.tick();
    assert!(chests(&room, back).is_empty(), "no account told yet");
    assert!(room.own(back, "came-back"));
    assert_eq!(chests(&room, back), chests(&room, players[0]), "the chest the account earned");
    assert!(room.own(back, "came-back"));
    assert_eq!(chests(&room, back).len(), 1, "only once");
}

#[test]
fn a_player_chested_before_their_account_was_told_is_laid_no_second_chest_coming_back() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).phase == Phase::Running {
        seal_one(&mut room, players[0]);
    }
    assert_eq!(running(&room).phase, Phase::Won);
    assert_eq!(chests(&room, players[0]).len(), 1, "chested under their number");
    assert!(room.own(players[0], "told-late"));
    assert_eq!(chests(&room, players[0]).len(), 1, "the one chest, their account's now");
    room.leave(players[0]);
    let back = room.join().expect("room to come back");
    assert!(room.own(back, "told-late"));
    assert!(chests(&room, back).is_empty(), "their account's chest was laid already");
}

#[test]
fn the_growth_broken_by_no_player_leaves_the_heroic_task_to_them() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let growth = fissure(&room).growth.unwrap();
    let foe = lesser(&room)[0];
    killed_by_a_foe(&mut room, growth, foe);
    room.tick();
    assert_ne!(running(&room).heroic, Heroic::Met, "a foe met no task of the players'");
}

#[test]
fn failed_with_the_growth_standing_its_growth_is_gone_with_its_mark() {
    let (mut room, players) = room_at(FISSURE_MINUTE, 1);
    room.tick();
    while running(&room).heroic == Heroic::NotYet {
        seal_one(&mut room, players[0]);
    }
    let growth = fissure(&room).growth.unwrap();
    running_mut(&mut room).ticks_left = 1;
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    assert!(fissure(&room).growth.is_none() && !room.foes.contains_key(&growth), "gone, not slid into the crack");
    let marks = room.public_seen().unwrap().marks;
    assert!(marks.iter().all(|mark| mark.kind != super::seen::GROWTH), "no mark of it returns at its spot");
}
