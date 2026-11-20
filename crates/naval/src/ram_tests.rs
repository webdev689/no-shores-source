use super::*;
use crate::arms::{LARGE_BOAT, PIRATE_SLOOP};
use crate::damage::{Hurt, State};

/// A hull 4 m half long and 1 m half wide, upright at the origin, her bow north.
fn hull() -> Block {
    Block { centre: [0.0, 0.0, 0.0], axes: [[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]], half: [4.0, 1.0, 1.0] }
}

#[test]
fn a_stem_meets_the_face_it_stands_farthest_outside_of_within_its_reach() {
    let side = ram_contact(&hull(), [1.6, 0.0, 0.0], RAM_REACH);
    assert_eq!(side, Some(Contact { side: true, normal: [1.0, 0.0] }), "0.6 m off her starboard side");
    assert_eq!(ram_contact(&hull(), [1.0 + RAM_REACH + 0.01, 0.0, 0.0], RAM_REACH), None, "out of reach");
    let inside = ram_contact(&hull(), [0.6, 3.0, 0.0], RAM_REACH);
    assert_eq!(inside.map(|contact| contact.side), Some(true), "0.4 m into her planking: the face least inside");
    let stern = ram_contact(&hull(), [0.2, 4.5, 0.0], RAM_REACH);
    assert_eq!(stern, Some(Contact { side: false, normal: [0.0, 1.0] }), "at her stern");
}

#[test]
fn the_closing_way_is_the_most_remembered_way_less_hers_into_the_face() {
    let into_side = [-1.0, 0.0];
    assert_eq!(ram_closing(&[[6.0, 0.0]], [0.0, 0.0], into_side), 6.0, "square on");
    assert_eq!(ram_closing(&[[0.0, 6.0]], [0.0, 0.0], into_side), 0.0, "along her side");
    assert_eq!(ram_closing(&[[6.0, 0.0]], [5.0, 0.0], into_side), 1.0, "she runs on ahead of the stem");
    assert_eq!(ram_closing(&[[6.0, 0.0]], [-2.0, 0.0], into_side), 8.0, "she comes on to meet it");
    assert_eq!(ram_closing(&[[2.0, 0.0], [7.0, 0.0], [0.1, 0.0]], [0.0, 0.0], into_side), 7.0, "remembered");
}

#[test]
fn a_rams_blow_is_a_share_of_the_lesser_hull_by_its_pace_and_face_half_again_dfos() {
    // DFO's share of the lesser hull, struck half again as hard in a sea fight.
    let share = 0.15_f64 * 1.5;
    assert_eq!(ram_blow(1.59, true, 672.0, 538.0), 0.0, "a bump");
    assert_eq!(ram_blow(f64::NAN, true, 672.0, 538.0), 0.0);
    assert_eq!(ram_blow(1.6, true, 672.0, 538.0), (share * 538.0 * 0.2 + 0.5).floor());
    assert_eq!(ram_blow(8.0, true, 672.0, 538.0), 121.0);
    assert_eq!(ram_blow(38.9, true, 672.0, 538.0), 121.0, "a storm's way rams no harder");
    assert_eq!(ram_blow(4.0, true, 672.0, 538.0), (share * 538.0 * 0.5 + 0.5).floor());
    assert_eq!(ram_blow(8.0, false, 672.0, 538.0), (share * 538.0 * 0.4 + 0.5).floor(), "into her bow");
    let small = (share * 96.0 + 0.5).floor();
    assert_eq!(
        (ram_blow(8.0, true, 96.0, 896.0), ram_blow(8.0, true, 896.0, 96.0)),
        (small, small),
        "the lesser, both"
    );
}

/// A ship of `whole` hull points with `hull` of it left.
fn worn(whole: f64, hull: f64) -> Damage {
    let mut damage = Damage::new(&PIRATE_SLOOP, false);
    damage.max_hull = whole;
    damage.hull = hull;
    damage
}

