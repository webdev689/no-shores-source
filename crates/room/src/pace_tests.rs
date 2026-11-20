//! Shots keep the beat as blows do: a shot or an aimed shot at a target lands a beat or more after another foe's blow
//! there, and the next blow lands a beat after it, each counted from where its shot leaves to the body it strikes.

use super::*;
use crate::Input;
use ::foes::Rank;
use ::foes::roster::{COLLECTOR, CROSSBOWMAN, MARKSMAN};

const LANDING: [EventKind; 6] = [
    EventKind::Hit,
    EventKind::Blocked,
    EventKind::Parried,
    EventKind::GuardBroken,
    EventKind::Dodged,
    EventKind::PerfectDodge,
];

/// A still player kept whole for 40 s, a shooter `distance` m north of it and a swordsman 2.5 m south: the gaps
/// between landings on it by two different foes, each with the beat as it stood, and how many were shots.
fn gaps(shooter: u8, rank: Rank, distance: f64, seed: u64) -> (Vec<(u64, u64)>, usize) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.world_seed ^= seed.wrapping_mul(0x9e37_79b9_7f4a_7c15);
    let player = room.join().unwrap();
    let found = ::foes::foe_type(shooter).unwrap();
    room.stand_foe(found, rank, [0.0, -distance, 0.0], core::f64::consts::PI, None);
    room.stand_foe(::foes::foe_type(COLLECTOR).unwrap(), Rank::Major, [0.0, 2.5, 0.0], 0.0, None);
    let mut last: Option<(u64, FighterId)> = None;
    let (mut gaps, mut shots) = (Vec::new(), 0);
    for sequence in 1..=2400 {
        room.input(player, Input { sequence, seen: room.clock(), ..Input::default() }).unwrap();
        room.tick();
        let fighter = &mut room.players.get_mut(&player).unwrap().fighter;
        fighter.health = fighter.health_max;
        let beat = u64::from(combat::ticks(room.director.pressed().beat));
        for event in room.take_events() {
            if event.defender != player || !LANDING.contains(&event.kind) {
                continue;
            }
            shots += usize::from(event.how == Some(How::Shot));
            if let Some((tick, by)) = last
                && by != event.striker
            {
                gaps.push((event.tick - tick, beat));
            }
            last = Some((event.tick, event.striker));
        }
    }
    (gaps, shots)
}

#[test]
fn a_shot_lands_a_beat_after_another_foe_s_blow_and_the_next_blow_a_beat_after_it() {
    for (shooter, rank, distance) in [(CROSSBOWMAN, Rank::Major, 8.0), (CROSSBOWMAN, Rank::Major, 20.0)] {
        for seed in 0..3 {
            let (gaps, shots) = gaps(shooter, rank, distance, seed);
            assert!(shots >= 3, "seed {seed}, {distance} m: the shooter's shots land: {shots}");
            let short: Vec<_> = gaps.iter().filter(|(gap, beat)| gap < beat).collect();
            assert!(short.is_empty(), "seed {seed}, {distance} m: landings inside the beat {short:?}");
        }
    }
}

#[test]
fn an_aimed_shot_is_counted_to_where_it_lands_after_its_flight() {
    for distance in [12.0, 20.0] {
        for seed in 0..3 {
            let (gaps, shots) = gaps(MARKSMAN, Rank::Elite, distance, seed);
            assert!(shots >= 3, "seed {seed}, {distance} m: the marksman's shots land: {shots}");
            let short: Vec<_> = gaps.iter().filter(|(gap, beat)| gap < beat).collect();
            assert!(short.is_empty(), "seed {seed}, {distance} m: landings inside the beat {short:?}");
        }
    }
}
