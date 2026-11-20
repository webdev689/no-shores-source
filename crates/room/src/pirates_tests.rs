use super::*;
use crate::sighting::{RANKS_AT_SEA, SIGHT_HOLD_S};
use naval::ranks::{PIRATES, Rank};
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

const PIRATE_WATER: OneWater =
    OneWater { holder: Holder::Pirates, levels: Some((10, 13)), lane: false, open: |_, _| true };

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

/// A player's ship at `at`, heading north at `pace`, fighting or not; her waters run at her pace.
fn voyager(player: PlayerId, at: [f64; 2], pace: u16, fighting: bool) -> Voyager {
    Voyager { player, at, heading: 0.0, pace, fighting, clock: f64::from(pace.max(1)) }
}

fn standing(id: u32, at: [f64; 2], heading: f64, bold: bool) -> Pirate {
    Pirate::standing(id, id, Commission::default(), at, heading, bold)
}

/// Every ship one water sends a player who stays at `at` at `pace` over `hours`, a second at a time, a fresh sea for
/// each of `seeds`: bold ones are taken out before they meet the player.
fn brought(chart: &OneWater, seeds: u32, hours: u32, at: [f64; 2], pace: u16) -> Vec<Pirate> {
    let mut seen = Map::new();
    for seed in 1..=seeds {
        let mut pirates = Pirates::new(seed);
        for _ in 0..hours * 3600 {
            pirates.tick(1.0, &[voyager(1, at, pace, false)], chart);
            for pirate in &pirates.sailing {
                seen.entry((seed, pirate.id)).or_insert(*pirate);
            }
            pirates.sailing.retain(|pirate| !pirate.bold);
        }
    }
    seen.into_values().collect()
}

#[test]
fn no_ship_comes_before_the_first_roll_or_to_a_fighting_player_and_each_comes_near_her_sight_out() {
    let mut pirates = Pirates::default();
    let ship = [500_000.0, 500_000.0];
    for _ in 0..4 * 3600 {
        pirates.tick(1.0, &[voyager(1, ship, 0, true)], &PIRATE_WATER);
    }
    assert!(pirates.sailing.is_empty(), "a fighting player is sent no one");
    let mut launched = Map::new();
    for _ in 0..4 * 3600 {
        pirates.sailing.retain(|pirate| !pirate.bold);
        pirates.tick(1.0, &[voyager(1, ship, 0, false)], &PIRATE_WATER);
        for pirate in &pirates.sailing {
            launched.entry(pirate.id).or_insert(apart([pirate.x, pirate.y], ship));
        }
        assert!(pirates.sailing.iter().filter(|pirate| pirate.sees(ship)).count() <= DENSITY);
    }
    // About one roll in 100 s, a hostile ship on 0.24 of them: some 35 in four hours.
    assert!((15..70).contains(&launched.len()), "{} ships in four hours", launched.len());
    for &out in launched.values() {
        let way = way_of(Rank::Miniboss);
        assert!((0.9 * SIGHT_LEAST_M - way..=SIGHT_LEAST_M + way).contains(&out), "launched {out} m out");
    }
}

#[test]
fn a_ship_stays_while_a_player_is_within_1_1_times_her_sight_and_goes_past_it() {
    let mut pirates = Pirates {
        sailing: vec![standing(1, [5_400.0, 0.0], 0.0, false), standing(2, [5_600.0, 0.0], 0.0, false)],
        ..Pirates::default()
    };
    pirates.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false)], &PIRATE_WATER);
    assert_eq!(pirates.sailing.iter().map(|pirate| pirate.id).collect::<Vec<_>>(), [1]);
}

