use super::*;
use crate::layout;

pub(crate) fn world_layout() -> Layout {
    layout::parse(include_str!("../../../content/world/layout.json")).expect("the layout reads")
}

/// A small seeded generator, the same on every run.
pub(crate) struct Seeded(u64);

impl Seeded {
    pub(crate) fn new(seed: u64) -> Self {
        Self(seed)
    }

    /// A number in [0, 1).
    pub(crate) fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 11) as f64 / (1_u64 << 53) as f64
    }
}

fn inside(ring: &[[f64; 2]], point: [f64; 2]) -> bool {
    let mut inside = false;
    for i in 0..ring.len() {
        let (a, b) = (ring[i], ring[(i + 1) % ring.len()]);
        if (a[1] > point[1]) != (b[1] > point[1]) {
            let crossing_x = a[0] + (point[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
            if point[0] < crossing_x {
                inside = !inside;
            }
        }
    }
    inside
}

/// The nearest coast by looking at every edge: the continent and the distance, or none on land.
fn brute_force(waters: &Waters, point: [f64; 2]) -> Option<(usize, f64)> {
    let mut best: Option<(usize, f64)> = None;
    for continent in 0..waters.continent_count() {
        let ring = waters.ring(continent);
        if inside(ring, point) {
            return None;
        }
        for i in 0..ring.len() {
            let distance = to_segment(point, ring[i], ring[(i + 1) % ring.len()]).0;
            if best.is_none_or(|(_, least)| distance < least) {
                best = Some((continent, distance));
            }
        }
    }
    best
}

fn index_of(layout: &Layout, id: &str) -> usize {
    layout.continents.iter().position(|continent| continent.id == id).expect("the continent is in the layout")
}

#[test]
fn the_table_names_each_island_water_and_its_holder() {
    let holders: Vec<Holder> = (1..=9).map(|n| holder_of(&format!("continent-{n}")).unwrap()).collect();
    use Holder::{Contested, GreyTithe, Home, Pirates};
    assert_eq!(holders, [Home, Contested, GreyTithe, Pirates, Pirates, Pirates, GreyTithe, GreyTithe, GreyTithe]);
    assert_eq!(name_of("continent-1"), Some("The Lantern Sea"));
    assert_eq!(name_of("continent-4"), Some("The Sunscorch Coves"));
    assert_eq!(name_of("continent-9"), Some("The Rimeholt Deep"));
    assert_eq!(name_of("continent-10"), None);
}

#[test]
fn the_waters_border_exactly_as_measured() {
    let layout = world_layout();
    let waters = Waters::new(&layout);
    let named: Vec<[usize; 2]> = waters.borders().iter().map(|pair| pair.map(|index| index + 1)).collect();
    let expected = [
        [1, 2],
        [1, 3],
        [1, 4],
        [1, 5],
        [1, 8],
        [1, 9],
        [2, 5],
        [2, 6],
        [2, 9],
        [3, 7],
        [3, 8],
        [3, 9],
        [4, 5],
        [4, 8],
        [5, 6],
        [7, 8],
        [7, 9],
    ];
    assert_eq!(named, expected);
    let pirate_tithe: Vec<&[usize; 2]> = expected
        .iter()
        .filter(|pair| {
            let holders = pair.map(|n| holder_of(&format!("continent-{n}")).unwrap());
            holders.contains(&Holder::Pirates) && holders.contains(&Holder::GreyTithe)
        })
        .collect();
    assert_eq!(pirate_tithe, [&[4, 8]], "4-8 is the one border between the pirates and the Tithe");
}

#[test]
fn water_at_agrees_with_a_brute_force_nearest_coast() {
    let waters = Waters::new(&world_layout());
    let mut random = Seeded::new(7);
    for _ in 0..2_000 {
        let point = [random.next() * FRAME_WIDTH_M as f64, random.next() * FRAME_HEIGHT_M as f64];
        let expected = brute_force(&waters, point);
        let found = waters.water_at(point);
        assert_eq!(found.map(|water| water.continent), expected.map(|(continent, _)| continent), "at {point:?}");
        if let (Some(nearest), Some((_, distance))) = (waters.nearest(point), expected) {
            assert_eq!(nearest.distance_squared, distance, "at {point:?}");
        }
    }
}

#[test]
fn just_offshore_each_port_city_is_its_own_island_water() {
    let layout = world_layout();
    let waters = Waters::new(&layout);
    for (index, continent) in layout.continents.iter().enumerate() {
        let path = format!("{}/../../content/world/land/{}.json", env!("CARGO_MANIFEST_DIR"), continent.id);
        let file: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let centre = [file["city"]["centre"][0].as_f64().unwrap(), file["city"]["centre"][1].as_f64().unwrap()];
        assert!(waters.water_at(centre).is_none(), "{} stands on land", continent.id);
        let ring = waters.ring(index);
        let (corner, _) = (0..ring.len())
            .map(|i| {
                let (distance, fraction) = to_segment(centre, ring[i], ring[(i + 1) % ring.len()]);
                (i, (distance, fraction))
            })
            .min_by(|a, b| a.1.0.total_cmp(&b.1.0))
            .unwrap();
        let (_, fraction) = to_segment(centre, ring[corner], ring[(corner + 1) % ring.len()]);
        let (a, b) = (ring[corner], ring[(corner + 1) % ring.len()]);
        let coast = [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
        let (away_x, away_y) = (coast[0] - centre[0], coast[1] - centre[1]);
        let length = (away_x * away_x + away_y * away_y).sqrt();
        let offshore = [coast[0] + 2_000.0 * away_x / length, coast[1] + 2_000.0 * away_y / length];
        assert_eq!(waters.water_at(offshore).map(|water| water.continent), Some(index), "off {}", continent.id);
    }
}

#[test]
fn seam_points_are_contested_and_only_along_the_fourth_and_eighth() {
    let layout = world_layout();
    let waters = Waters::new(&layout);
    let (fourth, eighth) = (index_of(&layout, "continent-4"), index_of(&layout, "continent-8"));
    let grid = waters.grid(20_000.0);
    let mut seen = [false; 2];
    for (cell, &byte) in grid.cells.iter().enumerate() {
        let middle = [((cell % grid.columns) as f64 + 0.5) * 20_000.0, ((cell / grid.columns) as f64 + 0.5) * 20_000.0];
        let Some(water) = waters.water_at(middle) else { continue };
        if water.seam {
            assert_eq!(water.holder, Holder::Contested);
            assert!(byte & SEAM_BIT != 0);
            assert!(water.continent == fourth || water.continent == eighth, "seam only off the fourth and eighth");
            seen[usize::from(water.continent == eighth)] = true;
        } else {
            assert_eq!(water.holder, holder_of(&layout.continents[water.continent].id).unwrap());
        }
    }
    assert_eq!(seen, [true, true], "the seam runs on both sides of the border");
}

#[test]
fn land_has_no_water() {
    let layout = world_layout();
    let waters = Waters::new(&layout);
    let mut random = Seeded::new(3);
    for (index, continent) in layout.continents.iter().enumerate() {
        let ring = waters.ring(index);
        let (west, east) =
            ring.iter().fold((f64::MAX, f64::MIN), |(least, most), point| (least.min(point[0]), most.max(point[0])));
        let (north, south) =
            ring.iter().fold((f64::MAX, f64::MIN), |(least, most), point| (least.min(point[1]), most.max(point[1])));
        let mut inland = 0;
        while inland < 50 {
            let point = [west + random.next() * (east - west), north + random.next() * (south - north)];
            if inside(ring, point) {
                assert_eq!(waters.water_at(point), None, "{point:?} is inland on {}", continent.id);
                inland += 1;
            }
        }
        for corner in ring {
            assert_eq!(waters.water_at(*corner), None, "the coast itself is land");
        }
    }
}

#[test]
fn the_grid_agrees_with_water_at_at_its_cell_middles() {
    let waters = Waters::new(&world_layout());
    let grid = waters.grid(48_000.0);
    assert_eq!((grid.columns, grid.rows), (103, 64));
    for row in 0..grid.rows {
        for column in 0..grid.columns {
            let middle = [(column as f64 + 0.5) * 48_000.0, (row as f64 + 0.5) * 48_000.0];
            let expected = match waters.water_at(middle) {
                None => LAND_CELL,
                Some(water) => water.continent as u8 | if water.seam { SEAM_BIT } else { 0 },
            };
            assert_eq!(grid.cells[row * grid.columns + column], expected);
        }
    }
}

#[test]
fn the_held_map_grid_has_its_size() {
    let grid = Waters::new(&world_layout()).grid(4_800.0);
    assert_eq!((grid.columns, grid.rows, grid.cells.len()), (1024, 640, 1024 * 640));
}

#[test]
fn a_point_outside_the_frame_still_finds_its_water() {
    let layout = world_layout();
    let waters = Waters::new(&layout);
    let point = [-50_000.0, -50_000.0];
    assert_eq!(waters.water_at(point).map(|water| water.continent), brute_force(&waters, point).map(|found| found.0));
    assert_eq!(Waters::new(&Layout::default()).water_at([0.0, 0.0]), None);
}
