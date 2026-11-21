use super::*;
use crate::edits::Edits;
use crate::places::{CarvedRiver, Road, Town};
use crate::relief::COAST_REACH_M;

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
    Ground::new(&land, &land.like(COAST_REACH_M), &vec![0.0; land.data.len()], &[], edits, 1)
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
fn fresh_water_s_edge_is_found_to_the_metre_either_side_of_a_river() {
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
    let edge = |y: f64| ground.fresh_edge(20_000.0, y).unwrap();
    assert!((edge(20_000.0) - -20.0).abs() < 1e-6, "mid-channel is half its width inside");
    assert!(edge(20_019.5) < 0.0 && edge(20_020.5) > 0.0, "the edge runs at the channel's side");
    assert!((edge(20_026.0) - 6.0).abs() < 1e-6);
    assert_eq!(ground.fresh_edge(20_000.0, 25_000.0), None, "far off there is no fresh water");
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
    let cut = chaikin(&[[0.0, 0.0, 1.0], [100.0, 0.0, 1.0], [100.0, 100.0, 3.0]]);
    assert_eq!(cut.len(), 6);
    assert_eq!(cut[0], [0.0, 0.0, 1.0]);
    assert_eq!(*cut.last().unwrap(), [100.0, 100.0, 3.0]);
}

#[test]
fn a_gathered_river_through_a_lake_keeps_its_level_beyond_it() {
    // a valley falling west to the sea, with a deep pit 30 km up it that the river fills and spills from
    let mut land = Grid::new(60, 30, 0.0, 0.0, 1000.0);
    let mask: Vec<bool> = (0..1800).map(|index| index % 60 != 0).collect();
    for (index, value) in land.data.iter_mut().enumerate() {
        let (i, j) = (index % 60, index / 60);
        *value = if i == 0 { -5.0 } else { 10.0 * i as f64 + (j as f64 - 15.0).abs() * 30.0 };
        if (29..=31).contains(&i) && j == 15 {
            *value -= 200.0;
        }
    }
    let gathered = crate::water::water(&land, &mask, 800.0);
    // The sea's column is the west kilometre: the coast runs down x = 1 km.
    let coast = Grid { data: (0..1800).map(|index| ((index % 60) as f64 - 0.5) * 1000.0).collect(), ..land.like(0.0) };
    let ground = Ground::new(&land, &coast, &gathered.lake_level, &gathered.rivers, &Edits::default(), 1);
    for i in [5, 12, 20, 26] {
        let (x, y) = land.centre(i, 15);
        let below = land.data[15 * 60 + i] - ground.height_at(x, y);
        assert!(below < 6.0, "the channel {} km from the sea is {below} m under the land", i);
    }
}

#[test]
fn a_diagonal_coast_runs_along_its_painted_line_not_the_cells_steps() {
    let text = r#"{ "continents": [{ "id": "wedge", "outline": [[200000, 300000], [400000, 300000], [200000, 500000]] }], "isles": [] }"#;
    let layout = world::layout::parse(text).unwrap();
    let landmass = crate::landmass::generate(&layout.continents[0], Edits::default()).unwrap();
    let ground = &landmass.surface;
    // Lines across the diagonal coast x + y = 700 km, `offset` metres along (1, 1) from it: inland is negative.
    let (mut worst, mut lines) = (0.0_f64, 0);
    for step in 0..120 {
        let along = 250_000.0 + 818.5 * f64::from(step);
        let at = |offset: f64| (along + offset, 700_000.0 - along + offset);
        let fresh = (-160..=160).any(|tick| {
            let (x, y) = at(f64::from(tick) * 10.0);
            ground.fresh_edge(x, y).is_some()
        });
        if fresh {
            continue;
        }
        lines += 1;
        for tick in -60..=60 {
            let offset = f64::from(tick) * 25.0 + 0.5;
            let (x, y) = at(offset);
            assert_eq!(ground.height_at(x, y) < 0.0, offset > 0.0, "{along} m along, {offset} m across");
        }
        let (mut inside, mut outside) = (-1000.0, 1000.0);
        for _ in 0..50 {
            let middle = 0.5 * (inside + outside);
            if ground.height_at(at(middle).0, at(middle).1) > 0.0 { inside = middle } else { outside = middle }
        }
        worst = worst.max((inside * std::f64::consts::SQRT_2).abs());
    }
    assert!(lines > 80, "most lines are clear of rivers: {lines}");
    assert!(worst < 1.0, "the coast strays {worst:.2} m from its painted line");
}

#[test]
fn a_lake_s_shore_is_where_the_ground_meets_its_surface_not_a_cell_s_side() {
    // A hollow on a plateau: its middle 2 m under the spill, a shallow ring round it, a rim above the lake's level.
    let mut land = Grid::new(9, 9, 0.0, 0.0, 1000.0);
    for (index, value) in land.data.iter_mut().enumerate() {
        let (i, j) = ((index % 9) as i64 - 4, (index / 9) as i64 - 4);
        *value = [8.0, 9.8, 10.1, 11.5, 12.5][i.abs().max(j.abs()) as usize];
    }
    let lake_level: Vec<f64> = land.data.iter().map(|&height| if height < 10.0 { 10.0 } else { 0.0 }).collect();
    let ground = Ground::new(&land, &land.like(COAST_REACH_M), &lake_level, &[], &Edits::default(), 1);
    let mut shore = 0.0;
    for step in 0..400 {
        let x = 4_500.0 + f64::from(step) * 5.0;
        let (height, water) = (ground.height_at(x, 4_500.0), ground.water_at(x, 4_500.0));
        assert_eq!(water == (WaterAt::Lake { surface: 10.0 }), height < 10.0, "{x} m: {height} m");
        if height < 10.0 {
            shore = x - 4_500.0;
        }
    }
    assert!(shore > 1_500.0 && shore < 2_000.0, "the shore lies past the lake's cells, short of the rim: {shore} m");
}

