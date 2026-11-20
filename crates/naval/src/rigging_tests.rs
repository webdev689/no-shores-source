use super::*;

#[test]
fn every_hulls_sails_stand_on_its_masts_fore_to_aft() {
    assert_eq!(masts_of(HullKind::Sloop), vec![0, 0]);
    assert_eq!(masts_of(HullKind::Schooner), vec![0, 0, 1]);
    assert_eq!(masts_of(HullKind::Brig), vec![0, 0, 0, 0, 0, 1, 1, 1, 1]);
    assert_eq!(masts_of(HullKind::Frigate), vec![0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
}

#[test]
fn the_sails_shares_of_its_drive_make_its_whole_canvas() {
    for hull in [HullKind::Sloop, HullKind::Schooner, HullKind::Brig, HullKind::Frigate] {
        let rig = Rigging::new(hull);
        assert!((rig.standing() - 1.0).abs() < 1e-12, "{hull:?}");
    }
}

#[test]
fn a_sail_tears_away_once_its_harm_passes_its_due_and_takes_its_share_of_its_drive() {
    let mut rig = Rigging::new(HullKind::Sloop);
    let due = rig.shares[1] * 100.0;
    assert_eq!(rig.struck(1, due, 100.0), None, "at its due it still stands");
    assert_eq!(rig.struck(1, 1.0, 100.0), Some(Torn::Sail(1)));
    assert!(rig.lost(1));
    assert!((rig.standing() - rig.shares[0]).abs() < 1e-12);
}

#[test]
fn a_bare_mast_struck_again_falls_and_no_ball_meets_its_rig_after() {
    let mut rig = Rigging::new(HullKind::Schooner);
    assert_eq!(rig.struck(2, 1e9, 100.0), Some(Torn::Sail(2)));
    assert!(rig.up(2), "its spars still stand");
    assert_eq!(rig.struck(2, 5.0, 100.0), Some(Torn::Mast(1)));
    assert!(!rig.up(2));
    assert_eq!(rig.struck(2, 5.0, 100.0), None);
}

#[test]
fn a_mast_with_a_sail_still_set_stands_however_its_bare_spars_are_struck() {
    let mut rig = Rigging::new(HullKind::Schooner);
    assert_eq!(rig.struck(1, 1e9, 100.0), Some(Torn::Sail(1)));
    assert_eq!(rig.struck(1, 5.0, 100.0), None, "its staysail still stands on the foremast");
    assert!(rig.up(1));
}
