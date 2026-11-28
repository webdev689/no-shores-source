//! The watershed's own cases, on an open field as a bake lays it.

use crate::collider::Collider;
use crate::compact;
use crate::{AGENT, Agent, Bounds, raster};
use movement::{Block, Terrain};

/// A way 3.2 m wide that winds back over itself, as a dungeon's does from one storey to the one over it: a corridor
/// at -8 m along y, turning east at its north end onto a ramp that climbs south to 0 m, and from the ramp's top a way
/// at 0 m west, over the corridor on a slab of rock from 4 m over the corridor's floor up to the way's.
struct OverItself;

impl Terrain for OverItself {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        let corridor = x.abs() < 1.6 && (-16.0..12.0).contains(&y);
        let turn = (-1.6..9.6).contains(&x) && (-16.0..-12.8).contains(&y);
        let ramp = (6.4..9.6).contains(&x) && (-12.8..3.2).contains(&y);
        let way = (-6.4..9.6).contains(&x) && (3.2..6.4).contains(&y);
        if corridor || turn {
            -8.0
        } else if ramp {
            -8.0 + (y + 12.8) * 0.5
        } else if way {
            0.0
        } else {
            10.0
        }
    }
}

#[test]
fn no_region_lies_over_itself_where_a_way_winds_back_over_its_own_floor() {
    // Over this field one region once grew from the corridor up the ramp, along the way and back over the corridor
    // under it, so 24 columns held two of its floors and its outline crossed itself.
    let agent = Agent { cell_size: 0.4, walks_to_drops: true, ..AGENT };
    let bounds = Bounds { min_x: -12.0, min_y: -24.0, max_x: 16.0, max_y: 16.0 };
    let slab = Block { min_x: -1.6, min_y: 3.2, max_x: 1.6, max_y: 6.4, top: 0.0, bottom: -4.0 };
    let solid = raster::voxelise(&[Collider::from(slab)], &OverItself, bounds, &agent, true);
    let mut field = compact::open(&solid, &agent);
    compact::erode(&mut field, &agent);
    // The way's floors, under the rock's tops at 10 m.
    let floors = |field: &compact::CompactField| {
        let under_rock = |floor: i64| field.grid.height(floor) < 5.0;
        field.columns.iter().flatten().filter(|span| span.walkable && under_rock(span.floor)).count()
    };
    let open = floors(&field);
    super::partition(&mut field, &[], Some([0.0, 10.0, -8.0]), false);
    assert_eq!(floors(&field), open, "every floor of the way kept: it is all one walk");
    let stacked = field.columns.iter().filter(|spans| {
        let regions: Vec<usize> = spans.iter().filter(|span| span.walkable).map(|span| span.region).collect();
        regions.iter().enumerate().any(|(at, region)| regions[at + 1..].contains(region))
    });
    assert_eq!(stacked.count(), 0, "columns holding two floors of one region");
    // Nor does a region meet itself beside a span it does not link to, as the corridor beside the slab's top would.
    let cells_x = field.grid.cells_x;
    let mut unjoined = 0;
    for (column, spans) in field.columns.iter().enumerate() {
        for span in spans.iter().filter(|span| span.walkable) {
            for direction in 0..4 {
                let Some((next_x, next_y)) = field.beside(column % cells_x, column / cells_x, direction) else {
                    continue;
                };
                let next = &field.columns[next_x + next_y * cells_x];
                let own = |(index, other): &(usize, &compact::OpenSpan)| {
                    other.walkable && other.region == span.region && span.links[direction] != Some(*index)
                };
                unjoined += next.iter().enumerate().filter(own).count();
            }
        }
    }
    assert_eq!(unjoined, 0, "spans beside a span of their own region they do not link to");
}
