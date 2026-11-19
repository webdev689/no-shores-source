//! Foes in numbers fight as a group, not a rush: their blows at one target land a beat apart, the first held back by
//! the beat going first and a shot taking only a beat no blow waits for; while one waits in reach the rest keep to the
//! ring; the waiting hold a line before their group's side, one foe at a time, a skirmisher before others, working
//! round to the flank; and only a foe in its place strikes a back turned to it. One foe alone fights as it did.

mod common;

use combat::fighter::Action;
use combat::sight::off;
use common::{BRUTE, CAPTAIN, Room, SKIRMISHER, SWORDSMAN, still};
use core::f64::consts::PI;
use foes::Board;
use foes::Director;
use foes::Rank::Major;
use foes::brain::Plan;
use foes::tuning::{BEAT, LINE_ARC};

const PLAYER: u32 = 1;

/// Foes of the types numbered, alert to a still player, each 6 m off at a bearing in degrees, numbered from 10.
fn group(seed: u64, heat: f64, foes: &[(u8, f64)]) -> Room {
    let mut room = Room::new(seed).player(PLAYER, 0.0, 0.0, 0.0);
    room.director = Director { heat };
    for (index, (number, degrees)) in foes.iter().enumerate() {
        let (id, turn) = (10 + u32::try_from(index).expect("a few foes"), degrees.to_radians());
        room = room.foe(id, *number, Major, 6.0 * libm::sin(turn), -6.0 * libm::cos(turn), turn + PI).alert(id, PLAYER);
    }
    room
}

/// The ticks the foes' blows landed on the player, each with its striker, in order.
fn landings(room: &Room) -> Vec<(u64, u32)> {
    room.verdicts.iter().filter(|(_, _, on, _)| *on == PLAYER).map(|(tick, by, _, _)| (*tick, *by)).collect()
}

#[test]
fn blows_from_several_foes_at_one_target_land_a_beat_apart() {
    let beat = u64::from(combat::ticks(BEAT));
    let mut landed = 0;
    for seed in [2, 5, 9] {
        let mut room = group(seed, foes::director::REST, &[(SWORDSMAN, -40.0), (BRUTE, 0.0), (SKIRMISHER, 40.0)]);
        room.run(1800, &mut still(0.0));
        let blows = landings(&room);
        for pair in blows.windows(2).filter(|pair| pair[0].1 != pair[1].1) {
            assert!(pair[1].0 >= pair[0].0 + beat, "seed {seed}: a beat between {pair:?}");
        }
        landed += blows.len();
    }
    assert!(landed >= 3 * 15, "and they keep striking: {landed} blows in three half-minutes");
}

#[test]
fn of_the_foes_the_beat_holds_back_the_first_held_goes_first() {
    let mut board = Board::default();
    board.struck(9, 1, 100);
    assert!(!board.may_strike(9, 2, 120, 72, 50, true), "too soon after foe 1's blow");
    assert!(!board.may_strike(9, 3, 180, 72, 51, true), "foe 2 was held back first");
    assert!(board.may_strike(9, 2, 180, 72, 52, true), "foe 2 goes first once the beat is past");
    board.struck(9, 2, 180);
    assert!(board.may_strike(9, 1, 300, 72, 120, true), "and its own blows never hold a foe back");
    assert!(!board.may_strike(9, 3, 260, 72, 121, true));
    assert!(!board.may_strike(9, 1, 300, 72, 123, true), "foe 3 held first now, while it asks");
    assert!(board.may_strike(9, 1, 300, 72, 125, true), "one that stops asking loses its place");
}

#[test]
fn a_shot_takes_only_a_beat_no_blow_waits_for() {
    let mut board = Board::default();
    board.struck(9, 1, 100);
    assert!(!board.may_strike(9, 2, 150, 72, 60, true), "a swordsman waits in reach for the beat");
    assert!(!board.may_strike(9, 4, 190, 72, 61, false), "the shooter yields the beat to it");
    assert!(board.may_strike(9, 2, 180, 72, 61, true));
    board.struck(9, 2, 180);
    assert!(board.may_strike(9, 4, 260, 72, 70, false), "with no one waiting, it looses into the next");
    assert!(board.may_strike(9, 2, 400, 72, 71, true), "and takes no place a blow would wait behind");
}

#[test]
fn while_one_waits_in_reach_for_the_beat_the_others_keep_to_the_ring() {
    // Hot: three hold turns at once, and none of them stands in reach but the one about to strike.
    let mut room = group(4, 0.9, &[(SWORDSMAN, -30.0), (SWORDSMAN, -10.0), (SWORDSMAN, 10.0), (SWORDSMAN, 30.0)]);
    let (mut crowded, mut counted) = (0, 0);
    for tick in 0..1800 {
        room.director = Director { heat: 0.9 };
        room.step(&mut still(0.0));
        let near = (10..14).filter(|id| room.distance(PLAYER, *id) <= 1.8 + 0.6).count();
        counted += u32::from(tick >= 300);
        crowded += u32::from(tick >= 300 && near >= 2);
    }
    let share = f64::from(crowded) / f64::from(counted);
    assert!(share < 0.15, "two or more within reach on {share} of the ticks");
}

/// The bearings from the player of the foes waiting their turn on the ring, sampled each tick past the first ten
/// seconds of a minute's fight, by id.
fn waiting_bearings(room: &mut Room, ids: &[u32]) -> Vec<(u32, f64)> {
    let mut samples = Vec::new();
    for tick in 0..3600 {
        room.step(&mut still(0.0));
        for id in ids.iter().copied().filter(|_| tick >= 600) {
            let waiting = room.brain(id).plan() == Plan::Wait && !matches!(room.fighter(id).action, Action::Attack(_));
            if waiting && room.distance(PLAYER, id) <= 6.5 {
                samples.push((id, room.toward(PLAYER, id)));
            }
        }
    }
    samples
}

