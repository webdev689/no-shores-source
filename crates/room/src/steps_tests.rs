//! The roads' steps in a room, each the file's own goal on places a test lays: a way along the paths that join two
//! places, and a figure past its end; an escort walking while the player keeps up, held by its ambush, arriving and
//! staying; a tail noticing a player too near and starting again; an unseen step's watchers, and who counts as seeing;
//! and a race whose clock starts as the player leaves its first checkpoint, run late and in time.

use super::*;
use crate::quests::quests_tests::{
    counted, goal_where, joined, living, node_room, now, on_goal, run, shoot_dead, stand_at,
};
use gear::quests::{GoalKind, Place, quests};

fn place(name: &str, at: [f64; 2], radius: f64) -> Place {
    Place { name: name.to_owned(), at, radius }
}

/// The file's first step of a kind that `pick` takes: its quest, task and place in the task, and its goal.
pub(crate) fn step_of(kind: GoalKind, pick: impl Fn(&Goal) -> bool) -> ([usize; 3], &'static GoalDef) {
    goal_where(|_, goal| goal.kind() == kind && pick(&goal.goal))
}

/// Whether a player's step's goal is met: its count full, or its task done.
pub(crate) fn met(room: &Room, player: PlayerId, key: [usize; 3]) -> bool {
    let (on, counts) = now(room, player);
    on != Some((key[0], key[1])) || counts[key[2]] >= 1
}

/// A goal as long as the tests, changed from one of the file's.
pub(crate) fn changed(goal: &GoalDef, change: impl FnOnce(&mut Goal)) -> &'static GoalDef {
    let mut goal = goal.clone();
    change(&mut goal.goal);
    Box::leak(Box::new(goal))
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

#[test]
fn a_figure_past_its_ways_end_stands_at_its_end_facing_as_its_last_leg_does() {
    let way = [[0.0, 0.0], [10.0, 0.0], [10.0, 0.0]];
    assert_eq!(along_way(&way, 5.0).0, [5.0, 0.0]);
    let (at, facing) = along_way(&way, 50.0);
    assert_eq!(at, [10.0, 0.0], "at its end");
    assert!((facing - core::f64::consts::FRAC_PI_2).abs() < 1e-9, "facing east, as it walked: {facing}");
}

/// What a player is sent of their figure: its look, where it stands and its state.
fn figure(room: &Room, player: PlayerId) -> (u16, [f64; 2], u8) {
    let seen = room.step_seen(player).figures;
    assert_eq!(seen.len(), 6, "one figure");
    (seen[0] as u16, [seen[1], seen[2]], seen[5] as u8)
}

/// The player's figure's state, if they have one.
fn figure_or_none(room: &Room, player: PlayerId) -> Option<u8> {
    room.step_seen(player).figures.get(5).map(|state| *state as u8)
}

