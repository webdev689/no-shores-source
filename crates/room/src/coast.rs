//! The continents' coasts as the sea judges courses by them: each ring with its bounds, so a point or a leg is judged
//! against the few coasts whose bounds it falls in, in whole metres.

use world::geometry::{Point, edges, ring_contains, segments_meet};
use world::layout::Layout;

/// A continent's coast, with its bounds to pass over it quickly.
#[derive(Debug)]
pub(crate) struct Coast {
    ring: Vec<Point>,
    west: i64,
    north: i64,
    east: i64,
    south: i64,
}

impl Coast {
    /// A coast round a ring of points, with its bounds.
    pub(crate) fn ring(ring: Vec<Point>) -> Coast {
        let (xs, ys) = (ring.iter().map(|point| point.x), ring.iter().map(|point| point.y));
        let (west, east) = (xs.clone().min().unwrap_or(0), xs.max().unwrap_or(0));
        let (north, south) = (ys.clone().min().unwrap_or(0), ys.max().unwrap_or(0));
        Coast { ring, west, north, east, south }
    }

    /// Each continent's coast of a layout that has three corners or more.
    pub(crate) fn of(layout: &Layout) -> Vec<Coast> {
        layout
            .continents
            .iter()
            .filter(|continent| continent.outline.len() >= 3)
            .map(|continent| Coast::ring(continent.outline.clone()))
            .collect()
    }
}

/// Whether a point lies on a continent.
pub(crate) fn on_land<'coast>(coasts: impl IntoIterator<Item = &'coast Coast>, point: Point) -> bool {
    coasts
        .into_iter()
        .filter(|coast| {
            coast.west <= point.x && coast.east >= point.x && coast.north <= point.y && coast.south >= point.y
        })
        .any(|coast| ring_contains(&coast.ring, point))
}

/// Whether a leg between two points meets a coast. A leg that never enters a coast's box, though its own box overlaps
/// it (a long leg passing a continent's corner), is told so by the box's four sides, not the coast's thousands.
pub(crate) fn leg_meets_land<'coast>(coasts: impl IntoIterator<Item = &'coast Coast>, from: Point, to: Point) -> bool {
    let (west, east) = (from.x.min(to.x), from.x.max(to.x));
    let (north, south) = (from.y.min(to.y), from.y.max(to.y));
    coasts
        .into_iter()
        .filter(|coast| coast.west <= east && coast.east >= west && coast.north <= south && coast.south >= north)
        .filter(|coast| leg_enters_box(coast, from, to))
        .any(|coast| edges(&coast.ring).any(|edge| segments_meet((from, to), edge)))
}

/// Whether a leg has an end inside a coast's box, or crosses one of its sides.
fn leg_enters_box(coast: &Coast, from: Point, to: Point) -> bool {
    let inside = |point: Point| {
        coast.west <= point.x && point.x <= coast.east && coast.north <= point.y && point.y <= coast.south
    };
    let corners = [
        Point::new(coast.west, coast.north),
        Point::new(coast.east, coast.north),
        Point::new(coast.east, coast.south),
        Point::new(coast.west, coast.south),
    ];
    inside(from) || inside(to) || edges(&corners).any(|side| segments_meet((from, to), side))
}
