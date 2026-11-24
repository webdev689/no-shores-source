use super::*;
use crate::sighting::{RANKS_AT_SEA, SIGHT_HOLD_S};
use naval::ranks::{GREY_TITHE, Rank};
use std::collections::BTreeMap as Map;
use world::waters::Holder;

/// One water over open sea: its holder and band, a coast along the line x = 0 west of every ship, and a lane along
/// y = 0 when asked, every leg open but where `open` says.
struct OneWater {
    holder: Holder,
    levels: Option<(u8, u8)>,
    lane: bool,
    open: fn([f64; 2], [f64; 2]) -> bool,
}

const HOSTILE_WATER: OneWater =
    OneWater { holder: Holder::GreyTithe, levels: Some((10, 13)), lane: false, open: |_, _| true };

impl Chart for OneWater {
    fn open(&self, from: [f64; 2], to: [f64; 2]) -> bool {
        (self.open)(from, to)
    }
    fn water(&self, _at: [f64; 2]) -> Option<WaterHere> {
        Some(WaterHere { holder: self.holder, levels: self.levels })
    }
    fn coast(&self, at: [f64; 2]) -> f64 {
        at[0].abs()
    }
    fn lane(&self, at: [f64; 2]) -> Option<(f64, [f64; 2])> {
        self.lane.then_some((at[1].abs(), [1.0, 0.0]))
    }
}

/// A player's ship at `at`, heading north at `pace`, fighting or not; its waters run at its pace.
fn voyager(player: PlayerId, at: [f64; 2], pace: u16, fighting: bool) -> Voyager {
    Voyager {
        player,
        at,
        heading: 0.0,
        pace,
        fighting,
        home: false,
        clock: f64::from(pace.max(1)),
        hull: 1.0,
        hull_kind: sailing::HullKind::Sloop,
    }
}

fn standing(id: u32, at: [f64; 2], heading: f64, bold: bool) -> Hostile {
    Hostile::standing(id, id, Commission::default(), at, heading, bold)
}

/// Every ship one water sends a player who stays at `at` at `pace` over `hours`, a second at a time, a fresh sea for
/// each of `seeds`: bold ones are taken out before they meet the player.
fn brought(chart: &OneWater, seeds: u32, hours: u32, at: [f64; 2], pace: u16) -> Vec<Hostile> {
    let mut seen = Map::new();
    for seed in 1..=seeds {
        let mut hostiles = Hostiles::new(seed);
        for _ in 0..hours * 3600 {
            hostiles.tick(1.0, &[voyager(1, at, pace, false)], chart);
            for hostile in &hostiles.sailing {
                seen.entry((seed, hostile.id)).or_insert(*hostile);
            }
            hostiles.sailing.retain(|hostile| !hostile.bold);
        }
    }
    seen.into_values().collect()
}

#[test]
fn no_ship_comes_before_the_first_roll_or_to_a_fighting_player_and_each_comes_near_its_sight_out() {
    let mut hostiles = Hostiles::default();
    let ship = [500_000.0, 500_000.0];
    for _ in 0..4 * 3600 {
        hostiles.tick(1.0, &[voyager(1, ship, 0, true)], &HOSTILE_WATER);
    }
    assert!(hostiles.sailing.is_empty(), "a fighting player is sent no one");
    let mut launched = Map::new();
    for _ in 0..4 * 3600 {
        hostiles.sailing.retain(|hostile| !hostile.bold);
        hostiles.tick(1.0, &[voyager(1, ship, 0, false)], &HOSTILE_WATER);
        for hostile in &hostiles.sailing {
            launched.entry(hostile.id).or_insert(apart([hostile.x, hostile.y], ship));
        }
        assert!(hostiles.sailing.iter().filter(|hostile| hostile.sees(ship)).count() <= DENSITY);
    }
    // About one roll in 100 s, a hostile ship on 0.24 of them: some 35 in four hours.
    assert!((15..70).contains(&launched.len()), "{} ships in four hours", launched.len());
    for &out in launched.values() {
        let way = way_of(Rank::Miniboss);
        assert!((0.9 * SIGHT_LEAST_M - way..=SIGHT_LEAST_M + way).contains(&out), "launched {out} m out");
    }
}

