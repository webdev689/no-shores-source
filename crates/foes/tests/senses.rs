//! A foe's senses: it comes to know of a player by sight, sooner near and dead ahead than far or at the edge of its
//! sight, and by what it hears, a gun farther than a bow and anything through a block half as far, but never its own
//! side's noises; stirred, it turns and walks a few metres toward what stirred it, and with nothing more its awareness
//! bleeds back to nothing; alert, it fights and wakes its allies near it; a blow alerts it at once; out of sight, it
//! hunts, searches the last place it knew, and lets go.

mod common;

use combat::sight::{apart, bearing, off};
use combat::{Happening, Intent, Ranged, Stroke, Verdict};
use common::{ARCHER, Room, SWORDSMAN, standing_still, still};
use core::f64::consts::{FRAC_PI_2, PI};
use foes::Alertness::{Alert, Idle, Searching, Suspicious};
use foes::Rank::Major;
use foes::Seen;
use foes::noises::shot;
use movement::{Block, Controls};

const PLAYER: u32 = 1;
const COLLECTOR: u8 = 2;

/// Steps the room until the foe is alert, at most `ticks`: the ticks it took.
fn ticks_to_alert(room: &mut Room, foe: u32, ticks: u64, script: common::Script<'_>) -> Option<u64> {
    let start = room.tick;
    (0..ticks).find_map(|_| {
        room.step(script);
        (room.brain(foe).alertness() == Alert).then_some(room.tick - start)
    })
}

#[test]
fn a_foe_sees_a_player_across_open_ground_within_its_range_and_fights_once_alert() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, PI);
    room.step(&mut still(0.0));
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (None, Suspicious), "not at a glance");
    room.run(60, &mut still(0.0));
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (Some(PLAYER), Alert));
    let mut far = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -20.0, PI);
    far.run(300, &mut still(0.0));
    assert_eq!((far.brain(10).target(), far.brain(10).alertness()), (None, Idle), "20 m off, out of its range");
    let mut shooter = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, ARCHER, Major, 0.0, -30.0, PI);
    shooter.run(60, &mut still(0.0));
    assert_eq!(shooter.brain(10).target(), Some(PLAYER), "a shooter sees farther");
}

#[test]
fn a_foe_does_not_see_through_a_block() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, PI);
    room.blocks.push(Block { min_x: -3.0, min_y: -5.5, max_x: 3.0, max_y: -4.5, top: 3.0 });
    room.run(60, &mut still(0.0));
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (None, Idle));
    assert!(room.fighter(10).body.y < -9.9, "and stays where it stands");
}

#[test]
fn a_player_is_noticed_sooner_near_and_dead_ahead_than_far_or_at_the_edge_of_its_sight() {
    // The foe stands at the origin facing north; the player stands `distance` off, `turn` from its facing.
    let alert_in = |distance: f64, turn: f64| {
        let (x, y) = (distance * libm::sin(turn), -distance * libm::cos(turn));
        let mut room = Room::new(1).player(PLAYER, x, y, 0.0).foe(10, SWORDSMAN, Major, 0.0, 0.0, 0.0);
        ticks_to_alert(&mut room, 10, 600, &mut still(0.0)).expect("noticed")
    };
    let edge = 85_f64.to_radians();
    let (near, far) = (alert_in(4.0, 0.0), alert_in(12.0, 0.0));
    let (near_edge, far_edge) = (alert_in(4.0, edge), alert_in(12.0, edge));
    assert!(near < far && near < near_edge && far < far_edge, "near {near}, far {far}, {near_edge} and {far_edge}");
    // A player walking up from afar dead ahead: not noticed past the foe's range, noticed well before reaching it.
    let mut room = Room::new(1).player(PLAYER, 0.0, -25.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, 0.0, 0.0);
    let mut walking = |room: &Room, me: u32| {
        let forward = if room.distance(me, 10) > 1.5 { 1.0 } else { 0.0 };
        Intent { controls: Controls { forward, yaw: room.toward(me, 10), ..Controls::default() }, ..Intent::default() }
    };
    ticks_to_alert(&mut room, 10, 600, &mut walking).expect("noticed");
    let noticed = room.distance(PLAYER, 10);
    assert!((6.0..14.0).contains(&noticed), "noticed {noticed} m off");
}

#[test]
fn a_foe_facing_away_does_not_notice_a_player_behind_it_until_a_noise() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, 0.0);
    room.run(300, &mut still(0.0));
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (None, Idle), "the player stands behind it");
    let mut swing_once = |room: &Room, _: u32| {
        let mut intent = standing_still(0.0);
        intent.combat.attack = (room.tick == 300).then_some(Stroke::Down);
        intent
    };
    room.run(2, &mut swing_once);
    assert_eq!(room.brain(10).alertness(), Suspicious, "the swing heard 10 m off stirs it");
    room.run(120, &mut swing_once);
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (Some(PLAYER), Alert), "it turned and saw");
}

