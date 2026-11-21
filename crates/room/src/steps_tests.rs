//! The roads' steps in a room: a way along the paths that join two places; an escort walking while the player keeps
//! up, held by its ambush, arriving; a tail noticing a player too near and starting again; a defence's ward and waves,
//! won and lost; a puzzle's points used in order and out of it; an unseen step seen and waited out; a race run late and
//! in time; and each one's mark and what its player is sent.

use super::*;
use crate::asks::{Asked, OUT_OF_REACH};
use crate::quests::quests_tests::{joined, living, node_room, now, on_road, run, shoot_dead, stand_at};
use gear::quests::Place;

fn place(name: &str, at: [f64; 2], radius: f64) -> Place {
    Place { name: name.to_owned(), at, radius }
}

#[test]
fn a_figure_walks_the_paths_that_join_two_places_and_straight_where_none_does() {
    let (from, to) = (place("A", [0.0, 0.0], 20.0), place("B", [100.0, 0.0], 20.0));
    let paths =
        vec![vec![[5.0, 5.0], [50.0, 40.0]], vec![[52.0, 41.0], [95.0, 4.0]], vec![[0.0, -90.0], [100.0, -90.0]]];
    let way = way_between(&paths, &from, &to);
    assert_eq!(
        way,
        [[0.0, 0.0], [5.0, 5.0], [50.0, 40.0], [52.0, 41.0], [95.0, 4.0], [100.0, 0.0]],
        "on and off at its ends"
    );
    assert!(way_length(&way) > 100.0);
    let far = vec![vec![[0.0, -90.0], [100.0, -90.0]]];
    assert_eq!(way_between(&far, &from, &to), [[0.0, 0.0], [100.0, 0.0]], "no path within either's reach");
}

/// What a player is sent of their figure: its look, where it stands and its state.
fn figure(room: &Room, player: PlayerId) -> (u16, [f64; 2], u8) {
    let seen = room.step_seen(player).figures;
    assert_eq!(seen.len(), 6, "one figure");
    (seen[0] as u16, [seen[1], seen[2]], seen[5] as u8)
}

#[test]
fn an_escort_walks_while_the_player_keeps_within_its_reach_holds_for_its_ambush_and_arrives() {
    let places = [("Drowned Men's Graves", [0.0, 100.0], 65.0), ("Moorend", [0.0, -100.0], 70.0)];
    let mut room = node_room("driftwood-moors", &places);
    let player = joined(&mut room, &on_road(2, 2), [0.0, 160.0]);
    run(&mut room, 2);
    let tobin = u16::try_from(gear::quests::speaker_place("tobin").expect("Tobin speaks") + 1).unwrap_or(0);
    assert_eq!(figure(&room, player), (tobin, [0.0, 100.0], WAITING), "60 m off: it waits at the graves");
    assert_eq!(room.quest_at(player), Some([0.0, 100.0, 15.0]), "the mark on the figure, its reach the player's");
    let (mut held, mut ambush) = (0, Vec::new());
    for _ in 0..6000 {
        if figure_or_none(&room, player).is_none_or(|state| state == ARRIVED) {
            break;
        }
        let (_, at, _) = figure(&room, player);
        stand_at(&mut room, player, [at[0], at[1] + 10.0]);
        run(&mut room, 1);
        if figure_or_none(&room, player) == Some(HELD) {
            held += 1;
            if ambush.is_empty() {
                ambush = living(&room);
                assert_eq!(ambush.len(), 3, "its ambush stands round it halfway");
                assert!(at[1] < 1.0 && at[1] > -1.0, "halfway: {at:?}");
            }
            if held == 120 {
                for id in &ambush {
                    shoot_dead(&mut room, player, *id);
                }
            }
        }
    }
    assert!(held >= 120, "it held while its ambush stood");
    assert_eq!(now(&room, player).0, Some((2, 3)), "Tobin brought to Moorend: the next task");
    let earned = room.player(player).expect("in").character.earned(2);
    assert_eq!(earned & gear::arts::EARNED_ART, gear::arts::EARNED_ART, "and the Art with it");
}

/// The player's figure's state, if they have one.
fn figure_or_none(room: &Room, player: PlayerId) -> Option<u8> {
    room.step_seen(player).figures.get(5).map(|state| *state as u8)
}

#[test]
fn an_escort_waits_while_the_player_is_past_its_reach() {
    let places = [("Vale Mouth", [0.0, 100.0], 40.0), ("Hollow Coven", [0.0, -100.0], 65.0)];
    let mut room = node_room("gullwing-vale", &places);
    let player = joined(&mut room, &on_road(3, 0), [0.0, 110.0]);
    run(&mut room, 60);
    let (_, walked, state) = figure(&room, player);
    assert!(walked[1] < 97.0 && state == WALKING, "it walks with them near: {walked:?}");
    stand_at(&mut room, player, [0.0, 140.0]);
    run(&mut room, 60);
    let (_, waited, state) = figure(&room, player);
    assert_eq!(state, WAITING);
    assert!((waited[1] - walked[1]).abs() < 4.0, "it waits for them: {waited:?}");
}

