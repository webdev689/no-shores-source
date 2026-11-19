use super::*;
use sailing::HullKind;
use sailing::pose::Pose;
use sailing::ship::Ship;

fn ship_at(heading: f64) -> Ship {
    Ship { x: 100.0, y: 200.0, heading, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 }
}

const LEVEL: Pose = Pose { heave: 0.5, pitch: 0.0, roll: 0.0, aground: false };

#[test]
fn a_look_off_the_bow_or_the_stern_lays_no_battery() {
    assert_eq!(side_for_bearing(20.0), None);
    assert_eq!(side_for_bearing(-35.0), None);
    assert_eq!(side_for_bearing(60.0), Some(Side::Starboard));
    assert_eq!(side_for_bearing(-100.0), Some(Side::Port));
    assert_eq!(side_for_bearing(139.0), Some(Side::Starboard));
    assert_eq!(side_for_bearing(150.0), None);
    assert_eq!(side_for_bearing(f64::NAN), None);
}

#[test]
fn a_battery_is_its_sides_three_mouths_fore_to_aft() {
    let port = SLOOP_ARMS.battery(Side::Port);
    let starboard = SLOOP_ARMS.battery(Side::Starboard);
    assert!(port.iter().all(|mouth| mouth[1] < 0.0) && starboard.iter().all(|mouth| mouth[1] > 0.0));
    assert!(port[0][0] > port[1][0] && port[1][0] > port[2][0]);
}

#[test]
fn her_frame_turns_with_her_heading_and_rides_her_heave() {
    // Heading east (a quarter turn), her bow points east and her starboard south.
    let east = std::f64::consts::FRAC_PI_2;
    let bow = posed(&ship_at(east), &LEVEL, [2.0, 0.0, 0.0]);
    assert!((bow[0] - 102.0).abs() < 1e-12 && (bow[1] - 200.0).abs() < 1e-12 && bow[2] == 0.5);
    let starboard = posed(&ship_at(east), &LEVEL, [0.0, 1.0, 1.0]);
    assert!((starboard[0] - 100.0).abs() < 1e-12 && (starboard[1] - 201.0).abs() < 1e-12 && starboard[2] == 1.5);
}

#[test]
fn her_heel_lowers_her_starboard_side_and_her_rise_lifts_her_bow() {
    let heeled = Pose { roll: 0.1, ..LEVEL };
    let low = posed(&ship_at(0.0), &heeled, [0.0, 1.1, 0.77]);
    let high = posed(&ship_at(0.0), &heeled, [0.0, -1.1, 0.77]);
    assert!(low[2] < high[2]);
    let rising = Pose { pitch: 0.1, ..LEVEL };
    assert!(posed(&ship_at(0.0), &rising, [3.0, 0.0, 0.0])[2] > posed(&ship_at(0.0), &rising, [-3.0, 0.0, 0.0])[2]);
}

#[test]
fn her_hull_box_turns_and_heels_with_her() {
    let block = hull_block(&ship_at(0.0), &LEVEL, &SLOOP_ARMS);
    // Heading north, her bow axis is north (0, -1, 0) and her box is centred between her ends.
    assert!((block.axes[0][1] + 1.0).abs() < 1e-12);
    let middle = (SLOOP_ARMS.hull[0][0] + SLOOP_ARMS.hull[1][0]) / 2.0;
    assert!((block.centre[1] - (200.0 - middle)).abs() < 1e-12);
    assert!((block.half[2] - (SLOOP_ARMS.hull[1][2] - SLOOP_ARMS.hull[0][2]) / 2.0).abs() < 1e-12);
    assert_eq!(sail_blocks(&ship_at(0.0), &LEVEL, &SLOOP_ARMS).len(), 2);
}

#[test]
fn each_hulls_batteries_run_fore_to_aft_along_her_sides() {
    let guns = [(HullKind::Sloop, 3), (HullKind::Schooner, 5), (HullKind::Brig, 7), (HullKind::Frigate, 10)];
    for (kind, a_side) in guns {
        let arms = arms_of(kind);
        for side in Side::BOTH {
            let battery = arms.battery(side);
            assert_eq!(battery.len(), a_side, "{kind:?} {side:?}");
            assert!(battery.iter().all(|mouth| mouth[1] * side.sign() > 0.0), "{kind:?}: along her {side:?} side");
            assert!(battery.windows(2).all(|pair| pair[0][0] > pair[1][0]), "{kind:?}: fore to aft");
        }
        let [low, high] = arms.hull;
        assert!(low[0] < 0.0 && high[0] > 0.0 && low[2] < 0.0 && high[2] > 0.0, "{kind:?}'s box about her middle");
        assert_eq!(arms.sails.len(), kind.hull().sails.len(), "{kind:?}: a box for every sail");
        assert_eq!(sail_blocks(&ship_at(0.0), &LEVEL, arms).len(), arms.sails.len());
    }
    // The Frigate's guns alternate between her two gun decks.
    let decks: Vec<bool> = FRIGATE_ARMS.port.iter().map(|mouth| mouth[2] > 2.5).collect();
    assert!(decks.windows(2).all(|pair| pair[0] != pair[1]), "{decks:?}");
}

#[test]
fn a_sides_broadside_weighs_the_sloops_whatever_her_hull() {
    use crate::gunnery::lay;
    use crate::guns::{Gun, SWIVEL, Shot, loaded};
    for shot in Shot::CYCLE {
        let sloops = loaded(&SWIVEL, shot);
        for kind in HullKind::ALL {
            for side in Side::BOTH {
                let laid = lay(&ship_at(0.0), &LEVEL, arms_of(kind), side, shot, 100.0, None);
                let guns = laid.mouths.len() as f64;
                assert_eq!(laid.mouths.len(), arms_of(kind).battery(side).len());
                // Each ball is the Sloop's, taking its share of her broadside: the side's shares make her three.
                assert!((laid.gun.share * guns - 3.0).abs() < 1e-12, "{kind:?} {shot:?}");
                assert_eq!(Gun { share: 1.0, ..laid.gun }, sloops, "{kind:?} {shot:?}");
            }
        }
    }
    assert_eq!(SLOOP_ARMS.gun_share(Side::Port), 1.0, "the Sloop's guns throw what they always did");
}
