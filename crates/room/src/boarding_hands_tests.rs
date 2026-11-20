use super::*;
use crate::deck::test_deck;
use crate::deck_fight::rail_spot;
use ::foes::factions::PIRATES;

fn boarded(hands: u8, level: u8) -> (Room, PlayerId) {
    let mut room = Room::deck(&test_deck(), PIRATES, Rank::Major, 6);
    let player = room.board_at(rail_spot(&test_deck(), 1.0)).expect("room aboard");
    room.board_hands(player, hands, level);
    (room, player)
}

#[test]
fn two_hands_board_with_their_player_and_as_many_more_as_her_trim_leads_never_more_than_she_has() {
    assert_eq!(boarding(10, 0), HANDS_BOARD);
    assert_eq!(boarding(10, 4), 6);
    assert_eq!(boarding(1, 4), 1, "only the hands she has left");
    assert_eq!(boarding(0, 0), 0);
}

#[test]
fn her_hands_stand_on_the_players_side_at_her_level_and_are_no_foes_of_the_deck() {
    let (room, player) = boarded(3, 9);
    let crew = room.foes.values().filter(|foe| !foe.fighter.side.is_players()).count();
    let hands: Vec<_> = room.ashore.hands.iter().collect();
    assert_eq!(hands.len(), 3);
    for (id, hand) in hands {
        let foe = &room.foes[id];
        assert!(foe.fighter.side.is_players() && foe.level == 9 && hand.leader == player);
    }
    assert_eq!(room.living_foes(), crew, "her crew alone");
    assert!(
        room.companion_times(
            *room.ashore.hands.keys().next().expect("a hand"),
            *room.foes.keys().find(|id| !room.is_companion(**id)).expect("crew")
        )
        .is_some()
    );
}

#[test]
fn a_hand_who_falls_is_counted_against_their_player_and_her_crew_down_clears_her_with_hands_standing() {
    let (mut room, player) = boarded(2, 6);
    let first = *room.ashore.hands.keys().next().expect("a hand");
    if let Some(foe) = room.foes.get_mut(&first) {
        foe.fighter.health = 0.0;
        foe.fighter.action = combat::fighter::Action::Dead { elapsed: 0 };
    }
    room.keep_hands();
    assert_eq!(room.fallen_hands(player), 1);
    assert_eq!(room.ashore.hands.len(), 1);
    let crew: Vec<_> = room.foes.keys().copied().filter(|id| !room.is_companion(*id)).collect();
    for id in crew {
        if let Some(foe) = room.foes.get_mut(&id) {
            foe.fighter.health = 0.0;
            foe.fighter.action = combat::fighter::Action::Dead { elapsed: 0 };
        }
    }
    assert!(room.cleared(), "her deck is won with a hand still standing");
}

#[test]
fn her_hands_go_back_aboard_when_their_player_leaves_her_deck() {
    let (mut room, player) = boarded(2, 6);
    room.leave(player);
    room.keep_hands();
    assert!(room.ashore.hands.is_empty());
    assert_eq!(room.fallen_hands(player), 0, "leaving is no loss");
}
