//! Foes in numbers fight as a group, not a rush: their blows at one target land a beat apart, the first held back by
//! the beat going first and a shot taking only a beat no blow waits for, and after each exchange of blows they give
//! their target a breath, in which none strikes or closes in; while one waits in reach the rest keep to the
//! ring; the waiting hold a line before their group's side, one foe at a time, a skirmisher before others, working
//! round to the flank; and only a foe in its place strikes a back turned to it. One foe alone fights at its own pace.

mod common;

use combat::FighterId;
use combat::fighter::Action;
use combat::sight::off;
use common::{ARCHER, BRUTE, CAPTAIN, Room, SKIRMISHER, SWORDSMAN, standing_still, still};
use core::f64::consts::{PI, TAU};
use foes::Board;
use foes::Director;
use foes::Rank::Major;
use foes::brain::Plan;
use foes::tuning::{BEAT, BREATH, EXCHANGE, LINE_ARC};

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
    // The beat at rest, more than a second: time for a person to answer one blow before the next.
    let beat = u64::from(combat::ticks(BEAT));
    assert!(beat > 60);
    let mut landed = 0;
    for seed in [2, 5, 9] {
        let foes = [(SWORDSMAN, -40.0), (BRUTE, 0.0), (SKIRMISHER, 40.0), (ARCHER, 150.0), (ARCHER, -150.0)];
        let mut room = group(seed, foes::director::REST, &foes);
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
    board.struck(9, 1, 100, 150);
    assert!(!board.may_strike(9, 2, 120, 72, 50, true), "too soon after foe 1's blow");
    assert!(!board.may_strike(9, 3, 150, 72, 50, true), "and for foe 3");
    assert!(!board.may_strike(9, 3, 180, 72, 51, true), "past the beat, foe 2 was held back first");
    assert!(board.may_strike(9, 2, 180, 72, 51, true), "so foe 2 goes first");
    board.struck(9, 2, 180, 150);
    assert!(board.may_strike(9, 2, 200, 72, 52, true), "its own blows never hold a foe back");
    assert!(!board.may_strike(9, 3, 260, 72, 53, true), "foe 2, asking still, keeps its place");
    assert!(board.may_strike(9, 3, 260, 72, 55, true), "one that stops asking loses it");
}

#[test]
fn after_an_exchange_no_foe_strikes_or_goes_in_until_a_breath_after_its_last_blow() {
    let (beat, breath) = (72, 150);
    let mut board = Board::default();
    board.struck(9, 1, 100, breath);
    board.struck(9, 2, 180, breath);
    assert!(board.go_in(9, 3, 190), "two blows in, foe 3 goes in");
    board.struck(9, 3, 260, breath);
    assert!(!board.go_in(9, 4, 270), "the exchange's third begun: no one goes in");
    assert!(!board.may_strike(9, 3, 420, beat, 405, true), "its own blow holds it back too");
    assert!(!board.may_strike(9, 4, 430, beat, 409, true), "none begins a blow till a breath after the third lands");
    assert!(board.may_strike(9, 4, 440, beat, 410, true), "a breath on, the next may");
    assert!(board.go_in(9, 4, 410), "and goes in");
}

#[test]
fn blows_each_a_breath_after_the_last_make_no_exchange() {
    let (beat, breath) = (72, 150);
    let mut board = Board::default();
    // A duel's pace: no breath after three blows each landing a breath or more after the one before.
    for lands in [100, 250, 400] {
        board.struck(9, 1, lands, breath);
    }
    assert!(board.go_in(9, 2, 401) && board.may_strike(9, 2, 480, beat, 401, true), "no breath at a duel's pace");
    // Two quick blows, a breath, then two more: the breath between starts the count again.
    board.struck(9, 2, 480, breath);
    board.struck(9, 1, 640, breath);
    board.struck(9, 2, 720, breath);
    assert!(board.may_strike(9, 1, 800, beat, 650, true), "two since the breath, the third may still come");
}

