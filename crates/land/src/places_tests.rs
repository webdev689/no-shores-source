use super::*;

fn ring(points: &[[i64; 2]]) -> Vec<Point> {
    points.iter().map(|&point| point.into()).collect()
}

fn coast() -> Vec<Point> {
    ring(&[[0, 0], [100_000, 0], [100_000, 100_000], [0, 100_000]])
}

#[test]
fn places_on_the_land_keep_the_rules() {
    let rivers = [CarvedRiver {
        id: "river-1".into(),
        width_m: 40,
        depth_m: 4,
        points: ring(&[[50_000, 50_000], [50_000, 120_000]]),
    }];
    let roads = [Road { id: "road-1".into(), width_m: 8, points: ring(&[[10_000, 10_000], [40_000, 40_000]]) }];
    let towns = [Town { id: "town-1".into(), outline: ring(&[[20_000, 20_000], [30_000, 20_000], [30_000, 30_000]]) }];
    let ports = [Port { id: "port-1".into(), at: [99_000, 50_000].into() }];
    assert!(check_places(&coast(), &rivers, &roads, &towns, &ports).is_empty());
}

#[test]
fn places_that_break_the_rules_say_how() {
    let roads = [Road { id: "road-1".into(), width_m: 80, points: ring(&[[10_000, 10_000], [140_000, 40_000]]) }];
    let towns = [
        Town { id: "town-1".into(), outline: ring(&[[20_000, 20_000], [30_000, 20_000], [30_000, 30_000]]) },
        Town { id: "town-1".into(), outline: ring(&[[25_000, 21_000], [35_000, 21_000], [35_000, 31_000]]) },
    ];
    let ports = [Port { id: "Port 1".into(), at: [50_000, 50_000].into() }];
    let found = check_places(&coast(), &[], &roads, &towns, &ports);
    let messages: Vec<String> = found.iter().map(|(id, message)| format!("{id}: {message}")).collect();
    assert_eq!(
        messages,
        [
            "road-1: its width must be 2 to 30 m",
            "road-1: it leaves the land",
            "town-1: its area overlaps town-1",
            "Port 1: a port stands on the land within 3000 m of the coast",
            "town-1: another place has this id",
            "Port 1: an id is lowercase letters, digits and hyphens",
        ]
    );
    assert!((distance_to_ring(&coast(), Point::new(50_000, 50_000)) - 50_000.0).abs() < 1e-9);
}
