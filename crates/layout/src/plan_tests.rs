//! A way keeps clear what would stand on it, as the plan keeps each piece off the ways.

use super::*;
use city::solids::{Material, Shape, Solid};

#[test]
fn a_lantern_on_a_way_goes_with_its_light_and_a_pile_under_a_deck_stays() {
    let path =
        Path { tier: Tier::Track, points: vec![[0.0, 0.0], [100.0, 0.0]], crossings: Vec::new(), heights: Vec::new() };
    let solid = |at: [f64; 3], size: [f64; 3]| Solid::upright(Shape::Block, at, size, Material::Timber);
    let mut seating = Seating {
        solids: vec![
            solid([50.0, 1.0, -0.3], [0.16, 0.16, 2.8]),
            solid([50.0, 1.0, 2.5], [0.2, 0.2, 0.26]),
            solid([60.0, 0.5, -6.0], [0.5, 0.5, 6.0]),
            solid([70.0, 9.0, -0.3], [0.16, 0.16, 2.8]),
        ],
        ..Seating::default()
    };
    clearing::keep_off_paths(&mut seating, &[path], &|_, _| 0.0);
    let left: Vec<[f64; 2]> = seating.solids.iter().map(|solid| [solid.at[0], solid.at[1]]).collect();
    assert_eq!(left, [[60.0, 0.5], [70.0, 9.0]], "the lantern on the track and its light are gone");
}