#[test]
fn an_escort_walks_while_the_player_keeps_within_its_reach_holds_for_its_ambush_arrives_and_stays() {
    let (key, goal) =
        step_of(GoalKind::Escort, |goal| matches!(goal, Goal::Escort(escort) if !escort.ambush.is_empty()));
    let Goal::Escort(escort) = &goal.goal else { unreachable!("an escort") };
    let places = [(escort.from.as_str(), [0.0, 100.0], 65.0), (escort.to.as_str(), [0.0, -100.0], 70.0)];
    let mut room = node_room(&escort.node, &places);
    let player = joined(&mut room, &on_goal(key), [0.0, 160.0]);
    run(&mut room, 2);
    let look = u16::try_from(gear::quests::speaker_place(&escort.who).expect("it speaks") + 1).unwrap_or(0);
    assert_eq!(figure(&room, player), (look, [0.0, 100.0], WAITING), "60 m off: it waits at its first place");
    assert_eq!(
        room.quest_at(player),
        Some([0.0, 100.0, escort.near]),
        "the mark on the figure, its reach the player's"
    );
    assert_eq!(room.quests.ways.len(), 1, "its way found once and kept");
    let (mut held, mut ambush) = (0, Vec::new());
    for _ in 0..6000 {
        if figure_or_none(&room, player).is_none_or(|state| state == ARRIVED) {
            break;
        }
        let (_, at, _) = figure(&room, player);
        stand_at(&mut room, player, [at[0], at[1] + 10.0]);
        let told = room.take_gear_change(player);
        run(&mut room, 1);
        if figure_or_none(&room, player) == Some(HELD) {
            held += 1;
            if ambush.is_empty() {
                ambush = living(&room);
                assert_eq!(
                    ambush.len(),
                    crate::quests::foes_of(escort.ambush.iter()).len(),
                    "its ambush stands halfway"
                );
                assert!(at[1] < 1.0 && at[1] > -1.0, "halfway: {at:?}");
                assert!(!told && room.take_gear_change(player), "the page is told it stands");
            }
            if held == 120 {
                for id in &ambush {
                    shoot_dead(&mut room, player, *id);
                }
            }
        }
    }
    assert!(held >= 120, "it held while its ambush stood");
    assert!(met(&room, player, key), "brought to its place: the goal met");
    if quests().quests[key[0]].tasks[key[1]].reward.art {
        let earned = room.player(player).expect("in").character.earned(quests().quests[key[0]].faction);
        assert_eq!(earned & gear::arts::EARNED_ART, gear::arts::EARNED_ART, "and the Art with it");
    }
    run(&mut room, 600);
    assert_eq!(figure(&room, player), (look, [0.0, -100.0], ARRIVED), "it stays where it arrived for its player");
    room.leave(player);
    assert!(room.quests.arrived.is_empty(), "and goes as they leave");
}

#[test]
fn an_escort_waits_while_the_player_is_past_its_reach() {
    let (key, goal) = step_of(GoalKind::Escort, |_| true);
    let Goal::Escort(escort) = &goal.goal else { unreachable!("an escort") };
    let places = [(escort.from.as_str(), [0.0, 100.0], 40.0), (escort.to.as_str(), [0.0, -100.0], 65.0)];
    let mut room = node_room(&escort.node, &places);
    let player = joined(&mut room, &on_goal(key), [0.0, 100.0 + escort.near * 0.6]);
    run(&mut room, 60);
    let (_, walked, state) = figure(&room, player);
    assert!(walked[1] < 99.0 && state == WALKING, "it walks with them near: {walked:?}");
    stand_at(&mut room, player, [0.0, 100.0 + escort.near * 3.0]);
    run(&mut room, 60);
    let (_, waited, state) = figure(&room, player);
    assert_eq!(state, WAITING);
    assert!((waited[1] - walked[1]).abs() < 4.0, "it waits for them: {waited:?}");
}

#[test]
fn a_tail_noticing_a_player_too_near_walks_back_and_starts_again_once_it_waited_and_is_back() {
    let (key, goal) = step_of(GoalKind::Tail, |goal| matches!(goal, Goal::Tail(tail) if tail.foe.is_some()));
    let Goal::Tail(tail) = &goal.goal else { unreachable!("a tail") };
    let places = [(tail.from.as_str(), [0.0, 100.0], 70.0), (tail.to.as_str(), [0.0, -100.0], 75.0)];
    let mut room = node_room(&tail.node, &places);
    let follow = (tail.far + tail.near) / 2.0;
    let player = joined(&mut room, &on_goal(key), [0.0, 100.0 + follow]);
    run(&mut room, 2);
    let roster = ::foes::ROSTER.iter().find(|foe| Some(foe.name) == tail.foe.as_deref()).expect("a roster type");
    let look = 100 + u16::from(roster.number);
    assert_eq!(figure(&room, player).0, look, "the type's look");
    for _ in 0..1200 {
        let (_, at, _) = figure(&room, player);
        stand_at(&mut room, player, [at[0], at[1] + follow]);
        run(&mut room, 1);
    }
    let (_, at, state) = figure(&room, player);
    assert_eq!(state, WALKING, "followed from {follow} m: {at:?}");
    stand_at(&mut room, player, [at[0], at[1] + tail.far / 2.0]);
    run(&mut room, 1);
    assert_eq!(figure(&room, player).2, NOTICED, "too near: it notices them");
    assert_eq!(room.step_seen(player).fails, counted(key, 1), "a failure, the tail's");
    let (clock, back) = (room.step_seen(player).clock, (100.0 - at[1]) / FIGURE_PACE);
    eprintln!("noticed {:.0} m along: {clock:.1} s to start again", 100.0 - at[1]);
    assert!(back > 10.0 && (clock - back).abs() < 0.1, "its walk back, longer than its wait: {clock:.1} s");
    stand_at(&mut room, player, [0.0, 190.0]);
    run(&mut room, (clock * 60.0) as u32 + 2);
    assert_eq!(figure(&room, player), (look, [0.0, 100.0], WAITING), "back where it began, waiting");
    for _ in 0..12_000 {
        if figure_or_none(&room, player).is_none_or(|state| state == ARRIVED) {
            break;
        }
        let (_, at, _) = figure(&room, player);
        stand_at(&mut room, player, [at[0], at[1] + follow]);
        run(&mut room, 1);
    }
    assert!(met(&room, player, key), "followed to its end, never too near");
}