#[test]
fn one_foes_own_blows_make_no_exchange() {
    let (beat, breath) = (72, 150);
    let mut board = Board::default();
    for lands in [100, 180, 260, 340] {
        board.struck(9, 1, lands, breath);
    }
    assert!(board.go_in(9, 1, 341) && board.may_strike(9, 1, 400, beat, 341, true), "alone, it keeps its own pace");
    board.struck(9, 2, 420, breath);
    assert!(!board.go_in(9, 3, 421), "joined by another, the exchange closes and its target breathes");
}

#[test]
fn a_lone_player_meets_no_more_than_an_exchange_of_blows_without_a_breath() {
    let breath = u64::from(combat::ticks(BREATH));
    let mut exchanges = 0;
    for seed in [2, 5, 9] {
        let foes = [(SWORDSMAN, -40.0), (BRUTE, 0.0), (SKIRMISHER, 40.0), (ARCHER, 150.0), (ARCHER, -150.0)];
        let mut room = group(seed, foes::director::REST, &foes);
        room.run(1800, &mut still(0.0));
        let mut run = 1;
        for pair in landings(&room).windows(2) {
            run = if pair[1].0 < pair[0].0 + breath { run + 1 } else { 1 };
            assert!(run <= usize::from(EXCHANGE), "seed {seed}: {run} blows without a breath, to {pair:?}");
            exchanges += usize::from(run == usize::from(EXCHANGE));
        }
    }
    assert!(exchanges >= 3 * 5, "and they fight in exchanges: {exchanges} in three half-minutes");
}

#[test]
fn a_player_walking_off_in_a_breath_leaves_the_foes_behind() {
    let breath = u64::from(combat::ticks(BREATH));
    let melee = [10, 11, 12];
    let mut breaths: Vec<(f64, f64)> = Vec::new();
    for seed in [2, 5, 9] {
        let mut room = group(seed, foes::director::REST, &[(SWORDSMAN, -40.0), (BRUTE, 0.0), (SKIRMISHER, 40.0)]);
        let mut began: Option<f64> = None;
        let mut walking_off = |room: &Room, me: FighterId| {
            let nearest = melee.iter().min_by(|a, b| room.distance(me, **a).total_cmp(&room.distance(me, **b)));
            let (nearest, from) = nearest.map(|id| (room.distance(me, *id), room.toward(*id, me))).unwrap();
            let blows = landings(room);
            let last = blows.len().checked_sub(usize::from(EXCHANGE)).map(|first| &blows[first..]);
            // The exchange just closed: its blows each landed within a breath of the one before.
            let closed = last.is_some_and(|run| run.windows(2).all(|pair| pair[1].0 < pair[0].0 + breath));
            let breathing = closed && blows.last().is_some_and(|(at, _)| room.tick < at + breath);
            if breathing {
                began.get_or_insert(nearest);
                let mut intent = standing_still(from);
                intent.controls.forward = 1.0;
                return intent;
            }
            if let Some(start) = began.take() {
                breaths.push((start, nearest));
            }
            standing_still(from + PI)
        };
        room.run(1800, &mut walking_off);
    }
    assert!(breaths.len() >= 3 * 3, "breaths enough to judge: {}", breaths.len());
    for (start, end) in &breaths {
        assert!(end > &(start + 1.0), "walked off in a breath, it gains ground: from {start:.1} m to {end:.1} m");
    }
}

#[test]
fn a_shot_takes_only_a_beat_no_blow_waits_for() {
    let mut board = Board::default();
    board.struck(9, 1, 100, 150);
    assert!(!board.may_strike(9, 2, 150, 72, 60, true), "a swordsman waits in reach for the beat");
    assert!(!board.may_strike(9, 4, 190, 72, 61, false), "the shooter yields the beat to it");
    assert!(board.may_strike(9, 2, 180, 72, 61, true));
    board.struck(9, 2, 180, 150);
    assert!(board.may_strike(9, 4, 260, 72, 70, false), "with no one waiting, it looses into the next");
    assert!(board.may_strike(9, 2, 400, 72, 71, true), "and takes no place a blow would wait behind");
    assert!(board.go_in(9, 3, 80), "foe 3 goes in to strike next");
    assert!(!board.go_in(9, 5, 80), "and foe 5 keeps to the ring while it does");
    assert!(board.may_strike(9, 4, 500, 72, 81, false), "a shot is loosed while foe 3 is on its way");
}

