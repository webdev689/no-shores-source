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

#[test]
fn a_boarder_comes_onto_a_hostile_deck_whole_whatever_body_their_character_last_left_a_room_with() {
    let mut left = room();
    left.set_minute(1_000);
    let player = left.join().expect("a room with space");
    let mut fallen = *left.fighter(player).expect("in");
    (fallen.health, fallen.action) = (0.0, combat::Action::Dead { elapsed: 0 });
    left.set_fighter(player, fallen);
    let kept = left.kept_character(player).expect("kept");
    let mut deck = Room::deck(&crate::deck::test_deck(), 1, ::foes::Rank::Minor, 1);
    deck.set_minute(1_001);
    let boarder = deck.join().expect("a deck with space");
    assert!(deck.restore_character(boarder, &kept));
    let fighter = *deck.fighter(boarder).expect("aboard");
    assert!(!fighter.dead() && fighter.health == fighter.health_max, "they come from their own ship, unhurt");
}

/// Overlook's social space as a room on open ground, a section 400 m square round its spawn, and a ledge to stand on.
fn social() -> Room {
    let ring = vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]];
    let section = crate::Section { ring, spawns: vec![[0.0, 150.0]], falls_kill: true };
    let ledge = movement::Block { min_x: 40.0, min_y: 40.0, max_x: 50.0, max_y: 50.0, top: 3.0, bottom: 0.0 };
    let pillar = movement::Block { min_x: -20.0, min_y: -20.0, max_x: -10.0, max_y: -10.0, top: 6.0, bottom: 0.0 };
    let kind = crate::NodeKind::Social;
    Room::garrisoned(crate::Floor::Flat, vec![ledge, pillar], section, kind, ("overlook-social", None))
}

fn stand_at(room: &mut Room, player: crate::PlayerId, [x, y, z]: [f64; 3], facing: f64) {
    let body = &mut room.players.get_mut(&player).expect("in").fighter.body;
    (body.x, body.y, body.z, body.facing) = (x, y, z, facing);
}

#[test]
fn a_player_logs_back_in_where_they_last_stood_in_a_social_space_on_the_floor_they_stood_on_facing_as_they_did() {
    let mut left = social();
    let player = left.join().expect("in");
    stand_at(&mut left, player, [45.0, 44.0, 3.0], 2.0);
    let kept = left.kept_character(player).expect("kept");
    let last = gear::Character::from_json(&kept).and_then(|character| character.last);
    assert_eq!(last, Some(gear::last::Last::social("overlook-social", [45.0, 44.0, 3.0], 2.0)), "where they stood");
    let mut back = social();
    let again = back.join().expect("in");
    assert!(back.restore_character(again, &kept));
    back.tick();
    let at_spawn = back.players[&again].fighter.body;
    assert_eq!([at_spawn.x, at_spawn.y], [0.0, 150.0], "a claim alone moves no one: through a gate, a rejoin");
    assert!(back.stand_where_left(again), "logging back in, a tick after the claim");
    let body = back.players[&again].fighter.body;
    assert_eq!([body.x, body.y, body.z, body.facing], [45.0, 44.0, 3.0, 2.0], "on the ledge, not under it");
    let mut sea = social();
    let docked = sea.join().expect("in");
    let mut sailed = gear::Character::from_json(&kept).expect("a character");
    sailed.last = Some(gear::last::Last::Sea);
    assert!(sea.restore_character(docked, &sailed.to_json()));
    assert!(!sea.stand_where_left(docked), "last at sea");
    assert_eq!([sea.players[&docked].fighter.body.x, sea.players[&docked].fighter.body.y], [0.0, 150.0], "came by sea");
}

#[test]
fn the_spot_last_stood_at_is_kept_through_a_jump_after_it_so_leaving_mid_jump_logs_back_in_there() {
    let mut left = social();
    let player = left.join().expect("in");
    let mut character = gear::Character::starting();
    character.last = Some(gear::last::Last::Sea);
    assert!(left.restore_character(player, &character.to_json()));
    stand_at(&mut left, player, [45.0, 44.0, 3.0], 2.0);
    left.tick();
    let stood = left.players[&player].fighter.body;
    left.players.get_mut(&player).expect("in").fighter.body.mode = movement::Mode::Air;
    let kept = left.kept_character(player).expect("kept");
    let last = gear::Character::from_json(&kept).and_then(|character| character.last);
    let spot = gear::last::Last::social("overlook-social", [stood.x, stood.y, stood.z], stood.facing);
    assert_eq!(last, Some(spot), "where they last stood, not where they came from");
}

#[test]
fn no_spot_is_kept_from_a_jump_a_fall_or_another_room_and_one_a_body_no_longer_fits_stands_at_the_spawn() {
    let mut left = social();
    let player = left.join().expect("in");
    let mut character = gear::Character::starting();
    character.last = Some(gear::last::Last::Sea);
    let earlier = character.to_json();
    assert!(left.restore_character(player, &earlier));
    left.players.get_mut(&player).expect("in").fighter.body.mode = movement::Mode::Air;
    let last = |room: &Room| {
        gear::Character::from_json(&room.kept_character(player).expect("kept")).and_then(|character| character.last)
    };
    assert_eq!(last(&left), Some(gear::last::Last::Sea), "mid-jump: as it was");
    left.players.get_mut(&player).expect("in").fighter.body.mode = movement::Mode::Ground;
    left.players.get_mut(&player).expect("in").standing = crate::Standing::Dead { ticks: 0, fell: true };
    assert_eq!(last(&left), Some(gear::last::Last::Sea), "dead by a fall: as it was");
    let mut patrol = Room::new(Vec::new(), (0.0, 0.0));
    let walker = patrol.join().expect("in");
    assert!(patrol.restore_character(walker, &earlier));
    let kept = patrol.kept_character(walker).expect("kept");
    assert_eq!(
        gear::Character::from_json(&kept).and_then(|character| character.last),
        Some(gear::last::Last::Sea),
        "no other room writes it"
    );
    let mut boxed = social();
    let inside = boxed.join().expect("in");
    let mut walled = gear::Character::starting();
    walled.last = Some(gear::last::Last::social("overlook-social", [-15.0, -15.0, 0.0], 0.0));
    assert!(boxed.restore_character(inside, &walled.to_json()));
    assert!(!boxed.stand_where_left(inside));
    let body = boxed.players[&inside].fighter.body;
    assert_eq!([body.x, body.y], [0.0, 150.0], "a pillar stands there now: the spawn");
}
