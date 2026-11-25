//! What a body runs into in a layout, as boxes square to the world (west, north, east, south, top, bottom), the
//! shape the movement rules stand bodies against: the walls, floors, ceilings and stairs of the buildings walked into,
//! each other building whole, each plinth and set piece, and each prop tall enough not to be stepped over; none for
//! what lies wholly past the section. A box's bottom is its real underside, so a body walks under one that stands over
//! its head, and an arch is its jambs and its head, so a body walks through it.

use crate::Layout;
use crate::book::{Book, Measure};
use crate::seat::{Seated, Seating};
use city::solids::Material;

/// A box a body runs into: west, north, east, south, top and bottom, metres, as the city's.
pub use city::collision::Box2 as Box3;

/// Props and solids lower than this over their foot are stepped over, metres.
const STEPPED_OVER_M: f64 = 0.45;
/// How far a body's head stands over its feet, and how far from a box its middle keeps, metres.
const HEAD_M: f64 = 1.8;
const BODY_CLEAR_M: f64 = 0.5;

/// The section as cells held or not, a cell next to a held one counted held, so a box at its very edge is kept.
struct Section {
    west: f64,
    north: f64,
    columns: usize,
    rows: usize,
    held: Vec<bool>,
}

/// The section's cells' side, metres.
const SECTION_CELL_M: f64 = 2.0;
/// A piece wider than this is kept by any corner in the section, not only its middle: a wall across a canyon whose
/// ends are sunk in the cliffs. Metres.
const WIDE_M: f64 = 8.0;

impl Section {
    /// The ring filled row by row from where its edges cross each row's middle, then grown by a cell.
    fn of(ring: &[[f64; 2]]) -> Self {
        if ring.len() < 3 {
            return Self { west: 0.0, north: 0.0, columns: 0, rows: 0, held: Vec::new() };
        }
        let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
        let [west, north, east, south] = ring
            .iter()
            .fold(start, |[west, north, east, south], &[x, y]| [west.min(x), north.min(y), east.max(x), south.max(y)]);
        let (west, north) = (west - SECTION_CELL_M, north - SECTION_CELL_M);
        let columns = ((east - west) / SECTION_CELL_M) as usize + 3;
        let rows = ((south - north) / SECTION_CELL_M) as usize + 3;
        let mut inside = vec![false; columns * rows];
        for row in 0..rows {
            let y = north + (row as f64 + 0.5) * SECTION_CELL_M;
            let mut crossings: Vec<f64> = (0..ring.len())
                .filter_map(|at| {
                    let ([x1, y1], [x2, y2]) = (ring[at], ring[(at + 1) % ring.len()]);
                    ((y1 > y) != (y2 > y)).then(|| x1 + (y - y1) / (y2 - y1) * (x2 - x1))
                })
                .collect();
            crossings.sort_by(f64::total_cmp);
            for pair in crossings.chunks_exact(2) {
                let first = ((pair[0] - west) / SECTION_CELL_M - 0.5).ceil().max(0.0) as usize;
                let last = ((pair[1] - west) / SECTION_CELL_M - 0.5).floor();
                if last < 0.0 {
                    continue;
                }
                for column in first..=(last as usize).min(columns - 1) {
                    inside[row * columns + column] = true;
                }
            }
        }
        let mut held = inside.clone();
        for row in 0..rows {
            for column in 0..columns {
                if !inside[row * columns + column] {
                    continue;
                }
                let near = [
                    (row.wrapping_sub(1), column),
                    (row + 1, column),
                    (row, column.wrapping_sub(1)),
                    (row, column + 1),
                ];
                for (near_row, near_column) in near {
                    if near_row < rows && near_column < columns {
                        held[near_row * columns + near_column] = true;
                    }
                }
            }
        }
        Self { west, north, columns, rows, held }
    }

    fn holds(&self, x: f64, y: f64) -> bool {
        let (column, row) = (((x - self.west) / SECTION_CELL_M).floor(), ((y - self.north) / SECTION_CELL_M).floor());
        column >= 0.0
            && row >= 0.0
            && (column as usize) < self.columns
            && (row as usize) < self.rows
            && self.held[row as usize * self.columns + column as usize]
    }

