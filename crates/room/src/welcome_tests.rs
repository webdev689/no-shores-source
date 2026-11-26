//! The welcome to Overlook in a room: the stranger is heard anywhere in a social space and nowhere else, once, giving
//! nothing; the Bay given by the Tack at her counter, the Postmaster spoken with at the mail counter, his letter
//! posted as he is, and the Harbourmaster at theirs, who hands over the Sloop a new player has none of until then and
//! answers every ask for the player's ships.

use crate::Room;
use crate::asks::{Asked, Counter, CounterKind, answer_code};
use crate::quests::quests_tests::{joined, node_room, now, on_road, run, stand_at};
use gear::Ask;
use gear::Character;
use gear::asks::Refusal;
use gear::quests::{STRANGER, keeper_key, quests};

fn speak(room: &mut Room, player: crate::PlayerId, keeper: u8) -> u8 {
    room.answer(player, Asked::Gear(Ask::Speak { keeper }));
    room.player(player).expect("in").answer
}

/// Acquires the round from the Weaponsmith, who offers it once the stranger is heard: the answer's number.
fn acquire(room: &mut Room, player: crate::PlayerId) -> u8 {
    room.answer(player, Asked::Gear(Ask::Acquire { keeper: WEAPONSMITH }));
    room.player(player).expect("in").answer
}

/// The Weaponsmith's number in ask 64, and her counter.
const WEAPONSMITH: u8 = 13;
const HER_COUNTER: Counter = Counter { kind: CounterKind::Vendor(gear::vendor::Vendor::Weaponsmith), at: [10.0, 0.0] };

fn aurem(room: &Room, player: crate::PlayerId) -> u32 {
    room.player(player).expect("in").character.materials.aurem
}

#[test]
fn the_stranger_is_heard_anywhere_in_a_social_space_once_and_gives_no_aurem() {
    let mut room = node_room("harbour-social", &[]);
    room.counters = Some(vec![Counter { kind: CounterKind::Mage, at: [100.0, 0.0] }]);
    let player = joined(&mut room, &Character::starting(), [0.0, 0.0]);
    assert_eq!(keeper_key(STRANGER), Some("stranger"));
    assert_eq!(speak(&mut room, player, STRANGER), 0, "far from every counter");
    assert_eq!(aurem(&room, player), 0, "her Aurem is gone: the keepers give gifts");
    assert!(!room.player(player).expect("in").character.may_ride(), "no horse from her: the Tack gives it");
    assert_eq!(speak(&mut room, player, STRANGER), answer_code(Err(Refusal::NothingToSay)), "a second hearing");
    assert_eq!(aurem(&room, player), 0);
    let mut afield = node_room("a-patrol", &[]);
    afield.counters = None;
    let player = joined(&mut afield, &Character::starting(), [0.0, 0.0]);
    assert_eq!(speak(&mut afield, player, STRANGER), answer_code(Err(Refusal::NotHere)), "afield");
}

#[test]
fn the_round_is_acquired_from_the_weaponsmith_at_her_counter_alone_and_counts_her_word() {
    let mut room = node_room("harbour-social", &[]);
    room.counters = Some(vec![HER_COUNTER]);
    let player = joined(&mut room, &Character::starting(), [60.0, 0.0]);
    assert_eq!(speak(&mut room, player, STRANGER), 0);
    let offered = |room: &Room| room.player(player).expect("in").character.quest_offered();
    assert_eq!(offered(&room), Some(WEAPONSMITH));
    assert_eq!(acquire(&mut room, player), answer_code(Err(Refusal::NotHere)), "away from her counter");
    assert_eq!(speak(&mut room, player, WEAPONSMITH), answer_code(Err(Refusal::NotHere)));
    stand_at(&mut room, player, [10.0, 1.0]);
    assert_eq!(speak(&mut room, player, WEAPONSMITH), answer_code(Err(Refusal::NothingToSay)), "Acquire is the word");
    assert_eq!(acquire(&mut room, player), 0);
    assert_eq!(offered(&room), None);
    assert_eq!(room.player(player).expect("in").character.quest_counts()[0], 1, "her goal met by it");
    assert_eq!(acquire(&mut room, player), answer_code(Err(Refusal::NothingOffered)), "once");
}