#[test]
fn a_tail_noticing_a_player_too_near_walks_back_and_starts_again_ten_seconds_on() {
    let places = [("Saltgrass", [0.0, 100.0], 70.0), ("Chalkpit Ruin", [0.0, -100.0], 75.0)];
    let mut room = node_room("saltgrass-downs", &places);
    let player = joined(&mut room, &on_road(3, 3), [0.0, 125.0]);
    run(&mut room, 2);
    let collector = 100 + u16::from(::foes::roster::COLLECTOR);
    assert_eq!(figure(&room, player).0, collector, "a Tithe collector's look");
    run(&mut room, 120);
    let (_, at, state) = figure(&room, player);
    assert_eq!(state, WALKING, "followed from 25 m: {at:?}");
    stand_at(&mut room, player, [at[0], at[1] + 5.0]);
    run(&mut room, 1);
    assert_eq!(figure(&room, player).2, NOTICED, "5 m: it notices them");
    assert_eq!(room.step_seen(player).fails, [0, 1], "a failure, the tail's");
    assert!(room.step_seen(player).clock > 9.0, "a wait to run");
    stand_at(&mut room, player, [0.0, 190.0]);
    run(&mut room, 600);
    assert_eq!(figure(&room, player), (collector, [0.0, 100.0], WAITING), "back where it began, waiting");
    for _ in 0..6000 {
        if figure_or_none(&room, player).is_none_or(|state| state == ARRIVED) {
            break;
        }
        let (_, at, _) = figure(&room, player);
        stand_at(&mut room, player, [at[0], at[1] + 20.0]);
        run(&mut room, 1);
    }
    assert_eq!(now(&room, player).1, [0, 1], "followed to the chalk, never too near: the cast waits");
}

#[test]
fn a_defences_ward_stands_with_its_first_wave_coming_at_it_and_the_last_wave_fallen_meets_it() {
    let mut room = node_room("saltgrass-downs", &[("The High Downs", [0.0, 0.0], 60.0)]);
    let player = joined(&mut room, &on_road(1, 2), [0.0, 100.0]);
    run(&mut room, 2);
    assert!(room.foes.is_empty() && room.step_seen(player).ward.is_empty(), "past its reach, nothing stands");
    stand_at(&mut room, player, [0.0, 20.0]);
    run(&mut room, 1);
    let ward = room.quests.wards.iter().next().copied().expect("its ward stands");
    assert!(room.foes_seen().all(|foe| foe.foe != ward), "in no snapshot");
    assert_eq!(room.step_seen(player).ward, [0.0, 0.0, 1.0], "sent its player whole");
    for wave in [3, 3] {
        let standing: Vec<FighterId> = living(&room).into_iter().filter(|id| *id != ward).collect();
        assert_eq!(standing.len(), wave, "a wave stands");
        for id in &standing {
            let body = room.foes[id].fighter.body;
            let out = libm::hypot(body.x, body.y);
            assert!((22.0..33.0).contains(&out), "25 to 30 m out: {out:.1}");
            assert_eq!(room.foes[id].brain.target(), Some(ward), "coming at the ward");
        }
        for id in &standing {
            shoot_dead(&mut room, player, *id);
        }
        run(&mut room, 1);
    }
    assert_eq!(now(&room, player).0, Some((1, 3)), "the glass held: the next task");
    assert!(room.quests.wards.is_empty() && !room.foes.contains_key(&ward), "its ward gone with it");
}

#[test]
fn a_ward_left_alone_lasts_a_while_and_falls_and_the_defence_is_tried_again_ten_seconds_on() {
    let mut room = node_room("saltgrass-downs", &[("The High Downs", [0.0, 0.0], 60.0)]);
    let player = joined(&mut room, &on_road(1, 2), [0.0, 20.0]);
    run(&mut room, 2);
    let ward = room.quests.wards.iter().next().copied().expect("its ward stands");
    stand_at(&mut room, player, [0.0, 150.0]);
    let mut ticks = 0;
    while room.quests.wards.contains(&ward) && ticks < 60 * 300 {
        run(&mut room, 1);
        ticks += 1;
    }
    assert!((60 * 30..60 * 300).contains(&ticks), "the first wave alone fells it in {} s", ticks / 60);
    assert_eq!(room.step_seen(player).fails, [1], "a failure");
    assert!(living(&room).is_empty(), "the waves leave");
    stand_at(&mut room, player, [0.0, 20.0]);
    run(&mut room, 590);
    assert!(room.quests.wards.is_empty(), "it waits");
    run(&mut room, 11);
    assert_eq!((room.quests.wards.len(), living(&room).len()), (1, 4), "tried again: a ward and its first wave");
}

