//! The Grey Tithe's raid: banners planted and three waves from the approach; Collectors plunder the stores they stand
//! at; the last wave broken with a store standing wins it, every store plundered fails it, as does its countdown; the
//! tithe-taker walks his round and leaves unless he is killed, which brings a fourth wave led by Marrow.

use super::fixture::{RAID_MINUTE, place, room_at, running, running_mut, standing, strike, ticks, told};
use super::raid::{MARROW_NAME, PLUNDER_TICKS, WAVE_GAP};
use super::seen::{BANNER, PLUNDERED, STORE};
use super::{Heroic, Phase, Play};
use crate::{Dropped, EventKind, PlayerId, Room};
use ::foes::roster::{COLLECTOR, TITHE_TAKER};
use combat::fighter::FighterId;

fn raid(room: &Room) -> &super::raid::Raid {
    let Play::Raid(raid) = &running(room).play else { panic!("a raid") };
    raid
}

fn taker(room: &Room) -> Option<FighterId> {
    raid(room).taker.as_ref().map(|taker| taker.foe)
}

/// A player breaks the wave standing: fells each of its foes in turn, then waits out the gap to the next.
fn break_wave(room: &mut Room, player: PlayerId) {
    for foe in raid(room).wave_foes.clone() {
        if room.foes.get(&foe).is_some_and(|found| !found.fighter.dead()) {
            strike(room, player, foe, 1.0e7);
        }
    }
    room.tick();
    if running(room).phase == Phase::Running && raid(room).next_wave.is_some() {
        ticks(room, WAVE_GAP);
    }
}

fn chests(room: &Room, player: PlayerId) -> Vec<u8> {
    let tier = |drop: &crate::Drop| if let Dropped::Chest { tier, .. } = drop.what { Some(tier) } else { None };
    room.drops_for(player).filter_map(tier).collect()
}

#[test]
fn breaking_three_waves_with_every_store_whole_wins_the_bonus_chest_and_the_tithe_march_out() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    let seen = room.public_seen().unwrap();
    assert_eq!((seen.kind, seen.stage, seen.stages, seen.needed), (2, 1, 3, 1000));
    assert_eq!(seen.marks.iter().filter(|mark| mark.kind == BANNER).count(), 2, "the banners planted");
    let collectors = raid(&room).collectors.len();
    assert_eq!(collectors, 2, "the first wave's Collectors make for the stores");
    let mut came = None;
    // Every wave's foes felled as they come; the tithe-taker left be, and the raid waits for him to go.
    while running(&room).phase == Phase::Running {
        came = came.or(taker(&room));
        break_wave(&mut room, players[0]);
    }
    assert!(!room.foes.contains_key(&came.expect("he came")), "he left unharmed");
    assert_eq!(running(&room).phase, Phase::Won, "the Tithe give up");
    assert_eq!(running(&room).heroic, Heroic::Missed);
    assert_eq!(chests(&room, players[0]), [2], "won, no store lost");
    assert_eq!(told(&mut room, EventKind::PublicStage).len(), 2, "the second and third waves came");
}

#[test]
fn collectors_standing_at_the_stores_plunder_them_and_every_store_plundered_fails_the_raid() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [0.0, 150.0]);
    room.tick();
    let collectors: Vec<FighterId> = raid(&room).collectors.keys().copied().collect();
    for (nth, foe) in collectors.iter().enumerate() {
        assert_eq!(room.foes[foe].brain.foe_type.number, COLLECTOR);
        let store = raid(&room).stores[nth].0;
        let found = room.foes.get_mut(foe).unwrap();
        (found.fighter.body.x, found.fighter.body.y) = (store[0], store[1] - 1.5);
    }
    let raided = raid(&room).collectors[&collectors[0]];
    ticks(&mut room, PLUNDER_TICKS as u64 + 5);
    assert!(raid(&room).stores[raided].1 <= 0.0, "plundered in twenty seconds");
    assert!(!running(&room).bonus, "a store lost");
    assert!(!told(&mut room, EventKind::StorePlundered).is_empty());
    let marks = room.public_seen().unwrap().marks;
    assert!(marks.iter().any(|mark| mark.kind == STORE && mark.state == PLUNDERED));
    for (at, health) in &mut running_mut(&mut room).play_raid_mut().stores {
        let _ = at;
        *health = 0.0;
    }
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    assert!(chests(&room, players[0]).is_empty(), "failing leaves nothing");
}

#[test]
fn its_countdown_run_out_the_raid_fails_and_the_tithe_march_back_out() {
    let (mut room, _) = room_at(RAID_MINUTE, 1);
    room.tick();
    running_mut(&mut room).ticks_left = 1;
    room.tick();
    assert_eq!(running(&room).phase, Phase::Failed);
    ticks(&mut room, 8 * 60 + 1);
    assert!(standing(&room).is_empty(), "marched out");
}

#[test]
fn the_tithe_taker_killed_on_his_round_turns_it_heroic_and_marrow_must_be_broken_for_the_best_chest() {
    let (mut room, players) = room_at(RAID_MINUTE, 1);
    place(&mut room, players[0], [100.0, 0.0]);
    room.tick();
    break_wave(&mut room, players[0]);
    let found = taker(&room).expect("the tithe-taker came with the second wave");
    assert_eq!(room.foes[&found].brain.foe_type.number, TITHE_TAKER);
    assert_eq!(running(&room).heroic, Heroic::Offered);
    let from = room.foes[&found].fighter.body;
    ticks(&mut room, 120);
    let walked = room.foes[&found].fighter.body;
    assert!((walked.x - from.x).abs() + (walked.y - from.y).abs() > 1.0, "he walks his round");
    assert!(room.foes[&found].fighter.health == room.foes[&found].fighter.health_max, "fighting no one, hit by none");
    strike(&mut room, players[0], found, 1.0e7);
    room.tick();
    assert_eq!((running(&room).heroic, running(&room).stages), (Heroic::Met, 4));
    break_wave(&mut room, players[0]);
    assert_eq!(raid(&room).wave, 3);
    assert_eq!(raid(&room).wave_foes.len(), 7, "the third wave holds an Enforcer and a Marksman more");
    break_wave(&mut room, players[0]);
    assert_eq!(raid(&room).wave, 4);
    let marrow = raid(&room).wave_foes[0];
    assert_eq!(room.foes_seen().find(|foe| foe.foe == marrow).unwrap().name, MARROW_NAME);
    break_wave(&mut room, players[0]);
    assert_eq!(running(&room).phase, Phase::Won);
    assert_eq!(chests(&room, players[0]), [4]);
}

impl super::Running {
    fn play_raid_mut(&mut self) -> &mut super::raid::Raid {
        let Play::Raid(raid) = &mut self.play else { panic!("a raid") };
        raid
    }
}
