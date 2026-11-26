//! The Tack's riding lesson in a room: each act is ticked from what the room stepped, whatever pressed it; a step done
//! early stays done; and an arrival counts only in the saddle, at the counter its goal names.

use crate::asks::{Counter, CounterKind};
use crate::players::Input;
use crate::quests::quests_tests::{joined, node_room, stand_at};
use crate::{PlayerId, Room};
use core::f64::consts::PI;
use gear::Character;
use gear::quests::quests;
use movement::Controls;

/// A character on the opening's riding task, the Bay worn.
fn rider() -> Character {
    let mut character = Character::starting();
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let task = quests().quests[opening].tasks.iter().position(|task| task.id == "ride-the-bay").expect("the ride");
    character.quests.set_task(opening, task);
    character
}

/// Overlook's market with the Harbourmaster's counter 60 m north of the middle, a rider at the middle.
fn market() -> (Room, PlayerId) {
    let mut room = node_room("overlook-social", &[]);
    let shipwright = CounterKind::Vendor(gear::vendor::Vendor::Shipwright);
    room.counters = Some(vec![Counter { kind: shipwright, at: [0.0, -60.0] }]);
    let player = joined(&mut room, &rider(), [0.0, 0.0]);
    crate::gear_tests::horsed(&mut room, player);
    (room, player)
}

/// Steps the room `ticks` times with the player pressing `controls` each tick.
fn press(room: &mut Room, player: PlayerId, controls: Controls, ticks: u32) {
    for _ in 0..ticks {
        let sequence = u32::try_from(room.clock()).expect("a short test") + 1;
        let intent = combat::Intent { controls, combat: combat::CombatInput::default() };
        room.input(player, Input { sequence, intent, seen: room.clock(), ..Input::default() }).expect("in order");
        room.tick();
    }
}

/// The lesson's steps met, by their words.
fn met(room: &Room, player: PlayerId) -> Vec<&'static str> {
    let character = &room.player(player).expect("in").character;
    let (quest, task) = character.quest_now().expect("on the opening");
    let goals = &quests().quests[quest].tasks[task].goals;
    goals
        .iter()
        .zip(character.quest_counts())
        .filter(|(_, count)| *count > 0)
        .map(|(goal, _)| goal.text.as_str())
        .collect()
}

const RIDING: Controls = Controls {
    forward: 0.0,
    sideways: 0.0,
    yaw: 0.0,
    run: false,
    jump: false,
    crouch: false,
    mounted: true,
    boost: false,
};

#[test]
fn each_riding_act_is_ticked_as_the_room_steps_it_and_stays_done() {
    let (mut room, player) = market();
    press(&mut room, player, Controls::default(), 5);
    assert!(met(&room, player).is_empty(), "standing on foot does nothing");
    press(&mut room, player, RIDING, 5);
    assert_eq!(met(&room, player), ["Get up on your horse"]);
    // Along the ground, facing away from the counter: south.
    let walk = Controls { forward: 1.0, yaw: core::f64::consts::PI, ..RIDING };
    press(&mut room, player, walk, 150);
    assert!(met(&room, player).contains(&"Ride at a walk"), "{:?}", met(&room, player));
    assert!(!met(&room, player).contains(&"Gallop"), "a walk is no gallop");
    press(&mut room, player, Controls { run: true, ..walk }, 200);
    assert!(met(&room, player).contains(&"Gallop"));
    press(&mut room, player, Controls { boost: true, ..walk }, 1);
    press(&mut room, player, walk, 2);
    assert!(met(&room, player).contains(&"Spur it on"));
    press(&mut room, player, Controls::default(), 3);
    assert!(met(&room, player).contains(&"Get down"), "down from the saddle");
    assert!(met(&room, player).contains(&"Get up on your horse"), "a step done stays done");
    assert!(!met(&room, player).contains(&"Ride to the Harbourmaster's stall"));
}

#[test]
fn riding_up_to_the_harbourmasters_counter_counts_only_in_the_saddle() {
    let (mut room, player) = market();
    stand_at(&mut room, player, [0.0, -57.0]);
    press(&mut room, player, Controls::default(), 3);
    assert!(!met(&room, player).contains(&"Ride to the Harbourmaster's stall"), "on foot");
    press(&mut room, player, RIDING, 3);
    assert!(met(&room, player).contains(&"Ride to the Harbourmaster's stall"));
    let (mut elsewhere, rider) = market();
    elsewhere.counters = Some(vec![Counter { kind: CounterKind::Tack, at: [0.0, -60.0] }]);
    stand_at(&mut elsewhere, rider, [0.0, -57.0]);
    press(&mut elsewhere, rider, RIDING, 3);
    assert!(!met(&elsewhere, rider).contains(&"Ride to the Harbourmaster's stall"), "another keeper's counter");
}

#[test]
fn the_whole_lesson_takes_the_rider_on_to_the_harbourmaster() {
    let (mut room, player) = market();
    press(&mut room, player, RIDING, 2);
    let walk = Controls { forward: 1.0, yaw: core::f64::consts::PI, ..RIDING };
    press(&mut room, player, walk, 150);
    press(&mut room, player, Controls { run: true, ..walk }, 200);
    press(&mut room, player, Controls { boost: true, ..walk }, 1);
    press(&mut room, player, Controls::default(), 3);
    stand_at(&mut room, player, [0.0, -57.0]);
    press(&mut room, player, RIDING, 3);
    let character = &room.player(player).expect("in").character;
    let task = character.quest_now().map(|(quest, task)| quests().quests[quest].tasks[task].id.as_str());
    assert_eq!(task, Some("your-ship"), "{:?}", met(&room, player));
    assert!(room.quests.ridden.is_empty(), "a rider whose task asks no riding is forgotten");
}

#[test]
fn a_mark_set_from_the_sea_is_where_the_gear_marks_the_next_goal() {
    let (mut room, player) = market();
    assert_eq!(room.quest_at(player), None, "the riding task marks no place of its own");
    room.mark_quest(Some([50_000.0, 48_800.0, 60.0]));
    assert_eq!(room.quest_at(player), Some([50_000.0, 48_800.0, 60.0]));
}

#[test]
fn one_riders_acts_tick_their_own_lesson_and_no_other_riders() {
    let (mut room, first) = market();
    // The rider who joined second rides; the first stands on foot.
    let second = joined(&mut room, &rider(), [30.0, 0.0]);
    crate::gear_tests::horsed(&mut room, second);
    press(&mut room, second, RIDING, 2);
    let walk = Controls { forward: 1.0, yaw: PI, ..RIDING };
    press(&mut room, second, walk, 150);
    press(&mut room, second, Controls { run: true, ..walk }, 200);
    assert!(met(&room, second).contains(&"Gallop"), "{:?}", met(&room, second));
    assert!(met(&room, first).is_empty(), "the other rider stood on foot: {:?}", met(&room, first));
}