    /// Whether a piece over a footprint (west, north, east, south) can be reached: what lies wholly past the section,
    /// at the cliffs' feet or on their tops, never is.
    fn reaches(&self, [west, north, east, south]: [f64; 4]) -> bool {
        let middle = [(west + east) / 2.0, (north + south) / 2.0];
        let wide = east - west > WIDE_M || south - north > WIDE_M;
        let corners = [[west, north], [east, north], [east, south], [west, south]];
        self.holds(middle[0], middle[1]) || (wide && corners.iter().any(|&[x, y]| self.holds(x, y)))
    }
}

/// The boxes reaching into a rect (west, north, east, south).
pub fn within(boxes: &[Box3], bounds: [f64; 4]) -> impl Iterator<Item = Box3> + '_ {
    boxes.iter().copied().filter(move |found| {
        found[0] <= bounds[2] && found[2] >= bounds[0] && found[1] <= bounds[3] && found[3] >= bounds[1]
    })
}

/// Every box of a layout, to the centimetre.
#[must_use]
pub fn boxes_of(layout: &Layout, book: &Book) -> Vec<Box3> {
    // To the centimetre, grown out to it so no box shrinks: thousands of them are written into each node's file.
    seated_boxes(&layout.seating, &layout.ring, book)
        .into_iter()
        .map(|found| {
            let [west, north, east, south, top, bottom] = found;
            let (down, up) =
                (|value: f64| (value * 100.0).floor() / 100.0, |value: f64| (value * 100.0).ceil() / 100.0);
            [down(west), down(north), up(east), up(south), up(top), down(bottom)]
        })
        .collect()
}

/// Every box of what is seated in a section's ring.
#[must_use]
pub fn seated_boxes(seating: &Seating, ring: &[[f64; 2]], book: &Book) -> Vec<Box3> {
    let mut boxes = Vec::new();
    let section = Section::of(ring);
    boxes.extend(seating.walls.iter().copied());
    for building in seating.buildings.iter().filter(|building| !building.open) {
        let Some(measure) = book.measure(building.model, true) else { continue };
        let [west, north, east, south] = building.footprint;
        boxes.push([west, north, east, south, building.at[2] + measure.max[1], building.at[2] + measure.min[1]]);
    }
    for prop in &seating.props {
        let Some(measure) = book.measure(prop.model, false) else { continue };
        if measure.max[1] - measure.min[1] < STEPPED_OVER_M || !section.reaches(prop.footprint) {
            continue;
        }
        boxes.extend(prop_boxes(prop, measure, book.parts.get(&prop.model)));
    }
    for solid in &seating.solids {
        if matches!(solid.material, Material::Paving | Material::Path | Material::Lawn | Material::Earth)
            || solid.size[2] < STEPPED_OVER_M
        {
            continue;
        }
        // A solid boxed upright or as a circle reaches up to `KEEP_M` past its turned corners.
        let [west, north, east, south, ..] = solid.bounds();
        let keep = city::hug::KEEP_M;
        if section.reaches([west - keep, north - keep, east + keep, south + keep]) {
            boxes.extend(city::collision::boxes(solid));
        }
    }
    boxes
}

/// How far a prop's part stands past what is drawn at most: a column of `client/src/models/propParts.ts`.
const PART_CELL_M: f64 = 0.25;
/// How far a turned prop's strips stand off its parts: what `KEEP_M` leaves past a part's column, so a turned prop's
/// edge stands no further past what is drawn than a solid's.
pub const STRIPS_KEEP_M: f64 = city::hug::KEEP_M - PART_CELL_M;

/// A prop's boxes: each part its drawn shape fills (its whole box where that keeps to it) where the prop stands, a
/// part turned off the world's axes in strips (`prop_kept`). A gate's arch is shut: its parts reach down to its foot,
/// so the opening its bar spans stays closed as its whole box kept it.
#[must_use]
pub fn prop_boxes(prop: &Seated, measure: &Measure, parts: Option<&Vec<[f64; 6]>>) -> Vec<Box3> {
    prop_kept(prop, measure, parts).0
}