#[test]
fn an_unseen_steps_watchers_stand_idle_and_only_a_foe_near_its_place_alert_on_the_player_sees_them() {
    let (key, goal) = step_of(GoalKind::Unseen, |_| true);
    let watched = changed(goal, |goal| {
        if let Goal::Unseen(unseen) = goal
            && unseen.spawn.is_empty()
        {
            unseen.spawn =
                [("Runner", "Minor"), ("Collector", "Minor")].map(|(foe, rank)| (foe.into(), rank.into())).to_vec();
        }
    });
    let Goal::Unseen(unseen) = &watched.goal else { unreachable!("an unseen step") };
    let mut room = node_room(&unseen.node, &[(unseen.place.as_str(), [0.0, 0.0], 60.0)]);
    let player = joined(&mut room, &on_goal(key), [0.0, 150.0]);
    let kind = Stepping::Unseen(Watched::default());
    room.quests.steps.insert(player, Step { key, goal: watched, fails: 0, kind });
    run(&mut room, 1);
    let watchers = living(&room);
    assert_eq!(watchers.len(), crate::quests::foes_of(unseen.spawn.iter()).len(), "its watchers stand as it begins");
    for id in &watchers {
        let foe = &room.foes[id];
        let (out, facing) = (libm::hypot(foe.fighter.body.x, foe.fighter.body.y), foe.fighter.aim);
        let outward = libm::atan2(foe.fighter.body.x, -foe.fighter.body.y);
        let off = libm::fabs(libm::remainder(facing - outward, core::f64::consts::TAU));
        assert!((out - unseen.within).abs() < 0.5 && off < 0.01, "on its ring facing out: {out:.1} m, {off:.2} off");
        assert_eq!(foe.brain.alertness(), ::foes::Alertness::Idle, "idle");
    }
    let far = room.stand_foe(::foes::foe_type(1).expect("a runner"), ::foes::Rank::Minor, [0.0, 140.0, 0.0], 0.0, None);
    let at = room.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y, fighter.body.z]);
    room.foes.get_mut(&far).expect("stood").brain.hunt(player, at.unwrap_or_default(), 1);
    run(&mut room, 2);
    assert_eq!(room.step_seen(player).fails, counted(key, 0), "alert 140 m from its place: not its watching");
    shoot_dead(&mut room, player, far);
    let body = room.foes[&watchers[0]].fighter.body;
    stand_at(&mut room, player, ahead([body.x, body.y], body.facing, 8.0));
    let mut ticks = 0;
    while room.step_seen(player).fails == counted(key, 0) && ticks < 600 {
        run(&mut room, 1);
        ticks += 1;
    }
    assert_eq!(room.step_seen(player).fails, counted(key, 1), "8 m before a watcher: seen in {ticks} ticks");
    stand_at(&mut room, player, [0.0, 0.0]);
    room.send_away(&watchers);
    run(&mut room, 300);
    assert!(!met(&room, player, key) && room.step_seen(player).clock > 0.0, "seen within 10 s: the wait runs");
    stand_at(&mut room, player, [0.0, unseen.within + 1.0]);
    run(&mut room, 400);
    assert!(!met(&room, player, key), "in its place, a metre past its middle's {} m", unseen.within);
    assert_eq!(room.quest_at(player), Some([0.0, 0.0, unseen.within]), "its mark the middle's");
    stand_at(&mut room, player, [0.0, unseen.within - 1.0]);
    run(&mut room, 1);
    assert!(met(&room, player, key), "unseen 10 s, at its middle");
}

