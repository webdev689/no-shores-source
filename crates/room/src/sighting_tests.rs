use super::*;

#[test]
fn sight_is_half_a_minute_of_closing_head_on_and_never_under_five_kilometres() {
    assert_eq!(sight_for(0.0, 1.0), SIGHT_LEAST_M, "at rest counts as 1");
    assert_eq!(sight_for(5.0, 1.0), SIGHT_LEAST_M);
    assert!((sight_for(20.0, 1.0) - 8_640.0).abs() < 1e-9);
    assert!((sight_for(60.0, 1.0) - 25_920.0).abs() < 1e-9);
    assert!((sight_for(100.0, 1.0) - 43_200.0).abs() < 1e-9);
}

#[test]
fn a_ship_comes_out_half_a_minute_of_closing_head_on_off_and_never_under_one_kilometre() {
    assert_eq!(come_out_for(0.0, 1.0), COME_OUT_LEAST_M, "at rest counts as 1");
    assert_eq!(come_out_for(2.0, 1.0), COME_OUT_LEAST_M);
    assert!((come_out_for(5.0, 1.0) - 2_160.0).abs() < 1e-9, "nearer than its sight");
    assert!((come_out_for(60.0, 1.0) - sight_for(60.0, 1.0)).abs() < 1e-9, "its sight at speed");
}

#[test]
fn each_holder_sends_its_faction_and_home_waters_none() {
    assert_eq!(faction_of(Holder::Home), None);
    assert_eq!(faction_of(Holder::GreyTithe), Some(GREY_TITHE));
    assert_eq!(faction_of(Holder::Lattice), Some(GREY_TITHE), "the Lattice's waters send the Tithe's ships");
}

#[test]
fn a_bands_row_holds_from_its_level_to_the_next_and_its_shares_sum_to_one() {
    let shares = |low: u8| {
        let rolls = (0..10_000).map(|step| (f64::from(step) + 0.5) / 10_000.0);
        let ranks: Vec<Rank> = rolls.map(|roll| rank_for(low, roll)).collect();
        RANKS_AT_SEA.map(|rank| ranks.iter().filter(|&&each| each == rank).count() as f64 / 10_000.0)
    };
    let near = |one: [f64; 4], other: [f64; 4]| one.iter().zip(other).all(|(a, b)| (a - b).abs() < 1e-3);
    for (low, row) in [(1, 0), (3, 0), (4, 1), (7, 2), (10, 3), (12, 3), (13, 4), (16, 5), (19, 6), (22, 7), (26, 8)] {
        assert!(near(shares(low), RANKS_BY_BAND[row].1), "band from {low}: {:?}", shares(low));
    }
    for (_, row) in RANKS_BY_BAND {
        assert!((row.iter().sum::<f64>() - 1.0).abs() < 1e-12);
    }
    assert_eq!(rank_for(19, 1.0 - f64::EPSILON / 4.0), Rank::Miniboss, "the top of a roll: the row's highest rank");
    assert_eq!(rank_for(1, 1.0 - f64::EPSILON / 4.0), Rank::Elite);
}

#[test]
fn each_islands_band_has_a_row_and_each_rank_moves_one_way_from_row_to_row() {
    let lows: Vec<u8> = gear::world::ISLANDS.iter().map(|&(_, low, _)| low).collect();
    assert_eq!(RANKS_BY_BAND.map(|(from, _)| from).to_vec(), lows, "a row from each island's lowest level");
    let column = |rank: usize| RANKS_BY_BAND.map(|(_, row)| row[rank]);
    assert!(column(0).windows(2).all(|pair| pair[1] < pair[0]), "fewer Minors each band: {:?}", column(0));
    assert!(column(2).windows(2).all(|pair| pair[1] > pair[0]), "more Elites each band: {:?}", column(2));
    assert!(column(3).windows(2).all(|pair| pair[1] >= pair[0]), "Minibosses never fewer: {:?}", column(3));
}

#[test]
fn a_hostile_ships_chance_at_a_roll_rises_evenly_with_the_waters_band() {
    let chance = |low: u8, high: u8| hostile_chance(Some((low, high)));
    assert!((chance(1, 4) - 0.18).abs() < 1e-12, "the first band");
    assert!((chance(26, 30) - 0.36).abs() < 1e-12, "the last band");
    assert!((chance(13, 16) - 0.27).abs() < 1e-12, "the middle band, halfway");
    let rising: Vec<f64> = gear::world::ISLANDS.iter().map(|&(_, low, high)| chance(low, high)).collect();
    let steps: Vec<f64> = rising.windows(2).map(|pair| pair[1] - pair[0]).collect();
    assert!(steps.iter().all(|step| (step - 0.0225).abs() < 1e-12), "even steps: {rising:?}");
    assert!((hostile_chance(None) - 0.18).abs() < 1e-12, "a water with no band rolls as the first");
}

#[test]
fn a_level_is_drawn_evenly_from_the_band() {
    assert_eq!(level_in(None, 0.5), 0);
    assert_eq!(level_in(Some((22, 26)), 0.0), 22);
    assert_eq!(level_in(Some((22, 26)), 0.999_999), 26);
    assert_eq!(level_in(Some((22, 26)), 0.5), 24);
}

#[test]
fn a_tithe_ship_heads_the_way_of_its_lane_nearer_its_slant() {
    assert!((along_lane([1.0, 0.0], 1.0) - PI / 2.0).abs() < 1e-12, "east, slanting east");
    assert!((along_lane([1.0, 0.0], 4.0) - 1.5 * PI).abs() < 1e-12, "west, slanting west");
    assert!((along_lane([0.0, -1.0], 6.0)).abs() < 1e-12, "north, slanting a little west of north");
}

#[test]
fn lead_pursuit_heads_where_the_ship_will_be_and_straight_at_one_that_cannot_be_reached() {
    let close = |one: f64, other: f64| (one - other).abs() < 1e-9;
    assert!(close(intercept_heading([0.0, 0.0], 3.0, [0.0, -1_000.0], [0.0, 0.0]), 0.0), "at rest: straight at it");
    // It is 1 km north sailing east at 3 m/s; a chaser at 5 m/s meets it where 3-4-5 says: 750 m east of it.
    let lead = intercept_heading([0.0, 0.0], 5.0, [0.0, -1_000.0], [3.0, 0.0]);
    assert!(close(lead, libm::atan2(750.0, 1_000.0)), "{lead}");
    let away = intercept_heading([0.0, 0.0], 2.4, [0.0, -1_000.0], [0.0, -12.0]);
    assert!(close(away, 0.0), "the faster sailing away: straight at it");
}

#[test]
fn a_heading_turns_toward_another_by_at_most_the_most_the_shorter_way() {
    let close = |one: f64, other: f64| (one - other).abs() < 1e-12;
    assert!(close(turned_toward(0.0, 1.0, 0.1), 0.1));
    assert!(close(turned_toward(0.1, 6.2, 0.5), 6.2), "past north the short way");
    assert!(close(turned_toward(1.0, 1.05, 0.1), 1.05), "near enough, there");
    assert!((HELM_TURN_RAD_S - 10.0_f64.to_radians()).abs() < 1e-12);
}

#[test]
fn a_bold_ships_meeting_cone_is_where_its_way_can_meet_a_voyage_holding_its_course() {
    let major = meeting_arc(Rank::Major);
    assert!((major - libm::asin(0.2) * MEETING_MARGIN).abs() < 1e-12, "a fifth of his way: 11.5 degrees, shrunk");
    assert!(meeting_arc(Rank::Minor) < major && major < meeting_arc(Rank::Miniboss));
}
