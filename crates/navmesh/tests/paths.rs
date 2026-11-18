//! Paths over small courses on a 20 m field: around blocks and up steps, never onto what a body cannot climb, kept
//! a body's radius from every wall, pulled taut, and steered by obstacles.

mod common;

use common::{along, closest, ends_at, path};
use movement::Block;
use navmesh::{AGENT, Bounds, Collider, NavMesh, Ramp, Rise, Way};

fn block(min_x: f64, min_y: f64, max_x: f64, max_y: f64, top: f64) -> Block {
    Block { min_x, min_y, max_x, max_y, top }
}

/// A 20 x 20 m field of open ground around the origin.
const FIELD: Bounds = Bounds { min_x: -10.0, min_y: -10.0, max_x: 10.0, max_y: 10.0 };

fn bake(blocks: &[Block]) -> NavMesh {
    NavMesh::bake(blocks, FIELD, &AGENT)
}

/// The tallest top under a point, edges included, else the open ground.
fn top_at(blocks: &[Block], x: f64, y: f64) -> f64 {
    blocks
        .iter()
        .filter(|block| x >= block.min_x && x <= block.max_x && y >= block.min_y && y <= block.max_y)
        .fold(0.0, |top, block| f64::max(top, block.top))
}

fn length(route: &[[f64; 3]]) -> f64 {
    route
        .windows(2)
        .map(|pair| {
            let (dx, dy) = (pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]);
            (dx * dx + dy * dy).sqrt()
        })
        .sum()
}

#[test]
fn open_ground_is_one_straight_leg() {
    let navmesh = bake(&[]);
    let route = path(&navmesh, [-6.0, 0.0, 0.0], [6.0, 3.0, 0.0]);
    assert_eq!(route.len(), 2, "start and goal only: {route:?}");
    ends_at(&route, [6.0, 3.0, 0.0]);
}

#[test]
fn a_path_bends_around_a_wall_and_never_through_it() {
    let wall = block(-1.0, -4.0, 1.0, 4.0, 3.0);
    let route = path(&bake(&[wall]), [-5.0, 0.0, 0.0], [5.0, 0.0, 0.0]);
    assert!(closest(&route, &wall) >= AGENT.radius, "it keeps a body's radius off the wall: {route:?}");
    // The shortest way round: to the eroded edge's chamfered corners half a metre off the wall's end, and back.
    let shortest = 2.0 * (3.5_f64 * 3.5 + 4.0 * 4.0).sqrt() + 2.0 * 0.5_f64.sqrt() + 2.0;
    assert!(length(&route) <= shortest * 1.05, "near taut round the wall's end: {route:?}");
    ends_at(&route, [5.0, 0.0, 0.0]);
}

#[test]
fn a_pillar_in_the_open_is_a_hole_the_path_goes_round() {
    let pillar = block(-0.5, -0.5, 0.5, 0.5, 3.0);
    let route = path(&bake(&[pillar]), [-5.0, 0.0, 0.0], [5.0, 0.0, 0.0]);
    assert!(route.len() >= 3, "it bends: {route:?}");
    assert!(closest(&route, &pillar) >= AGENT.radius, "no leg crosses the pillar: {route:?}");
}

#[test]
fn a_gap_narrower_than_a_body_is_not_walked_and_a_wide_one_is() {
    let narrow = [block(-10.0, -0.5, -0.3, 0.5, 3.0), block(0.3, -0.5, 6.0, 0.5, 3.0)];
    let route = path(&bake(&narrow), [0.0, -4.0, 0.0], [0.0, 4.0, 0.0]);
    assert!(route.iter().any(|point| point[0] > 6.0), "round the wall's end, not through 0.6 m: {route:?}");
    for wall in &narrow {
        assert!(closest(&route, wall) >= AGENT.radius, "a radius off each wall: {route:?}");
    }
    let wide = [block(-10.0, -0.5, -1.0, 0.5, 3.0), block(1.0, -0.5, 6.0, 0.5, 3.0)];
    let route = path(&bake(&wide), [0.0, -4.0, 0.0], [0.0, 4.0, 0.0]);
    assert!(route.iter().all(|point| point[0] == 0.0), "straight through 2 m: {route:?}");
}

#[test]
fn steps_of_a_step_height_lead_up_to_a_platform() {
    let stairs = [block(2.0, -2.0, 3.0, 2.0, 0.5), block(3.0, -2.0, 4.0, 2.0, 1.0), block(4.0, -2.0, 8.0, 2.0, 1.5)];
    let goal = [6.0, 0.0, 1.5];
    let route = path(&bake(&stairs), [-5.0, 0.0, 0.0], goal);
    ends_at(&route, goal);
    let tops: Vec<f64> = along(&route).into_iter().map(|(x, y)| top_at(&stairs, x, y)).collect();
    assert!(tops.windows(2).all(|pair| (pair[1] - pair[0]).abs() <= 0.5 + 1e-9), "up a step at a time: {route:?}");
}

