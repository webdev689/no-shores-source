//! Abyss's rules in a run's room: five revives its company shares, its fallen staying down once none is left; no wipe
//! in a room no one is in, nor once its cache stands open; and a wipe, when every player is down at once, starting
//! the run over with its five revives.

use crate::{Event, EventKind, PlayerId, Room, RunOf};
use combat::Action;

/// A Friday's 09:00 UTC: day 20,778, in week 2,968.
const FRIDAY_NINE: u64 = 29_919_420;

/// The Abyss run of a patrol's dungeon that is not the dungeon of the day, so it carries no modifier.
fn abyss_run() -> Room {
    let of = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 1 };
    Room::dungeon_run(&of, gear::Difficulty::Abyss, FRIDAY_NINE).expect("an Abyss run")
}

/// A player fallen long enough to stand again at the next tick, if the run lets them.
fn fallen(room: &mut Room, player: PlayerId) {
    let found = room.players.get_mut(&player).expect("in the room");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: combat::tuning::RESPAWN });
}

fn wiped(events: &[Event]) -> Vec<PlayerId> {
    events.iter().filter(|event| event.kind == EventKind::Wiped).map(|event| event.defender).collect()
}

#[test]
fn an_abyss_company_shares_five_revives_and_its_fallen_stay_down_once_none_is_left() {
    let mut room = abyss_run();
    let (first, _second) = (room.join().expect("in"), room.join().expect("in"));
    for left in (0..5).rev() {
        fallen(&mut room, first);
        room.tick();
        assert!(!room.players[&first].fighter.dead(), "stands again, {left} left");
        assert_eq!(room.revives(), Some(left));
    }
    fallen(&mut room, first);
    room.tick();
    assert!(room.players[&first].fighter.dead(), "none left: down");
    assert!(wiped(&room.take_events()).is_empty(), "one still stands");
    let of = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 1 };
    let mut elite = Room::dungeon_run(&of, gear::Difficulty::Elite, FRIDAY_NINE).expect("an Elite run");
    let alone = elite.join().expect("in");
    for _ in 0..6 {
        fallen(&mut elite, alone);
        elite.tick();
        assert!(!elite.players[&alone].fighter.dead(), "below Abyss the dead stand again as ever");
    }
    assert!(wiped(&elite.take_events()).is_empty());
    assert_eq!(elite.revives(), None);
}

#[test]
fn a_run_with_no_one_in_it_is_never_wiped_and_one_revive_stands_one_of_two_fallen_together() {
    let mut room = abyss_run();
    room.tick();
    assert!(wiped(&room.take_events()).is_empty(), "no one in: no wipe");
    let players = [room.join().expect("in"), room.join().expect("in"), room.join().expect("in")];
    room.run.as_mut().expect("a run").revives = Some(1);
    fallen(&mut room, players[0]);
    fallen(&mut room, players[1]);
    room.tick();
    let dead = players.map(|player| room.players[&player].fighter.dead());
    assert_eq!(dead, [false, true, false], "the first by number takes the last");
    assert_eq!(room.revives(), Some(0));
    for player in players {
        room.leave(player);
    }
    room.tick();
    assert!(wiped(&room.take_events()).is_empty(), "left empty: no wipe");
    assert_eq!(room.revives(), Some(0), "nor started over");
}

#[test]
fn when_every_player_is_down_at_once_the_run_starts_over_and_its_five_revives_with_it() {
    let mut room = abyss_run();
    let players = [room.join().expect("in"), room.join().expect("in")];
    let posted: usize = room.garrison.iter().map(|post| post.members.len()).sum();
    room.run.as_mut().expect("a run").revives = Some(2);
    for player in players {
        let found = room.players.get_mut(&player).expect("in");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
    assert_eq!(wiped(&room.take_events()), players, "each is told");
    assert_eq!(room.revives(), Some(5));
    assert_eq!(room.foes.values().filter(|foe| !foe.fighter.dead()).count(), posted, "every post stands again");
    assert_eq!(room.cache().map(|cache| cache[4]), Some(0.0), "its cache shut");
    let start = room.section.as_ref().expect("a section").spawns[0];
    for player in players {
        let fighter = room.players[&player].fighter;
        assert!(!fighter.dead() && [fighter.body.x, fighter.body.y] == start, "whole at the way in");
    }
    let mut cleared = abyss_run();
    let both = [cleared.join().expect("in"), cleared.join().expect("in")];
    for id in cleared.garrison[0].standing.clone() {
        let found = cleared.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    cleared.tick();
    cleared.take_events();
    for player in both {
        fallen(&mut cleared, player);
    }
    cleared.tick();
    assert!(wiped(&cleared.take_events()).is_empty(), "a cleared run is won: no wipe");
}