#[test]
fn a_race_s_clock_starts_as_the_player_leaves_its_first_checkpoint_and_run_late_it_starts_again() {
    let (key, goal) = step_of(GoalKind::Race, |_| true);
    let Goal::Race(race) = &goal.goal else { unreachable!("a race") };
    let spots: Vec<[f64; 2]> = (0..race.checkpoints.len()).map(|at| [0.0, 150.0 - 150.0 * at as f64]).collect();
    let places: Vec<(&str, [f64; 2], f64)> =
        race.checkpoints.iter().zip(&spots).map(|(name, at)| (name.as_str(), *at, 40.0)).collect();
    let mut room = node_room(&race.node, &places);
    let player = joined(&mut room, &on_goal(key), [60.0, 190.0]);
    run(&mut room, 2);
    let mark = |at: [f64; 2]| Some([at[0], at[1], 40.0]);
    assert_eq!((room.step_seen(player).clock, room.quest_at(player)), (-1.0, mark(spots[0])), "the first first");
    stand_at(&mut room, player, spots[0]);
    run(&mut room, 600);
    assert_eq!((room.step_seen(player).clock, room.quest_at(player)), (-1.0, mark(spots[1])), "no clock while there");
    stand_at(&mut room, player, [0.0, 100.0]);
    run(&mut room, 1);
    assert!(room.step_seen(player).clock > race.seconds - 0.1, "the clock runs from leaving it");
    run(&mut room, (race.seconds * 60.0) as u32 + 1);
    let seen = room.step_seen(player);
    assert_eq!((seen.fails, seen.clock), (counted(key, 1), -1.0), "late: again from the first");
    for at in &spots {
        stand_at(&mut room, player, *at);
        run(&mut room, 1);
    }
    assert!(met(&room, player, key), "run in time");
}

/// Walks beside the player's escort until its ambush stands: the ambush's foes, none if it never stood.
fn walked_to_ambush(room: &mut Room, player: PlayerId) -> Vec<FighterId> {
    for _ in 0..6000 {
        if let Some(Step { kind: Stepping::Figure(Figure { ambush: Some(ambush), .. }), .. }) =
            room.quests.steps.get(&player)
            && !ambush.is_empty()
        {
            return ambush.clone();
        }
        let (_, at, _) = figure(room, player);
        stand_at(room, player, [at[0], at[1] + 10.0]);
        run(room, 1);
    }
    Vec::new()
}

#[test]
fn an_escorts_ambush_fought_before_a_rejoin_drops_nothing_again() {
    let (key, goal) =
        step_of(GoalKind::Escort, |goal| matches!(goal, Goal::Escort(escort) if !escort.ambush.is_empty()));
    let Goal::Escort(escort) = &goal.goal else { unreachable!("an escort") };
    let places = [(escort.from.as_str(), [0.0, 100.0], 65.0), (escort.to.as_str(), [0.0, -100.0], 70.0)];
    let mut room = node_room(&escort.node, &places);
    let player = joined(&mut room, &on_goal(key), [0.0, 110.0]);
    run(&mut room, 2);
    let first = walked_to_ambush(&mut room, player);
    assert!(!first.is_empty() && first.iter().all(|id| !room.quests.spoilless.contains(id)), "its ambush drops");
    for id in &first {
        shoot_dead(&mut room, player, *id);
    }
    let kept = gear::Character::from_json(&room.kept_character(player).expect("kept")).expect("a character");
    room.leave(player);
    run(&mut room, 2);
    let back = joined(&mut room, &kept, [0.0, 110.0]);
    run(&mut room, 2);
    let again = walked_to_ambush(&mut room, back);
    assert!(!again.is_empty() && again.iter().all(|id| room.quests.spoilless.contains(id)), "fought before: nothing");
}
