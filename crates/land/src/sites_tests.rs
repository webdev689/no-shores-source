use super::*;
use crate::edits::{Edits, check_on, parse, write};

/// A square island 100 km a side, its coast running round the frame's corner at (10 km, 10 km).
fn coast() -> Vec<Point> {
    [(10_000, 10_000), (110_000, 10_000), (110_000, 110_000), (10_000, 110_000)]
        .into_iter()
        .map(|(x, y)| Point { x, y })
        .collect()
}

fn point(x: i64, y: i64) -> Point {
    Point { x, y }
}

fn city_at(x: i64, y: i64) -> City {
    City { id: "overlook".into(), name: "Overlook".into(), centre: point(x, y), motif: "beacon".into() }
}

/// A square section `side` metres across with its north-west corner at (x, y), and a spawn in its middle.
fn node(id: &str, x: i64, y: i64, side: i64) -> Node {
    Node {
        id: id.into(),
        kind: NodeKind::Patrol,
        name: "The Brine Steps".into(),
        ring: vec![point(x, y), point(x + side, y), point(x + side, y + side), point(x, y + side)],
        spawns: vec![point(x + side / 2, y + side / 2)],
    }
}

#[test]
fn a_city_by_the_coast_and_a_node_on_the_land_break_no_rule() {
    let problems = check_sites(&coast(), Some(&city_at(12_000, 50_000)), &[node("brine-steps", 40_000, 40_000, 1_600)]);
    assert!(problems.is_empty(), "{problems:?}");
}

#[test]
fn a_city_far_inland_is_refused() {
    let problems = check_sites(&coast(), Some(&city_at(60_000, 60_000)), &[]);
    assert_eq!(problems.len(), 1);
    assert!(problems[0].1.contains("within"));
}

#[test]
fn a_city_in_the_sea_is_refused() {
    assert_eq!(check_sites(&coast(), Some(&city_at(9_000, 50_000)), &[]).len(), 1);
}

#[test]
fn a_motif_with_capitals_or_digits_is_refused() {
    let city = City { motif: "Beacon2".into(), ..city_at(12_000, 50_000) };
    assert!(check_sites(&coast(), Some(&city), &[]).iter().any(|problem| problem.1.contains("motif")));
}

#[test]
fn a_section_reaching_past_the_coast_is_refused() {
    let problems = check_sites(&coast(), None, &[node("cliffs", 109_500, 50_000, 1_000)]);
    assert!(problems.iter().any(|problem| problem.1.contains("past the coast")), "{problems:?}");
}

#[test]
fn a_section_that_crosses_itself_is_refused() {
    let mut bow = node("bow", 40_000, 40_000, 1_000);
    bow.ring.swap(1, 2);
    let problems = check_sites(&coast(), None, &[bow]);
    assert!(problems.iter().any(|problem| problem.1.contains("never crosses")));
}

#[test]
fn a_section_too_small_or_too_large_is_refused() {
    let small = check_sites(&coast(), None, &[node("small", 40_000, 40_000, 50)]);
    let large = check_sites(&coast(), None, &[node("large", 40_000, 40_000, 3_100)]);
    for problems in [small, large] {
        assert!(problems.iter().any(|problem| problem.1.contains("square kilometres")), "{problems:?}");
    }
}

#[test]
fn a_node_needs_a_spawn_inside_its_section() {
    let mut none = node("none", 40_000, 40_000, 1_000);
    none.spawns.clear();
    let mut outside = node("outside", 40_000, 40_000, 1_000);
    outside.spawns.push(point(39_000, 40_500));
    for problems in [check_sites(&coast(), None, &[none]), check_sites(&coast(), None, &[outside])] {
        assert!(problems.iter().any(|problem| problem.1.contains("spawn")), "{problems:?}");
    }
}

#[test]
fn a_drawn_node_may_not_take_a_social_space_id() {
    let problems = check_sites(&coast(), None, &[node("overlook-social", 40_000, 40_000, 1_000)]);
    assert!(problems.iter().any(|problem| problem.1.contains("social")));
}

#[test]
fn a_site_may_not_share_an_id_with_another_place() {
    let edits = Edits {
        city: Some(city_at(12_000, 50_000)),
        nodes: vec![node("overlook", 40_000, 40_000, 1_000)],
        ..Edits::default()
    };
    let problems = check_on(&edits, &coast());
    assert!(problems.iter().any(|problem| problem.message.contains("another place")), "{problems:?}");
}

#[test]
fn a_city_and_its_nodes_come_back_from_their_written_form() {
    let edits = Edits {
        city: Some(city_at(12_000, 50_000)),
        nodes: vec![node("brine-steps", 40_000, 40_000, 1_600)],
        ..Edits::default()
    };
    let text = write(&edits).unwrap();
    assert!(text.contains("\"kind\": \"patrol\""), "{text}");
    assert_eq!(parse(&text).unwrap(), edits);
}

#[test]
fn a_file_with_no_city_or_nodes_still_reads() {
    assert_eq!(parse("{\"strokes\": []}").unwrap(), Edits::default());
}
