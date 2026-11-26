//! The houses' hordes in a room, each road's own on a place a test lays: its waves standing as the player comes, each
//! coming at them, the next before the last is down, counted down to none and met; the player's Art unbounded while it
//! runs, theirs alone; its foes dropping nothing; and a death or a leave sending its waves away.

use super::horde::HORDE_NEXT_AT;
use super::*;
use crate::arts::Cast;
use crate::garrison::garrison_tests::run_baked;
use crate::quests::quests_tests::{counted, joined, living, node_room, on_goal, run, shoot_dead, stand_at};
use crate::steps::steps_tests::{met, step_of};
use gear::Character;
use gear::arts::EARNED_ART;
use gear::quests::{Defend, GoalKind};

/// A road's horde, by its house's number.
fn horde_of(faction: u8) -> ([usize; 3], &'static Defend) {
    let (key, goal) = step_of(GoalKind::Defend, |goal| matches!(goal, Goal::Defend(defend) if defend.horde));
    let quests = &gear::quests::quests().quests;
    let found = quests.iter().position(|quest| quest.faction == faction).expect("its road");
    let ([quest, task, at], goal) = if key[0] == found {
        (key, goal)
    } else {
        let task = quests[found]
            .tasks
            .iter()
            .position(|task| task.goals.iter().any(|goal| matches!(&goal.goal, Goal::Defend(defend) if defend.horde)));
        let task = task.expect("a horde on its road");
        ([found, task, 0], &quests[found].tasks[task].goals[0])
    };
    let Goal::Defend(defend) = &goal.goal else { unreachable!("a horde") };
    ([quest, task, at], defend)
}

/// A character on a horde's task wearing the house's Art, its Anima and Tenets not yet earned, as its road leaves it.
fn on_horde(key: [usize; 3]) -> Character {
    let mut character = on_goal(key);
    let faction = gear::quests::quests().quests[key[0]].faction;
    let art = gear::factions::factions().faction(faction).expect("its house").art;
    let earned = character.arts.earned.get_or_insert_with(Vec::new);
    earned.resize(3, 0);
    earned[usize::from(art) - 1] = EARNED_ART;
    character.arts.worn = art;
    character
}

/// The file's horde of a house, a room of its node with its place at the middle, and a player on it at a point.
fn horde(faction: u8, at: [f64; 2]) -> (Room, PlayerId, [usize; 3], &'static Defend) {
    let (key, defend) = horde_of(faction);
    let mut room = node_room(&defend.node, &[(defend.place.as_str(), [0.0, 0.0], 60.0)]);
    let player = joined(&mut room, &on_horde(key), at);
    (room, player, key, defend)
}

/// The foes standing in a player's horde.
fn standing(room: &Room, player: PlayerId) -> Vec<FighterId> {
    let Some(Step { kind: Stepping::Horde(horde), .. }) = room.quests.steps.get(&player) else { return Vec::new() };
    horde.standing.clone()
}

/// The horde's foes, all its waves'.
fn total(defend: &Defend) -> u16 {
    u16::try_from(defend.waves.iter().map(Vec::len).sum::<usize>()).unwrap_or(0)
}

fn shares(room: &Room, player: PlayerId) -> [f64; 3] {
    let casting = room.player(player).expect("in").casting;
    [casting.anima, casting.tenets[0], casting.tenets[1]]
}

/// Asks a cast of the worn Art's ability and runs the room past its release: whether the room took it.
fn cast(room: &mut Room, player: PlayerId, ability: u8) -> bool {
    let art = room.player(player).expect("in").character.arts.worn;
    room.ask_cast(player, Some(Cast { spell: (art - 1) * 3 + ability + 1, aim: None }));
    let taken = room.player(player).expect("in").casting.releasing.is_some();
    run(room, 20);
    taken
}

fn emptied(room: &mut Room, player: PlayerId) {
    room.players.get_mut(&player).expect("in").casting.anima = 0.0;
    room.players.get_mut(&player).expect("in").casting.tenets = [0.0; 2];
}

fn set_action(room: &mut Room, player: PlayerId, action: combat::Action) {
    room.players.get_mut(&player).expect("in").fighter.action = action;
}

#[test]
fn every_houses_horde_stands_as_the_player_comes_counts_down_as_it_falls_and_meets_its_goal() {
    for faction in 1..=3 {
        let (mut room, player, key, defend) = horde(faction, [0.0, 100.0]);
        run(&mut room, 2);
        assert!(room.foes.is_empty() && room.step_seen(player).horde.is_empty(), "past its reach, nothing stands");
        assert!(!room.unbounded(player), "nor is the Art unbounded");
        stand_at(&mut room, player, [0.0, 10.0]);
        run_baked(&mut room, 1);
        let all = total(defend);
        assert_eq!(room.step_seen(player).horde, [all, all], "its foes left and all of them");
        assert!(room.unbounded(player), "{faction}: the Art unbounded as it runs");
        let mut left = all;
        let mut rounds = 0;
        while !met(&room, player, key) && rounds < 20 {
            let foes = standing(&room, player);
            assert!(!foes.is_empty() && foes.len() <= 2 * gear::quests::HORDE_WAVE_MOST, "a wave or two standing");
            for id in &foes {
                assert_eq!(room.foes[id].brain.target(), Some(player), "coming at the player");
                assert!(room.quests.spoilless.contains(id), "a horde's foes drop nothing");
                let body = room.foes[id].fighter.body;
                assert!(libm::hypot(body.x, body.y) < 30.0, "round its place");
            }
            let drops = room.drops.len();
            for id in &foes {
                shoot_dead(&mut room, player, *id);
            }
            assert_eq!(room.drops.len(), drops, "nor did they");
            run(&mut room, 1);
            left -= u16::try_from(foes.len()).unwrap_or(0);
            if !met(&room, player, key) {
                assert_eq!(room.step_seen(player).horde, [left, all], "counted down");
            }
            rounds += 1;
        }
        assert!(met(&room, player, key), "{faction}: the last wave fallen, the horde is beaten");
        let ended = !room.unbounded(player) && room.step_seen(player).horde.is_empty();
        assert!(ended, "{faction}: bound again on the tick it falls, so that tick's word shows no power");
        run(&mut room, 1);
        assert!(!room.unbounded(player) && room.step_seen(player).horde.is_empty(), "and the Art bound again");
    }
}

