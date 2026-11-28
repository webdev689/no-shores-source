//! Where a garrison's groups stand: a post laid only where one stands, clearing the points round it alone; a patrol's
//! foes' sites, its territories, each standing its group as a player comes near it, on a mesh baked round it, let go
//! once no player has come near for a while and standing afresh as one comes again, none by a public event's ground;
//! and a cleared group come back by airship.

use super::garrison_tests::{clear, node, run, run_baked, stand_player};
use super::leash_tests::whole;
use super::stands::{EVENT_CLEAR, LIFT_AFTER, LIFT_FAR, SITE_NEAR, first_post};
use super::*;
use crate::FoeSeen;
use crate::arrivals::Bringer;

/// A site far from the node's own square, which holds its spawns' end of the section.
const SITE: [f64; 2] = [-150.0, -100.0];

fn feet(foe: &FoeSeen) -> [f64; 2] {
    [foe.fighter.body.x, foe.fighter.body.y]
}

#[test]
fn a_post_that_does_not_stand_keeps_the_points_near_it_and_one_that_does_clears_them() {
    let mut open = vec![(0.0, 0.0), (5.0, 0.0), (10.0, 0.0), (50.0, 0.0)];
    let mut draws = draws_of(1);
    let mut tried = Vec::new();
    let stood = first_post(
        &mut open,
        &mut draws,
        |_, _| 0,
        |point, _| {
            tried.push(point);
            (point != (0.0, 0.0)).then_some(point)
        },
    );
    assert_eq!(stood, Some((5.0, 0.0)), "the point beside the one refused is tried next");
    assert_eq!(tried, vec![(0.0, 0.0), (5.0, 0.0)]);
    assert_eq!(open, vec![(50.0, 0.0)], "only the post that stood clears the points within 20 m of it");
}

#[test]
fn a_patrol_s_foes_site_stands_its_group_the_first_time_a_player_comes_within_150_m_and_again_once_cleared() {
    let mut room = node(NodeKind::Patrol, "glade");
    room.set_foe_sites(&[SITE]);
    let (posts, foes) = (room.garrison.len(), room.foes_seen().count());
    let player = room.join().unwrap();
    stand_player(&mut room, player, [SITE[0], SITE[1] + SITE_NEAR + 5.0]);
    run(&mut room, 3);
    assert_eq!((room.garrison.len(), room.place_grounds()), (posts, 0), "nothing stands while no player is near");
    stand_player(&mut room, player, [SITE[0], SITE[1] + SITE_NEAR - 5.0]);
    run_baked(&mut room, 3);
    assert_eq!(room.garrison.len(), posts + 1, "its group stands");
    assert_eq!(room.place_grounds(), 1, "on a mesh baked round the site");
    let stood: Vec<FoeSeen> = room.foes_seen().skip(foes).collect();
    assert!((2..=4).contains(&stood.len()), "a group of two to four: {}", stood.len());
    for foe in &stood {
        assert!(
            PATROL.contains(&(foe.foe_type, Rank::ALL[usize::from(foe.rank) - 1])),
            "drawn as a patrol's other groups are"
        );
        assert!(apart(feet(foe), SITE) <= SPREAD + 1.0, "round the site: {:?}", feet(foe));
    }
    let post = room.garrison.len() - 1;
    let kept: Vec<FoeSeen> = stood.clone();
    clear(&mut room, post);
    stand_player(&mut room, player, [SITE[0], SITE[1] + SITE_NEAR - 5.0]);
    run(&mut room, STAND_AGAIN + 2);
    assert_eq!(room.garrison.len(), posts + 1, "it stands nowhere else");
    let again: Vec<FoeSeen> = room.foes_seen().filter(|foe| room.garrison[post].standing.contains(&foe.foe)).collect();
    assert_eq!(again.len(), kept.len(), "a cleared site's group stands again as any garrison group does");
    for (new, old) in again.iter().zip(&kept) {
        assert_eq!((new.foe_type, new.rank), (old.foe_type, old.rank));
    }
}

#[test]
fn a_site_on_a_way_stands_a_patrol_that_walks_its_beat_along_the_way() {
    let mut room = node(NodeKind::Patrol, "glade");
    // A way running east and west through the site.
    room.set_paths(vec![vec![[SITE[0] - 90.0, SITE[1]], [SITE[0] + 90.0, SITE[1]]]]);
    room.set_foe_sites(&[SITE]);
    let (posts, foes) = (room.garrison.len(), room.foes_seen().count());
    let player = room.join().unwrap();
    stand_player(&mut room, player, [SITE[0], SITE[1] + SITE_NEAR - 5.0]);
    run_baked(&mut room, 3);
    assert_eq!(room.garrison.len(), posts + 1, "its group stands");
    let ids: Vec<FighterId> = room.foes_seen().skip(foes).map(|foe| foe.foe).collect();
    let (mut west, mut east) = (f64::INFINITY, f64::NEG_INFINITY);
    for _ in 0..60 * 60 {
        room.tick();
        for foe in room.foes_seen().filter(|foe| ids.contains(&foe.foe)) {
            let [x, y] = feet(&foe);
            assert!((y - SITE[1]).abs() <= 7.0, "it keeps to the way: {x:.1}, {y:.1}");
            (west, east) = (west.min(x), east.max(x));
        }
    }
    assert!(east - west > 15.0, "and walks along it: {west:.1} to {east:.1}");
}

