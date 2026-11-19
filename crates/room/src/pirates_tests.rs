use super::*;

const OPEN: fn([f64; 2], [f64; 2]) -> bool = |_, _| true;

/// Steps the pirates `seconds` a second at a time round ships that stay where they are, answering every meeting.
fn sail(pirates: &mut Pirates, seconds: u32, ships: &[(PlayerId, [f64; 2], bool, f64)]) -> Vec<(PlayerId, Pirate)> {
    (0..seconds).flat_map(|_| pirates.tick(1.0, ships, OPEN)).collect()
}

#[test]
fn no_pirate_comes_before_the_first_roll_and_each_comes_on_the_ring_clear_of_the_player() {
    let mut pirates = Pirates::default();
    let ship = [500_000.0, 500_000.0];
    sail(&mut pirates, 29, &[(1, ship, true, 1.0)]);
    assert!(pirates.sailing.is_empty(), "nothing before half a minute, and nothing while fighting");
    let mut launched = Vec::new();
    for _ in 0..4 * 3600 {
        pirates.tick(1.0, &[(1, ship, true, 1.0)], OPEN);
        // A fighting player is never met, so every pirate stays to be seen.
        for pirate in &pirates.sailing {
            if !launched.iter().any(|&(id, _)| id == pirate.id) {
                launched.push((pirate.id, apart([pirate.x, pirate.y], ship)));
            }
        }
    }
    assert!(launched.is_empty(), "a fighting player is sent no one");
    for _ in 0..4 * 3600 {
        pirates.sailing.retain(|pirate| !pirate.bold);
        pirates.tick(1.0, &[(1, ship, false, 1.0)], OPEN);
        for pirate in &pirates.sailing {
            if !launched.iter().any(|&(id, _)| id == pirate.id) {
                launched.push((pirate.id, apart([pirate.x, pirate.y], ship)));
            }
        }
        let near = pirates.sailing.iter().filter(|pirate| apart([pirate.x, pirate.y], ship) <= DESPAWN_BEYOND);
        assert!(near.count() <= DENSITY);
    }
    // About one roll in 100 s, a pirate on 0.24 of them: some 35 in four hours.
    assert!((15..70).contains(&launched.len()), "{} pirates in four hours", launched.len());
    for &(_, out) in &launched {
        assert!((SPAWN_RING[0]..=SPAWN_RING[1] + PIRATE_WAY_M_S).contains(&out), "launched {out} m out");
    }
}

#[test]
fn a_pirate_far_from_every_player_leaves_the_sea_and_one_near_another_stays() {
    let pirate = |id: u32, x: f64| Pirate { id, seed: id, x, y: 0.0, heading: 0.0, bold: false };
    let mut pirates = Pirates { sailing: vec![pirate(1, 3_000.0), pirate(2, 10_000.0)], ..Pirates::default() };
    let ships = [(1, [0.0, 0.0], false, 1.0), (2, [11_000.0, 0.0], false, 1.0)];
    pirates.tick(1.0, &ships, OPEN);
    assert_eq!(pirates.sailing.iter().map(|pirate| pirate.id).collect::<Vec<_>>(), [2]);
}

#[test]
fn a_bold_pirate_in_sight_of_a_player_meets_them_and_a_wary_one_sails_by() {
    let pirate = |id: u32, bold: bool| Pirate { id, seed: id, x: 700.0, y: 0.0, heading: 0.0, bold };
    let mut pirates = Pirates { sailing: vec![pirate(1, false), pirate(2, true)], ..Pirates::default() };
    let met = pirates.tick(1.0, &[(5, [0.0, 0.0], false, 1.0)], OPEN);
    assert_eq!(met.iter().map(|(player, pirate)| (*player, pirate.id)).collect::<Vec<_>>(), [(5, 2)]);
    assert_eq!(pirates.sailing.len(), 1, "the one met leaves the sea for her fight");
    pirates.sailing.push(pirate(3, true));
    assert!(pirates.tick(1.0, &[(5, [0.0, 0.0], true, 1.0)], OPEN).is_empty(), "no meeting for a player fighting");
}

#[test]
fn a_pirate_goes_about_at_land_and_none_comes_where_land_lies_between() {
    let ahead = Pirate { id: 1, seed: 1, x: 0.0, y: 0.0, heading: 0.0, bold: false };
    let mut pirates = Pirates { sailing: vec![ahead], ..Pirates::default() };
    pirates.tick(1.0, &[(1, [0.0, 500.0], false, 1.0)], |_, _| false);
    assert_eq!((pirates.sailing[0].y, pirates.sailing[0].heading), (0.0, TAU / 2.0));
    let mut walled = Pirates::default();
    for _ in 0..4 * 3600 {
        walled.tick(1.0, &[(1, [0.0, 0.0], false, 1.0)], |_, _| false);
    }
    assert!(walled.sailing.is_empty());
}

