//! Where a garrison's groups stand: a post laid only where one stands, clearing the points round it alone; a patrol's
//! foes' sites, each standing its group the first time a player comes near it, on a mesh baked round it.

use super::garrison_tests::{clear, node, run, stand_player};
use super::stands::{SITE_NEAR, first_post};
use super::*;
use crate::FoeSeen;

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
    run(&mut room, 3);
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
fn the_same_site_stands_the_same_group_on_every_machine_and_only_in_a_patrol() {
    let stood = |kind: NodeKind| {
        let mut room = node(kind, "glade");
        room.set_foe_sites(&[SITE]);
        let foes = room.foes_seen().count();
        let player = room.join().unwrap();
        stand_player(&mut room, player, [SITE[0], SITE[1] + 100.0]);
        run(&mut room, 3);
        room.foes_seen().skip(foes).map(|foe| (foe.foe_type, foe.rank, feet(&foe))).collect::<Vec<_>>()
    };
    assert!(!stood(NodeKind::Patrol).is_empty());
    assert_eq!(stood(NodeKind::Patrol), stood(NodeKind::Patrol));
    assert!(stood(NodeKind::Mission).is_empty(), "a mission's garrison is one encounter: no site stands in it");
}