#[test]
fn a_ship_stays_while_a_player_is_within_1_1_times_its_sight_and_goes_past_it() {
    let mut hostiles = Hostiles {
        sailing: vec![standing(1, [5_400.0, 0.0], 0.0, false), standing(2, [5_600.0, 0.0], 0.0, false)],
        ..Hostiles::default()
    };
    hostiles.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false)], &HOSTILE_WATER);
    assert_eq!(hostiles.sailing.iter().map(|hostile| hostile.id).collect::<Vec<_>>(), [1]);
}

#[test]
fn a_ship_takes_the_sight_of_the_player_nearest_it_and_keeps_the_largest() {
    let mut hostiles = Hostiles { sailing: vec![standing(1, [5_000.0, 0.0], 0.0, false)], ..Hostiles::default() };
    let far_off = voyager(2, [200_000.0, 0.0], 100, false);
    hostiles.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false), far_off], &HOSTILE_WATER);
    assert_eq!(hostiles.sailing[0].sight_m, SIGHT_LEAST_M, "the nearer player is at rest");
    hostiles.tick(1.0, &[voyager(1, [0.0, 0.0], 100, false)], &HOSTILE_WATER);
    assert!((hostiles.sailing[0].sight_m - sight_for(100.0, 1.0)).abs() < 1e-9);
    hostiles.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false)], &HOSTILE_WATER);
    assert!((hostiles.sailing[0].sight_m - sight_for(100.0, 1.0)).abs() < 1e-9, "kept once the player slows");
}

#[test]
fn a_bold_hostile_within_engage_range_of_a_player_meets_them_and_a_wary_one_sails_by() {
    let mut hostiles = Hostiles {
        sailing: vec![standing(1, [700.0, 0.0], 0.0, false), standing(2, [700.0, 0.0], 0.0, true)],
        ..Hostiles::default()
    };
    let met = hostiles.tick(1.0, &[voyager(5, [0.0, 0.0], 0, false)], &HOSTILE_WATER);
    assert_eq!(met.iter().map(|(player, hostile)| (*player, hostile.id)).collect::<Vec<_>>(), [(5, 2)]);
    assert_eq!(hostiles.sailing.len(), 1, "the one met leaves the sea for its fight");
    hostiles.sailing.push(standing(3, [700.0, 0.0], 0.0, true));
    assert!(hostiles.tick(1.0, &[voyager(5, [0.0, 0.0], 0, true)], &HOSTILE_WATER).is_empty(), "none for a fighter");
}

#[test]
fn a_ship_goes_about_where_it_may_not_sail_and_none_comes_where_it_may_not() {
    let walled = OneWater { open: |_, _| false, ..HOSTILE_WATER };
    let mut hostiles = Hostiles { sailing: vec![standing(1, [0.0, 0.0], 0.0, false)], ..Hostiles::default() };
    hostiles.tick(1.0, &[voyager(1, [0.0, 500.0], 0, false)], &walled);
    assert_eq!((hostiles.sailing[0].y, hostiles.sailing[0].heading), (0.0, TAU / 2.0));
    let mut empty = Hostiles::default();
    for _ in 0..4 * 3600 {
        empty.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false)], &walled);
    }
    assert!(empty.sailing.is_empty());
}

#[test]
fn a_ship_sails_on_the_clock_of_the_player_it_sails_by_and_a_shared_sea_keeps_real_time() {
    let way = |ships: &[Voyager]| {
        let mut hostiles = Hostiles { sailing: vec![standing(1, [0.0, 0.0], 0.0, false)], ..Hostiles::default() };
        hostiles.tick(1.0, ships, &HOSTILE_WATER);
        -hostiles.sailing[0].y
    };
    let at = |player, x, clock| Voyager { clock, ..voyager(player, [x, 0.0], 0, false) };
    assert!((way(&[at(1, 1_000.0, 60.0)]) - HOSTILE_WAY_M_S * 60.0).abs() < 1e-9, "at the voyage's x60");
    assert!((way(&[at(1, 1_000.0, 1.0)]) - HOSTILE_WAY_M_S).abs() < 1e-9, "by a ship at rest");
    let shared = [at(1, 1_000.0, 60.0), at(2, 1_500.0, 30.0)];
    assert!((way(&shared) - HOSTILE_WAY_M_S).abs() < 1e-9, "another player within 1200 m: real time");
    let apart_far = [at(1, 1_000.0, 60.0), at(2, 5_000.0, 30.0)];
    assert!((way(&apart_far) - HOSTILE_WAY_M_S * 60.0).abs() < 1e-9, "the nearer player's clock, the other far off");
}