#[test]
fn the_next_wave_stands_once_the_one_before_is_down_to_two() {
    let (mut room, player, _, defend) = horde(1, [0.0, 10.0]);
    run_baked(&mut room, 1);
    let first = standing(&room, player);
    assert_eq!(first.len(), defend.waves[0].len());
    for id in &first[..first.len() - HORDE_NEXT_AT - 1] {
        shoot_dead(&mut room, player, *id);
    }
    run(&mut room, 1);
    assert_eq!(standing(&room, player).len(), HORDE_NEXT_AT + 1, "three left: no other yet");
    shoot_dead(&mut room, player, first[first.len() - HORDE_NEXT_AT - 1]);
    run(&mut room, 1);
    assert_eq!(standing(&room, player).len(), HORDE_NEXT_AT + defend.waves[1].len(), "two left: the next comes");
}

#[test]
fn while_a_horde_runs_its_players_art_is_whole_and_never_spent_and_no_one_elses() {
    let (mut room, player, key, _) = horde(1, [0.0, 10.0]);
    let other = joined(&mut room, &on_horde(key), [0.0, 150.0]);
    emptied(&mut room, player);
    emptied(&mut room, other);
    run_baked(&mut room, 2);
    assert_eq!(shares(&room, player), [1.0; 3], "full at once");
    assert!(shares(&room, other)[0] < 1.0, "another player's is as it was");
    for ability in [0, 1, 2, 0, 0, 2] {
        assert!(cast(&mut room, player, ability), "ability {ability} cast, earned or not");
        assert_eq!(shares(&room, player), [1.0; 3], "and full again");
    }
    room.players.get_mut(&other).expect("in").casting.tenets = [1.0; 2];
    assert!(!cast(&mut room, other, 1), "another player's unearned Tenet is refused");
    let before = room.step_seen(player).horde.clone();
    assert!(!before.is_empty());
    for _ in 0..12 {
        let foes = standing(&room, player);
        for id in &foes {
            shoot_dead(&mut room, player, *id);
        }
        run(&mut room, 1);
    }
    assert!(met(&room, player, key));
    run(&mut room, 2);
    assert!(!room.unbounded(player), "bound again");
    assert!(!cast(&mut room, player, 1), "its unearned Tenet refused once more");
    assert!(cast(&mut room, player, 0));
    assert!(shares(&room, player)[0] < 0.01, "its Anima spent as any cast spends it");
}

#[test]
fn a_player_falling_in_a_horde_sends_its_waves_away_and_it_starts_again_10_s_on_from_the_first() {
    let (mut room, player, key, defend) = horde(2, [0.0, 10.0]);
    run_baked(&mut room, 1);
    let first = standing(&room, player)[0];
    shoot_dead(&mut room, player, first);
    set_action(&mut room, player, combat::Action::Dead { elapsed: 0 });
    run(&mut room, 1);
    let seen = room.step_seen(player);
    assert_eq!((seen.fails, (seen.clock * 10.0).round()), (counted(key, 1), 100.0), "a failure, 10 s to wait");
    assert!(living(&room).is_empty() && seen.horde.is_empty(), "its waves gone");
    assert!(!room.unbounded(player), "the Art bound while it waits");
    set_action(&mut room, player, combat::Action::Idle);
    stand_at(&mut room, player, [0.0, 10.0]);
    run(&mut room, 590);
    assert!(living(&room).is_empty(), "it waits");
    run(&mut room, 11);
    let all = total(defend);
    assert_eq!(room.step_seen(player).horde, [all, all], "from its first wave, whole");
    assert_eq!(standing(&room, player).len(), defend.waves[0].len());
}

#[test]
fn a_player_leaving_mid_horde_takes_its_waves_and_its_power_with_them() {
    let (mut room, player, _, _) = horde(3, [0.0, 10.0]);
    run_baked(&mut room, 1);
    assert!(!living(&room).is_empty() && room.unbounded(player));
    room.leave(player);
    run(&mut room, 1);
    assert!(living(&room).is_empty(), "its waves gone with them");
}

#[test]
fn a_horde_begun_with_no_wave_yet_standing_lends_no_power() {
    let (mut room, player, _, _) = horde(1, [0.0, 10.0]);
    run_baked(&mut room, 1);
    assert!(room.unbounded(player), "its first wave stood");
    // As a horde stands whose first wave waits for the room's cap on foes, or for its mesh.
    let Some(Step { kind: Stepping::Horde(horde), .. }) = room.quests.steps.get_mut(&player) else { panic!("a horde") };
    (horde.wave, horde.standing) = (0, Vec::new());
    assert!(!room.unbounded(player), "no foe to fight, no power to fight it with");
}
