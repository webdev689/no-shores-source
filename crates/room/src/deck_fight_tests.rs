use super::*;
use crate::deck::test_deck;
use ::foes::factions::{GREY_TITHE, PIRATES};
use movement::Terrain;

#[test]
fn a_captains_deck_room_stands_its_rank_and_factions_crew_at_its_level_on_its_planks() {
    let deck = test_deck();
    for (faction, rank, count) in
        [(PIRATES, Rank::Major, 4), (GREY_TITHE, Rank::Miniboss, 6), (PIRATES, Rank::Minor, 3)]
    {
        let room = Room::deck(&deck, faction, rank, 14);
        assert_eq!(room.foes.len(), count, "{rank:?}");
        for foe in room.foes.values() {
            assert_eq!(foe.level, 14);
            let body = foe.fighter.body;
            assert!(deck.heights.stands_at(body.x, body.y), "{body:?} on its planks");
            assert!((body.z - deck.heights.height_at(body.x, body.y)).abs() < 0.05);
        }
        assert!(!room.cleared());
    }
}

#[test]
fn a_boarder_comes_over_the_rail_on_their_ships_side_clear_of_its_middle_and_its_room_tells_when_crew_or_boarders_are_down()
 {
    let deck = test_deck();
    let mut room = Room::deck(&deck, PIRATES, Rank::Minor, 3);
    // Its rails amidships, half a metre in from its outermost planks (the test deck's are at 1 m either side).
    let [starboard, port] = [rail_spot(&deck, 1.0), rail_spot(&deck, -1.0)];
    assert!((starboard[0] - 0.45).abs() < 0.06 && starboard[1] == 0.0, "{starboard:?}");
    assert!((port[0] + 0.5).abs() < 0.06 && port[1] == 0.0, "{port:?}");
    let player = room.board_at(port).expect("room aboard");
    let body = room.player(player).expect("aboard").fighter.body;
    assert!((body.x - port[0]).abs() + body.y.abs() < 1e-9 && (body.z - 0.8).abs() < 1e-9, "{body:?}");
    assert!(body.facing.abs() < 1e-9, "facing its bow, where its crew stands");
    // One with no plank across its middle comes aboard at its helm.
    let mut holed = test_deck();
    holed.heights = movement::Heights::new(
        -1.0,
        -3.5,
        0.1,
        20,
        70,
        (0..1400).map(|cell| (cell / 20 != 35).then_some(0.8)).collect(),
    )
    .unwrap();
    assert_eq!(rail_spot(&holed, 1.0), holed.helm);
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
