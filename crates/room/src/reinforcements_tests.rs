//! A patrol's Grey Tithe kept by airship: a roaming player is brought groups near them, never at the landing, three
//! at most at once and each next some 45 to 75 s after; a group no one comes near is gone; ground is baked where none
//! reaches, beside a player whose way ahead is out of the section, and counted however they move while it bakes; and a
//! cleared group and a half-fallen group's fallen come back by airship.

use super::garrison_tests::{node, run, stand_player};
use super::leash_tests::whole;
use super::reinforcements::{BROUGHT_MOST, LAID_CLEAR, LIFT_AFTER, LIFT_FAR, SET_DOWN};
use super::smaller::SMALLER;
use super::*;
use crate::arrivals::Bringer;

/// A patrol with a player standing at `at`, opened as the room's door opens one: its foes' sites set, none here.
fn patrol_with_player(at: [f64; 2]) -> (Room, crate::PlayerId) {
    let mut room = node(NodeKind::Patrol, "glade");
    room.set_foe_sites(&[]);
    let player = room.join().unwrap();
    stand_player(&mut room, player, at);
    (room, player)
}

/// The groups the airships brought, standing now.
fn brought(room: &Room) -> Vec<&Post> {
    room.garrison.iter().filter(|post| post.arrival).collect()
}

/// Runs the room until an airship sets out, at most `ticks`; its seen.
fn until_a_ship(room: &mut Room, player: crate::PlayerId, at: [f64; 2], ticks: u64) -> Option<crate::ArrivalSeen> {
    for _ in 0..ticks {
        stand_player(room, player, at);
        whole(room, player);
        room.tick();
        if let Some(ship) = room.arrivals_seen().iter().find(|seen| seen.kind == Bringer::Airship) {
            return Some(*ship);
        }
    }
    None
}

/// Where the fixture's player roams: north of the landing, past every spawn by more than 60 m.
const ROAMING: [f64; 2] = [0.0, 100.0];

#[test]
fn at_the_landing_nothing_is_brought_but_a_roaming_player_is_brought_a_varied_group_set_down_near_them() {
    let (mut room, player) = patrol_with_player([0.0, 180.0]);
    assert!(until_a_ship(&mut room, player, [0.0, 180.0], 40 * 60).is_none(), "nothing at the landing");
    let ship = until_a_ship(&mut room, player, ROAMING, 60 * 60).expect("a ship for a roaming player");
    let posts = brought(&room);
    assert_eq!(posts.len(), 1);
    let post = posts[0];
    let far = apart([post.at[0], post.at[1]], ROAMING);
    assert!((SET_DOWN.0..=SET_DOWN.1).contains(&far), "set down {far} m off");
    assert!(apart([ship.at[0], ship.at[1]], [post.at[0], post.at[1]]) <= SPREAD + 0.5, "the ship over them");
    let drawn: Vec<(u8, Rank)> = post.members.iter().map(|&(number, rank, ..)| (number, rank)).collect();
    let band = (2..=4).contains(&drawn.len()) && drawn.iter().all(|member| PATROL.contains(member));
    assert!(band || SMALLER.iter().any(|(members, _)| *members == drawn), "a band or a smaller group: {drawn:?}");
    assert!(post.standing.iter().all(|id| room.arriving(*id)), "its foes let down from the ship");
}

