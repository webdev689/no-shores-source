//! What a body runs into in a layout, as boxes square to the world (west, north, east, south, top, bottom), the
//! shape the movement rules stand bodies against: each building, each plinth and set piece, and each prop tall enough
//! not to be stepped over. A box's bottom is its real underside, so a body walks under one that stands over its head.

use crate::Layout;
use crate::book::Book;
use city::solids::Material;

/// A box a body runs into: west, north, east, south, top and bottom, metres, as the city's.
pub use city::collision::Box2 as Box3;

/// Props and solids lower than this over their foot are stepped over, metres.
const STEPPED_OVER_M: f64 = 0.45;

/// The boxes reaching into a rect (west, north, east, south).
pub fn within(boxes: &[Box3], bounds: [f64; 4]) -> impl Iterator<Item = Box3> + '_ {
    boxes.iter().copied().filter(move |found| {
        found[0] <= bounds[2] && found[2] >= bounds[0] && found[1] <= bounds[3] && found[3] >= bounds[1]
    })
}

/// Every box of a layout.
#[must_use]
pub fn boxes_of(layout: &Layout, book: &Book) -> Vec<Box3> {
    let mut boxes = Vec::new();
    for building in &layout.seating.buildings {
        let Some(measure) = book.measure(building.model, true) else { continue };
        let [west, north, east, south] = building.footprint;
        boxes.push([west, north, east, south, building.at[2] + measure.max[1], building.at[2] + measure.min[1]]);
    }
    for prop in &layout.seating.props {
        let Some(measure) = book.measure(prop.model, false) else { continue };
        if measure.max[1] - measure.min[1] < STEPPED_OVER_M {
            continue;
        }
        let [west, north, east, south] = prop.footprint;
        boxes.push([west, north, east, south, prop.at[2] + measure.max[1], prop.at[2] + measure.min[1]]);
    }
    for solid in &layout.seating.solids {
        if solid.material == Material::Paving || solid.size[2] < STEPPED_OVER_M {
            continue;
        }
        let [west, north, east, south, bottom, top] = solid.bounds();
        boxes.push([west, north, east, south, top, bottom]);
    }
    boxes
}
