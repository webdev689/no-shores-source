use super::*;

#[test]
fn a_repair_costs_two_aurem_for_each_whole_percent_missing_of_the_most_missing_a_part_counted_whole() {
    assert_eq!(repair_price([0.9, 1.0, 0.95]), 20);
    assert_eq!(repair_price([0.7, 1.0, 1.0]), 60, "a share a hair off its percent counts as that percent");
    assert_eq!(repair_price([0.995, 1.0, 1.0]), 2, "half a percent costs a whole one");
    assert_eq!(repair_price(SUNK_KEPT), 180);
    assert_eq!(repair_price([0.0; 3]), 200);
    assert_eq!(repair_price([1.0; 3]), 0, "whole, free");
}

#[test]
fn the_nearest_port_is_the_nearest_roadstead_and_repairs_reach_three_kilometres() {
    let harbours = Harbours {
        ports: vec![("a".into(), [0.0, 0.0]), ("b".into(), [10_000.0, 0.0])],
        ways: None,
        locked: Vec::new(),
    };
    assert_eq!(harbours.nearest([6_000.0, 100.0]), Some(1));
    assert!(harbours.in_reach([0.0, 2_999.0]));
    assert!(!harbours.in_reach([0.0, 3_001.0]));
}

#[test]
fn the_nearest_port_city_is_nearest_by_the_seas_way_round_land_not_in_a_straight_line() {
    // A long thin continent between where it went down and the port city a straight line finds nearest.
    let text = r#"{ "continents": [{ "id": "wall", "outline": [[500000, 100000], [520000, 100000], [520000, 900000], [500000, 900000]] }], "isles": [] }"#;
    let layout = world::layout::parse(text).unwrap();
    let points = [world::geometry::Point::new(545_000, 500_000), world::geometry::Point::new(480_000, 300_000)];
    let ways = SeaWays::new(&layout, &world::waters::Waters::new(&layout), &points);
    let ports = vec![("across".into(), [545_000.0, 500_000.0]), ("along".into(), [480_000.0, 300_000.0])];
    let harbours = Harbours { ports, ways: Some(ways), locked: Vec::new() };
    assert_eq!(harbours.nearest([480_000.0, 500_000.0]), Some(1), "round the wall the far side lies 800 km off");
    assert_eq!(Harbours { ways: None, ..harbours }.nearest([480_000.0, 500_000.0]), Some(0), "in a straight line");
}