/// A prop's boxes and how many times `STRIPS_KEEP_M` its strips keep within: a turned prop too costly to strip so
/// closely (`city::collision::affordable`) is stripped a quarter looser at a time, as a solid is.
#[must_use]
pub fn prop_kept(prop: &Seated, measure: &Measure, parts: Option<&Vec<[f64; 6]>>) -> (Vec<Box3>, f64) {
    let [min_x, min_y, min_z] = measure.min;
    let [max_x, max_y, max_z] = measure.max;
    let whole = [[min_x, min_y, min_z, max_x, max_y, max_z]];
    let parts: &[[f64; 6]] = parts.map_or(&whole, Vec::as_slice);
    let shut = crate::pieces::model::GATE_ARCHES.contains(&prop.model);
    let (sine, cosine) = land::exact::sin_cos(prop.yaw.to_radians());
    let square = (prop.yaw / 90.0 - (prop.yaw / 90.0).round()).abs() < 1e-9;
    let world = |x: f64, z: f64| [prop.at[0] + x * cosine + z * sine, prop.at[1] + x * sine - z * cosine];
    let boxed = |loosened: f64| -> Vec<Box3> {
        parts
            .iter()
            .flat_map(|&[x0, y0, z0, x1, y1, z1]| {
                let bottom = prop.at[2] + if shut { min_y } else { y0 };
                let corners = [world(x0, z0), world(x1, z0), world(x1, z1), world(x0, z1)];
                if square {
                    let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
                    let [west, north, east, south] =
                        corners.iter().fold(start, |[west, north, east, south], &[x, y]| {
                            [west.min(x), north.min(y), east.max(x), south.max(y)]
                        });
                    vec![[west, north, east, south, prop.at[2] + y1, bottom]]
                } else {
                    city::hug::strips(corners, bottom, prop.at[2] + y1, STRIPS_KEEP_M * loosened)
                }
            })
            .collect()
    };
    if square {
        return (boxed(1.0), 1.0);
    }
    // Loosening thins only the strips: a prop of many parts may spend twice what its loosest strips cost, so its
    // strips stay as close as that allows rather than falling to the loosest.
    let footprint = (max_x - min_x) * (max_z - min_z);
    let loosest_at = (0..city::collision::MOST_LOOSENINGS).fold(1.0, |at, _| at * city::collision::LOOSER);
    let loosest = boxed(loosest_at);
    let (least, least_crowding) = (2 * loosest.len(), 2 * city::collision::crowding(&loosest));
    let mut loosened = 1.0;
    for _ in 0..city::collision::MOST_LOOSENINGS {
        let found = boxed(loosened);
        if city::collision::affordable(&found, footprint, least, least_crowding) {
            return (found, loosened);
        }
        loosened *= city::collision::LOOSER;
    }
    (loosest, loosest_at)
}