#[test]
fn each_rank_has_its_own_way() {
    let ways: Vec<f64> = RANKS_AT_SEA.iter().map(|&rank| way_of(rank) / HOSTILE_WAY_M_S).collect();
    let expected = [0.9, 1.0, 1.1, 1.2];
    assert!(ways.iter().zip(expected).all(|(way, wanted)| (way - wanted).abs() < 1e-12), "{ways:?}");
    let mut hostiles = Hostiles::default();
    let elite = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    hostiles.sailing.push(Hostile::standing(1, 1, elite, [0.0, 0.0], 0.0, false));
    hostiles.tick(1.0, &[voyager(1, [1_000.0, 0.0], 0, false)], &HOSTILE_WATER);
    assert!((-hostiles.sailing[0].y - 1.1 * HOSTILE_WAY_M_S).abs() < 1e-9, "an Elite sails a tenth faster");
}

#[test]
fn seas_opened_with_other_seeds_send_other_ships_and_the_same_courses_the_same_ones() {
    let first = |seed: u32| {
        let mut hostiles = Hostiles::new(seed);
        let mut ticks = 0;
        while hostiles.sailing.is_empty() && ticks < 4 * 3600 {
            hostiles.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false)], &HOSTILE_WATER);
            ticks += 1;
        }
        hostiles.sailing.first().map(|hostile| format!("{ticks} s, at {:.0}, {:.0}", hostile.x, hostile.y))
    };
    let seen: std::collections::BTreeSet<_> = (1..=8).map(first).collect();
    assert!(seen.len() >= 6, "eight seeds, their first ships: {seen:?}");
    let run = || {
        let mut hostiles = Hostiles::default();
        for _ in 0..3600 {
            let ships = [voyager(1, [0.0, 0.0], 0, false), voyager(2, [5_000.0, 0.0], 0, false)];
            hostiles.tick(1.0, &ships, &HOSTILE_WATER);
        }
        hostiles.sailing
    };
    assert_eq!(run(), run());
}

#[test]
fn home_waters_send_no_one_and_every_other_water_the_grey_tithe() {
    let home = OneWater { holder: Holder::Home, levels: Some((1, 4)), ..HOSTILE_WATER };
    assert!(brought(&home, 10, 4, [0.0, 0.0], 0).is_empty(), "nothing comes in home waters");
    for holder in [Holder::GreyTithe, Holder::Lattice] {
        let hostiles = brought(&OneWater { holder, ..HOSTILE_WATER }, 10, 4, [0.0, 0.0], 0);
        assert!(!hostiles.is_empty() && hostiles.iter().all(|hostile| hostile.commission.faction == GREY_TITHE));
    }
}

#[test]
fn ranks_come_by_their_band_and_a_level_evenly_from_it() {
    for (low, high) in [(1, 4), (10, 13), (13, 16), (19, 22), (26, 30)] {
        let water = OneWater { levels: Some((low, high)), ..HOSTILE_WATER };
        let here = water.water([0.0, 0.0]).unwrap();
        // The roll itself, a few thousand times, as a ship coming to a player at rest draws it.
        let mut hostiles = Hostiles::new(u32::from(low));
        let ship = voyager(1, [0.0, 0.0], 0, false);
        let ships: Vec<Hostile> =
            (0..6_000).filter_map(|_| hostiles.come(&ship, here, &water, &|_| f64::MAX)).collect();
        assert_eq!(ships.len(), 6_000, "every roll in open hostile water sends a ship");
        let shares = crate::sighting::RANKS_BY_BAND.iter().rev().find(|(from, _)| low >= *from).unwrap().1;
        for (rank, expected) in RANKS_AT_SEA.into_iter().zip(shares) {
            let seen = ships.iter().filter(|hostile| hostile.commission.rank == rank).count() as f64;
            let seen = seen / ships.len() as f64;
            assert!((seen - expected).abs() < 0.04, "band from {low}: {rank:?} {seen}, not {expected}");
        }
        assert!(ships.iter().all(|hostile| hostile.commission.rank != Rank::Boss), "no Boss by a roll");
        if low < 13 {
            assert!(ships.iter().all(|hostile| hostile.commission.rank != Rank::Miniboss), "no Miniboss under 13");
        }
        for level in low..=high {
            let seen = ships.iter().filter(|hostile| hostile.level == level).count() as f64 / ships.len() as f64;
            let even = 1.0 / f64::from(high - low + 1);
            assert!((seen - even).abs() < 0.05, "band from {low}: level {level} on {seen}");
        }
        let elites = ships.iter().filter(|hostile| hostile.commission.rank == Rank::Elite);
        assert!(elites.into_iter().all(|hostile| hostile.bold), "an Elite is always bold");
    }
}

