//! What a body runs into in a city: every solid of the plan reaching into a rectangle, as a box square to the world
//! (west, north, east, south, top, bottom), the shape the movement rules stand bodies against. Only the social space is
//! walked, so only what stands round it is ever asked for.

use crate::Plan;
use crate::solids::{Material, Solid};

/// A box a body runs into: west, north, east and south edges, its top and its underside, metres.
pub type Box2 = [f64; 6];

/// Solids lower than this over their foot are stepped over and left out, metres.
const LEAST_HEIGHT_M: f64 = 0.3;
/// A solid as a box, its underside where it really is: a roof, a lintel or a hung lamp over the floor is walked under.
fn into_box(solid: &Solid) -> Option<Box2> {
    if solid.material == Material::Paving || solid.size[2] < LEAST_HEIGHT_M {
        return None;
    }
    let [west, north, east, south, bottom, top] = solid.bounds();
    Some([west, north, east, south, top, bottom])
}

/// The plan's solids reaching into `bounds` (west, north, east, south), as boxes.
#[must_use]
pub fn boxes_within(plan: &Plan, bounds: [f64; 4]) -> Vec<Box2> {
    plan.social
        .solids
        .iter()
        .chain(&plan.landmark)
        .chain(&plan.works)
        .filter_map(into_box)
        .filter(|found| {
            found[0] <= bounds[2] && found[2] >= bounds[0] && found[1] <= bounds[3] && found[3] >= bounds[1]
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::solids::Shape;

    #[test]
    fn paving_and_low_kerbs_are_stepped_over() {
        let paving = Solid::upright(Shape::Block, [0.0, 0.0, 10.0], [100.0, 100.0, 0.05], Material::Paving);
        let kerb = Solid::upright(Shape::Block, [0.0, 0.0, 10.0], [5.0, 1.0, 0.2], Material::Stone);
        let parapet = Solid::upright(Shape::Block, [0.0, 0.0, 9.0], [5.0, 1.0, 2.1], Material::Stone);
        assert_eq!(into_box(&paving), None);
        assert_eq!(into_box(&kerb), None);
        assert_eq!(into_box(&parapet), Some([-2.5, -0.5, 2.5, 0.5, 11.1, 9.0]));
    }

    #[test]
    fn a_roof_over_the_floor_comes_back_with_its_underside() {
        let roof = Solid::upright(Shape::Gable, [0.0, 0.0, 16.0], [10.0, 80.0, 3.0], Material::Roof);
        let column = Solid::upright(Shape::Block, [0.0, 0.0, 10.0], [1.0, 1.0, 6.0], Material::Stone);
        assert_eq!(into_box(&roof), Some([-5.0, -40.0, 5.0, 40.0, 19.0, 16.0]));
        assert_eq!(into_box(&column), Some([-0.5, -0.5, 0.5, 0.5, 16.0, 10.0]));
    }
}