#[test]
fn the_tack_gives_the_bay_worn_as_she_is_spoken_with_at_her_counter_on_the_round() {
    let mut room = node_room("harbour-social", &[]);
    room.counters = Some(vec![Counter { kind: CounterKind::Tack, at: [10.0, 0.0] }, HER_COUNTER]);
    let player = joined(&mut room, &Character::starting(), [10.0, 1.0]);
    assert_eq!(speak(&mut room, player, STRANGER), 0);
    assert_eq!(acquire(&mut room, player), 0);
    let tack = (1..=u8::MAX).find(|number| keeper_key(*number) == Some("tack")).expect("the Tack's number");
    stand_at(&mut room, player, [60.0, 0.0]);
    assert_eq!(speak(&mut room, player, tack), answer_code(Err(Refusal::NotHere)), "away from her counter");
    assert!(!room.player(player).expect("in").character.may_ride());
    stand_at(&mut room, player, [10.0, 1.0]);
    assert_eq!(speak(&mut room, player, tack), 0);
    let character = &room.player(player).expect("in").character;
    assert!(character.may_ride() && character.keeps_horse(gear::horses::FIRST_HORSE), "the Bay worn");
    assert_eq!(aurem(&room, player), 0, "the Bay is given, not sold");
}

#[test]
fn the_postmaster_is_spoken_with_at_the_mail_counter() {
    let mut room = node_room("harbour-social", &[]);
    room.counters = Some(vec![Counter { kind: CounterKind::Mail, at: [10.0, 0.0] }, HER_COUNTER]);
    let player = joined(&mut room, &Character::starting(), [10.0, 1.0]);
    assert_eq!(speak(&mut room, player, STRANGER), 0);
    assert_eq!(acquire(&mut room, player), 0);
    let mail = (1..=u8::MAX).find(|number| keeper_key(*number) == Some("mail")).expect("the Postmaster's number");
    assert_eq!(speak(&mut room, player, mail), 0);
    let (quest, task) = room.player(player).expect("in").character.quest_now().expect("the opening");
    let counts = room.player(player).expect("in").character.quest_counts();
    let goals = &quests().quests[quest].tasks[task].goals;
    let heard = goals.iter().zip(counts).any(|(goal, count)| goal.text == "The Postmaster" && count == 1);
    assert!(heard, "the Postmaster heard");
    let mail = &room.player(player).expect("in").character.mail;
    assert!(mail.len() == 1 && mail[0].from == gear::mail::Source::Gift as u8, "his letter posted as he is heard");
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

/// The Harbourmaster's number in ask 64.
fn harbourmaster() -> u8 {
    (1..=u8::MAX).find(|number| keeper_key(*number) == Some("harbourmaster")).expect("the Harbourmaster's number")
}

/// A social room with the Harbourmaster's counter 10 m east of its middle.
fn harbour() -> Room {
    let mut room = node_room("harbour-social", &[]);
    let shipwright = CounterKind::Vendor(gear::vendor::Vendor::Shipwright);
    room.counters = Some(vec![Counter { kind: shipwright, at: [10.0, 0.0] }]);
    room
}

fn to_ship(room: &mut Room, player: crate::PlayerId) -> u8 {
    room.answer(player, Asked::ToShip);
    room.player(player).expect("in").answer
}

#[test]
fn a_new_player_has_no_ship_to_return_to_until_the_harbourmaster_hands_over_the_sloop() {
    let mut room = harbour();
    let mut character = Character::starting();
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let task =
        quests().quests[opening].tasks.iter().position(|task| task.reward.ship).expect("the Harbourmaster's task");
    character.quests.set_task(opening, task);
    let player = joined(&mut room, &character, [10.0, 1.0]);
    assert_eq!(to_ship(&mut room, player), crate::asks::NO_SHIP, "no ship yet");
    stand_at(&mut room, player, [60.0, 0.0]);
    assert_eq!(speak(&mut room, player, harbourmaster()), answer_code(Err(Refusal::NotHere)), "at the counter only");
    stand_at(&mut room, player, [10.0, 1.0]);
    assert_eq!(speak(&mut room, player, harbourmaster()), 0);
    let held = &room.player(player).expect("in").character;
    assert_eq!(held.sailed_hull(), Some(gear::ship::fleet::SLOOP), "the Sloop handed over");
    assert!(held.fitted(gear::Slot::Guns).is_some(), "fitted with its first modules");
    assert_eq!(to_ship(&mut room, player), crate::asks::TO_SHIP);
}

#[test]
fn the_harbourmasters_asks_are_answered_at_the_harbourmasters_counter_alone() {
    use gear::ship::shipyard::ShipAsk;
    let mut room = harbour();
    let mut character = Character::starting();
    assert!(character.give_first_ship());
    character.materials.aurem = 5_000;
    let player = joined(&mut room, &character, [10.0, 1.0]);
    let buy = |id: &str| {
        Asked::Gear(Ask::Ship(ShipAsk::BuyDress { dress: gear::ship::fleet::dress_number(id).expect("a dress") }))
    };
    room.answer(player, buy("harbour_blue"));
    assert_eq!(room.player(player).expect("in").answer, 0, "at the counter");
    assert!(room.player(player).expect("in").character.keeps_dress("harbour_blue"));
    stand_at(&mut room, player, [60.0, 0.0]);
    room.answer(player, buy("kelp"));
    assert_eq!(room.player(player).expect("in").answer, answer_code(Err(Refusal::NotHere)), "away from it");
    assert_eq!(room.player(player).expect("in").character.materials.aurem, 4_000, "paid once");
}

#[test]
fn a_house_road_not_yet_acquired_begins_no_step_marks_nothing_and_counts_nothing_until_its_leader_is_asked() {
    for faction in [1, 3] {
        let quest = quests().quests.iter().position(|quest| quest.faction == faction).expect("its road");
        let mut character = on_road(quest, 0);
        character.quests.acquired.retain(|id| *id != quests().quests[quest].id);
        let goal = &quests().quests[quest].tasks[0].goals[0];
        let (node, place) = match &goal.goal {
            gear::quests::Goal::Tail(tail) => (tail.node.as_str(), tail.from.as_str()),
            gear::quests::Goal::Reach(reach) => (reach.node.as_str(), reach.place.as_str()),
            other => panic!("{faction}: a first step the test lays no place for: {other:?}"),
        };
        let mut room = node_room(node, &[(place, [0.0, 0.0], 40.0), ("Chalkpit Ruin", [0.0, -150.0], 40.0)]);
        let leader = Counter { kind: CounterKind::Faction(faction), at: [60.0, 0.0] };
        room.counters = Some(vec![leader]);
        let player = joined(&mut room, &character, [0.0, 10.0]);
        assert_eq!(room.player(player).expect("in").character.quest_offered(), Some(faction), "{faction}: offered");
        run(&mut room, 3);
        assert!(!room.quests.steps.contains_key(&player), "{faction}: no step begun");
        assert_eq!(room.quest_at(player), None, "{faction}: nothing marked");
        assert_eq!(
            now(&room, player),
            (Some((quest, 0)), vec![0]),
            "{faction}: nothing counted, standing on its place"
        );
        stand_at(&mut room, player, [60.0, 1.0]);
        room.answer(player, Asked::Gear(Ask::Acquire { keeper: faction }));
        assert_eq!(room.player(player).expect("in").answer, 0, "{faction}: acquired at the leader's counter");
        assert!(room.quest_at(player).is_some(), "{faction}: its goal marked once acquired");
        stand_at(&mut room, player, [0.0, 10.0]);
        run(&mut room, 3);
        if goal.kind().stepped() {
            assert!(room.quests.steps.contains_key(&player), "{faction}: its step begun once acquired");
        } else {
            assert_ne!(now(&room, player).0, Some((quest, 0)), "{faction}: its place reached once acquired");
        }
    }
}