#[test]
fn under_way_a_ship_comes_ahead_within_60_degrees_and_a_bold_one_within_its_meeting_cone() {
    let mut hostiles = Hostiles::default();
    let ship = Voyager { heading: TAU / 4.0, ..voyager(1, [0.0, 0.0], 60, false) };
    let (mut count, mut bold) = (0, 0);
    for _ in 0..4 * 3600 {
        hostiles.sailing.clear();
        // Held in place, it rolls as if under way at x60, heading east.
        hostiles.tick(1.0, &[Voyager { clock: 1.0, ..ship }], &HOSTILE_WATER);
        for hostile in &hostiles.sailing {
            count += 1;
            let out = apart([hostile.x, hostile.y], ship.at);
            let sight = sight_for(60.0, 1.0);
            assert!((hostile.sight_m - sight).abs() < 1e-9);
            assert!((0.9 * sight - 3.0..=sight + 3.0).contains(&out), "{out} m out");
            let bearing = heading_to(ship.at, [hostile.x, hostile.y]);
            let arc = if hostile.bold { crate::sighting::meeting_arc(hostile.commission.rank) } else { TAU / 6.0 };
            assert!((bearing - TAU / 4.0).abs() <= arc + 1e-3, "bearing {bearing}, bold {}", hostile.bold);
            bold += usize::from(hostile.bold);
        }
    }
    assert!(count > 15 && bold > 0 && bold < count, "{count} ships, {bold} bold: a bold one within its meeting cone");
    assert!((sight_for(60.0, 1.0) - SIGHT_HOLD_S * (12.0 + 2.4) * 60.0).abs() < 1e-9);
}

#[test]
fn a_hostile_ship_comes_nearest_a_lane_and_heads_along_it_else_nearest_a_coast() {
    // The player 20 km off the coast at x = 0 and 20 km off the lane at y = 0, at rest.
    let at = [20_000.0, 20_000.0];
    let mean =
        |ships: &[Hostile], off: &dyn Fn(&Hostile) -> f64| ships.iter().map(off).sum::<f64>() / ships.len() as f64;
    let on_lane = brought(&OneWater { lane: true, ..HOSTILE_WATER }, 20, 4, at, 0);
    let coast = |hostile: &Hostile| hostile.x.abs();
    let lane = |hostile: &Hostile| hostile.y.abs();
    assert!(mean(&on_lane, &lane) < 17_000.0, "{} m off the lane", mean(&on_lane, &lane));
    let along =
        |hostile: &Hostile| (hostile.heading - TAU / 4.0).abs() < 1e-9 || (hostile.heading - 0.75 * TAU).abs() < 1e-9;
    assert!(on_lane.iter().all(along), "each heads along its lane");
    let no_lane = brought(&HOSTILE_WATER, 20, 4, at, 0);
    assert!(mean(&no_lane, &coast) < 17_000.0, "with no lane near, it comes by the coast");
    assert!(mean(&on_lane, &lane) < mean(&no_lane, &lane) - 2_000.0, "a lane draws it");
}

#[test]
fn a_bold_ship_comes_for_a_player_in_its_sight_at_the_helms_rate_and_a_wary_one_keeps_its_course() {
    // A player at rest 4 km east of the ship; it heads north.
    let player = voyager(1, [4_000.0, 0.0], 0, false);
    let mut hostiles = Hostiles {
        sailing: vec![standing(1, [0.0, 0.0], 0.0, true), standing(2, [0.0, 100.0], 0.0, false)],
        ..Hostiles::default()
    };
    hostiles.tick(1.0, &[player], &HOSTILE_WATER);
    let (bold, wary) = (hostiles.sailing[0], hostiles.sailing[1]);
    assert!((bold.heading - HELM_TURN_RAD_S).abs() < 1e-9, "a helm's turn toward him: {}", bold.heading);
    assert_eq!(bold.quarry, Some(1));
    assert_eq!((wary.heading, wary.quarry), (0.0, None), "the wary one sails on");
    for _ in 0..30 {
        hostiles.tick(1.0, &[player], &HOSTILE_WATER);
    }
    let heading = hostiles.sailing[0].heading;
    assert!((heading - TAU / 4.0).abs() < 0.01, "come round to him, east: {heading}");
    let far = voyager(1, [5_400.0, 0.0], 0, false);
    hostiles.sailing[0].heading = 0.0;
    hostiles.tick(1.0, &[far], &HOSTILE_WATER);
    assert_eq!((hostiles.sailing[0].heading, hostiles.sailing[0].quarry), (0.0, None), "out of its sight: lost");
}

