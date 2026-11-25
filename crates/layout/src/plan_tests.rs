//! A way keeps clear what would stand on it, as the plan keeps each piece off the ways, and finds its way in past
//! what stands round an area.

use super::*;
use city::solids::{Material, Shape, Solid};

#[test]
fn a_lantern_on_a_way_goes_with_its_light_and_a_pile_under_a_deck_stays() {
    let path =
        Path { tier: Tier::Track, points: vec![[0.0, 0.0], [100.0, 0.0]], crossings: Vec::new(), heights: Vec::new() };
    let solid = |at: [f64; 3], size: [f64; 3]| Solid::upright(Shape::Block, at, size, Material::Timber);
    let mut seating = Seating {
        solids: vec![
            solid([50.0, 1.0, -0.3], [0.16, 0.16, 2.8]),
            solid([50.0, 1.0, 2.5], [0.2, 0.2, 0.26]),
            solid([60.0, 0.5, -6.0], [0.5, 0.5, 6.0]),
            solid([70.0, 9.0, -0.3], [0.16, 0.16, 2.8]),
        ],
        ..Seating::default()
    };
    clearing::keep_off_paths(&mut seating, &[path], &|_, _| 0.0);
    let left: Vec<[f64; 2]> = seating.solids.iter().map(|solid| [solid.at[0], solid.at[1]]).collect();
    assert_eq!(left, [[60.0, 0.5], [70.0, 9.0]], "the lantern on the track and its light are gone");
}

#[test]
fn a_camps_way_in_stays_open_on_the_path_grid_at_every_turn() {
    let land = land::grid::Grid::new(40, 40, -1000.0, -1000.0, 50.0).like(100.0);
    let coast = land.like(land::relief::COAST_REACH_M);
    let edits = land::edits::Edits::default();
    let ground = Ground::new(&land, &coast, &vec![0.0; land.data.len()], &[], &edits, 1);
    let (book, field) = (Book::default(), Field::level(-96.0, -96.0, 24, 24));
    // A camp turned every degree, its middle set 0 to 6 m into a cell, is walked into from 70 m out past its way in.
    let radius = areas::radius_of(AreaKind::Camp, 1);
    let mut sealed = Vec::new();
    let mut cases = 0;
    for degrees in 0..360 {
        let (sine, cosine) = land::exact::sin_cos(f64::from(degrees).to_radians());
        let toward = [sine, -cosine];
        for offset in 0..16 {
            cases += 1;
            let at = [f64::from(offset % 4) * 2.0, f64::from(offset / 4) * 2.0];
            let area = Area { kind: AreaKind::Camp, name: "A Camp".into(), at, radius, leads_to: None };
            let mut seating = Seating::default();
            let mut kit = pieces::Kit { ground: &ground, book: &book, seed: 7, draws: 0, into: &mut seating };
            pieces::build(&mut kit, &area, toward, [0.0, -1.0]);
            let blocked = blocked_by(&field, &seating);
            let outside = [at[0] + toward[0] * 70.0, at[1] + toward[1] * 70.0];
            let laid = vec![false; field.columns * field.rows];
            if paths::find(&field, [outside, at], Tier::Footpath.steepest(), &laid, &blocked, 7).is_none() {
                sealed.push((degrees, at));
            }
        }
    }
    assert!(sealed.is_empty(), "{} of {cases} sealed: {:?}", sealed.len(), &sealed[..sealed.len().min(40)]);
}
