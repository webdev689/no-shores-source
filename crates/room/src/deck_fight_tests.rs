use super::*;
use crate::deck::test_deck;
use ::foes::factions::{GREY_TITHE, PIRATES};
use movement::Terrain;

#[test]
fn her_deck_room_stands_her_rank_and_factions_crew_at_her_level_on_her_planks() {
    let deck = test_deck();
    for (faction, rank, count) in
        [(PIRATES, Rank::Major, 4), (GREY_TITHE, Rank::Miniboss, 6), (PIRATES, Rank::Minor, 3)]
    {
        let room = Room::deck(&deck, faction, rank, 14);
        assert_eq!(room.foes.len(), count, "{rank:?}");
        for foe in room.foes.values() {
            assert_eq!(foe.level, 14);
            let body = foe.fighter.body;
            assert!(deck.heights.stands_at(body.x, body.y), "{body:?} on her planks");
            assert!((body.z - deck.heights.height_at(body.x, body.y)).abs() < 0.05);
        }
        assert!(!room.cleared());
    }
}

#[test]
fn a_boarder_comes_over_her_side_amidships_or_at_her_helm_and_her_room_tells_when_her_crew_or_boarders_are_down() {
    let deck = test_deck();
    let mut room = Room::deck(&deck, PIRATES, Rank::Minor, 3);
    let player = room.join().expect("room aboard");
    let body = room.player(player).expect("aboard").fighter.body;
    // The test deck has a hole amidships, so she comes aboard at the helm.
    assert!(
        (body.x - deck.helm[0]).abs() + (body.y - deck.helm[1]).abs() < 1e-9 && (body.z - 0.8).abs() < 1e-9,
        "{body:?}"
    );
    assert!(!room.all_down());
    for foe in room.foes.values_mut() {
        foe.fighter.health = 0.0;
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    assert!(room.cleared());
    let found = room.players.get_mut(&player).expect("aboard");
    found.fighter.action = combat::Action::Dead { elapsed: 0 };
    assert!(room.all_down());
}