#[test]
fn a_pirate_sails_on_the_clock_of_the_player_she_sails_by_and_a_shared_sea_keeps_real_time() {
    let pirate = Pirate { id: 1, seed: 1, x: 0.0, y: 0.0, heading: 0.0, bold: false };
    let way = |ships: &[(PlayerId, [f64; 2], bool, f64)]| {
        let mut pirates = Pirates { sailing: vec![pirate], ..Pirates::default() };
        pirates.tick(1.0, ships, OPEN);
        -pirates.sailing[0].y
    };
    assert!((way(&[(1, [1_000.0, 0.0], false, 60.0)]) - PIRATE_WAY_M_S * 60.0).abs() < 1e-9, "at the voyage's x60");
    assert!((way(&[(1, [1_000.0, 0.0], false, 1.0)]) - PIRATE_WAY_M_S).abs() < 1e-9, "by a ship at rest");
    let shared = [(1, [1_000.0, 0.0], false, 60.0), (2, [1_500.0, 0.0], false, 30.0)];
    assert!((way(&shared) - PIRATE_WAY_M_S).abs() < 1e-9, "another player within 1200 m: real time");
    let apart_far = [(1, [1_000.0, 0.0], false, 60.0), (2, [5_000.0, 0.0], false, 30.0)];
    assert!((way(&apart_far) - PIRATE_WAY_M_S * 60.0).abs() < 1e-9, "the nearer player's clock, the other far off");
}

#[test]
fn seas_opened_with_other_seeds_send_other_pirates() {
    let first = |seed: u32| {
        let mut pirates = Pirates::new(seed);
        let mut ticks = 0;
        while pirates.sailing.is_empty() && ticks < 4 * 3600 {
            pirates.tick(1.0, &[(1, [0.0, 0.0], false, 1.0)], OPEN);
            ticks += 1;
        }
        pirates.sailing.first().map(|pirate| format!("{ticks} s, at {:.0}, {:.0}", pirate.x, pirate.y))
    };
    let seen: std::collections::BTreeSet<_> = (1..=8).map(first).collect();
    assert!(seen.len() >= 6, "eight seeds, their first pirates: {seen:?}");
}

#[test]
fn the_same_courses_make_the_same_pirates() {
    let run = || {
        let mut pirates = Pirates::default();
        sail(&mut pirates, 3600, &[(1, [0.0, 0.0], false, 1.0), (2, [5_000.0, 0.0], false, 1.0)]);
        pirates.sailing
    };
    assert_eq!(run(), run());
}

#[test]
fn the_sea_brings_the_grey_tithe_as_often_as_pirates_and_minors_majors_and_elites_by_their_shares() {
    let mut brought = std::collections::BTreeMap::new();
    for seed in 1..=200 {
        let mut pirates = Pirates::new(seed);
        for _ in 0..4 * 3600 {
            let met = pirates.tick(1.0, &[(1, [0.0, 0.0], false, 1.0)], OPEN);
            for pirate in pirates.sailing.iter().chain(met.iter().map(|(_, pirate)| pirate)) {
                brought.insert((seed, pirate.id), *pirate);
            }
        }
    }
    let count = brought.len() as f64;
    assert!(count > 4_000.0, "{count} ships in 200 seas' four hours");
    let share = |wanted: &dyn Fn(Commission) -> bool| {
        brought.values().filter(|pirate| wanted(pirate.commission())).count() as f64 / count
    };
    let tithe = share(&|commission| commission.faction == GREY_TITHE);
    assert!((tithe - TITHE_SHARE).abs() < 0.03, "the Grey Tithe's share {tithe}");
    assert!((share(&|commission| commission.faction == PIRATES) + tithe - 1.0).abs() < 1e-9, "pirates the rest");
    for (rank, expected) in RANKS_AT_SEA {
        let seen = share(&|commission| commission.rank == rank);
        assert!((seen - expected).abs() < 0.03, "{rank:?}: {seen}");
    }
    let elites = brought.values().filter(|pirate| pirate.commission().rank == Rank::Elite);
    assert!(elites.clone().count() > 0 && elites.into_iter().all(|pirate| pirate.bold), "an Elite is always bold");
}

#[test]
fn a_ships_faction_and_rank_come_from_her_seed_by_their_shares() {
    let commissions: Vec<Commission> = (0..20_000).map(commission_at_sea).collect();
    let share = |wanted: &dyn Fn(&Commission) -> bool| {
        commissions.iter().filter(|commission| wanted(commission)).count() as f64 / commissions.len() as f64
    };
    assert!((share(&|commission| commission.faction == GREY_TITHE) - TITHE_SHARE).abs() < 0.015);
    for (rank, expected) in RANKS_AT_SEA {
        assert!((share(&|commission| commission.rank == rank) - expected).abs() < 0.015, "{rank:?}");
    }
    assert_eq!(commission_at_sea(77), commission_at_sea(77), "one seed, one commission");
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