/// A foe 30 m north of a player, facing away, told of the player's gunshot after half a second: near enough to be
/// stirred by it, too far to see the player once it turns.
fn a_far_shot() -> Room {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -30.0, 0.0);
    room.run(30, &mut still(0.0));
    room.hear(shot(&room.fighter(PLAYER), Ranged::Pistolet));
    room.step(&mut still(0.0));
    room
}

#[test]
fn a_suspicious_foe_turns_and_walks_a_few_metres_toward_a_noise() {
    let mut room = a_far_shot();
    assert_eq!(room.brain(10).alertness(), Suspicious);
    room.run(120, &mut still(0.0));
    let foe = room.fighter(10);
    let walked = apart([0.0, -30.0], [foe.body.x, foe.body.y]);
    assert!((2.5..=3.5).contains(&walked) && foe.body.y > -30.0, "a few metres toward the noise: {walked}");
    let toward = bearing([foe.body.x, foe.body.y], [0.0, 0.0]);
    assert!(off(foe.aim, toward) < 0.1, "facing where it heard it: {} against {toward}", foe.aim);
    assert_eq!(room.brain(10).target(), None, "it never saw the player");
}

#[test]
fn with_nothing_stirring_awareness_bleeds_back_to_idle() {
    let mut room = a_far_shot();
    let stirred = room.brain(10).awareness();
    assert!((stirred - 2.0 * (1.0 - 30.0 / 40.0)).abs() < 1e-9, "a gunshot 30 m off: {stirred}");
    room.run(60, &mut still(0.0));
    assert!((stirred - room.brain(10).awareness() - 0.16).abs() < 1e-9, "0.16 a second");
    room.run(240, &mut still(0.0));
    assert_eq!((room.brain(10).alertness(), room.brain(10).awareness()), (Idle, 0.0));
}

/// How a foe facing away, `distance` north of a player, is stirred by a shot the player looses with `ranged`.
fn stirred_by(ranged: Ranged, distance: f64) -> foes::Alertness {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -distance, 0.0);
    room.hear(shot(&room.fighter(PLAYER), ranged));
    room.step(&mut still(0.0));
    room.brain(10).alertness()
}

#[test]
fn a_gunshot_carries_farther_than_a_bow() {
    for gun in [Ranged::Pistolet, Ranged::Thunderlock] {
        assert_eq!(stirred_by(gun, 15.0), Searching, "a gun 15 m off alerts it outright, to search where it was fired");
        assert_eq!(stirred_by(gun, 30.0), Suspicious);
        assert_eq!(stirred_by(gun, 45.0), Idle);
    }
    for bow in [Ranged::Bow, Ranged::Crossbow] {
        assert_eq!(stirred_by(bow, 5.0), Suspicious, "a bow only stirs it");
        assert_eq!(stirred_by(bow, 15.0), Idle, "and not 15 m off");
    }
}

#[test]
fn lost_from_sight_a_foe_hunts_then_searches_the_last_place_it_saw_and_lets_go() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -10.0, PI);
    room.blocks.push(Block { min_x: 10.0, min_y: -15.0, max_x: 12.0, max_y: 5.0, top: 4.0 });
    room.run(60, &mut still(0.0));
    assert_eq!(room.brain(10).target(), Some(PLAYER));
    room.set(PLAYER, |player| player.body.x = 20.0);
    room.run(200, &mut still(0.0));
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (Some(PLAYER), Alert), "still hunting");
    room.run(110, &mut still(0.0));
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (None, Searching), "five seconds unseen");
    let foe = room.fighter(10).body;
    assert!(foe.x.abs() < 1.4 && foe.y.abs() < 1.4, "at the place it last saw the player: {foe:?}");
    let facing = room.fighter(10).aim;
    let mut swept: f64 = 0.0;
    for _ in 0..140 {
        room.step(&mut still(0.0));
        swept = swept.max(off(facing, room.fighter(10).aim));
    }
    assert!(swept > 1.0 && room.brain(10).alertness() == Searching, "it looks about: {swept}");
    room.run(30, &mut still(0.0));
    let left = room.brain(10).awareness();
    assert_eq!(room.brain(10).alertness(), Suspicious, "then lets go");
    assert!(left > 0.4 && left < 1.0 - 0.16 * 2.6, "having bled since it began to look about: {left}");
    room.run(60 * 4, &mut still(0.0));
    assert_eq!((room.brain(10).alertness(), room.brain(10).awareness()), (Idle, 0.0), "and bleeds back to idle");
    let foe = room.fighter(10).body;
    assert!(foe.x.abs() < 1.4 && foe.y.abs() < 1.4, "where it searched: {foe:?}");
}

