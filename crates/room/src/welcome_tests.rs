//! The welcome to Overlook in a room: the stranger is heard anywhere in a social space and nowhere else, her gift
//! (her Aurem and the Bay) given once, and the Postmaster spoken with at the mail counter.

use crate::Room;
use crate::asks::{Asked, Counter, CounterKind, answer_code};
use crate::quests::quests_tests::{joined, node_room, stand_at};
use gear::Ask;
use gear::Character;
use gear::asks::Refusal;
use gear::quests::{STRANGER, keeper_key, quests};

fn speak(room: &mut Room, player: crate::PlayerId, keeper: u8) -> u8 {
    room.answer(player, Asked::Gear(Ask::Speak { keeper }));
    room.player(player).expect("in").answer
}

fn aurem(room: &Room, player: crate::PlayerId) -> u32 {
    room.player(player).expect("in").character.materials.aurem
}

#[test]
fn the_stranger_is_heard_anywhere_in_a_social_space_and_gives_her_gift_once() {
    let mut room = node_room("harbour-social", &[]);
    room.counters = Some(vec![Counter { kind: CounterKind::Mage, at: [100.0, 0.0] }]);
    let player = joined(&mut room, &Character::starting(), [0.0, 0.0]);
    assert_eq!(keeper_key(STRANGER), Some("stranger"));
    assert_eq!(speak(&mut room, player, STRANGER), 0, "far from every counter");
    assert_eq!(aurem(&room, player), 400);
    assert!(room.player(player).expect("in").character.may_ride(), "the Bay given worn with it");
    assert_eq!(speak(&mut room, player, STRANGER), answer_code(Err(Refusal::NothingToSay)), "a second hearing");
    assert_eq!(aurem(&room, player), 400);
    let mut afield = node_room("a-patrol", &[]);
    afield.counters = None;
    let player = joined(&mut afield, &Character::starting(), [0.0, 0.0]);
    assert_eq!(speak(&mut afield, player, STRANGER), answer_code(Err(Refusal::NotHere)), "afield");
}

#[test]
fn the_postmaster_is_spoken_with_at_the_mail_counter() {
    let mut room = node_room("harbour-social", &[]);
    room.counters = Some(vec![Counter { kind: CounterKind::Mail, at: [10.0, 0.0] }]);
    let player = joined(&mut room, &Character::starting(), [10.0, 1.0]);
    assert_eq!(speak(&mut room, player, STRANGER), 0);
    let mail = (1..=u8::MAX).find(|number| keeper_key(*number) == Some("mail")).expect("the Postmaster's number");
    assert_eq!(speak(&mut room, player, mail), 0);
    let (quest, task) = room.player(player).expect("in").character.quest_now().expect("the opening");
    let counts = room.player(player).expect("in").character.quest_counts();
    let goals = &quests().quests[quest].tasks[task].goals;
    let heard = goals.iter().zip(counts).any(|(goal, count)| goal.text == "The Postmaster" && count == 1);
    assert!(heard, "the Postmaster heard");
    stand_at(&mut room, player, [60.0, 0.0]);
    assert_eq!(speak(&mut room, player, 10), answer_code(Err(Refusal::NotHere)), "the Mage keeps no counter here");
}

#[test]
fn the_test_grounds_player_starts_on_the_houses_and_is_never_given_the_strangers_gift() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.furnish(Some([0.0, 0.0]), Vec::new());
    let player = room.join().expect("a room with space");
    let character = &room.player(player).expect("in").character;
    let task = character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str());
    assert_eq!(task, Some("hear-three-houses"), "a task the Test Ground's stall can serve");
    assert_eq!(speak(&mut room, player, STRANGER), answer_code(Err(Refusal::NotHere)), "at the stall too");
    assert_eq!(aurem(&room, player), 0);
}