#[test]
fn a_bold_ship_leads_a_player_under_way_and_lets_one_fighting_be() {
    // He is 3 km north and 200 m east, sailing south at x10, past it: it heads for where he will be, south of him.
    let straight = libm::atan2(200.0, 3_000.0);
    let mut hostiles = Hostiles { sailing: vec![standing(1, [0.0, 0.0], straight, true)], ..Hostiles::default() };
    let player = Voyager { heading: TAU / 2.0, ..voyager(1, [200.0, -3_000.0], 10, false) };
    for _ in 0..20 {
        hostiles.tick(0.1, &[player], &HOSTILE_WATER);
    }
    let heading = hostiles.sailing[0].heading;
    assert!(heading > straight + 0.01 && heading < TAU / 4.0, "ahead of where he is: {heading}");
    let mut hostiles = Hostiles { sailing: vec![standing(1, [0.0, 0.0], 0.0, true)], ..Hostiles::default() };
    hostiles.tick(1.0, &[voyager(1, [4_000.0, 0.0], 0, true)], &HOSTILE_WATER);
    assert_eq!((hostiles.sailing[0].heading, hostiles.sailing[0].quarry), (0.0, None));
}

#[test]
fn a_wary_ship_comes_for_a_sloop_it_would_take_and_lets_a_sound_one_be() {
    let sound = voyager(1, [4_000.0, 0.0], 0, false);
    let holed = Voyager { hull: 0.3, ..sound };
    let mut hostiles = Hostiles { sailing: vec![standing(2, [0.0, 0.0], 0.0, false)], ..Hostiles::default() };
    hostiles.tick(1.0, &[sound], &HOSTILE_WATER);
    assert_eq!(hostiles.sailing[0].quarry, None, "a sound Sloop it does not outgun");
    hostiles.tick(1.0, &[holed], &HOSTILE_WATER);
    assert_eq!(hostiles.sailing[0].quarry, Some(1), "one holed under GRAPPLE_HULL it comes for");
    assert!((hostiles.sailing[0].heading - HELM_TURN_RAD_S).abs() < 1e-9);
}

#[test]
fn a_harder_seas_ships_come_at_the_levels_its_tier_raises_foes_to_on_land_and_of_the_same_ranks() {
    let water = OneWater { levels: Some((10, 13)), ..HOSTILE_WATER };
    let here = water.water([0.0, 0.0]).unwrap();
    let ship = voyager(1, [0.0, 0.0], 0, false);
    let sent = |difficulty: gear::Difficulty| {
        let mut hostiles = Hostiles::new(5);
        hostiles.difficulty = difficulty;
        (0..200).filter_map(|_| hostiles.come(&ship, here, &water, &|_| f64::MAX)).collect::<Vec<Hostile>>()
    };
    let normal = sent(gear::Difficulty::Normal);
    for difficulty in [gear::Difficulty::Elite, gear::Difficulty::Abyss] {
        let harder = sent(difficulty);
        assert_eq!(harder.len(), normal.len());
        for (plain, raised) in normal.iter().zip(&harder) {
            assert_eq!(raised.level, difficulty.raise(plain.level), "{difficulty:?}");
            assert_eq!(raised.commission, plain.commission, "the same ranks come");
        }
    }
}

#[test]
fn a_bold_ship_by_the_edge_of_home_waters_meets_no_player_inside_them() {
    let home = OneWater { holder: Holder::Home, open: |_, _| false, ..HOSTILE_WATER };
    let mut hostiles = Hostiles { sailing: vec![standing(1, [700.0, 0.0], 0.0, true)], ..Hostiles::default() };
    let inside = Voyager { home: true, ..voyager(5, [0.0, 0.0], 0, false) };
    assert!(hostiles.tick(1.0, &[inside], &home).is_empty(), "home waters hold no hostile");
    hostiles.chase(5, Some(1));
    assert!(hostiles.tick(1.0, &[inside], &home).is_empty(), "nor one it chases");
}
