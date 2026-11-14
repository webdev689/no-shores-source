use super::*;
use crate::layout::{Continent, Isle};

const KM: i64 = 1_000;

fn continent(id: &str, left_km: i64, top_km: i64, side_km: i64) -> Continent {
    let (left, top, side) = (left_km * KM, top_km * KM, side_km * KM);
    let outline = vec![
        Point::new(left, top),
        Point::new(left + side, top),
        Point::new(left + side, top + side),
        Point::new(left, top + side),
    ];
    Continent { id: id.to_owned(), outline, climate: None }
}

fn isle(id: &str, x_km: i64, y_km: i64, radius_km: i64) -> Isle {
    Isle {
        id: id.to_owned(),
        centre: Point::new(x_km * KM, y_km * KM),
        radius_m: radius_km * KM,
        seed: 1,
        climate: None,
    }
}

fn messages(layout: &Layout) -> Vec<String> {
    check(layout).iter().map(ToString::to_string).collect()
}

/// Nine 500 km squares in a three-by-three grid with 1,000 km of sea between them.
fn nine_continents() -> Vec<Continent> {
    (0..9)
        .map(|index| continent(&format!("c{index}"), 100 + (index % 3) * 1_500, 100 + (index / 3) * 1_000, 500))
        .collect()
}

#[test]
fn an_empty_layout_is_a_sound_draft_but_not_a_finished_world() {
    let layout = Layout::default();
    assert!(check(&layout).is_empty());
    assert_eq!(check_finished(&layout).len(), 1);
}

#[test]
fn nine_continents_in_range_with_sea_between_make_a_finished_world() {
    let layout = Layout { continents: nine_continents(), isles: vec![isle("rock", 850, 350, 50)] };
    assert!(check_finished(&layout).is_empty(), "{:?}", check_finished(&layout));
}

#[test]
fn a_tenth_continent_is_one_too_many() {
    let mut continents = nine_continents();
    continents.push(continent("tenth", 4_000, 2_500, 500));
    let found = messages(&Layout { continents, isles: Vec::new() });
    assert_eq!(found, ["layout: 10 continents: the world has 9"]);
}

#[test]
fn a_continent_smaller_than_daggerfall_or_larger_than_hammerfell_is_refused() {
    let layout = Layout {
        continents: vec![continent("small", 0, 0, 400), continent("large", 1_000, 0, 1_000)],
        isles: Vec::new(),
    };
    assert_eq!(
        messages(&layout),
        [
            "small: 160000 km², outside the 161600-940000 km² a continent may cover",
            "large: 1000000 km², outside the 161600-940000 km² a continent may cover"
        ]
    );
}

#[test]
fn an_outline_must_stay_in_the_frame_have_three_points_and_not_cross_itself() {
    let mut outside = continent("outside", 4_700, 0, 500);
    outside.outline[1].x = FRAME_WIDTH_M + 1;
    let short = Continent { id: "short".to_owned(), outline: vec![Point::new(0, 0), Point::new(1, 1)], climate: None };
    let mut crossed = continent("crossed", 0, 1_000, 500);
    crossed.outline.swap(1, 2);
    let found = messages(&Layout { continents: vec![outside, short, crossed], isles: Vec::new() });
    assert_eq!(
        found,
        [
            "outside: the outline leaves the world's frame",
            "short: an outline needs at least three points",
            "crossed: the outline crosses or touches itself"
        ]
    );
}

#[test]
fn continents_may_not_overlap() {
    let layout =
        Layout { continents: vec![continent("west", 0, 0, 500), continent("east", 400, 0, 500)], isles: Vec::new() };
    assert_eq!(messages(&layout), ["west: overlaps east"]);
}

#[test]
fn ids_are_unique_across_continents_and_isles() {
    let layout = Layout { continents: vec![continent("same", 0, 0, 500)], isles: vec![isle("same", 1_000, 1_000, 10)] };
    assert_eq!(messages(&layout), ["same: the id is used twice"]);
}

#[test]
fn an_isle_must_be_smaller_than_the_smallest_continent() {
    let layout =
        Layout { continents: Vec::new(), isles: vec![isle("big", 1_000, 1_000, 230), isle("fine", 2_000, 1_000, 220)] };
    assert_eq!(messages(&layout), ["big: an isle must be smaller than the smallest continent"]);
}

#[test]
fn an_isle_must_clear_the_continents_and_the_other_isles() {
    let continents = vec![continent("land", 0, 0, 500)];
    let isles = vec![isle("ashore", 520, 250, 30), isle("first", 1_000, 1_000, 30), isle("second", 1_050, 1_000, 30)];
    assert_eq!(
        messages(&Layout { continents, isles }),
        ["ashore: the isle touches a continent", "second: the isle touches first"]
    );
}

#[test]
fn an_isle_must_stay_in_the_frame_with_a_real_radius() {
    let layout =
        Layout { continents: Vec::new(), isles: vec![isle("edge", 10, 1_000, 20), isle("none", 2_000, 1_000, 0)] };
    assert_eq!(messages(&layout), ["edge: the isle leaves the world's frame", "none: the radius must be above zero"]);
}
