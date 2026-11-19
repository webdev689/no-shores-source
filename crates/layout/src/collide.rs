//! What a body runs into in a layout, as boxes square to the world (west, north, east, south, top, bottom), the
//! shape the movement rules stand bodies against: the walls, floors and stairs of the buildings walked into, each other
//! building whole, each plinth and set piece, and each prop tall enough not to be stepped over; none for what lies
//! wholly past the section. A box's bottom is its real underside, so a body walks under one that stands over its
//! head, and an arch is its jambs and its head, so a body walks through it.

use crate::Layout;
use crate::book::Book;
use city::solids::{Material, Shape, Solid};

/// A box a body runs into: west, north, east, south, top and bottom, metres, as the city's.
pub use city::collision::Box2 as Box3;

/// Props and solids lower than this over their foot are stepped over, metres.
const STEPPED_OVER_M: f64 = 0.45;
/// An arch's opening is this share of its width, as the browser draws it (client/src/city/solidMesh.ts).
const ARCH_OPENING_WIDTH: f64 = 0.8;

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

/// An upright arch's boxes: its two jambs whole and its head over the crown of its opening, so a body passes under it.
fn arch_boxes(solid: &Solid, opening: f64) -> [Box3; 3] {
    let (sine, cosine) = land::exact::sin_cos(solid.turn);
    let [width, depth, height] = solid.size;
    let half = width / 2.0;
    let piece = |from: f64, to: f64, bottom: f64, top: f64| -> Box3 {
        let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
        let [west, north, east, south] =
            [[from, -depth / 2.0], [to, -depth / 2.0], [from, depth / 2.0], [to, depth / 2.0]].iter().fold(
                start,
                |[west, north, east, south], &[across, along]| {
                    let x = solid.at[0] + across * cosine - along * sine;
                    let y = solid.at[1] + across * sine + along * cosine;
                    [west.min(x), north.min(y), east.max(x), south.max(y)]
                },
            );
        [west, north, east, south, solid.at[2] + top, solid.at[2] + bottom]
    };
    let crown = opening.clamp(0.05, 0.95) * height;
    let jamb = half * ARCH_OPENING_WIDTH;
    [piece(-half, -jamb, 0.0, height), piece(jamb, half, 0.0, height), piece(-half, half, crown, height)]
}

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
    let section = Section::of(&layout.ring);
    boxes.extend(layout.seating.walls.iter().copied());
    for building in layout.seating.buildings.iter().filter(|building| !building.open) {
        let Some(measure) = book.measure(building.model, true) else { continue };
        let [west, north, east, south] = building.footprint;
        boxes.push([west, north, east, south, building.at[2] + measure.max[1], building.at[2] + measure.min[1]]);
    }
    for prop in &layout.seating.props {
        let Some(measure) = book.measure(prop.model, false) else { continue };
        if measure.max[1] - measure.min[1] < STEPPED_OVER_M || !section.reaches(prop.footprint) {
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
        if !section.reaches([west, north, east, south]) {
            continue;
        }
        match solid.shape {
            Shape::CaveRoof { .. } | Shape::Overhang { .. } | Shape::RockArch { .. } | Shape::TunnelMouth { .. } => {
                boxes.extend(city::rock::boxes(solid));
            }
            Shape::Arch { opening } if solid.lean == 0.0 && solid.roll == 0.0 => {
                boxes.extend(arch_boxes(solid, opening))
            }
            _ => boxes.push([west, north, east, south, top, bottom]),
        }
    }
    // To the centimetre, grown out to it so no box shrinks: thousands of them are written into each node's file.
    boxes
        .into_iter()
        .map(|found| {
            let [west, north, east, south, top, bottom] = found;
            let (down, up) =
                (|value: f64| (value * 100.0).floor() / 100.0, |value: f64| (value * 100.0).ceil() / 100.0);
            [down(west), down(north), up(east), up(south), up(top), down(bottom)]
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_section_holds_its_ring_and_a_cell_round_it_and_nothing_further() {
        let ring = [[0.0, 0.0], [40.0, 0.0], [40.0, 20.0], [0.0, 20.0]];
        let section = Section::of(&ring);
        assert!(section.holds(20.0, 10.0) && section.holds(1.0, 1.0) && section.holds(41.0, 10.0));
        assert!(!section.holds(46.0, 10.0) && !section.holds(20.0, -5.0));
        assert!(section.reaches([30.0, -30.0, 60.0, 5.0]), "a wide piece with a corner in");
        assert!(!section.reaches([44.0, 5.0, 47.0, 8.0]), "a stone past the edge");
    }

    #[test]
    fn a_body_passes_under_an_arch_but_not_through_its_jambs() {
        let arch = Solid::upright(Shape::Arch { opening: 0.7 }, [0.0, 0.0, 10.0], [40.0, 8.0, 30.0], Material::Rubble);
        let boxes = arch_boxes(&arch, 0.7);
        let holds = |x: f64, y: f64, z: f64| {
            boxes.iter().any(|&[west, north, east, south, top, bottom]| {
                (west..=east).contains(&x) && (north..=south).contains(&y) && (bottom..=top).contains(&z)
            })
        };
        assert!(!holds(0.0, 0.0, 11.0) && !holds(12.0, 3.0, 20.0), "the opening is free");
        assert!(holds(19.0, 0.0, 12.0) && holds(-19.0, 0.0, 12.0), "the jambs stand either side");
        assert!(holds(0.0, 0.0, 10.0 + 21.5), "the head is over the crown");
    }
}