#[test]
fn a_ship_takes_the_sight_of_the_player_nearest_her_and_keeps_the_largest() {
    let mut pirates = Pirates { sailing: vec![standing(1, [5_000.0, 0.0], 0.0, false)], ..Pirates::default() };
    let far_off = voyager(2, [200_000.0, 0.0], 100, false);
    pirates.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false), far_off], &PIRATE_WATER);
    assert_eq!(pirates.sailing[0].sight_m, SIGHT_LEAST_M, "the nearer player is at rest");
    pirates.tick(1.0, &[voyager(1, [0.0, 0.0], 100, false)], &PIRATE_WATER);
    assert!((pirates.sailing[0].sight_m - sight_for(100.0)).abs() < 1e-9);
    pirates.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false)], &PIRATE_WATER);
    assert!((pirates.sailing[0].sight_m - sight_for(100.0)).abs() < 1e-9, "kept once the player slows");
}

#[test]
fn a_bold_pirate_within_engage_range_of_a_player_meets_them_and_a_wary_one_sails_by() {
    let mut pirates = Pirates {
        sailing: vec![standing(1, [700.0, 0.0], 0.0, false), standing(2, [700.0, 0.0], 0.0, true)],
        ..Pirates::default()
    };
    let met = pirates.tick(1.0, &[voyager(5, [0.0, 0.0], 0, false)], &PIRATE_WATER);
    assert_eq!(met.iter().map(|(player, pirate)| (*player, pirate.id)).collect::<Vec<_>>(), [(5, 2)]);
    assert_eq!(pirates.sailing.len(), 1, "the one met leaves the sea for her fight");
    pirates.sailing.push(standing(3, [700.0, 0.0], 0.0, true));
    assert!(pirates.tick(1.0, &[voyager(5, [0.0, 0.0], 0, true)], &PIRATE_WATER).is_empty(), "none for a fighter");
}

#[test]
fn a_ship_goes_about_where_she_may_not_sail_and_none_comes_where_she_may_not() {
    let walled = OneWater { open: |_, _| false, ..PIRATE_WATER };
    let mut pirates = Pirates { sailing: vec![standing(1, [0.0, 0.0], 0.0, false)], ..Pirates::default() };
    pirates.tick(1.0, &[voyager(1, [0.0, 500.0], 0, false)], &walled);
    assert_eq!((pirates.sailing[0].y, pirates.sailing[0].heading), (0.0, TAU / 2.0));
    let mut empty = Pirates::default();
    for _ in 0..4 * 3600 {
        empty.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false)], &walled);
    }
    assert!(empty.sailing.is_empty());
}

#[test]
fn a_ship_sails_on_the_clock_of_the_player_she_sails_by_and_a_shared_sea_keeps_real_time() {
    let way = |ships: &[Voyager]| {
        let mut pirates = Pirates { sailing: vec![standing(1, [0.0, 0.0], 0.0, false)], ..Pirates::default() };
        pirates.tick(1.0, ships, &PIRATE_WATER);
        -pirates.sailing[0].y
    };
    let at = |player, x, clock| Voyager { clock, ..voyager(player, [x, 0.0], 0, false) };
    assert!((way(&[at(1, 1_000.0, 60.0)]) - PIRATE_WAY_M_S * 60.0).abs() < 1e-9, "at the voyage's x60");
    assert!((way(&[at(1, 1_000.0, 1.0)]) - PIRATE_WAY_M_S).abs() < 1e-9, "by a ship at rest");
    let shared = [at(1, 1_000.0, 60.0), at(2, 1_500.0, 30.0)];
    assert!((way(&shared) - PIRATE_WAY_M_S).abs() < 1e-9, "another player within 1200 m: real time");
    let apart_far = [at(1, 1_000.0, 60.0), at(2, 5_000.0, 30.0)];
    assert!((way(&apart_far) - PIRATE_WAY_M_S * 60.0).abs() < 1e-9, "the nearer player's clock, the other far off");
}