#[test]
fn a_block_one_step_high_is_climbed_and_one_higher_is_not() {
    let goal = [4.0, 0.0, 0.5];
    let route = path(&bake(&[block(2.0, -2.0, 6.0, 2.0, 0.5)]), [-5.0, 0.0, 0.0], goal);
    ends_at(&route, goal);
    let tall = bake(&[block(2.0, -2.0, 6.0, 2.0, 0.75)]);
    assert_eq!(tall.find_path([-5.0, 0.0, 0.0], [4.0, 0.0, 0.75]), None);
    let past = path(&tall, [-5.0, 0.0, 0.0], [9.0, 0.0, 0.0]);
    assert!(past.len() >= 3, "a walk past it goes round, not over: {past:?}");
}

#[test]
fn a_platform_with_no_way_up_is_out_of_reach() {
    let island = block(2.0, -2.0, 6.0, 2.0, 2.0);
    let navmesh = bake(&[island]);
    let (ground, top) = ([-5.0, 0.0, 0.0], [4.0, 0.0, 2.0]);
    assert_eq!(navmesh.find_path(ground, top), None);
    let reach = navmesh.reachable_from(ground).expect("the ground is on the mesh");
    assert!(reach.contains([8.0, 6.0, 0.0]), "the ground all round is reached");
    assert!(!reach.contains(top), "the platform's top is not");
    assert!(!reach.contains([8.0, 6.0, 2.0]), "nor a point 2 m over the ground");
    assert!(navmesh.reachable_from(top).is_none(), "the top stands on no poly");
    assert_eq!(navmesh.nearest_point(top), None, "no poly on the top's level");
    let beside = navmesh.nearest_point([6.2, 0.0, 0.0]).expect("the ground beside it is near");
    assert!(beside[0] - 6.0 >= AGENT.radius && beside[0] - 6.2 <= 0.5, "the mesh's edge beside it: {beside:?}");
    assert!(beside[2].abs() < 1e-9, "on the ground: {beside:?}");
    let route = path(&navmesh, ground, beside);
    ends_at(&route, beside);
    assert_eq!(navmesh.nearest_point([-5.0, 3.0, 0.0]), Some([-5.0, 3.0, 0.0]), "a point on the mesh is its own");
}

#[test]
fn a_gentle_ramp_walks_up_and_a_steep_one_does_not() {
    let ramp = |length: f64| {
        let ramp =
            Ramp { min_x: 4.0 - length, min_y: -2.0, max_x: 4.0, max_y: 2.0, rises: Rise::East, low: 0.0, high: 1.5 };
        [Collider::Ramp(ramp), Collider::Block(block(4.0, -2.0, 8.0, 2.0, 1.5))]
    };
    let goal = [6.0, 0.0, 1.5];
    let gentle = NavMesh::bake_colliders(&ramp(4.0), FIELD, &AGENT);
    let route = path(&gentle, [-5.0, 0.0, 0.0], goal);
    ends_at(&route, goal);
    assert!(route.iter().all(|point| point[2] >= 0.0 && point[2] <= 1.5), "on the ramp's plane: {route:?}");
    let steep = NavMesh::bake_colliders(&ramp(1.0), FIELD, &AGENT);
    assert_eq!(steep.find_path([-5.0, 0.0, 0.0], goal), None);
}

#[test]
fn a_ramp_stands_on_the_ground_beneath_it_and_nothing_walks_under_it() {
    // Its lower end 2 m up: were it solid only from there, a body would fit under it.
    let ramp = Ramp { min_x: -1.0, min_y: -4.0, max_x: 1.0, max_y: 4.0, rises: Rise::East, low: 2.0, high: 2.5 };
    let navmesh = NavMesh::bake_colliders(&[Collider::Ramp(ramp)], FIELD, &AGENT);
    let route = path(&navmesh, [-5.0, 0.0, 0.0], [5.0, 0.0, 0.0]);
    assert!(closest(&route, &block(-1.0, -4.0, 1.0, 4.0, 2.5)) >= AGENT.radius, "round it, not under it: {route:?}");
    let reach = navmesh.reachable_from([-5.0, 0.0, 0.0]).expect("the ground is on the mesh");
    assert!(!reach.contains([0.0, 0.0, 0.0]), "no floor under it");
}

#[test]
fn an_end_off_the_mesh_has_no_path() {
    let navmesh = bake(&[]);
    assert_eq!(navmesh.find_path([0.0, 0.0, 0.0], [30.0, 0.0, 0.0]), None);
    assert!(navmesh.reachable_from([30.0, 0.0, 0.0]).is_none());
    let empty = NavMesh::bake(&[], Bounds { min_x: 0.0, min_y: 0.0, max_x: 0.5, max_y: 0.5 }, &AGENT);
    assert_eq!(empty.find_path([0.25, 0.25, 0.0], [0.3, 0.3, 0.0]), None, "too small to stand on");
}