#[test]
fn a_ram_takes_a_ship_to_her_line_and_no_further() {
    let mut her = worn(538.0, 538.0);
    assert_eq!((ram_line(&her), ram_room(&her)), (134.5, 403.5));
    let change = her.apply(Hurt { hull: 1000.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, ram_line(&her));
    assert_eq!((her.hull, change, ram_room(&her)), (134.5, Some(State::Struck), 0.0));
    assert_eq!(recoil_room(&worn(672.0, 672.0)), 503.0);
    assert_eq!((recoil_room(&worn(672.0, 169.5)), recoil_room(&worn(672.0, 170.5))), (0.0, 1.0));
}

#[test]
fn a_ram_is_as_hard_as_the_rammer_can_pay_for_and_takes_men_by_its_blow() {
    assert_eq!(ram_paid(81.0, 1000.0, 0.6), 81.0);
    assert_eq!(ram_paid(81.0, 30.0, 0.6), 50.0);
    assert_eq!(ram_paid(81.0, 0.0, 0.6), 0.0, "a hull at its line has no ram left in it");
    assert_eq!(ram_paid(81.0, 0.0, 0.0), 81.0);
    assert_eq!(ram_men(80.0, 0.5, 1.0), 2.0);
    assert_eq!(RECOIL_SHARE, 0.6);
}

#[test]
fn rams_into_her_side_from_whole_bring_her_to_strike_at_her_line_on_the_fourth() {
    let (mut her, mut mine) = (Damage::new(&PIRATE_SLOOP, false), Damage::new(&LARGE_BOAT, true));
    let mut rams = 0;
    while her.state == State::Afloat {
        let blow = ram_paid(ram_blow(8.0, true, mine.max_hull, her.max_hull), recoil_room(&mine), RECOIL_SHARE);
        assert!(blow >= 1.0, "she always has the room to ram");
        her.apply(Hurt { hull: blow, sail: 0.0, crew: 0.0, fire: false }, 0.0, ram_line(&her));
        let recoil = rounded(blow * RECOIL_SHARE).min(recoil_room(&mine));
        mine.apply(Hurt { hull: recoil, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
        rams += 1;
        assert!(her.hull >= ram_line(&her) && mine.hull > ram_line(&mine), "neither under her line");
    }
    assert_eq!((rams, her.hull, her.state, mine.hull), (4, 66.0, State::Struck, 112.0));
}

fn flat(middle: [f64; 2], heading: f64) -> Flat {
    let (sine, cosine) = (libm::sin(heading), libm::cos(heading));
    Flat { middle, forward: [sine, -cosine], starboard: [cosine, sine], half_length: 3.5, half_beam: 1.0 }
}

#[test]
fn hulls_that_overlap_are_pushed_out_along_the_least_way_and_apart_ones_not() {
    let push = overlap(&flat([0.0, 0.0], 0.0), &flat([1.5, 0.0], 0.0));
    assert_eq!(push, Some([-0.5, 0.0]), "abreast, half a metre into each other: out to port");
    assert_eq!(overlap(&flat([0.0, 0.0], 0.0), &flat([2.01, 0.0], 0.0)), None);
    assert_eq!(overlap(&flat([0.0, 0.0], 0.0), &flat([0.0, -7.5], 0.0)), None, "bow to stern, apart");
    let ahead = overlap(&flat([0.0, 0.0], 0.0), &flat([0.0, -6.5], 0.0));
    assert_eq!(ahead, Some([0.0, 0.5]), "her stem in the other's stern: pushed back");
}

#[test]
fn a_ship_pushed_back_head_on_loses_her_way_and_one_sliding_along_keeps_it() {
    let north = [0.0, -1.0];
    assert_eq!(driven_into(north, [0.0, 0.5]), 1.0, "head on");
    assert_eq!(driven_into(north, [0.5, 0.0]), 0.0, "pushed aside");
    assert_eq!(driven_into(north, [0.0, -0.5]), 0.0, "pushed on her way");
    assert!((driven_into(north, [0.5, 0.5]) - 0.5_f64.sqrt()).abs() < 1e-12);
}