#[test]
fn a_site_s_group_never_stands_beside_a_player_but_waits_till_none_is_within_40_m() {
    let mut room = node(NodeKind::Patrol, "glade");
    room.set_foe_sites(&[SITE]);
    let posts = room.garrison.len();
    let player = room.join().unwrap();
    stand_player(&mut room, player, [SITE[0], SITE[1] + CLEAR_AROUND - 5.0]);
    run(&mut room, 3);
    assert_eq!(room.garrison.len(), posts, "none stands within sight of a player beside it");
    stand_player(&mut room, player, [SITE[0], SITE[1] + CLEAR_AROUND + 5.0]);
    run_baked(&mut room, 3);
    assert_eq!(room.garrison.len(), posts + 1, "it stands once the player is past 40 m");
}

#[test]
fn the_same_site_stands_the_same_group_on_every_machine_and_only_in_a_patrol() {
    let stood = |kind: NodeKind| {
        let mut room = node(kind, "glade");
        room.set_foe_sites(&[SITE]);
        let foes = room.foes_seen().count();
        let player = room.join().unwrap();
        stand_player(&mut room, player, [SITE[0], SITE[1] + 100.0]);
        run_baked(&mut room, 3);
        room.foes_seen().skip(foes).map(|foe| (foe.foe_type, foe.rank, feet(&foe))).collect::<Vec<_>>()
    };
    assert!(!stood(NodeKind::Patrol).is_empty());
    assert_eq!(stood(NodeKind::Patrol), stood(NodeKind::Patrol));
    assert!(stood(NodeKind::Mission).is_empty(), "a mission's garrison is one encounter: no site stands in it");
}

#[test]
fn a_site_s_group_no_player_comes_near_for_a_while_is_let_go_and_stands_afresh_as_one_comes_again() {
    let mut room = node(NodeKind::Patrol, "glade");
    room.set_foe_sites(&[SITE]);
    let (posts, foes) = (room.garrison.len(), room.foes_seen().count());
    let player = room.join().unwrap();
    let near = [SITE[0], SITE[1] + SITE_NEAR - 5.0];
    stand_player(&mut room, player, near);
    run_baked(&mut room, 3);
    assert_eq!(room.garrison.len(), posts + 1, "its group stands");
    let first = room.garrison[posts].standing.clone();
    let drawn: Vec<(u8, u8)> = room.foes_seen().skip(foes).map(|foe| (foe.foe_type, foe.rank)).collect();
    // Far off, out of sight: once the while is up and its foes are idle, they are gone with their post.
    let away = [180.0, 180.0];
    assert!(apart(away, SITE) > LIFT_FAR + SPREAD * 2.0);
    let mut gone_at = None;
    for tick in 0..LIFT_AFTER + 60 * 60 {
        stand_player(&mut room, player, away);
        whole(&mut room, player);
        room.tick();
        if first.iter().all(|id| !room.foes.contains_key(id)) {
            gone_at = Some(tick);
            break;
        }
    }
    assert!(gone_at.is_some_and(|tick| tick >= LIFT_AFTER - 1), "let go after the while: {gone_at:?}");
    assert_eq!(room.garrison.len(), posts, "its post with them");
    // Come near again, it stands afresh, already on the ground: the same group, drawn from where the site is.
    stand_player(&mut room, player, near);
    run_baked(&mut room, 3);
    assert_eq!(room.garrison.len(), posts + 1, "it stands again");
    let again = room.garrison[posts].standing.clone();
    assert!(again.iter().all(|id| !room.arriving(*id)), "already on the ground");
    let seen: Vec<(u8, u8)> =
        room.foes_seen().filter(|foe| again.contains(&foe.foe)).map(|foe| (foe.foe_type, foe.rank)).collect();
    assert_eq!(seen, drawn);
}

#[test]
fn no_site_stands_by_a_public_event_s_ground_which_its_event_holds() {
    let mut room = node(NodeKind::Patrol, "glade");
    room.set_foe_sites(&[SITE]);
    let middle = [SITE[0] + 40.0, SITE[1]];
    assert!(apart(middle, SITE) <= 25.0 + EVENT_CLEAR);
    let fissure = crate::public::FissureGround { at: middle, radius: 25.0, growth: [middle[0] + 10.0, middle[1]] };
    room.open_public("saltgrass-downs", crate::public::Grounds { fissure: Some(fissure), raid: None }, None);
    let posts = room.garrison.len();
    let player = room.join().unwrap();
    stand_player(&mut room, player, [SITE[0], SITE[1] + SITE_NEAR - 5.0]);
    run_baked(&mut room, 3);
    assert_eq!(room.garrison.len(), posts, "the event's own foes hold its ground");
}

