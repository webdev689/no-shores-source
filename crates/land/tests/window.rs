//! A node's room stands bodies on a small cut of its landmass's ground. Inside the cut's rect the cut answers with
//! the same bits as the whole landmass, on a road, along a river, in a town and at the coast, and it keeps them through
//! its saved form.

use land::edits::{Edits, check_on};
use land::ground::{Ground, WaterAt};
use land::landmass::{Landmass, generate};
use land::places::{CarvedRiver, Road, Town};
use std::path::Path;
use world::geometry::Point;
use world::layout::Continent;

/// The rainforest, the smallest continent of the layout.
fn rainforest() -> Continent {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content/world/layout.json");
    let text = std::fs::read_to_string(path).expect("the layout is in the repository");
    let layout = world::layout::parse(&text).expect("the layout parses");
    let mut continents = layout.continents.into_iter();
    continents.find(|continent| continent.climate.as_deref() == Some("rainforest")).expect("a rainforest continent")
}

/// A town, a road and a carved river by a gathered river's mouth, laid out from the mouth along the way inland and
/// along the coast. None where the coast bends so that one would leave the land.
fn places_by(landmass: &Landmass, continent: &Continent, mouth: (f64, f64)) -> Option<Edits> {
    let coast = |x: f64, y: f64| landmass.coast_m.at(x, y);
    let (inland_x, inland_y) = (
        coast(mouth.0 + 500.0, mouth.1) - coast(mouth.0 - 500.0, mouth.1),
        coast(mouth.0, mouth.1 + 500.0) - coast(mouth.0, mouth.1 - 500.0),
    );
    let length = (inland_x * inland_x + inland_y * inland_y).sqrt();
    let (inland_x, inland_y) = (inland_x / length, inland_y / length);
    let at = |inland: f64, along: f64| {
        let x = mouth.0 + inland * inland_x - along * inland_y;
        let y = mouth.1 + inland * inland_y + along * inland_x;
        Point::new(x.round() as i64, y.round() as i64)
    };
    let edits = Edits {
        towns: vec![Town {
            id: "town-1".into(),
            outline: vec![at(550.0, 200.0), at(550.0, 500.0), at(850.0, 500.0), at(850.0, 200.0)],
        }],
        roads: vec![Road {
            id: "road-1".into(),
            width_m: 8,
            points: vec![at(300.0, -900.0), at(300.0, 0.0), at(300.0, 900.0)],
        }],
        rivers: vec![CarvedRiver {
            id: "river-1".into(),
            width_m: 20,
            depth_m: 3,
            points: vec![at(900.0, -500.0), at(-200.0, -500.0)],
        }],
        ..Edits::default()
    };
    check_on(&edits, &continent.outline).is_empty().then_some(edits)
}

/// A water's kind and its surface's bits.
fn water_bits(water: WaterAt) -> (u8, u64) {
    match water {
        WaterAt::Dry => (0, 0),
        WaterAt::Sea => (1, 0),
        WaterAt::Lake { surface } => (2, surface.to_bits()),
        WaterAt::River { surface } => (3, surface.to_bits()),
    }
}

/// Points over the rect, a fraction of a metre off any round number, its corners and edges, and the places' own points.
fn points_in(rect: [f64; 4], ground: &Ground) -> Vec<(f64, f64)> {
    let [west, north, east, south] = rect;
    let mut points: Vec<(f64, f64)> = (0..64 * 64)
        .map(|index| {
            let (column, row) = (f64::from(index % 64), f64::from(index / 64));
            (
                west + 0.123_456_7 + column * (east - west - 0.3) / 63.0,
                north + 0.765_432_1 + row * (south - north - 0.9) / 63.0,
            )
        })
        .collect();
    for share in 0..=40 {
        let share = f64::from(share) / 40.0;
        let (x, y) = (west + (east - west) * share, north + (south - north) * share);
        points.extend([(x, north), (x, south), (west, y), (east, y)]);
    }
    let inside = |&(x, y): &(f64, f64)| x >= west && x <= east && y >= north && y <= south;
    let courses = ground.rivers.iter().chain(&ground.roads).flatten().map(|point| (point.x, point.y));
    points.extend(courses.filter(inside));
    points
}

#[test]
fn a_window_answers_as_the_whole_landmass_inside_its_rect_and_keeps_it_through_its_saved_form() {
    let continent = rainforest();
    let mut landmass = generate(&continent, Edits::default()).unwrap();
    let mouths: Vec<(f64, f64)> = landmass
        .surface
        .rivers
        .iter()
        .filter(|course| course.len() > 8)
        .filter_map(|course| course.last().map(|point| (point.x, point.y)))
        .filter(|&(x, y)| landmass.coast_m.at(x, y).abs() < 200.0)
        .collect();
    let (mouth, edits) =
        mouths.iter().find_map(|&mouth| Some((mouth, places_by(&landmass, &continent, mouth)?))).unwrap();
    landmass.set_edits(edits);
    let whole = &landmass.surface;
    let rect = [mouth.0 - 1000.0, mouth.1 - 1000.0, mouth.0 + 1000.0, mouth.1 + 1000.0];
    let window = whole.window(rect[0], rect[1], rect[2], rect[3]);
    let points = points_in(rect, whole);

    let found = |test: &dyn Fn(f64, f64) -> bool| points.iter().any(|&(x, y)| test(x, y));
    assert!(found(&|x, y| whole.on_road(x, y)), "a point on the road");
    assert!(found(&|x, y| whole.in_town(x, y)), "a point in the town");
    assert!(found(&|x, y| matches!(whole.water_at(x, y), WaterAt::River { .. })), "a point in a river");
    assert!(found(&|x, y| whole.water_at(x, y) == WaterAt::Sea), "a point at sea");
    assert!(found(&|x, y| whole.water_at(x, y) == WaterAt::Dry), "a point on dry land");

    assert_same(whole, &window, &points);
    assert!(window.land.data.len() <= 36, "{} cells kept", window.land.data.len());
    assert!(window.rivers.len() < whole.rivers.len(), "only the rivers that reach the rect");

    let json = serde_json::to_string(&window).unwrap();
    let loaded: Ground = serde_json::from_str(&json).unwrap();
    assert_same(whole, &loaded, &points);
    assert_eq!(loaded, window);
    assert!(json.len() < 1_000_000, "{} bytes saved", json.len());
    let mut broken: serde_json::Value = serde_json::from_str(&json).unwrap();
    broken["lake_level"] = serde_json::json!([]);
    assert!(serde_json::from_value::<Ground>(broken).is_err(), "lake levels that do not match the cells are refused");
    assert_eq!(whole.window(rect[2], rect[3], rect[0], rect[1]), window, "a rect given east to west is the same rect");

    // At the corner of the landmass's grid, where the spline reads its edge cells again.
    let (west, north) = (whole.land.left_m - 700.0, whole.land.top_m - 700.0);
    let corner = [west, north, west + 2000.0, north + 2000.0];
    assert_same(whole, &whole.window(west, north, west + 2000.0, north + 2000.0), &points_in(corner, whole));
}

/// The window's height and water have the whole ground's bits at every point.
fn assert_same(whole: &Ground, window: &Ground, points: &[(f64, f64)]) {
    for &(x, y) in points {
        assert_eq!(window.height_at(x, y).to_bits(), whole.height_at(x, y).to_bits(), "the height at ({x}, {y})");
        assert_eq!(water_bits(window.water_at(x, y)), water_bits(whole.water_at(x, y)), "the water at ({x}, {y})");
    }
}
