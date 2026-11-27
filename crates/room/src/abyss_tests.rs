//! Abyss's rules in a run's room: five revives its company shares, its fallen staying down once none is left; no wipe
//! in a room no one is in, nor once its cache stands open; and a wipe, when every player is down at once, starting
//! the run over with its five revives.

use crate::{Dropped, Event, EventKind, PlayerId, Room, RunOf};
use combat::Action;

/// A Friday's 09:00 UTC: day 20,778, in week 2,968.
const FRIDAY_NINE: u64 = 29_919_420;

/// The Abyss run of a patrol's dungeon that is not the dungeon of the day, so it carries no modifier.
fn abyss_run() -> Room {
    let of = RunOf::Patrol { patrol: "saltgrass-downs".into(), number: 0 };
    Room::dungeon_run(&of, gear::Difficulty::Abyss, FRIDAY_NINE).expect("an Abyss run")
}

/// A player fallen long enough to stand again at the next tick, who asks to, if the run lets them.
fn fallen(room: &mut Room, player: PlayerId) {
    let found = room.players.get_mut(&player).expect("in the room");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: combat::tuning::RESPAWN });
    found.respawn_asked = true;
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
    let of = RunOf::Patrol { patrol: "saltgrass-downs".into(), number: 0 };
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

#[test]
fn a_wipe_sends_each_vestige_still_lying_to_its_players_mail_and_takes_the_rest_off_the_ground() {
    let mut room = abyss_run();
    let players = [room.join().expect("in"), room.join().expect("in")];
    let vestige = gear::Vestige::new(0, gear::Rarity::Legendary, gear::Slot::Arms, 18);
    room.lay_drop(players[0], Dropped::Vestige(vestige), [0.0, -30.0, 0.0]);
    room.lay_drop(players[1], Dropped::AmmoBox, [0.0, -31.0, 0.0]);
    for player in players {
        let found = room.players.get_mut(&player).expect("in");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
    assert_eq!(wiped(&room.take_events()), players);
    assert_eq!(room.drops_for(players[0]).count() + room.drops_for(players[1]).count(), 0, "nothing lies");
    let mail = &room.players[&players[0]].character.mail;
    assert_eq!(mail.len(), 1, "the Vestige, not lost: {mail:?}");
    assert_eq!(mail[0].vestige.as_ref().map(|kept| kept.rarity), Some(gear::Rarity::Legendary));
    assert!(room.players[&players[1]].character.mail.is_empty(), "an Ammo box is no item");
}

#[test]
fn a_socket_that_never_signed_in_holds_no_run_up_when_every_player_kept_is_down() {
    let mut room = abyss_run();
    let [ada, cal, stranger] = [room.join().expect("in"), room.join().expect("in"), room.join().expect("in")];
    assert!(room.own(ada, "ada") && room.own(cal, "cal"));
    room.run.as_mut().expect("a run").revives = Some(0);
    fallen(&mut room, ada);
    fallen(&mut room, cal);
    room.tick();
    assert!(!room.players[&stranger].fighter.dead(), "the stranger stands");
    assert_eq!(wiped(&room.take_events()), [ada, cal, stranger], "yet the run is wiped, and each is told");
    assert_eq!(room.revives(), Some(5));
}

#[test]
fn a_run_started_over_stands_each_group_unbroken_with_its_leader_and_holding_its_post_again() {
    let mut room = abyss_run();
    let players = [room.join().expect("in"), room.join().expect("in")];
    let post = room.garrison.iter().position(|post| post.standing.len() >= 2).expect("a band of two or more");
    let leader = room.garrison[post].leader.expect("a leader");
    let found = room.foes.get_mut(&leader).expect("standing");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    let stood = room.garrison[post].standing.len();
    for id in room.garrison[post].standing.clone().into_iter().filter(|id| *id != leader).take(stood.div_ceil(2) - 1) {
        let found = room.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
    let found = &room.garrison[post];
    assert!(found.broken && found.defending && found.anchor.is_some(), "its leader fallen, and half of it");
    for player in players {
        fallen(&mut room, player);
    }
    room.tick();
    assert_eq!(wiped(&room.take_events()), players);
    for found in &room.garrison {
        assert!(!found.broken && !found.defending && found.anchor.is_none(), "whole again, at its post");
        let leader = found.leader.expect("led again");
        assert!(found.standing.contains(&leader) && !room.foes[&leader].fighter.dead(), "by one standing now");
        assert_eq!(found.leader, crate::garrison::leader_of(&room, &found.standing), "its highest rank");
    }
}

/// A kept player who left the run and came back, as the host joins them and notes their account.
fn back(room: &mut Room, owner: &str) -> PlayerId {
    let again = room.join().expect("in");
    assert!(room.own(again, owner));
    again
}

#[test]
fn a_player_who_leaves_a_run_down_comes_back_down_and_one_wounded_comes_back_wounded() {
    let mut room = abyss_run();
    let (ada, ben) = (room.join().expect("in"), room.join().expect("in"));
    assert!(room.own(ada, "ada") && room.own(ben, "ben"), "a company of two, kept");
    room.run.as_mut().expect("a run").revives = Some(0);
    fallen(&mut room, ada);
    room.leave(ada);
    let ada = back(&mut room, "ada");
    room.tick();
    assert!(room.players[&ada].fighter.dead(), "still down, with none left");
    assert_eq!(room.revives(), Some(0));
    room.run.as_mut().expect("a run").revives = Some(2);
    room.leave(ada);
    let ada = back(&mut room, "ada");
    room.tick();
    assert!(room.players[&ada].fighter.dead(), "back down: lies until she asks");
    room.players.get_mut(&ada).expect("in").respawn_asked = true;
    room.tick();
    assert!(!room.players[&ada].fighter.dead(), "stands once she asks");
    assert_eq!(room.revives(), Some(1), "and spends one");
    let found = room.players.get_mut(&ada).expect("in");
    found.fighter.health = found.fighter.health_max / 3.0;
    room.leave(ada);
    let ada = back(&mut room, "ada");
    let fighter = room.players[&ada].fighter;
    assert!((fighter.health - fighter.health_max / 3.0).abs() < 1e-9, "a third, as she left");
    let mut elite =
        Room::dungeon_run(&RunOf::Elite { place: "krakens-grotto".into() }, gear::Difficulty::Normal, FRIDAY_NINE)
            .expect("a run at Normal");
    let cal = elite.join().expect("in");
    assert!(elite.own(cal, "cal"));
    fallen(&mut elite, cal);
    elite.leave(cal);
    let cal = back(&mut elite, "cal");
    assert!(!elite.players[&cal].fighter.dead(), "a run that counts no revives keeps no one's body");
}

#[test]
fn a_run_started_over_remembers_no_one_who_left() {
    let mut room = abyss_run();
    let (ada, ben) = (room.join().expect("in"), room.join().expect("in"));
    assert!(room.own(ada, "ada") && room.own(ben, "ben"), "a company of two, kept");
    fallen(&mut room, ada);
    room.leave(ada);
    room.start_over();
    let ada = back(&mut room, "ada");
    assert!(!room.players[&ada].fighter.dead(), "whole, as the run is whole again");
}

#[test]
fn a_run_once_won_is_never_wiped_though_its_end_post_stands_again_and_its_cache_shuts() {
    let mut room = abyss_run();
    let both = [room.join().expect("in"), room.join().expect("in")];
    let post = room.cache.expect("a cache").post;
    for id in room.garrison[post].standing.clone() {
        let found = room.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
    room.stand_post(post);
    room.tick();
    assert_eq!(room.cache().map(|cache| cache[4]), Some(0.0), "its cache shut again");
    room.take_events();
    for player in both {
        fallen(&mut room, player);
    }
    room.tick();
    assert!(wiped(&room.take_events()).is_empty(), "won: no wipe");
}

#[test]
fn one_account_is_one_player_in_a_run_and_a_second_socket_comes_in_as_the_first_left() {
    let mut room = abyss_run();
    let (ada, ben) = (room.join().expect("in"), room.join().expect("in"));
    assert!(room.own(ada, "ada") && room.own(ben, "ben"), "a company of two, kept");
    room.run.as_mut().expect("a run").revives = Some(0);
    fallen(&mut room, ada);
    let again = room.join().expect("in");
    assert!(!room.own(again, "ada"), "held by her first socket");
    assert!(room.own(ada, "ada"), "which may be noted again");
    room.leave(ada);
    assert!(room.own(again, "ada"));
    room.tick();
    assert!(room.players[&again].fighter.dead(), "down, as she was, with none left");
}

#[test]
fn one_the_section_killed_holds_the_run_up_while_a_revive_is_left_and_not_once_none_is() {
    for (revives, wipes) in [(2, false), (0, true)] {
        let mut room = abyss_run();
        let (felled, strayed) = (room.join().expect("in"), room.join().expect("in"));
        room.run.as_mut().expect("a run").revives = Some(revives);
        let found = room.players.get_mut(&felled).expect("in");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
        room.players.get_mut(&strayed).expect("in").standing = reach::Standing::Dead { ticks: 0, fell: false };
        room.tick();
        assert_eq!(!wiped(&room.take_events()).is_empty(), wipes, "{revives} revives left");
    }
}