/// A wall across the field with a 2 m gap at each end of its middle stretch.
fn two_gaps() -> NavMesh {
    bake(&[block(-10.0, -0.5, -6.0, 0.5, 3.0), block(-4.0, -0.5, 4.0, 0.5, 3.0), block(6.0, -0.5, 10.0, 0.5, 3.0)])
}

fn through_west_gap(route: &[[f64; 3]]) -> bool {
    along(route).iter().any(|&(x, y)| y.abs() < 0.5 && x < -4.0)
}

#[test]
fn an_obstacle_turns_a_path_and_its_own_foe_walks_through_it() {
    let mut navmesh = two_gaps();
    let (from, to) = ([-5.0, -5.0, 0.0], [-5.0, 5.0, 0.0]);
    assert!(through_west_gap(&path(&navmesh, from, to)), "the near gap");
    assert_eq!(navmesh.epoch(), 0);
    navmesh.add_obstacle(7, -5.0, 0.0, 1.0);
    assert_eq!(navmesh.epoch(), 1);
    let turned = path(&navmesh, from, to);
    assert!(!through_west_gap(&turned), "the far gap: {turned:?}");
    assert!(along(&turned).iter().any(|&(x, y)| y.abs() < 0.5 && x > 4.0), "the far gap: {turned:?}");
    let own = navmesh.find_path_ignoring(from, to, 7).expect("a path through its own body");
    assert!(through_west_gap(&own), "the near gap: {own:?}");
    navmesh.remove_obstacle(7);
    assert_eq!(navmesh.epoch(), 2);
    assert!(through_west_gap(&path(&navmesh, from, to)), "the near gap again");
    navmesh.remove_obstacle(7);
    assert_eq!(navmesh.epoch(), 2, "removing what is not there changes nothing");
}

#[test]
fn obstacles_steer_a_path_but_never_sever_it() {
    let mut navmesh = two_gaps();
    navmesh.add_obstacle(1, -5.0, 0.0, 1.0);
    navmesh.add_obstacle(2, 5.0, 0.0, 1.0);
    let route = path(&navmesh, [-5.0, -5.0, 0.0], [-5.0, 5.0, 0.0]);
    ends_at(&route, [-5.0, 5.0, 0.0]);
}

#[test]
fn a_foe_standing_in_an_obstacle_walks_out_of_it() {
    let mut navmesh = two_gaps();
    navmesh.add_obstacle(3, -5.0, -5.0, 1.5);
    navmesh.add_obstacle(4, 5.0, 0.0, 1.0);
    let route = path(&navmesh, [-5.0, -5.0, 0.0], [-5.0, 5.0, 0.0]);
    assert!(through_west_gap(&route), "straight out by the near gap: {route:?}");
}

#[test]
fn a_kept_way_holds_its_gap_until_the_goal_moves_a_metre_or_an_obstacle_changes() {
    let mut navmesh = two_gaps();
    let from = [0.0, -5.0, 0.0];
    let kept = |navmesh: &NavMesh, way: &mut Way, x: f64| navmesh.find_path_kept(way, from, [x, 5.0, 0.0]).unwrap();
    let mut way = Way::default();
    let first = kept(&navmesh, &mut way, -0.5);
    assert_eq!(Some(first.clone()), navmesh.find_path(from, [-0.5, 5.0, 0.0]), "a new way is a fresh search");
    assert!(through_west_gap(&first), "the west gap, for a goal west of the middle");
    assert!(!through_west_gap(&path(&navmesh, from, [0.4, 5.0, 0.0])), "a fresh search goes east for one east of it");
    let held = kept(&navmesh, &mut way, 0.4);
    assert!(through_west_gap(&held), "the way holds while its goal moves under a metre: {held:?}");
    ends_at(&held, [0.4, 5.0, 0.0]);
    assert!(!through_west_gap(&kept(&navmesh, &mut way, 0.6)), "searched afresh once it moves further");
    let mut way = Way::default();
    assert!(through_west_gap(&kept(&navmesh, &mut way, -0.5)));
    navmesh.add_obstacle(1, -5.0, 0.0, 1.0);
    assert!(!through_west_gap(&kept(&navmesh, &mut way, -0.5)), "an obstacle laid in the gap: searched afresh");
}

#[test]
fn the_same_course_bakes_and_paths_the_same_twice() {
    let course = [block(-1.0, -4.0, 1.0, 4.0, 3.0), block(2.0, -2.0, 3.0, 2.0, 0.5), block(3.0, -2.0, 6.0, 2.0, 1.0)];
    let (first, second) = (bake(&course), bake(&course));
    assert_eq!(first, second);
    let ends = ([-5.0, 0.0, 0.0], [5.0, 0.0, 1.0]);
    assert_eq!(first.find_path(ends.0, ends.1), second.find_path(ends.0, ends.1));
}