#[test]
fn a_cleared_group_comes_back_by_airship() {
    let mut room = node(NodeKind::Patrol, "glade");
    room.set_foe_sites(&[]);
    let player = room.join().unwrap();
    let post = room.garrison.iter().position(|post| post.members.len() >= 2).unwrap();
    // Near enough that it is not let go, as a group no player comes near is, but not so near that it waits.
    let at = room.garrison[post].at;
    let watching = [at[0], at[1] - 100.0];
    assert!((CLEAR_AROUND..LIFT_FAR).contains(&apart(watching, [at[0], at[1]])));
    stand_player(&mut room, player, watching);
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

#[test]
fn a_site_whose_middle_lies_past_the_section_s_edge_stands_its_group_inside_it() {
    // The fixture's section reaches 200 m each way: this middle lies 5 m past its west edge.
    let past = [-205.0, -100.0];
    let mut room = node(NodeKind::Patrol, "glade");
    room.set_foe_sites(&[past]);
    let posts = room.garrison.len();
    let player = room.join().unwrap();
    stand_player(&mut room, player, [-150.0, -100.0]);
    run_baked(&mut room, 3);
    assert_eq!(room.garrison.len(), posts + 1, "its group stands");
    let section = room.section.clone().unwrap();
    for id in &room.garrison[posts].standing {
        let body = room.foes[id].fighter.body;
        assert!(reach::inside(&section.ring, body.x, body.y), "inside the section: {:.1} {:.1}", body.x, body.y);
    }
}

#[test]
fn a_landing_s_groups_no_player_comes_near_for_a_while_are_let_go_and_stand_again_on_the_ground_as_one_comes_back() {
    let mut room = node(NodeKind::Patrol, "glade");
    room.set_foe_sites(&[]);
    let posts = room.garrison.len();
    let laid: Vec<Vec<(u8, ::foes::Rank)>> = room
        .garrison
        .iter()
        .map(|post| post.members.iter().map(|&(number, rank, ..)| (number, rank)).collect())
        .collect();
    let firsts: Vec<FighterId> = room.garrison.iter().flat_map(|post| post.standing.clone()).collect();
    let player = room.join().unwrap();
    // Far off, out of sight: once the while is up and their foes are idle, the landing's groups are gone.
    let far =
        |at: [f64; 2]| room.garrison.iter().map(|post| apart(at, [post.at[0], post.at[1]])).fold(f64::MAX, f64::min);
    let away = [[180.0, 180.0], [-180.0, 180.0], [180.0, -180.0], [-180.0, -180.0]]
        .into_iter()
        .max_by(|one, two| far(*one).total_cmp(&far(*two)))
        .unwrap();
    assert!(far(away) > LIFT_FAR + 40.0, "{away:?} lies {:.0} m from a post", far(away));
    let mut gone_at = None;
    for tick in 0..LIFT_AFTER + 60 * 60 {
        stand_player(&mut room, player, away);
        whole(&mut room, player);
        room.tick();
        if firsts.iter().all(|id| !room.foes.contains_key(id)) {
            gone_at = Some(tick);
            break;
        }
    }
    assert!(gone_at.is_some_and(|tick| tick >= LIFT_AFTER - 1), "let go after the while: {gone_at:?}");
    assert_eq!(room.garrison.len(), posts, "their posts kept, to stand again");
    run(&mut room, STAND_AGAIN + 60);
    assert_eq!(room.living_foes(), 0, "none comes back while no player is near, by airship or other");
    // A player back at the landing: each post between CLEAR_AROUND and SITE_NEAR of them stands again, on the ground,
    // its group as it was laid; one nearer waits, as a cleared group does, so none stands beside them.
    let back = [room.spawn_points[0].0, room.spawn_points[0].1];
    stand_player(&mut room, player, back);
    run(&mut room, 2);
    let mut stood = 0;
    for (post, members) in room.garrison.iter().zip(&laid) {
        let apart_m = apart(back, [post.at[0], post.at[1]]);
        if apart_m <= CLEAR_AROUND || apart_m > SITE_NEAR {
            continue;
        }
        stood += 1;
        assert_eq!(post.standing.len(), members.len(), "it stands again whole");
        assert!(post.standing.iter().all(|id| !room.arriving(*id) && !room.foes[id].fighter.dead()), "on the ground");
        let seen: Vec<(u8, u8)> = post
            .standing
            .iter()
            .filter_map(|id| room.foes_seen().find(|foe| foe.foe == *id))
            .map(|foe| (foe.foe_type, foe.rank))
            .collect();
        let as_laid: Vec<(u8, u8)> = members.iter().map(|&(number, rank)| (number, rank as u8)).collect();
        assert_eq!(seen, as_laid, "as it was laid");
    }
    assert!(stood > 0, "a post stands within reach of the landing");
}