#[test]
fn the_waiting_hold_a_line_before_their_group_s_side() {
    // Shield-bearers, come from the player's right: they hold a line there, not round its face or its back.
    for seed in [3, 8] {
        let ids = [10, 11, 12, 13, 14];
        let mut room = group(seed, 0.1, &[(SWORDSMAN, 70.0), (SWORDSMAN, 80.0), (SWORDSMAN, 90.0), (SWORDSMAN, 100.0), (SWORDSMAN, 110.0)]);
        let samples = waiting_bearings(&mut room, &ids);
        let side = 90.0_f64.to_radians();
        let held = samples.iter().filter(|(_, toward)| off(*toward, side) <= LINE_ARC + 0.2).count();
        let share = held as f64 / samples.len() as f64;
        assert!(samples.len() > 1000 && share > 0.95, "seed {seed}: {share} of the waiting in the line");
    }
}

#[test]
fn one_foe_at_a_time_a_skirmisher_first_works_round_to_the_flank() {
    let ids = [10, 11, 12, 13, 14];
    let foes = [(SWORDSMAN, -20.0), (SKIRMISHER, -10.0), (SWORDSMAN, 0.0), (SKIRMISHER, 10.0), (BRUTE, 20.0)];
    let mut room = group(6, 0.1, &foes);
    let samples = waiting_bearings(&mut room, &ids);
    let wide = |id: u32| samples.iter().filter(|(by, toward)| *by == id && off(*toward, 0.0) > LINE_ARC + 0.2).count();
    let skirmishers = wide(11) + wide(13);
    let others = wide(10) + wide(12) + wide(14);
    assert!(skirmishers > 600, "a skirmisher stands out on the flank: {skirmishers} samples");
    assert!(others * 10 < skirmishers, "the shields and the brute hold the line: {others} samples off it");
    // Never two out at once.
    let mut room = group(6, 0.1, &foes);
    for tick in 0..3600 {
        room.step(&mut still(0.0));
        let out = ids
            .iter()
            .filter(|id| room.brain(**id).plan() == Plan::Wait && room.distance(PLAYER, **id) <= 6.5)
            .filter(|id| off(room.toward(PLAYER, **id), 0.0) > LINE_ARC + 0.6)
            .count();
        assert!(tick < 600 || out <= 1, "tick {tick}: {out} out on the flank");
    }
}

/// Whether the foe numbered 12 goes in without a turn in its first two seconds, three swordsmen alert to a player
/// facing `facing`: two at `pair` and the third at `third`.
fn goes_in_untaken(facing: f64, pair: [[f64; 2]; 2], third: [f64; 2]) -> bool {
    let mut room = Room::new(5)
        .player(PLAYER, 0.0, 0.0, facing)
        .foe(10, SWORDSMAN, Major, pair[0][0], pair[0][1], 0.0)
        .foe(11, SWORDSMAN, Major, pair[1][0], pair[1][1], 0.0)
        .foe(12, SWORDSMAN, Major, third[0], third[1], 0.0)
        .alert(10, PLAYER)
        .alert(11, PLAYER)
        .alert(12, PLAYER);
    let mut untaken = false;
    for _ in 0..120 {
        room.step(&mut still(facing));
        untaken |= room.brain(12).plan() == Plan::Engage && !room.board.holds(PLAYER, 12, false);
    }
    untaken
}

#[test]
fn only_a_foe_in_its_place_strikes_a_back_turned_to_it() {
    // The pair at the player's south, the third 3.3 m to its north: the line is the pair's.
    let (pair, third) = ([[-0.8, 5.0], [0.8, 5.0]], [0.0, -3.3]);
    assert!(!goes_in_untaken(PI, pair, third), "faced away from by the player, the third, out of its place, waits");
    // All three to its north: the third is in the line, and the player's back is turned on it.
    let pair = [[-1.6, -5.0], [0.0, -5.0]];
    assert!(goes_in_untaken(PI, pair, [1.6, -3.3]), "a back turned on its line is open to it without a turn");
    assert!(!goes_in_untaken(0.0, pair, [1.6, -3.3]), "faced, it waits its turn");
}

#[test]
fn one_foe_alone_fights_as_it_always_did() {
    // A lone foe of each melee role at a still player, its whole fight's controls and buttons folded into one number:
    // the same as before foes fought as a group.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for number in [SKIRMISHER, SWORDSMAN, BRUTE, CAPTAIN] {
        let mut room = Room::new(7).player(PLAYER, 0.0, 0.0, 0.0).foe(10, number, Major, 0.0, -8.0, PI);
        room.run(1200, &mut still(0.0));
        for (tick, intent) in room.foe_intents(10) {
            let controls = intent.controls;
            let combat = intent.combat;
            let words = [
                tick,
                controls.forward.to_bits(),
                controls.sideways.to_bits(),
                controls.yaw.to_bits(),
                u64::from(controls.run),
                combat.attack.map_or(0, |stroke| stroke as u64),
                u64::from(combat.guard) | u64::from(combat.dodge) << 1,
                combat.telegraph.map_or(0, |order| u64::from(order.windup) << 8 | order.shape as u64),
            ];
            for word in words {
                hash = (hash ^ word).wrapping_mul(0x0000_0100_0000_01b3);
            }
        }
    }
    assert_eq!(hash, LONE_HASH, "a lone foe's fight changed: {hash:#018x}");
}

const LONE_HASH: u64 = 0;