#[test]
fn at_most_three_brought_groups_stand_at_once_and_one_no_player_comes_near_for_a_while_is_gone() {
    let (mut room, player) = patrol_with_player(ROAMING);
    let mut most = 0;
    for _ in 0..8 * 60 * 60 {
        stand_player(&mut room, player, ROAMING);
        whole(&mut room, player);
        room.tick();
        most = most.max(brought(&room).len());
    }
    assert_eq!(most, BROUGHT_MOST, "as many as may stand, and no more");
    let ids: Vec<FighterId> = brought(&room).iter().flat_map(|post| post.standing.clone()).collect();
    // Far off, out of sight: once the while is up and its foes are idle, they are gone.
    let away = [-190.0, -190.0];
    assert!(apart(away, ROAMING) > LIFT_FAR + SET_DOWN.1);
    let mut gone_at = None;
    for tick in 0..LIFT_AFTER + 60 * 60 {
        stand_player(&mut room, player, away);
        whole(&mut room, player);
        room.tick();
        if ids.iter().all(|id| !room.foes.contains_key(id)) {
            gone_at = Some(tick);
            break;
        }
    }
    assert!(gone_at.is_some_and(|tick| tick >= LIFT_AFTER - 1), "gone after the while: {gone_at:?}");
}

#[test]
fn where_no_ground_reaches_a_ground_is_baked_ahead_of_the_player_and_the_group_set_down_on_it() {
    // Far north of the landing's square, facing on north: no ground the room has is near.
    let at = [0.0, -100.0];
    let (mut room, player) = patrol_with_player(at);
    room.players.get_mut(&player).unwrap().fighter.body.facing = 0.0;
    let ship = until_a_ship(&mut room, player, at, 60 * 60).expect("a ship once its ground is baked");
    assert!(room.place_grounds() >= 1, "a ground baked for it");
    let ground = room.mesh_index([ship.at[0], ship.at[1]]);
    assert!(ground > 0, "set down on the ground baked, not the landing's");
}

/// Stands the player at `at` facing `facing` (0 north), kept whole, and runs a tick.
fn step_facing(room: &mut Room, player: crate::PlayerId, at: [f64; 2], facing: f64) {
    stand_player(room, player, at);
    room.players.get_mut(&player).unwrap().fighter.body.facing = facing;
    whole(room, player);
    room.tick();
}

#[test]
fn a_player_at_the_section_s_edge_facing_out_of_it_is_brought_a_group_on_ground_baked_beside_them() {
    // By the north edge, facing on north: the cell ahead of them is out of the section, so one beside them is baked.
    let at = [0.0, -170.0];
    let (mut room, player) = patrol_with_player(at);
    let mut ship = None;
    for _ in 0..60 * 60 {
        step_facing(&mut room, player, at, 0.0);
        ship = room.arrivals_seen().iter().find(|seen| seen.kind == Bringer::Airship).copied();
        if ship.is_some() {
            break;
        }
    }
    let ship = ship.expect("a ship though the way ahead is out of the section");
    assert!(room.mesh_index([ship.at[0], ship.at[1]]) > 0, "set down on a ground baked for it");
    assert!(reach::inside(&room.section.as_ref().unwrap().ring, ship.at[0], ship.at[1]), "in the section");
}

#[test]
fn a_ground_baked_for_an_airship_is_counted_however_far_the_player_goes_while_it_bakes() {
    let (from, to) = ([0.0, -100.0], [150.0, 100.0]);
    let (mut room, player) = patrol_with_player(from);
    let mut began = false;
    for _ in 0..60 * 60 {
        step_facing(&mut room, player, from, 0.0);
        if room.quests.baking.is_some() {
            began = true;
            break;
        }
    }
    assert!(began, "a ground begun for the player");
    // Off to another cell, where no ground the room has reaches either, while it bakes.
    for _ in 0..60 * 60 {
        step_facing(&mut room, player, to, 0.0);
        if room.place_grounds() > 0 {
            break;
        }
    }
    assert_eq!(room.place_grounds(), 1, "the ground begun is baked whole");
    assert_eq!(room.airship_grounds(), 1, "and counted among the airships'");
}

#[test]
fn a_ground_the_airships_began_counts_as_theirs_whichever_place_s_turn_finishes_it() {
    let at = [0.0, -100.0];
    let (mut room, player) = patrol_with_player(at);
    while room.quests.baking.is_none() {
        step_facing(&mut room, player, at, 0.0);
    }
    // A site standing first each tick takes the turn and steps the airships' bake on to its end.
    let site = gear::quests::Place { name: "a site".to_owned(), at: [120.0, 120.0], radius: 0.0 };
    while room.place_grounds() == 0 {
        room.clock += 1;
        let _ = room.ground_of(&site, NODE_AROUND - FROM_SQUARE);
    }
    assert_eq!(room.airship_grounds(), 1, "the airships' ground, toward their ten");
}

