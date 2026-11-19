//! Foes spread across the players they fight: a group that found one player shares itself out once it sees another
//! with fewer at them, and holds its choice; a player who strikes a foe draws it; one player against a group fights as
//! it always did.

use super::*;
use crate::Input;
use ::foes::Rank;
use ::foes::roster::{COLLECTOR, ENFORCER, RUNNER};
use combat::sight::bearing;
use core::f64::consts::TAU;
use std::collections::BTreeMap;

const LANDING: [EventKind; 6] = [
    EventKind::Hit,
    EventKind::Blocked,
    EventKind::Parried,
    EventKind::GuardBroken,
    EventKind::Dodged,
    EventKind::PerfectDodge,
];

/// What a fight measured, per player in the order they joined: the foes fighting them, on average a tick past the
/// first 10 s, and the foes' blows that landed on them; how often a foe changed whom it fights, a foe-minute; and every
/// foe's fighter, tick by tick, folded into one number.
#[derive(Clone, Debug, Default)]
pub(crate) struct Spread {
    pub foes: Vec<f64>,
    pub landings: Vec<u32>,
    pub switches: f64,
    pub fingerprint: u64,
}

/// `players` players kept whole, standing still (and, `swinging`, swinging north each 40 ticks), the first at the
/// origin and each next `apart` m south of the one before (or, `apart` under 2 m, east of it, side by side), and
/// `count` Majors of three melee types on a ring 8 m round the first, facing it, for a minute.
pub(crate) fn spread(players: usize, count: usize, apart: f64, seed: u64, swinging: bool) -> Spread {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.world_seed ^= seed.wrapping_mul(0x9e37_79b9_7f4a_7c15);
    let side = apart < 2.0;
    room.spawn_points = (0..players)
        .map(|index| {
            let along = apart * index as f64;
            if side { (along, 0.0) } else { (0.0, along) }
        })
        .collect();
    let ids: Vec<crate::PlayerId> = (0..players).map(|_| room.join().unwrap()).collect();
    let types = [COLLECTOR, RUNNER, ENFORCER];
    let foes: Vec<FighterId> = (0..count)
        .map(|index| {
            let turn = TAU * index as f64 / count as f64 + 0.3 + seed as f64;
            let at = [8.0 * libm::sin(turn), -8.0 * libm::cos(turn), 0.0];
            let found = ::foes::foe_type(types[index % types.len()]).unwrap();
            room.stand_foe(found, Rank::Major, at, bearing([at[0], at[1]], [0.0, 0.0]), None)
        })
        .collect();
    let (mut fought, mut landings) = (vec![0_u64; players], vec![0_u32; players]);
    let mut last: BTreeMap<FighterId, FighterId> = BTreeMap::new();
    let (mut switches, mut sequence, mut counted) = (0_u32, 0, 0_u64);
    let mut fingerprint: u64 = 0xcbf2_9ce4_8422_2325;
    for tick in 0..3600 {
        sequence += 1;
        let mut intent = combat::Intent::default();
        if swinging && tick % 40 == 39 {
            intent.combat.attack = Some(combat::Stroke::Down);
        }
        for player in &ids {
            room.input(*player, Input { sequence, intent, seen: room.clock(), ..Input::default() }).unwrap();
        }
        room.tick();
        for player in &ids {
            let fighter = &mut room.players.get_mut(player).unwrap().fighter;
            fighter.health = fighter.health_max;
        }
        for event in room.take_events() {
            let on = ids.iter().position(|id| *id == event.defender);
            if let Some(on) = on.filter(|_| LANDING.contains(&event.kind) && room.foes.contains_key(&event.striker)) {
                landings[on] += 1;
            }
        }
        for found in room.foes.values() {
            for number in found.fighter.to_floats() {
                fingerprint = (fingerprint ^ number.to_bits()).wrapping_mul(0x0000_0100_0000_01b3);
            }
        }
        for foe in &foes {
            let Some(whom) = room.foes.get(foe).and_then(|found| found.brain.fights()) else { continue };
            if last.insert(*foe, whom).is_some_and(|before| before != whom) {
                switches += 1;
            }
            if let Some(on) = ids.iter().position(|id| *id == whom).filter(|_| tick >= 600) {
                fought[on] += 1;
            }
        }
        counted += u64::from(tick >= 600);
    }
    Spread {
        foes: fought.iter().map(|ticks| *ticks as f64 / counted as f64).collect(),
        landings,
        switches: f64::from(switches) / count as f64,
        fingerprint,
    }
}

#[test]
#[ignore = "probe: prints the spread across players, foes and distances"]
fn probe_spread() {
    for players in [2, 3] {
        for count in [3, 6, 12] {
            for apart in [1.5, 5.0, 12.0, 25.0] {
                for seed in 0..2 {
                    let measured = spread(players, count, apart, seed, false);
                    let foes: Vec<String> = measured.foes.iter().map(|foes| format!("{foes:.1}")).collect();
                    println!(
                        "players {players} foes {count:2} apart {apart:4} seed {seed}: foes {} landings {:?} switches {:.2}",
                        foes.join("/"),
                        measured.landings,
                        measured.switches
                    );
                }
            }
        }
    }
}

#[test]
fn one_player_against_a_group_fights_as_it_always_did() {
    // Still and swinging, against three, six and twelve: every foe's fighter, tick by tick, folded into one number.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for count in [3, 6, 12] {
        for swinging in [false, true] {
            hash = (hash ^ spread(1, count, 0.0, 1, swinging).fingerprint).wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    assert_eq!(format!("{hash:016x}"), LONE_CROWD_HASH, "one player's fight against a group changed");
}

const LONE_CROWD_HASH: &str = "a6c3e6fb7c12173c";
