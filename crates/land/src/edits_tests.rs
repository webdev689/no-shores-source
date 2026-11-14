use super::*;

fn flat(value: f64) -> (Grid, Vec<bool>) {
    let mut grid = Grid::new(40, 40, 0.0, 0.0, 1000.0);
    grid.data.fill(value);
    (grid, vec![true; 1600])
}

fn stroke(tool: Tool, strength: u32, level_m: Option<i64>, points: &[[i64; 2]]) -> Stroke {
    Stroke {
        tool,
        radius_m: 8_000,
        strength,
        falloff: Falloff::Smooth,
        level_m,
        points: points.iter().map(|&point| point.into()).collect(),
    }
}

#[test]
fn a_raise_lifts_the_centre_most_and_leaves_beyond_its_radius_alone() {
    let (mut ground, land) = flat(100.0);
    let rect = dab(&mut ground, &land, &stroke(Tool::Raise, 50, None, &[[20_000, 20_000]]), Point::new(20_000, 20_000));
    assert_eq!(rect, Some(CellRect { left: 12, top: 12, right: 28, bottom: 28 }));
    let at = |i: usize, j: usize| ground.data[j * 40 + i];
    // cell (19, 19) has its centre 0.7 km from the dab, where the smooth falloff weighs 0.978
    assert!((at(19, 19) - 148.9).abs() < 0.1, "{}", at(19, 19));
    assert!(at(15, 19) > 100.0 && at(15, 19) < at(19, 19));
    assert!((at(5, 5) - 100.0).abs() < f64::EPSILON);
}

#[test]
fn land_stays_land_and_flatten_reaches_its_level() {
    let (mut ground, land) = flat(100.0);
    let edits = Edits {
        strokes: vec![
            stroke(Tool::Lower, 500, None, &[[20_000, 20_000]]),
            stroke(Tool::Flatten, 100, Some(300), &[[10_000, 10_000]]),
        ],
    };
    apply(&mut ground, &land, &edits);
    assert!(ground.data.iter().all(|&height| height >= LAND_FLOOR_M), "the coast holds");
    assert!((ground.data[9 * 40 + 9] - 295.6).abs() < 0.1, "{}", ground.data[9 * 40 + 9]);
}

#[test]
fn smoothing_evens_a_spike() {
    let (mut ground, land) = flat(100.0);
    ground.data[20 * 40 + 20] = 900.0;
    dab(&mut ground, &land, &stroke(Tool::Smooth, 100, None, &[[20_500, 20_500]]), Point::new(20_500, 20_500));
    assert!(ground.data[20 * 40 + 20] < 300.0, "{}", ground.data[20 * 40 + 20]);
}

#[test]
fn a_file_reads_checks_and_writes_back_in_its_one_form() {
    let text = "{\n  \"strokes\": [\n    {\n      \"tool\": \"flatten\",\n      \"radius_m\": 5000,\n      \"strength\": 40,\n      \"falloff\": \"linear\",\n      \"level_m\": 250,\n      \"points\": [\n        [100, 200],\n        [300, 400]\n      ]\n    }\n  ]\n}\n";
    let edits = parse(text).unwrap();
    assert!(check(&edits).is_empty());
    assert_eq!(write(&edits).unwrap(), text);
    let broken = Edits { strokes: vec![stroke(Tool::Flatten, 400, None, &[[-1, 0]])] };
    let messages: Vec<String> = check(&broken).into_iter().map(|problem| problem.message).collect();
    assert_eq!(
        messages,
        [
            "its strength must be 1 to 100",
            "a flatten stroke needs its level_m",
            "a point lies outside the world's frame",
        ]
    );
    assert!(parse(r#"{ "strokes": [], "extra": 1 }"#).is_err(), "unknown fields are refused");
}