#[test]
fn a_river_s_banks_ease_back_to_the_land_with_no_wall_where_it_crosses_a_lake() {
    // The valley of the gathered-river test, its pit 200 m deep: the river crosses the pit at the lake's level.
    let mut land = Grid::new(60, 30, 0.0, 0.0, 1000.0);
    let mask: Vec<bool> = (0..1800).map(|index| index % 60 != 0).collect();
    for (index, value) in land.data.iter_mut().enumerate() {
        let (i, j) = (index % 60, index / 60);
        *value = if i == 0 { -5.0 } else { 10.0 * i as f64 + (j as f64 - 15.0).abs() * 30.0 };
        if (29..=31).contains(&i) && j == 15 {
            *value -= 200.0;
        }
    }
    let gathered = crate::water::water(&land, &mask, 800.0);
    let coast = Grid { data: (0..1800).map(|index| ((index % 60) as f64 - 0.5) * 1000.0).collect(), ..land.like(0.0) };
    let ground = Ground::new(&land, &coast, &gathered.lake_level, &gathered.rivers, &Edits::default(), 1);
    let (x, y) = land.centre(30, 15);
    let (river, _) = ground.nearest(x, y, false).expect("the river crosses the pit");
    assert!(river.level > ground.height_at(x, y + 40.0) + 50.0, "the lake's bed lies far under the river's level");
    let across: Vec<f64> = (0..600).map(|step| ground.height_at(x, y + f64::from(step) * 0.1)).collect();
    let jump = across.windows(2).map(|pair| (pair[1] - pair[0]).abs()).fold(0.0, f64::max);
    assert!(jump < 5.0, "the bank falls to the lake's bed without a wall: {jump} m in 10 cm");
}

#[test]
fn a_gathered_river_lies_in_its_channel_and_ends_at_the_painted_coast() {
    let text = r#"{ "continents": [{ "id": "wedge", "outline": [[200000, 300000], [400000, 300000], [200000, 500000]] }], "isles": [] }"#;
    let layout = world::layout::parse(text).unwrap();
    let landmass = crate::landmass::generate(&layout.continents[0], Edits::default()).unwrap();
    let ground = &landmass.surface;
    assert!(!ground.rivers.is_empty(), "the wedge gathers rivers");
    let (mut walls, mut seaward) = (0, 0);
    for course in &ground.rivers {
        for point in course {
            if ground.sides(point.x, point.y)[2] < -1.0 {
                seaward += 1;
            }
            // Just past the channel's edge, either side across the course: water there, or ground up to the surface.
            let diagonal = std::f64::consts::FRAC_1_SQRT_2;
            for (east, south) in [(1.0, 0.0), (diagonal, diagonal), (0.0, 1.0), (-diagonal, diagonal)] {
                let reach = point.width / 2.0 + 2.0;
                for side in [1.0, -1.0] {
                    let (x, y) = (point.x + side * reach * east, point.y + side * reach * south);
                    if ground.water_at(x, y) == WaterAt::Dry && ground.height_at(x, y) < point.level - 0.5 {
                        walls += 1;
                    }
                }
            }
        }
    }
    assert_eq!(seaward, 0, "no course runs past the painted coast");
    assert_eq!(walls, 0, "no river stands over dry ground beside its channel");
}

#[test]
fn a_city_s_pads_level_the_ground_dry_and_hold_through_a_window_and_its_saved_form() {
    use crate::pads::{Pad, Pads};
    let mut ground = ground_with(&Edits::default());
    let natural = ground.height_at(5_000.0, 5_000.0);
    ground.pads = Pads::from(vec![Pad::flat([4_900.0, 4_900.0, 5_100.0, 5_100.0], natural + 7.25)]);
    assert_eq!(ground.height_at(5_000.0, 5_000.0), natural + 7.25);
    assert_eq!(ground.water_at(5_000.0, 5_000.0), WaterAt::Dry);
    assert_ne!(ground.height_at(5_200.0, 5_000.0), natural + 7.25);
    let window = ground.window(4_800.0, 4_800.0, 5_200.0, 5_200.0);
    let back: Ground = serde_json::from_str(&serde_json::to_string(&window).unwrap()).unwrap();
    for (x, y) in [(5_000.0, 5_000.0), (5_150.0, 5_050.0), (4_850.0, 4_950.0)] {
        assert_eq!(back.height_at(x, y).to_bits(), ground.height_at(x, y).to_bits());
    }
}

#[test]
fn roads_added_later_are_found_and_level_across_as_drawn_ones() {
    let mut ground = ground_with(&Edits::default());
    assert!(!ground.on_road(20_000.0, 10_000.0));
    let course: Vec<(f64, f64)> = (0..=50).map(|step| (19_900.0 + f64::from(step) * 4.0, 10_000.0)).collect();
    ground.add_roads(&[(course, 4.0)]);
    assert!(ground.on_road(20_000.0, 10_000.0) && !ground.on_road(20_000.0, 10_003.0));
    let across = [9_999.0, 10_000.0, 10_001.0].map(|y| ground.height_at(20_000.0, y));
    assert!((across[0] - across[2]).abs() < 0.2, "the added path's bed is level across: {across:?}");
}
