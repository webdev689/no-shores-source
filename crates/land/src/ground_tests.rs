use super::*;
use crate::edits::Edits;
use crate::places::{CarvedRiver, Road, Town};

/// A gentle slope 40 km across, all land, rising east: 100 m at the west edge, 500 m at the east.
fn slope() -> Grid {
    let mut grid = Grid::new(40, 40, 0.0, 0.0, 1000.0);
    for (index, value) in grid.data.iter_mut().enumerate() {
        *value = 100.0 + 10.0 * (index % 40) as f64;
    }
    grid
}

fn points(list: &[[i64; 2]]) -> Vec<Point> {
    list.iter().map(|&point| point.into()).collect()
}

fn ground_with(edits: &Edits) -> Ground {
    let land = slope();
    Ground::new(&land, &vec![0.0; land.data.len()], &[], edits, 1)
}

#[test]
fn a_carved_river_cuts_its_channel_and_holds_water() {
    let edits = Edits {
        rivers: vec![CarvedRiver {
            id: "river-1".into(),
            width_m: 40,
            depth_m: 4,
            points: points(&[[30_000, 20_000], [5_000, 20_000]]),
        }],
        ..Edits::default()
    };
    let ground = ground_with(&edits);
    let plain = ground_with(&Edits::default());
    let (x, y) = (20_000.0, 20_000.0);
    assert!(ground.height_at(x, y) < plain.height_at(x, y) - 3.0, "the channel is cut");
    let WaterAt::River { surface } = ground.water_at(x, y) else { panic!("water in the channel") };
    assert!(surface > ground.height_at(x, y), "the surface stands over the bed");
    assert_eq!(ground.water_at(x, 25_000.0), WaterAt::Dry);
    assert_eq!(ground.height_at(x, 25_000.0).to_bits(), plain.height_at(x, 25_000.0).to_bits(), "far off, untouched");
}

#[test]
fn a_road_eases_to_its_level_and_a_town_levels_its_area() {
    let edits = Edits {
        roads: vec![Road { id: "road-1".into(), width_m: 10, points: points(&[[5_000, 10_000], [35_000, 10_000]]) }],
        towns: vec![Town {
            id: "town-1".into(),
            outline: points(&[[10_000, 25_000], [16_000, 25_000], [16_000, 31_000], [10_000, 31_000]]),
        }],
        ..Edits::default()
    };
    let ground = ground_with(&edits);
    let across = [9_998.0, 10_000.0, 10_002.0].map(|y| ground.height_at(20_000.0, y));
    assert!((across[0] - across[2]).abs() < 0.5, "a road's bed is level across: {across:?}");
    let level = ground.towns[0].level;
    assert!((ground.height_at(11_000.0, 26_000.0) - level).abs() < 1e-9);
    assert!((ground.height_at(15_000.0, 30_000.0) - level).abs() < 1e-9, "level across the town");
    assert!((level - 230.0).abs() < 10.0, "the mean of its ground: {level}");
}

#[test]
fn courses_are_densified_and_rounded_at_their_corners() {
    let dense = densify(&[(0.0, 0.0), (100.0, 0.0)], 50.0);
    assert_eq!(dense, [(0.0, 0.0), (50.0, 0.0), (100.0, 0.0)]);
    let cut = chaikin(&[(0.0, 0.0, 1.0), (100.0, 0.0, 1.0), (100.0, 100.0, 3.0)]);
    assert_eq!(cut.len(), 6);
    assert_eq!(cut[0], (0.0, 0.0, 1.0));
    assert_eq!(*cut.last().unwrap(), (100.0, 100.0, 3.0));
}
