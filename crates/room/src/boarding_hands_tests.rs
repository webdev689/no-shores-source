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
fn two_hands_board_with_their_player_and_as_many_more_as_its_trim_leads_never_more_than_it_has() {
    assert_eq!(boarding(10, 0), HANDS_BOARD);
    assert_eq!(boarding(10, 4), 6);
    assert_eq!(boarding(1, 4), 1, "only the hands it has left");
    assert_eq!(boarding(0, 0), 0);
}

#[test]
fn its_hands_stand_on_the_players_side_at_its_level_and_are_no_foes_of_the_deck() {
    let (room, player) = boarded(3, 9);
    let crew = room.foes.values().filter(|foe| !foe.fighter.side.is_players()).count();
    let hands: Vec<_> = room.ashore.hands.iter().collect();
    assert_eq!(hands.len(), 3);
    for (id, hand) in hands {
        let foe = &room.foes[id];
        assert!(foe.fighter.side.is_players() && foe.level == 9 && hand.leader == player);
    }
    assert_eq!(room.living_foes(), crew, "its crew alone");
    assert!(
        room.companion_times(
            *room.ashore.hands.keys().next().expect("a hand"),
            *room.foes.keys().find(|id| !room.is_companion(**id)).expect("crew")
        )
        .is_some()
    );
}

#[test]
fn a_hand_who_falls_is_counted_against_their_player_and_its_crew_down_clears_its_with_hands_standing() {
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
    assert!(room.cleared(), "its deck is won with a hand still standing");
}

#[test]
fn its_hands_go_back_aboard_when_their_player_leaves_its_deck() {
    let (mut room, player) = boarded(2, 6);
    room.leave(player);
    room.keep_hands();
    assert!(room.ashore.hands.is_empty());
    assert_eq!(room.fallen_hands(player), 0, "leaving is no loss");
}

#[test]
fn a_deck_refuses_what_the_sea_keeps_of_its_ship_and_answers_the_rest() {
    let (mut room, player) = boarded(2, 6);
    let not_here = crate::asks::answer_code(Err(gear::Refusal::NotHere));
    let guns = room.player(player).and_then(|found| found.character.fitted(gear::Slot::Guns)).map(|item| item.id);
    for ask in [
        gear::Ask::Station { officer: 1, duty: gear::crew::Duty::Posted },
        gear::Ask::Train { officer: 1, column: 0, node: 0 },
        gear::Ask::Infuse { item: 1, fed: 2 },
        gear::Ask::TakeOff { slot: gear::Slot::Guns },
        gear::Ask::Buy { item: guns.expect("fitted"), column: 0, node: 0 },
    ] {
        room.answer(player, crate::Asked::Gear(ask));
        assert_eq!(room.player(player).map(|found| found.answer), Some(not_here), "{ask:?}");
    }
    room.answer(player, crate::Asked::Gear(gear::Ask::TakeOff { slot: gear::Slot::Head }));
    assert_eq!(room.player(player).map(|found| found.answer), Some(0), "its own gear is its to change");
}

#[test]
fn its_hands_think_as_the_players_side() {
    let (room, _) = boarded(1, 6);
    let id = room.ashore.hands.keys().next().expect("a hand");
    assert!(room.foes[id].brain.side().is_players());
}
