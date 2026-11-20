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
    let chart = SeaChart { coasts: &coasts, charted: &charted, islands: &[] };
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
    let chart = SeaChart { coasts: &coasts, charted: &charted, islands: &[] };
    assert_eq!(chart.lane([310_000.0, 50_000.0]), Some((10_000.0, [0.0, 1.0])));
    assert_eq!(chart.lane([300_000.0, 130_000.0]), Some((30_000.0, [0.0, 1.0])), "past the leg's end");
}

#[test]
fn the_worlds_sea_opened_with_its_ports_sends_tithe_ships_along_its_lanes() {
    use crate::pirates::{Pirates, Voyager};
    let (layout, ports) = crate::measure_tests::world();
    let charted = Charted::new(&layout, &ports);
    assert!(!charted.lanes.is_empty(), "the lanes between the port cities");
    let coasts = Coast::of(&layout);
    let chart = SeaChart { coasts: &coasts, charted: &charted, islands: &[] };
    // A point of a lane in the Grey Tithe's waters, 20 km off it.
    let on_lane = charted.lanes.iter().map(|leg| leg[0]).find(|&at| {
        chart.water(at).is_some_and(|water| water.holder == Holder::GreyTithe) && chart.coast(at) > 30_000.0
    });
    let lane_at = on_lane.expect("a lane through the Tithe's waters");
    let player = [lane_at[0] + 20_000.0, lane_at[1]];
    let ship = Voyager { player: 1, at: player, heading: 0.0, pace: 0, fighting: false, clock: 1.0, hull: 1.0 };
    let mut seen = std::collections::BTreeMap::new();
    for seed in 1..=30 {
        let mut pirates = Pirates::new(seed);
        for _ in 0..3600 {
            pirates.tick(1.0, &[ship], &chart);
            for pirate in &pirates.sailing {
                seen.entry((seed, pirate.id)).or_insert(*pirate);
            }
            pirates.sailing.retain(|pirate| !pirate.bold);
        }
    }
    let tithe: Vec<_> = seen.values().filter(|pirate| pirate.commission.faction == naval::ranks::GREY_TITHE).collect();
    assert!(!tithe.is_empty(), "the Tithe's waters send her ships");
    let along = tithe.iter().filter(|pirate| {
        let (off, [east, south]) = chart.lane([pirate.x, pirate.y]).unwrap();
        let heading = libm::atan2(east, -south).rem_euclid(std::f64::consts::TAU);
        let turned = (pirate.heading - heading).rem_euclid(std::f64::consts::PI);
        off <= crate::sighting::LANE_REACH_M && (turned < 1e-9 || std::f64::consts::PI - turned < 1e-9)
    });
    assert_eq!(along.count(), tithe.len(), "each on a lane, heading along it");
}

#[test]
fn a_bold_ship_coming_for_a_player_in_home_waters_follows_their_edge_round_rather_than_swinging_at_it() {
    use crate::pirates::{Pirate, Pirates, Voyager};
    let (layout, ports) = crate::measure_tests::world();
    let charted = Charted::new(&layout, &ports);
    let coasts = Coast::of(&layout);
    let chart = SeaChart { coasts: &coasts, charted: &charted, islands: &[] };
    let holder = |at: [f64; 2]| chart.water(at).map(|water| water.holder);
    // The edge of Overlook's home waters on a line due east: home water, then another holder's, 1 km on.
    let edge = (0..4_000)
        .flat_map(|row| (0..4_000).map(move |column| [f64::from(column) * 1_000.0, f64::from(row) * 1_000.0]))
        .find(|&at| {
            holder(at) == Some(Holder::Home)
                && holder([at[0] + 1_000.0, at[1]]).is_some_and(|other| other != Holder::Home)
        })
        .expect("an edge of home waters on the layout");
    let player = Voyager {
        player: 1,
        at: [edge[0] - 2_000.0, edge[1]],
        heading: 0.0,
        pace: 0,
        fighting: false,
        clock: 1.0,
        hull: 1.0,
    };
    let elite = naval::ranks::Commission { faction: naval::ranks::PIRATES, rank: naval::ranks::Rank::Elite };
    let start = [edge[0] + 1_100.0, edge[1]];
    let mut pirates = Pirates::new(1);
    pirates.sailing.push(Pirate::standing(1, 1, elite, start, 1.5 * std::f64::consts::PI, true));
    let (mut headings, mut sailed, mut last) = (Vec::new(), 0.0, start);
    for _ in 0..600 {
        pirates.tick(1.0, &[player], &chart);
        let Some(ship) = pirates.sailing.iter().find(|ship| ship.id == 1) else { break };
        assert_ne!(holder([ship.x, ship.y]), Some(Holder::Home), "never into home waters");
        headings.push(ship.heading);
        let (east, south) = (ship.x - last[0], ship.y - last[1]);
        sailed += (east * east + south * south).sqrt();
        last = [ship.x, ship.y];
    }
    let flips = headings.windows(2).filter(|pair| {
        let turned =
            (pair[1] - pair[0] + std::f64::consts::PI).rem_euclid(std::f64::consts::TAU) - std::f64::consts::PI;
        turned.abs() > std::f64::consts::FRAC_PI_2
    });
    assert_eq!(flips.count(), 0, "no swinging back and forth: {headings:?}");
    assert!(sailed > 0.8 * crate::sighting::way_of(elite.rank) * 600.0, "she kept sailing along the edge: {sailed} m");
}
