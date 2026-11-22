use super::tests::{sea, ticks, vessel_mut};
use super::*;
use crate::harbour::Harbours;
use crate::pirates::Pirate;
use crate::sea::CourseRefused;
use naval::fight::{CAPTAIN, PLAYER, Sailor};
use naval::ranks::{Commission, PIRATES, Rank};
use world::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};

const WIDTH: f64 = FRAME_WIDTH_M as f64;
const HEIGHT: f64 = FRAME_HEIGHT_M as f64;

fn inside([x, y]: [f64; 2]) -> bool {
    (0.0..=WIDTH).contains(&x) && (0.0..=HEIGHT).contains(&y)
}

fn ship_of(sea: &Sea, player: PlayerId) -> Ship {
    sea.ships().find(|(each, _)| *each == player).unwrap().1
}

#[test]
fn a_fight_that_carries_a_ship_past_any_edge_of_the_world_leaves_it_within_the_world_and_free_to_sail() {
    // By each edge: where the ship fights, where the fight carries it past the edge, and a point back in to sail to.
    let edges = [
        ([300.0, 50_000.0], [-150.0, 50_000.0], [500.0, 50_000.0]),
        ([50_000.0, 300.0], [50_000.0, -150.0], [50_000.0, 500.0]),
        ([WIDTH - 300.0, 50_000.0], [WIDTH + 150.0, 50_000.0], [WIDTH - 500.0, 50_000.0]),
        ([50_000.0, HEIGHT - 300.0], [50_000.0, HEIGHT + 150.0], [50_000.0, HEIGHT - 500.0]),
    ];
    for (fights_at, carried, back) in edges {
        let mut sea = sea();
        let player = sea.join();
        sea.course_anywhere(player, &[fights_at], 10).unwrap();
        let commission = Commission { faction: PIRATES, rank: Rank::Major };
        let near = [fights_at[0], fights_at[1] + 600.0];
        sea.pirates.sailing.push(Pirate::standing(1, 7, commission, near, 0.0, true));
        sea.tick();
        assert!(sea.fights.fighting(player), "{fights_at:?}");
        let ship = &mut vessel_mut(&mut sea, player, PLAYER).ship;
        (ship.x, ship.y) = (carried[0], carried[1]);
        sea.tick();
        let ship = ship_of(&sea, player);
        assert!(inside([ship.x, ship.y]), "while the fight has it past the edge: {ship:?}");
        if let Sailor::Captain(command) = &mut vessel_mut(&mut sea, player, CAPTAIN).sailor {
            command.gone = Some(naval::fight::End::Gone);
        }
        ticks(&mut sea, 3);
        assert!(!sea.fights.fighting(player));
        let ship = ship_of(&sea, player);
        assert!(inside([ship.x, ship.y]), "after it: {ship:?}");
        let saved = gear::Character::from_json(&sea.kept_character(player).unwrap()).unwrap().ship_at.unwrap();
        assert!(inside(saved.map(|metres| metres as f64)), "kept within it: {saved:?}");
        ticks(&mut sea, 31);
        assert_eq!(sea.course(player, &[back], 10), Ok(()), "sails back in from {carried:?}");
    }
}

#[test]
fn a_ship_that_washes_up_with_no_port_known_or_sets_a_course_from_past_the_edge_lies_within_the_world() {
    for (out, back) in [
        ([-150.0, 50_000.0], [500.0, 50_000.0]),
        ([50_000.0, -150.0], [50_000.0, 500.0]),
        ([WIDTH + 150.0, 50_000.0], [WIDTH - 500.0, 50_000.0]),
        ([50_000.0, HEIGHT + 150.0], [50_000.0, HEIGHT - 500.0]),
    ] {
        let mut sea = sea();
        sea.harbour.harbours = Harbours::default();
        let player = sea.join();
        sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).unwrap();
        sea.wash_up(player, out, true);
        let ship = ship_of(&sea, player);
        assert!(inside([ship.x, ship.y]), "washed up from {out:?}: {ship:?}");
        // One that lay past the edge however it came there sets its course from the edge.
        if let Some(sailing) = sea.berths.get_mut(&player).and_then(|berth| berth.sailing.as_mut()) {
            (sailing.ship.x, sailing.ship.y) = (out[0], out[1]);
        }
        ticks(&mut sea, 31);
        assert_eq!(sea.course(player, &[back], 10), Ok(()), "from {out:?}");
        let ship = ship_of(&sea, player);
        assert!(inside([ship.x, ship.y]), "{ship:?}");
    }
}

#[test]
fn a_course_is_refused_when_a_point_is_no_number_past_the_frame_on_land_too_many_too_soon_or_across_a_coast() {
    let mut sea = sea();
    let player = sea.join();
    assert_eq!(sea.course(player, &[[50_000.0, 50_000.0]], 7), Err(CourseRefused::BadPace));
    let player = sea.join();
    assert_eq!(sea.course(player, &[[f64::NAN, 1.0]], 10), Err(CourseRefused::BadCourse));
    let player = sea.join();
    assert_eq!(sea.course(player, &[[-1.0, 1.0]], 10), Err(CourseRefused::BadCourse));
    let player = sea.join();
    assert_eq!(
        sea.course(player, &[[58_000.0, 50_000.0], [150_000.0, 150_000.0]], 10),
        Err(CourseRefused::CrossesLand)
    );
    let player = sea.join();
    assert_eq!(sea.course(player, &vec![[50_000.0, 50_000.0]; 65], 10), Err(CourseRefused::BadCourse));
    let player = sea.join();
    sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    assert_eq!(sea.course(player, &[[50_100.0, 50_000.0]], 10), Err(CourseRefused::TooSoon));
    ticks(&mut sea, 31);
    assert_eq!(sea.course(player, &[[150_000.0, 250_000.0]], 10), Err(CourseRefused::CrossesLand));
    assert_eq!(sea.face(player, f64::NAN), Err(CourseRefused::BadCourse));
}