#[test]
fn each_rank_has_her_own_way() {
    let ways: Vec<f64> = RANKS_AT_SEA.iter().map(|&rank| way_of(rank) / PIRATE_WAY_M_S).collect();
    let expected = [0.9, 1.0, 1.1, 1.2];
    assert!(ways.iter().zip(expected).all(|(way, wanted)| (way - wanted).abs() < 1e-12), "{ways:?}");
    let mut pirates = Pirates::default();
    let elite = Commission { faction: PIRATES, rank: Rank::Elite };
    pirates.sailing.push(Pirate::standing(1, 1, elite, [0.0, 0.0], 0.0, false));
    pirates.tick(1.0, &[voyager(1, [1_000.0, 0.0], 0, false)], &PIRATE_WATER);
    assert!((-pirates.sailing[0].y - 1.1 * PIRATE_WAY_M_S).abs() < 1e-9, "an Elite sails a tenth faster");
}

#[test]
fn seas_opened_with_other_seeds_send_other_ships_and_the_same_courses_the_same_ones() {
    let first = |seed: u32| {
        let mut pirates = Pirates::new(seed);
        let mut ticks = 0;
        while pirates.sailing.is_empty() && ticks < 4 * 3600 {
            pirates.tick(1.0, &[voyager(1, [0.0, 0.0], 0, false)], &PIRATE_WATER);
            ticks += 1;
        }
        pirates.sailing.first().map(|pirate| format!("{ticks} s, at {:.0}, {:.0}", pirate.x, pirate.y))
    };
    let seen: std::collections::BTreeSet<_> = (1..=8).map(first).collect();
    assert!(seen.len() >= 6, "eight seeds, their first ships: {seen:?}");
    let run = || {
        let mut pirates = Pirates::default();
        for _ in 0..3600 {
            let ships = [voyager(1, [0.0, 0.0], 0, false), voyager(2, [5_000.0, 0.0], 0, false)];
            pirates.tick(1.0, &ships, &PIRATE_WATER);
        }
        pirates.sailing
    };
    assert_eq!(run(), run());
}

#[test]
fn home_waters_send_no_one_and_each_holder_sends_her_own_faction() {
    let home = OneWater { holder: Holder::Home, levels: Some((1, 4)), ..PIRATE_WATER };
    assert!(brought(&home, 10, 4, [0.0, 0.0], 0).is_empty(), "nothing comes in home waters");
    let tithe = OneWater { holder: Holder::GreyTithe, ..PIRATE_WATER };
    assert!(brought(&tithe, 10, 4, [0.0, 0.0], 0).iter().all(|pirate| pirate.commission.faction == GREY_TITHE));
    let pirates = brought(&PIRATE_WATER, 10, 4, [0.0, 0.0], 0);
    assert!(!pirates.is_empty() && pirates.iter().all(|pirate| pirate.commission.faction == PIRATES));
    let contested = brought(&OneWater { holder: Holder::Contested, ..PIRATE_WATER }, 40, 4, [0.0, 0.0], 0);
    let share = contested.iter().filter(|pirate| pirate.commission.faction == GREY_TITHE).count() as f64;
    let share = share / contested.len() as f64;
    assert!(
        contested.len() > 800 && (share - 0.5).abs() < 0.05,
        "{} ships, the Tithe's share {share}",
        contested.len()
    );
}

#[test]
fn ranks_come_by_their_band_and_a_level_evenly_from_it() {
    for (low, high) in [(1, 4), (10, 13), (13, 16), (19, 22), (26, 30)] {
        let water = OneWater { levels: Some((low, high)), ..PIRATE_WATER };
        let ships = brought(&water, 60, 4, [0.0, 0.0], 0);
        let shares = crate::sighting::RANKS_BY_BAND.iter().rev().find(|(from, _)| low >= *from).unwrap().1;
        for (rank, expected) in RANKS_AT_SEA.into_iter().zip(shares) {
            let seen = ships.iter().filter(|pirate| pirate.commission.rank == rank).count() as f64;
            let seen = seen / ships.len() as f64;
            assert!((seen - expected).abs() < 0.04, "band from {low}: {rank:?} {seen}, not {expected}");
        }
        assert!(ships.iter().all(|pirate| pirate.commission.rank != Rank::Boss), "no Boss by a roll");
        if low < 13 {
            assert!(ships.iter().all(|pirate| pirate.commission.rank != Rank::Miniboss), "no Miniboss under 13");
        }
        for level in low..=high {
            let seen = ships.iter().filter(|pirate| pirate.level == level).count() as f64 / ships.len() as f64;
            let even = 1.0 / f64::from(high - low + 1);
            assert!((seen - even).abs() < 0.05, "band from {low}: level {level} on {seen}");
        }
        let elites = ships.iter().filter(|pirate| pirate.commission.rank == Rank::Elite);
        assert!(elites.into_iter().all(|pirate| pirate.bold), "an Elite is always bold");
    }
}

