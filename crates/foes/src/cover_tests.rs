//! A post's stances: the step aside is the shortest that turns the stance about, as wide as its cover asks; and cover
//! hides only what it hides from the eye as well as the chest.

use super::*;

/// The player's chest 14 m south of a spot.
const TARGET: [f64; 3] = [0.0, 14.0, 1.1];
const SPOT: [f64; 3] = [0.0, 0.0, 0.0];

/// A block between the spot and the target, `width` wide across the line and `top` high, a metre before the spot.
fn before_the_spot(width: f64, top: f64) -> Block {
    Block { min_x: -width / 2.0, min_y: 1.0, max_x: width / 2.0, max_y: 1.4, top, bottom: 0.0 }
}

/// How far a spot's stances stand apart, if it has them.
fn step(blocks: &[Block]) -> Option<f64> {
    stances(blocks, SPOT, TARGET).map(|(hide, fire)| apart(flat(hide), flat(fire)))
}

#[test]
fn the_step_aside_is_the_shortest_that_opens_the_line_as_wide_as_the_cover_asks() {
    let narrow = step(&[before_the_spot(0.4, 2.5)]).expect("a narrow post opens soon");
    assert!(narrow < 1.0, "past a post 0.4 m wide, a short step: {narrow}");
    let wide = step(&[before_the_spot(2.4, 2.5)]).expect("a wide wall opens farther out");
    assert!(wide > 1.4 && wide <= 2.0 + 1e-9, "past a wall 2.4 m wide, a long step: {wide}");
    assert_eq!(step(&[before_the_spot(4.0, 2.5)]), None, "past one 4 m wide, none within 2 m");
    let (hide, fire) = stances(&[before_the_spot(2.4, 2.5)], SPOT, TARGET).expect("a post");
    assert!(!exposed(&[before_the_spot(2.4, 2.5)], hide, TARGET) && fires(&[before_the_spot(2.4, 2.5)], fire, TARGET));
}

#[test]
fn cover_lower_than_the_eye_hides_no_one() {
    // A wall above the chest and below the eye: the head shows over it, so it is no place to hide.
    let low = [before_the_spot(1.0, 1.35)];
    assert!(!clear_line(&low, chest(SPOT), TARGET), "it hides the chest");
    assert_eq!(stances(&low, SPOT, TARGET), None, "but not the eye, so no post");
}

#[test]
fn a_step_aside_under_a_floor_overhead_is_free_and_one_into_a_wall_is_not() {
    let slab = Block { min_x: -3.0, min_y: -3.0, max_x: 3.0, max_y: 3.0, top: 3.2, bottom: 2.8 };
    assert!(free(&[slab], SPOT, [1.0, 0.0, 0.0]), "a body walks under the slab");
    let wall = Block { bottom: 0.0, ..slab };
    assert!(!free(&[wall], SPOT, [1.0, 0.0, 0.0]), "but not into a block from the ground up");
}