#[test]
fn a_blow_alerts_a_foe_at_once_to_its_striker_and_it_shouts() {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -1.5, 0.0);
    room.run(30, &mut still(0.0));
    assert_eq!(room.brain(10).alertness(), Idle, "the player stands at its back");
    room.tell(10, Seen::Struck { by: PLAYER, verdict: Verdict::Hit { damage: 5.0, poise: 0.0 } });
    room.step(&mut still(0.0));
    assert_eq!((room.brain(10).target(), room.brain(10).alertness()), (Some(PLAYER), Alert));
    assert_eq!(room.shouts, [(30, 10)]);
}

/// How a foe facing away, `distance` north of a player's gunshot, is stirred by it, with a wall between or none.
fn stirred_through(distance: f64, walled: bool) -> foes::Alertness {
    let mut room = Room::new(1).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Major, 0.0, -distance, 0.0);
    if walled {
        room.blocks = vec![Block { min_x: -5.0, min_y: -3.5, max_x: 5.0, max_y: -3.0, top: 2.5 }];
    }
    room.hear(shot(&room.fighter(PLAYER), Ranged::Pistolet));
    room.step(&mut still(0.0));
    room.brain(10).alertness()
}

#[test]
fn a_noise_through_a_block_carries_half_as_loud_and_half_as_far() {
    assert_eq!(stirred_through(15.0, false), Searching, "a gun 15 m off in the open alerts it");
    assert_eq!(stirred_through(15.0, true), Suspicious, "through a wall it only stirs it");
    assert_eq!(stirred_through(25.0, false), Suspicious, "25 m off in the open it stirs it");
    assert_eq!(stirred_through(25.0, true), Idle, "and through a wall reaches no farther than 20 m");
}

#[test]
fn an_alerted_foe_wakes_an_idle_ally_within_twelve_metres_and_not_one_at_twenty() {
    let mut room = Room::new(1)
        .player(PLAYER, 0.0, 0.0, 0.0)
        .foe(10, SWORDSMAN, Major, 0.0, -6.0, PI)
        .foe(11, SWORDSMAN, Major, 10.0, -6.0, FRAC_PI_2)
        .foe(12, SWORDSMAN, Major, -20.0, -6.0, -FRAC_PI_2);
    let shouted = ticks_to_alert(&mut room, 10, 120, &mut still(0.0)).expect("it sees the player");
    assert_eq!(room.shouts, [(shouted - 1, 10)], "once, as it turns alert");
    assert_eq!(room.brain(11).alertness(), Searching, "the ally 10 m off turns alert, toward the player");
    assert_eq!(room.brain(12).alertness(), Idle, "the ally 20 m off hears nothing");
    room.run(240, &mut still(0.0));
    assert_eq!(room.brain(11).target(), Some(PLAYER), "the woken ally found the player");
    assert_eq!((room.brain(12).target(), room.brain(12).alertness()), (None, Idle), "nor its allies' fight");
    assert_eq!(room.shouts.len(), 1, "a woken ally does not shout again");
}

/// A pirate archer, already alert, shooting at a player 20 m off, and a foe of the type numbered `number` 3.6 m behind
/// the archer, facing away: how alert that foe is each tick, until the archer's second shot, and the shots.
fn beside_an_archer(number: u8) -> (Vec<foes::Alertness>, usize) {
    let room = Room::new(2).player(PLAYER, 0.0, 0.0, 0.0).foe(10, ARCHER, Major, 0.0, -20.0, PI);
    let mut room = room.foe(11, number, Major, 3.0, -22.0, 0.0).alert(10, PLAYER);
    let mut alertness = Vec::new();
    let shots = |room: &Room| {
        let loosed =
            |(_, by, happening): &&(u64, u32, Happening)| *by == 10 && matches!(happening, Happening::Loosed(_));
        room.happenings.iter().filter(loosed).count()
    };
    while shots(&room) < 2 && room.tick < 1200 {
        room.step(&mut still(0.0));
        alertness.push(room.brain(11).alertness());
    }
    (alertness, shots(&room))
}

#[test]
fn a_foe_pays_no_heed_to_its_own_sides_noises() {
    let (pirate, shots) = beside_an_archer(SWORDSMAN);
    assert!(shots == 2 && pirate.iter().all(|alertness| *alertness == Idle), "a pirate beside a pirate's bow");
    let (tithe, _) = beside_an_archer(COLLECTOR);
    assert!(tithe.iter().any(|alertness| *alertness != Idle), "a Grey Tithe collector hears a pirate's bow");
}