#[test]
fn under_way_a_ship_comes_ahead_within_60_degrees_and_a_bold_one_within_her_meeting_cone() {
    let mut pirates = Pirates::default();
    let ship = Voyager { heading: TAU / 4.0, ..voyager(1, [0.0, 0.0], 60, false) };
    let (mut count, mut bold) = (0, 0);
    for _ in 0..4 * 3600 {
        pirates.sailing.clear();
        // Held in place, she rolls as if under way at x60, heading east.
        pirates.tick(1.0, &[Voyager { clock: 1.0, ..ship }], &PIRATE_WATER);
        for pirate in &pirates.sailing {
            count += 1;
            let out = apart([pirate.x, pirate.y], ship.at);
            let sight = sight_for(60.0);
            assert!((pirate.sight_m - sight).abs() < 1e-9);
            assert!((0.9 * sight - 3.0..=sight + 3.0).contains(&out), "{out} m out");
            let bearing = heading_to(ship.at, [pirate.x, pirate.y]);
            let arc = if pirate.bold { crate::sighting::meeting_arc(pirate.commission.rank) } else { TAU / 6.0 };
            assert!((bearing - TAU / 4.0).abs() <= arc + 1e-3, "bearing {bearing}, bold {}", pirate.bold);
            bold += usize::from(pirate.bold);
        }
    }
    assert!(count > 15 && bold > 0 && bold < count, "{count} ships, {bold} bold: a bold one within her meeting cone");
    assert!((sight_for(60.0) - SIGHT_HOLD_S * (12.0 + 2.4) * 60.0).abs() < 1e-9);
}

#[test]
fn pirates_keep_nearer_coasts_and_tithe_ships_nearer_lanes_on_average() {
    // The player 20 km off the coast at x = 0 and 20 km off the lane at y = 0, at rest.
    let at = [20_000.0, 20_000.0];
    let mean = |ships: &[Pirate], off: &dyn Fn(&Pirate) -> f64| ships.iter().map(off).sum::<f64>() / ships.len() as f64;
    let pirates = brought(&OneWater { lane: true, ..PIRATE_WATER }, 20, 4, at, 0);
    let tithe = brought(&OneWater { holder: Holder::GreyTithe, lane: true, ..PIRATE_WATER }, 20, 4, at, 0);
    let coast = |pirate: &Pirate| pirate.x.abs();
    let lane = |pirate: &Pirate| pirate.y.abs();
    assert!(mean(&pirates, &coast) < 17_000.0, "pirates {} m off the coast", mean(&pirates, &coast));
    assert!(mean(&tithe, &lane) < 17_000.0, "Tithe ships {} m off the lane", mean(&tithe, &lane));
    assert!(mean(&tithe, &lane) < mean(&pirates, &lane) - 2_000.0);
    let along =
        |pirate: &Pirate| (pirate.heading - TAU / 4.0).abs() < 1e-9 || (pirate.heading - 0.75 * TAU).abs() < 1e-9;
    assert!(tithe.iter().all(along), "a Tithe ship heads along her lane");
    let no_lane = brought(&OneWater { holder: Holder::GreyTithe, ..PIRATE_WATER }, 20, 4, at, 0);
    assert!(mean(&no_lane, &coast) < 17_000.0, "with no lane near, she comes as a pirate does");
}

