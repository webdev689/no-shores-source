use crate::Room;

fn room() -> Room {
    Room::new(Vec::new(), (0.0, 0.0))
}

#[test]
fn a_return_within_two_minutes_gets_back_the_health_and_charges_it_left_with_and_its_arts_charge_within_ten() {
    let mut left = room();
    left.set_minute(1_000);
    let player = left.join().expect("a room with space");
    let mut fighter = *left.fighter(player).expect("in");
    (fighter.health, fighter.charges) = (fighter.health_max * 0.4, 1);
    left.set_fighter(player, fighter);
    left.players.get_mut(&player).expect("in").casting.tenets = [0.25, 0.5];
    let kept = left.kept_character(player).expect("kept");
    let back = |minute: u64, text: &str| {
        let mut other = room();
        other.set_minute(minute);
        let back = other.join().expect("a room with space");
        assert!(other.restore_character(back, text));
        let fighter = *other.fighter(back).expect("in");
        let tenets = other.players[&back].casting.tenets;
        ((fighter.health / fighter.health_max * 100.0).round(), fighter.charges, tenets, fighter.dead())
    };
    assert_eq!(back(1_002, &kept), (40.0, 1, [0.25, 0.5], false), "another room, two minutes on");
    assert_eq!(back(1_003, &kept), (100.0, combat::tuning::CHARGES, [0.25, 0.5], false), "whole past two");
    assert_eq!(back(1_011, &kept), (100.0, combat::tuning::CHARGES, [1.0, 1.0], false), "Tenets ready past ten");
    let mut fallen = *left.fighter(player).expect("in");
    (fallen.health, fallen.action) = (0.0, combat::Action::Dead { elapsed: 0 });
    left.set_fighter(player, fallen);
    let kept = left.kept_character(player).expect("kept");
    assert!(back(1_001, &kept).3, "one who left fallen comes back fallen, to stand again at a spawn");
}
