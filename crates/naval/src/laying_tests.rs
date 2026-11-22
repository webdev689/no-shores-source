use super::*;

fn sloop(id: ShipId, flag: Flag, x: f64, fallen: u8) -> Sighted {
    let ship = Ship { x, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let pose = Pose { heave: 0.0, pitch: 0.0, roll: 0.0, aground: false };
    Sighted { id, flag, hull: HullKind::Sloop, ship, pose, afloat: true, fallen }
}

#[test]
fn a_look_on_where_a_fallen_mast_stood_lays_for_the_water_beyond() {
    let shooter = sloop(0, Flag::Player, 0.0, 0);
    let pirates = Flag::Faction(crate::ranks::PIRATES);
    let standing = sloop(1, pirates, 40.0, 0);
    let sail = standing.target().rig[0].centre;
    let eye = [0.0, 0.0, 4.0];
    let ray = [eye, [sail[0] - eye[0], sail[1] - eye[1], sail[2] - eye[2]]];
    let aim = Aim { bearing_deg: 90.0, range_m: 20.0, ray: Some(ray) };
    let lay = |ships: &[Sighted]| lay_for(&shooter, Shot::Chain, &aim, ships);
    let open = lay(&[]);
    assert_ne!(lay(&[standing]), open, "chain laid on its sail");
    assert_eq!(lay(&[sloop(1, pirates, 40.0, u8::MAX)]), open, "its mast fallen, the look meets nothing");
}