#[test]
fn a_bold_ship_meets_the_nearest_rival_in_sight_and_two_that_parted_meet_only_once_out_of_sight() {
    use crate::clash::tests::at_sea;
    let elite = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    let major = Commission::default();
    let friend = Commission { faction: GREY_TITHE, rank: Rank::Major };
    let ships = [at_sea(1, elite, 0.0, true), at_sea(2, friend, 100.0, true), at_sea(3, major, 700.0, false)];
    let mut pirates = Pirates { sailing: ships.to_vec(), ..Pirates::default() };
    let met: Vec<[u32; 2]> = pirates.meet_rivals().iter().map(|pair| pair.map(|pirate| pirate.id)).collect();
    assert_eq!(met, [[1, 3]], "her own faction's ship is no rival");
    let mut pirates = Pirates::default();
    pirates.back_from_clash(vec![ships[0], Pirate { x: 400.0, ..ships[2] }]);
    assert!(pirates.meet_rivals().is_empty(), "they parted");
    pirates.sailing[1].x = 800.0;
    assert!(pirates.meet_rivals().is_empty(), "out of sight");
    pirates.sailing[1].x = 400.0;
    assert_eq!(pirates.meet_rivals().len(), 1, "in sight again, they meet again");
}

#[test]
fn a_bold_ship_comes_for_a_player_in_her_sight_at_the_helms_rate_and_a_wary_one_keeps_her_course() {
    // A player 4 km east of her at rest; she heads north.
    let player = voyager(1, [4_000.0, 0.0], 0, false);
    let mut pirates = Pirates {
        sailing: vec![standing(1, [0.0, 0.0], 0.0, true), standing(2, [0.0, 100.0], 0.0, false)],
        ..Pirates::default()
    };
    pirates.tick(1.0, &[player], &PIRATE_WATER);
    let (bold, wary) = (pirates.sailing[0], pirates.sailing[1]);
    assert!((bold.heading - HELM_TURN_RAD_S).abs() < 1e-9, "a helm's turn toward him: {}", bold.heading);
    assert_eq!(bold.quarry, Some(1));
    assert_eq!((wary.heading, wary.quarry), (0.0, None), "the wary one sails on");
    for _ in 0..30 {
        pirates.tick(1.0, &[player], &PIRATE_WATER);
    }
    let heading = pirates.sailing[0].heading;
    assert!((heading - TAU / 4.0).abs() < 0.01, "come round to him, east: {heading}");
    let far = voyager(1, [5_400.0, 0.0], 0, false);
    pirates.sailing[0].heading = 0.0;
    pirates.tick(1.0, &[far], &PIRATE_WATER);
    assert_eq!((pirates.sailing[0].heading, pirates.sailing[0].quarry), (0.0, None), "out of her sight: lost");
}

#[test]
fn a_bold_ship_leads_a_player_under_way_and_lets_one_fighting_be() {
    // He is 3 km north and 200 m east, sailing south at x10, past her: she heads for where he will be, south of him.
    let straight = libm::atan2(200.0, 3_000.0);
    let mut pirates = Pirates { sailing: vec![standing(1, [0.0, 0.0], straight, true)], ..Pirates::default() };
    let player = Voyager { heading: TAU / 2.0, ..voyager(1, [200.0, -3_000.0], 10, false) };
    for _ in 0..20 {
        pirates.tick(0.1, &[player], &PIRATE_WATER);
    }
    let heading = pirates.sailing[0].heading;
    assert!(heading > straight + 0.01 && heading < TAU / 4.0, "ahead of where he is: {heading}");
    let mut pirates = Pirates { sailing: vec![standing(1, [0.0, 0.0], 0.0, true)], ..Pirates::default() };
    pirates.tick(1.0, &[voyager(1, [4_000.0, 0.0], 0, true)], &PIRATE_WATER);
    assert_eq!((pirates.sailing[0].heading, pirates.sailing[0].quarry), (0.0, None));
}