#[test]
fn a_puzzles_points_are_used_in_their_order_a_wrong_one_puts_them_out_and_all_lit_meets_it() {
    let mut room = node_room("driftwood-moors", &[("Grey Point Light", [0.0, 0.0], 30.0)]);
    let player = joined(&mut room, &on_road(1, 8), [0.0, 20.0]);
    run(&mut room, 1);
    let points = room.step_seen(player).points;
    let at = |point: usize| [points[point * 3], points[point * 3 + 1]];
    for (point, wanted) in [[-10.0, 0.0], [0.0, -10.0], [10.0, 0.0], [0.0, 10.0]].into_iter().enumerate() {
        assert!(libm::hypot(at(point)[0] - wanted[0], at(point)[1] - wanted[1]) < 1.0, "the rods round the light");
    }
    let used = |room: &mut Room, point: u8| {
        stand_at(room, player, at(usize::from(point)));
        room.answer(player, Asked::UsePoint { point });
        room.player(player).expect("in").answer
    };
    assert_eq!(used(&mut room, 0), 0);
    assert_eq!(room.step_seen(player).points[2], 1.0, "the west rod lit");
    stand_at(&mut room, player, [0.0, 0.0]);
    room.answer(player, Asked::UsePoint { point: 1 });
    assert_eq!(room.player(player).expect("in").answer, OUT_OF_REACH, "10 m off");
    assert_eq!(used(&mut room, 2), 0, "the east rod, out of its turn");
    assert_eq!((room.step_seen(player).points[2], room.step_seen(player).fails[0]), (0.0, 1), "all put out");
    for point in 0..4 {
        assert_eq!(used(&mut room, point), 0);
    }
    assert_eq!(now(&room, player).0, Some((1, 9)), "the storm grounded: the next task");
}

#[test]
fn a_puzzles_point_where_a_box_stands_is_nudged_onto_ground_a_player_stands_on() {
    let mut room = node_room("driftwood-moors", &[("Grey Point Light", [0.0, 0.0], 30.0)]);
    room.blocks =
        vec![movement::Block { min_x: -2.0, min_y: -13.0, max_x: 2.0, max_y: -7.0, top: 3.0, bottom: 0.0 }].into();
    let player = joined(&mut room, &on_road(1, 8), [0.0, 20.0]);
    run(&mut room, 1);
    let points = room.step_seen(player).points;
    let north = [points[3], points[4]];
    let clear = !(-2.4..2.4).contains(&north[0]) || !(-13.4..-6.6).contains(&north[1]);
    assert!(clear && libm::hypot(north[0], north[1] + 10.0) < 6.0, "off the box, near where it was meant: {north:?}");
}

#[test]
fn an_unseen_step_counts_a_foe_turning_alert_and_is_met_once_none_has_been_for_ten_seconds() {
    let mut room = node_room("gullwing-vale", &[("Valeguard", [0.0, 0.0], 60.0)]);
    let player = joined(&mut room, &on_road(3, 2), [0.0, 150.0]);
    run(&mut room, 1);
    let watcher =
        room.stand_foe(::foes::foe_type(1).expect("a runner"), ::foes::Rank::Minor, [0.0, 140.0, 0.0], 0.0, None);
    let at = room.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y, fighter.body.z]);
    room.foes.get_mut(&watcher).expect("stood").brain.hunt(player, at.unwrap_or_default(), 1);
    run(&mut room, 2);
    assert_eq!(room.step_seen(player).fails, [1], "seen: a failure");
    shoot_dead(&mut room, player, watcher);
    stand_at(&mut room, player, [0.0, 0.0]);
    run(&mut room, 300);
    assert_eq!(now(&room, player).0, Some((3, 2)), "at Valeguard, seen within 10 s");
    assert!(room.step_seen(player).clock > 0.0, "the wait runs");
    run(&mut room, 400);
    assert_eq!(now(&room, player).0, Some((3, 3)), "unseen 10 s at Valeguard: the next task");
}

#[test]
fn a_race_run_late_starts_again_and_one_in_time_meets_it() {
    let places =
        [("Weir Mill", [0.0, 150.0], 48.0), ("Gullwing", [0.0, 0.0], 70.0), ("The Water Meadows", [0.0, -150.0], 65.0)];
    let mut room = node_room("gullwing-vale", &places);
    let player = joined(&mut room, &on_road(1, 4), [60.0, 190.0]);
    run(&mut room, 2);
    // The road's own clock, as the file gives it.
    let seconds = gear::quests::quests().quests[1].tasks[4].goals[0].seconds.expect("a race's seconds");
    assert_eq!(
        (room.step_seen(player).clock, room.quest_at(player)),
        (-1.0, Some([0.0, 150.0, 48.0])),
        "the mill first"
    );
    stand_at(&mut room, player, [0.0, 150.0]);
    run(&mut room, 1);
    assert!(room.step_seen(player).clock > seconds - 1.0, "the clock runs from the mill");
    stand_at(&mut room, player, [0.0, 0.0]);
    run(&mut room, 1);
    assert_eq!(room.quest_at(player), Some([0.0, -150.0, 65.0]), "the meadows next");
    run(&mut room, (seconds * 60.0) as u32);
    assert_eq!((room.step_seen(player).fails[0], room.step_seen(player).clock), (1, -1.0), "late: again from the mill");
    for at in [[0.0, 150.0], [0.0, 0.0], [0.0, -150.0]] {
        stand_at(&mut room, player, at);
        run(&mut room, 1);
    }
    assert_eq!(now(&room, player).1, [1, 0, 0], "the river road run in time; the riders and the cast wait");
}
