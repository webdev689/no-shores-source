use super::*;

#[test]
fn sight_is_half_a_minute_of_closing_head_on_and_never_under_five_kilometres() {
    assert_eq!(sight_for(0.0), SIGHT_LEAST_M, "at rest counts as 1");
    assert_eq!(sight_for(5.0), SIGHT_LEAST_M);
    assert!((sight_for(20.0) - 8_640.0).abs() < 1e-9);
    assert!((sight_for(60.0) - 25_920.0).abs() < 1e-9);
    assert!((sight_for(100.0) - 43_200.0).abs() < 1e-9);
}

#[test]
fn each_holder_sends_its_faction_and_home_waters_none() {
    assert_eq!(faction_of(Holder::Home, 0.0), None);
    assert_eq!(faction_of(Holder::Pirates, 0.0), Some(PIRATES));
    assert_eq!(faction_of(Holder::GreyTithe, 0.9), Some(GREY_TITHE));
    assert_eq!(faction_of(Holder::Contested, 0.49), Some(GREY_TITHE));
    assert_eq!(faction_of(Holder::Contested, 0.5), Some(PIRATES));
}

#[test]
fn a_bands_row_holds_from_its_level_to_the_next_and_its_shares_sum_to_one() {
    let shares = |low: u8| {
        let rolls = (0..10_000).map(|step| (f64::from(step) + 0.5) / 10_000.0);
        let ranks: Vec<Rank> = rolls.map(|roll| rank_for(low, roll)).collect();
        RANKS_AT_SEA.map(|rank| ranks.iter().filter(|&&each| each == rank).count() as f64 / 10_000.0)
    };
    let near = |one: [f64; 4], other: [f64; 4]| one.iter().zip(other).all(|(a, b)| (a - b).abs() < 1e-3);
    for (low, row) in [(1, 0), (7, 0), (10, 1), (12, 1), (13, 2), (16, 2), (19, 3), (22, 3), (26, 4)] {
        assert!(near(shares(low), RANKS_BY_BAND[row].1), "band from {low}: {:?}", shares(low));
    }
    for (_, row) in RANKS_BY_BAND {
        assert!((row.iter().sum::<f64>() - 1.0).abs() < 1e-12);
    }
    assert_eq!(rank_for(19, 1.0 - f64::EPSILON / 4.0), Rank::Miniboss, "the top of a roll: the row's highest rank");
    assert_eq!(rank_for(1, 1.0 - f64::EPSILON / 4.0), Rank::Elite);
}

#[test]
fn a_level_is_drawn_evenly_from_the_band() {
    assert_eq!(level_in(None, 0.5), 0);
    assert_eq!(level_in(Some((22, 26)), 0.0), 22);
    assert_eq!(level_in(Some((22, 26)), 0.999_999), 26);
    assert_eq!(level_in(Some((22, 26)), 0.5), 24);
}

#[test]
fn a_tithe_ship_heads_the_way_of_her_lane_nearer_her_slant() {
    assert!((along_lane([1.0, 0.0], 1.0) - PI / 2.0).abs() < 1e-12, "east, slanting east");
    assert!((along_lane([1.0, 0.0], 4.0) - 1.5 * PI).abs() < 1e-12, "west, slanting west");
    assert!((along_lane([0.0, -1.0], 6.0)).abs() < 1e-12, "north, slanting a little west of north");
}