#[test]
fn the_airships_begin_no_ground_the_tick_after_another_place_waited_for_its_turn() {
    let at = [0.0, -100.0];
    let (mut room, player) = patrol_with_player(at);
    for _ in 0..60 * 60 {
        room.quests.waited = Some((room.clock, "a defence".to_owned()));
        step_facing(&mut room, player, at, 0.0);
        assert!(room.quests.baking.is_none() && room.place_grounds() == 0, "the defence's turn first");
    }
    let mut began = false;
    for _ in 0..60 * 60 {
        step_facing(&mut room, player, at, 0.0);
        if room.quests.baking.is_some() || room.place_grounds() > 0 {
            began = true;
            break;
        }
    }
    assert!(began, "once no place waits, the airships bake");
}

#[test]
fn a_brought_group_stays_while_a_player_lies_fallen_near_it() {
    let (mut room, player) = patrol_with_player(ROAMING);
    let mut landed = false;
    for _ in 0..3 * 60 * 60 {
        stand_player(&mut room, player, ROAMING);
        whole(&mut room, player);
        room.tick();
        let posts = brought(&room);
        if posts.len() == 1 && posts[0].standing.iter().all(|id| !room.arriving(*id)) {
            landed = true;
            break;
        }
    }
    assert!(landed, "a group brought and landed");
    let ids: Vec<FighterId> = brought(&room)[0].standing.clone();
    let found = room.players.get_mut(&player).unwrap();
    (found.fighter.health, found.fighter.action) = (0.0, combat::fighter::Action::Dead { elapsed: 0 });
    run(&mut room, LIFT_AFTER + 30 * 60);
    assert!(ids.iter().any(|id| room.foes.contains_key(id)), "kept while the player lies near it");
}

#[test]
fn a_group_is_set_down_clear_of_a_public_event_s_ground() {
    let (mut room, player) = patrol_with_player(ROAMING);
    // The Fissure's ground 25 m round, south of the roaming player toward the landing: where groups are set down
    // otherwise.
    let middle = [40.0, 140.0];
    let fissure = crate::public::FissureGround { at: middle, radius: 25.0, growth: [50.0, 140.0] };
    room.open_public("saltgrass-downs", crate::public::Grounds { fissure: Some(fissure), raid: None }, None);
    let mut brought_any = false;
    for _ in 0..4 * 60 * 60 {
        stand_player(&mut room, player, ROAMING);
        whole(&mut room, player);
        room.tick();
        for post in brought(&room) {
            brought_any = true;
            assert!(apart([post.at[0], post.at[1]], middle) >= 25.0 + LAID_CLEAR, "set down at {:?}", post.at);
        }
    }
    assert!(brought_any, "groups brought clear of it");
}
#[test]
fn a_cleared_group_and_a_half_fallen_group_s_fallen_come_back_by_airship() {
    let (mut room, _) = patrol_with_player([0.0, -150.0]);
    let post = room.garrison.iter().position(|post| post.members.len() >= 2).unwrap();
    for id in room.garrison[post].standing.clone() {
        let found = room.foes.get_mut(&id).unwrap();
        (found.fighter.health, found.fighter.action) = (0.0, combat::fighter::Action::Dead { elapsed: 0 });
    }
    run(&mut room, STAND_AGAIN + 2);
    let again = room.garrison[post].standing.clone();
    assert!(again.iter().all(|id| room.arriving(*id)), "it comes back by airship");
    let ship = room.arrival_of(again[0]).unwrap().from;
    assert!(room.arrivals_seen().iter().any(|seen| seen.id == ship && seen.kind == Bringer::Airship));
}
