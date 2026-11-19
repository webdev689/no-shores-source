use super::*;
use crate::sea::Coast;

/// Overlook's island, home waters, 100 km a side west, and the fourth island, the pirates', 100 km a side east,
/// 200 km of sea between.
fn layout() -> Layout {
    let text = r#"{ "continents": [
        { "id": "continent-1", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] },
        { "id": "continent-4", "outline": [[400000, 100000], [500000, 100000], [500000, 200000], [400000, 200000]] }
    ], "isles": [] }"#;
    world::layout::parse(text).unwrap()
}

#[test]
fn the_chart_reads_each_water_its_band_and_refuses_a_step_into_home_waters() {
    let layout = layout();
    let charted = Charted::new(&layout, &[]);
    let coasts = Coast::of(&layout);
    let chart = SeaChart { coasts: &coasts, charted: &charted };
    let home = chart.water([250_000.0, 150_000.0]).unwrap();
    assert_eq!((home.holder, home.levels), (Holder::Home, Some((1, 4))));
    let pirates = chart.water([350_000.0, 150_000.0]).unwrap();
    assert_eq!((pirates.holder, pirates.levels), (Holder::Pirates, Some((10, 13))));
    assert_eq!(chart.water([150_000.0, 150_000.0]), None, "land");
    assert!(chart.open([350_000.0, 150_000.0], [330_000.0, 150_000.0]));
    assert!(!chart.open([310_000.0, 150_000.0], [290_000.0, 150_000.0]), "into home waters");
    assert!(chart.open([290_000.0, 150_000.0], [310_000.0, 150_000.0]), "a ship left inside them sails out");
    assert!(!chart.open([350_000.0, 150_000.0], [450_000.0, 150_000.0]), "onto land");
    assert!((chart.coast([350_000.0, 150_000.0]) - 50_000.0).abs() < 1.0);
    assert_eq!(chart.lane([350_000.0, 150_000.0]), None, "no ports, no lanes");
}

#[test]
fn a_lane_is_the_nearest_leg_and_the_way_it_runs() {
    let layout = layout();
    let mut charted = Charted::new(&layout, &[]);
    charted.lanes = vec![[[300_000.0, 0.0], [300_000.0, 100_000.0]], [[0.0, 300_000.0], [100_000.0, 300_000.0]]];
    let coasts = Coast::of(&layout);
    let chart = SeaChart { coasts: &coasts, charted: &charted };
    assert_eq!(chart.lane([310_000.0, 50_000.0]), Some((10_000.0, [0.0, 1.0])));
    assert_eq!(chart.lane([300_000.0, 130_000.0]), Some((30_000.0, [0.0, 1.0])), "past the leg's end");
}
