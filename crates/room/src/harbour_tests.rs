use super::*;

#[test]
fn a_repair_takes_a_second_for_each_hundredth_missing_of_the_most_missing_and_a_hundred_at_most() {
    assert!((Repair::takes([0.9, 1.0, 0.95]) - 10.0).abs() < 1e-9);
    assert!((Repair::takes(SUNK_KEPT) - 90.0).abs() < 1e-9);
    assert!((Repair::takes([0.0, 0.0, 0.0]) - REPAIR_MOST_S).abs() < 1e-9);
    assert_eq!(Repair::takes([1.0; 3]), 0.0);
}

#[test]
fn a_repair_makes_her_whole_evenly_and_stops_where_it_stood() {
    let mut repairs = Repairs::default();
    repairs.under_way.insert(1, Repair { from: [0.5, 0.8, 1.0], seconds: 0.0 });
    // Half of its 50 s.
    for _ in 0..25 * 60 {
        repairs.tick(1.0 / 60.0);
    }
    let now = repairs.under_way[&1].now();
    assert!((now[0] - 0.75).abs() < 1e-6 && (now[1] - 0.9).abs() < 1e-6 && now[2] == 1.0, "{now:?}");
    let stood = repairs.stop(1).expect("one under way");
    assert_eq!(stood, now);
    assert!(repairs.under_way.is_empty());
}

#[test]
fn a_repair_done_ends_with_her_whole() {
    let mut repairs = Repairs::default();
    repairs.under_way.insert(1, Repair { from: [0.99, 1.0, 1.0], seconds: 0.0 });
    let mut last = Vec::new();
    for _ in 0..61 {
        let stepped = repairs.tick(1.0 / 60.0);
        if !stepped.is_empty() {
            last = stepped;
        }
    }
    assert!(repairs.under_way.is_empty());
    assert!(last.len() == 1 && last[0].1.iter().all(|share| (share - 1.0).abs() < 1e-12), "{last:?}");
}

#[test]
fn the_nearest_port_is_the_nearest_roadstead_and_repairs_reach_three_kilometres() {
    let harbours = Harbours { ports: vec![("a".into(), [0.0, 0.0]), ("b".into(), [10_000.0, 0.0])], ways: None };
    assert_eq!(harbours.nearest([6_000.0, 100.0]), Some(1));
    assert!(harbours.in_reach([0.0, 2_999.0]));
    assert!(!harbours.in_reach([0.0, 3_001.0]));
}

#[test]
fn the_nearest_port_city_is_nearest_by_the_seas_way_round_land_not_in_a_straight_line() {
    // A long thin continent between where she went down and the port city a straight line finds nearest.
    let text = r#"{ "continents": [{ "id": "wall", "outline": [[500000, 100000], [520000, 100000], [520000, 900000], [500000, 900000]] }], "isles": [] }"#;
    let layout = world::layout::parse(text).unwrap();
    let points = [world::geometry::Point::new(545_000, 500_000), world::geometry::Point::new(480_000, 300_000)];
    let ways = SeaWays::new(&layout, &world::waters::Waters::new(&layout), &points);
    let ports = vec![("across".into(), [545_000.0, 500_000.0]), ("along".into(), [480_000.0, 300_000.0])];
    let harbours = Harbours { ports, ways: Some(ways) };
    assert_eq!(harbours.nearest([480_000.0, 500_000.0]), Some(1), "round the wall the far side lies 800 km off");
    assert_eq!(Harbours { ways: None, ..harbours }.nearest([480_000.0, 500_000.0]), Some(0), "in a straight line");
}