/// Whether a body standing at `at` on a floor `floor` metres high stands clear of every box: none taller than a
/// step over its feet and under its head reaches within a body's width of it.
#[must_use]
pub fn stands_clear(boxes: &[Box3], at: [f64; 2], floor: f64) -> bool {
    !boxes.iter().any(|&[west, north, east, south, top, bottom]| {
        let [x, y] = at;
        x > west - BODY_CLEAR_M
            && x < east + BODY_CLEAR_M
            && y > north - BODY_CLEAR_M
            && y < south + BODY_CLEAR_M
            && bottom < floor + HEAD_M
            && top > floor + STEPPED_OVER_M
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const RING: [[f64; 2]; 4] = [[-50.0, -50.0], [50.0, -50.0], [50.0, 50.0], [-50.0, 50.0]];

    /// A book of one prop, a long one 6 m by 1 m and 3 m tall, and the parts its drawn shape fills: a post at one end
    /// and a bar over a body's head along it, as a signpost's.
    fn book(model: u32, parts: Option<Vec<[f64; 6]>>) -> Book {
        let mut book = Book::default();
        let measure =
            Measure { min: [-3.0, 0.0, -0.5], max: [3.0, 3.0, 0.5], grid: None, plan: Vec::new(), doors: Vec::new() };
        book.props.insert(model, measure);
        if let Some(parts) = parts {
            book.parts.insert(model, parts);
        }
        book
    }

    fn seated(model: u32, yaw: f64) -> Seating {
        let footprint = [-3.0, -3.0, 3.0, 3.0];
        let (building, purpose, open, grounded) = (false, 0, false, true);
        let prop = Seated { model, at: [0.0, 0.0, 10.0], yaw, building, footprint, purpose, open, grounded };
        Seating { props: vec![prop], ..Seating::default() }
    }

    /// How far a world point lies from the nearest part, in the prop's own frame, as the page stands it (yaw degrees).
    fn off_parts(parts: &[[f64; 6]], yaw: f64, [east, south, up]: [f64; 3]) -> f64 {
        let (sine, cosine) = land::exact::sin_cos(yaw.to_radians());
        let (x, z, y) = (east * cosine + south * sine, east * sine - south * cosine, up - 10.0);
        let gap = |value: f64, low: f64, high: f64| (low - value).max(value - high).max(0.0);
        parts
            .iter()
            .map(|&[x0, y0, z0, x1, y1, z1]| {
                let (across, rise, along) = (gap(x, x0, x1), gap(y, y0, y1), gap(z, z0, z1));
                (across * across + rise * rise + along * along).sqrt()
            })
            .fold(f64::INFINITY, f64::min)
    }

    #[test]
    fn a_turned_prop_is_its_drawn_parts_in_strips_that_keep_to_them_not_a_box_round_its_turned_corners() {
        let parts = vec![[-3.0, 0.0, -0.5, -2.6, 3.0, 0.5], [-3.0, 2.2, -0.2, 3.0, 3.0, 0.2]];
        for yaw in [0.0, 90.0, 30.0, 137.0] {
            let boxes = seated_boxes(&seated(7, yaw), &RING, &book(7, Some(parts.clone())));
            for [west, north, east, south, top, bottom] in &boxes {
                for corner in 0..8 {
                    let point = [
                        if corner & 1 == 0 { *west } else { *east },
                        if corner & 2 == 0 { *north } else { *south },
                        if corner & 4 == 0 { *bottom } else { *top },
                    ];
                    let off = off_parts(&parts, yaw, point);
                    assert!(off <= city::hug::KEEP_M + 1e-9, "at {yaw}: a corner {off:.2} m off the prop");
                }
            }
            // Under the bar, beside the post, a body stands: nothing reaches down there.
            let under = |along: f64| {
                let (sine, cosine) = land::exact::sin_cos(yaw.to_radians());
                [along * cosine, along * sine]
            };
            assert!(stands_clear(&boxes, under(1.5), 10.0), "at {yaw}: under the bar");
            assert!(!stands_clear(&boxes, under(-2.8), 10.0), "at {yaw}: the post");
        }
        let square = seated_boxes(&seated(7, 90.0), &RING, &book(7, Some(parts)));
        assert_eq!(square.len(), 2, "a quarter turn keeps each part one box");
    }

    #[test]
    fn a_prop_with_no_parts_of_its_own_is_its_box_and_one_with_none_is_stepped_over() {
        assert_eq!(seated_boxes(&seated(7, 0.0), &RING, &book(7, None)), vec![[-3.0, -0.5, 3.0, 0.5, 13.0, 10.0]]);
        assert!(seated_boxes(&seated(7, 0.0), &RING, &book(7, Some(Vec::new()))).is_empty());
    }

    #[test]
    fn a_gates_arch_is_its_piers_and_bar_with_the_opening_under_the_bar_shut() {
        let gate = crate::pieces::model::GATE_ARCHES[0];
        let parts =
            vec![[-3.0, 0.0, -0.5, -2.0, 3.0, 0.5], [-2.0, 2.0, -0.5, 2.0, 2.6, 0.5], [2.0, 0.0, -0.5, 3.0, 3.0, 0.5]];
        let boxes = seated_boxes(&seated(gate, 0.0), &RING, &book(gate, Some(parts)));
        assert_eq!(boxes.len(), 3);
        assert!(boxes.iter().all(|&[.., bottom]| bottom == 10.0), "every part down to its foot");
        assert_eq!(boxes[1][4], 12.6, "the bar's top, under the piers'");
    }

    #[test]
    fn the_section_holds_its_ring_and_a_cell_round_it_and_nothing_further() {
        let ring = [[0.0, 0.0], [40.0, 0.0], [40.0, 20.0], [0.0, 20.0]];
        let section = Section::of(&ring);
        assert!(section.holds(20.0, 10.0) && section.holds(1.0, 1.0) && section.holds(41.0, 10.0));
        assert!(!section.holds(46.0, 10.0) && !section.holds(20.0, -5.0));
        assert!(section.reaches([30.0, -30.0, 60.0, 5.0]), "a wide piece with a corner in");
        assert!(!section.reaches([44.0, 5.0, 47.0, 8.0]), "a stone past the edge");
    }
}
