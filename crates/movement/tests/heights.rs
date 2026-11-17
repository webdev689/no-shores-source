//! Ground known by a grid of heights, as a ship's deck is: walked between its cells, walled where it ends.

use movement::{Body, Controls, Heights, TICK_SECONDS, Terrain, step_body};

/// A deck of 4 by 3 cells of 0.5 m, its west edge at -1 m and its north at -0.75 m, level at 1 m but for one cell
/// a step higher and one that holds no height.
fn deck() -> Heights {
    let mut heights = vec![Some(1.0); 12];
    heights[5] = Some(1.2);
    heights[2] = None;
    Heights::new(-1.0, -0.75, 0.5, 4, 3, heights).expect("a grid whose shape holds its heights")
}

fn walk(from: Body, yaw: f64, ticks: usize) -> Body {
    let controls = Controls { forward: 1.0, yaw, ..Controls::default() };
    (0..ticks).fold(from, |body, _| step_body(&body, &controls, &[], &deck(), TICK_SECONDS))
}

#[test]
fn a_cells_centre_stands_at_its_height_and_between_centres_the_ground_blends() {
    let deck = deck();
    assert!((deck.height_at(-0.75, -0.5) - 1.0).abs() < 1e-12, "the north-west cell's centre");
    assert!((deck.height_at(-0.25, 0.0) - 1.2).abs() < 1e-12, "the raised cell's centre");
    assert!((deck.height_at(-0.5, 0.0) - 1.1).abs() < 1e-12, "half way to it");
}

#[test]
fn a_cell_with_no_height_and_the_ground_off_the_grid_are_walls() {
    let deck = deck();
    assert!(deck.height_at(0.25, -0.5) > 10.0, "the cell that holds none");
    assert!(deck.height_at(5.0, 0.0) > 10.0, "east of the grid");
    assert!(deck.stands_at(-0.75, -0.5) && !deck.stands_at(0.25, -0.5) && !deck.stands_at(-2.0, 0.0));
}

#[test]
fn a_body_walks_the_deck_and_is_stopped_at_its_edge_where_no_climb_takes_it_over() {
    let deck = deck();
    let start = deck.standing(-0.75, 0.5);
    assert!((start.z - 1.0).abs() < 1e-12, "it stands on the deck, not the ground under it");
    // East along the southern row for four seconds, far past the grid's edge.
    let walked = walk(start, std::f64::consts::FRAC_PI_2, 240);
    assert!(walked.x < 1.0 && walked.x > 0.0, "it reached the eastern cells and stopped at the wall: {}", walked.x);
    assert!((walked.z - 1.0).abs() < 0.01, "on the deck still");
    assert_eq!(walked.mode, movement::Mode::Ground, "a terrain wall is never taken hold of and climbed");
}

#[test]
fn a_grid_crosses_as_its_numbers_and_back_and_a_shape_that_does_not_hold_its_heights_is_none() {
    let deck = deck();
    assert_eq!(Heights::from_floats(&deck.to_floats()), Some(deck));
    assert!(Heights::new(0.0, 0.0, 0.5, 2, 2, vec![Some(1.0); 3]).is_none(), "three heights for four cells");
    assert!(Heights::new(0.0, 0.0, 0.0, 1, 1, vec![Some(1.0)]).is_none(), "a cell of no size");
    assert!(Heights::from_floats(&[0.0, 0.0, 0.5, 1.5, 1.0, 1.0]).is_none(), "half a column");
}

#[test]
fn a_wall_stands_at_its_cells_edge_so_a_passage_one_cell_wide_is_walked() {
    // A row of three cells, walled north and south: a passage 0.5 m wide, west to east.
    let mut heights = vec![None; 9];
    heights[3..6].copy_from_slice(&[Some(1.0); 3]);
    let passage = Heights::new(0.0, 0.0, 0.5, 3, 3, heights).expect("a grid");
    assert_eq!(passage.height_at(0.25, 0.55), 1.0, "a step inside its cell, the wall beside it blends in nothing");
    assert!(passage.height_at(0.25, 0.45) > 10.0, "over the cell's edge, the wall");
    let controls = Controls { forward: 1.0, yaw: std::f64::consts::FRAC_PI_2, ..Controls::default() };
    let walked =
        (0..60).fold(passage.standing(0.25, 0.75), |body, _| step_body(&body, &controls, &[], &passage, TICK_SECONDS));
    assert!(walked.x > 1.2, "it walked the passage to its far end: {}", walked.x);
}