#[test]
fn while_one_waits_in_reach_for_the_beat_the_others_keep_to_the_ring() {
    // Hot: three hold turns at once, and none of them stands in reach but the one about to strike.
    let mut room = group(4, 0.9, &[(SWORDSMAN, -30.0), (SWORDSMAN, -10.0), (SWORDSMAN, 10.0), (SWORDSMAN, 30.0)]);
    let (mut crowded, mut counted) = (0, 0);
    for tick in 0..1800 {
        room.director = Director { heat: 0.9 };
        room.step(&mut still(0.0));
        // In to fight, within reach, and not yet striking: waiting there for the beat.
        let near = (10..14)
            .filter(|id| room.brain(*id).plan() == Plan::Engage && room.distance(PLAYER, *id) <= 1.8 + 0.3)
            .filter(|id| matches!(room.fighter(*id).action, Action::Idle | Action::Guard { .. }))
            .count();
        counted += u32::from(tick >= 300);
        crowded += u32::from(tick >= 300 && near >= 2);
    }
    let share = f64::from(crowded) / f64::from(counted);
    assert!(share < 0.1, "two or more in to fight within reach on {share} of the ticks");
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

/// The narrowest arc round the player that holds every bearing of `bearings`.
fn arc_holding(bearings: &[f64]) -> f64 {
    let mut sorted = bearings.to_vec();
    sorted.sort_by(f64::total_cmp);
    let widest_gap = (0..sorted.len())
        .map(|index| {
            let next = sorted[(index + 1) % sorted.len()];
            (next - sorted[index]).rem_euclid(TAU)
        })
        .fold(0.0, f64::max);
    if sorted.len() < 2 { 0.0 } else { TAU - widest_gap }
}

#[test]
fn the_waiting_hold_a_line_before_their_group_s_side() {
    // Shield-bearers come from the player's right: those waiting stand in a line there, not round it.
    for seed in [1, 3] {
        let foes = [(SWORDSMAN, 70.0), (SWORDSMAN, 80.0), (SWORDSMAN, 90.0), (SWORDSMAN, 100.0), (SWORDSMAN, 110.0)];
        let mut room = group(seed, 0.1, &foes);
        let (mut lined, mut counted, mut side) = (0, 0, 0);
        for tick in 0..3600 {
            room.step(&mut still(0.0));
            let waiting: Vec<f64> = (10..15)
                .filter(|id| room.brain(*id).plan() == Plan::Wait && room.distance(PLAYER, *id) <= 6.5)
                .map(|id| room.toward(PLAYER, id))
                .collect();
            if tick < 600 || waiting.len() < 2 {
                continue;
            }
            counted += 1;
            lined += u32::from(arc_holding(&waiting) <= 2.0 * LINE_ARC + 0.2);
            let (east, south) = waiting
                .iter()
                .fold((0.0, 0.0), |(east, south), toward| (east + libm::sin(*toward), south - libm::cos(*toward)));
            side += u32::from(off(libm::atan2(east, -south), 90.0_f64.to_radians()) <= 60.0_f64.to_radians());
        }
        let share = |part: u32| f64::from(part) / f64::from(counted);
        assert!(counted > 600 && share(lined) > 0.95, "seed {seed}: the waiting in a line on {}", share(lined));
        assert!(share(side) > 0.9, "seed {seed}: on the group's side on {}", share(side));
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

/// Whether any foe goes in without a turn in its first two seconds, three swordsmen alert to a player facing
/// `facing`, at `places`.
fn goes_in_untaken(facing: f64, places: [[f64; 2]; 3]) -> bool {
    let mut room = Room::new(5).player(PLAYER, 0.0, 0.0, facing);
    for (id, [x, y]) in (10..).zip(places) {
        room = room.foe(id, SWORDSMAN, Major, x, y, 0.0).alert(id, PLAYER);
    }
    let mut untaken = false;
    for _ in 0..120 {
        room.step(&mut still(facing));
        untaken |= (10..13).any(|id| room.brain(id).plan() == Plan::Engage && !room.board.holds(PLAYER, id, false));
    }
    untaken
}

#[test]
fn only_a_foe_in_its_place_strikes_a_back_turned_to_it() {
    // The player faces a pair to its south; the third, 3.3 m to its north, is out of the line's place and waits.
    assert!(!goes_in_untaken(PI, [[-0.8, 5.0], [0.8, 5.0], [0.0, -3.3]]), "out of its place, it waits its turn");
    // All three to its north, the player's back turned on their line: one goes in without a turn.
    let north = [[-1.6, -5.0], [0.0, -5.0], [1.6, -3.3]];
    assert!(goes_in_untaken(PI, north), "a back turned on its line is open to it");
    assert!(!goes_in_untaken(0.0, north), "faced, they take their turns");
}

#[test]
fn one_foe_alone_fights_at_its_own_pace() {
    // A lone foe of each melee role at a still player, its whole fight's controls and buttons folded into one number:
    // no ally's blow, line or flank touches it.
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

const LONE_HASH: u64 = 0xded9_f2ed_7b4a_1dc3;

#[test]
fn a_foe_throws_no_blow_of_reach_at_a_target_walking_out_of_it() {
    // A brute in its turn after a player walking away: whatever it winds up still reaches where the player will be.
    let walking_away = |_: &Room, _: u32| combat::Intent {
        controls: movement::Controls { forward: 1.0, yaw: PI, ..movement::Controls::default() },
        ..combat::Intent::default()
    };
    for seed in 1..=6 {
        let room = Room::new(seed).player(PLAYER, 0.0, 0.0, PI).foe(10, BRUTE, Major, 0.0, -3.0, PI);
        let mut room = room.alert(10, PLAYER);
        room.run(900, &mut { walking_away });
        let reaching = room.orders(10).iter().filter(|(_, order)| order.shape != combat::shapes::Shape::Charge).count();
        assert_eq!(reaching, 0, "seed {seed}: a slam or a sweep wound up at a player walking out of it");
    }
}

#[test]
fn a_shooter_holds_its_draw_only_while_it_holds_its_turn() {
    // Two archers behind four foes hand to hand, in a cold fight with one ranged turn: the blows fill the beats, so a
    // drawn archer may wait past its turn's lease, and then the turn goes on and its shot with it.
    let foes = [(SWORDSMAN, -30.0), (BRUTE, -10.0), (SKIRMISHER, 10.0), (SWORDSMAN, 30.0), (ARCHER, 160.0)];
    let mut room = group(3, 0.1, &[&foes[..], &[(ARCHER, -160.0)]].concat());
    let mut drawn_without = 0;
    for _ in 0..3600 {
        room.step(&mut still(0.0));
        drawn_without += [14, 15]
            .into_iter()
            .filter(|id| matches!(room.fighter(*id).action, Action::Draw { .. }))
            .filter(|id| !room.board.holds(PLAYER, *id, true))
            .count();
    }
    assert_eq!(drawn_without, 0, "ticks an archer stood drawn without its turn");
}

#[test]
fn a_foe_with_no_shield_flanks_though_it_blocks_with_its_blade() {
    // The crew's captain guards with its sword alone; their swordsmen carry shields.
    let ids = [10, 11, 12];
    let foes = [(SWORDSMAN, -15.0), (CAPTAIN, 0.0), (SWORDSMAN, 15.0)];
    let mut room = group(6, 0.1, &foes);
    let samples = waiting_bearings(&mut room, &ids);
    let wide = |id: u32| samples.iter().filter(|(by, toward)| *by == id && off(*toward, 0.0) > LINE_ARC + 0.2).count();
    assert!(wide(11) > 300, "the captain stands out on the flank: {} samples", wide(11));
    assert!(wide(10) + wide(12) < wide(11) / 10, "the shields hold the line: {} samples off it", wide(10) + wide(12));
}

#[test]
fn a_foe_struck_from_idle_and_picked_to_rage_keeps_its_rage_as_it_thinks() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -6.0, PI);
    // A blow stirs it fully and gives it its target, though it has not yet thought itself alert.
    room.tell(10, foes::Seen::Struck { by: PLAYER, verdict: combat::Verdict::Hit { damage: 1.0, poise: 0.0 } });
    let tick = room.tick;
    room.brains[0].1.breaks(tick, true);
    room.run(1, &mut still(0.0));
    assert_eq!(room.brain(10).mood(room.tick), foes::Mood::Raging);
}
