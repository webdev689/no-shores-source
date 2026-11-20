//! Drops and ammunition in the room: a kill's Ammo box by the foe's rank and a Miniboss's or a Boss's crate, each thrown
//! out in a fan and taken at rest; and a player's shots spent from their gear, the weapon refusing to fire at none.

use super::*;
use crate::foes::{Foe, pirate_in};
use crate::power::{hold, loadout_arms};
use crate::{Input, REST_TICKS};
use combat::{CombatInput, Intent};
use gear::ammo::{AMMO_FULL, CRATES_MOST};
use gear::{Kind, Slot};
use movement::Controls;
use std::collections::BTreeMap;

/// A brute standing as a foe of a rank at (0, y), struck by the player in the last moment, and paid.
fn kill(room: &mut Room, player: PlayerId, rank: ::foes::Rank, y: f64) {
    let id = room.next_id();
    let (foe_type, _) = pirate_in(::foes::Role::Brute).expect("the pirates' brute");
    let (fighter, mut brain) = ::foes::spawn(foe_type, rank, 0.0, y, 0.0);
    // Its type may not come in every rank: what it drops is the rank's alone.
    brain.rank = rank;
    room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    room.mark_struck(player, id, Slot::Melee);
    room.pay_kill(id);
    room.foes.remove(&id);
}

fn lying(room: &Room, player: PlayerId, what: Dropped) -> usize {
    room.drops_for(player).filter(|drop| drop.what == what).count()
}

fn trigger(sequence: u32, room: &Room) -> Input {
    let controls = Controls { yaw: 0.0, ..Controls::default() };
    let combat = CombatInput { shoot: true, ..CombatInput::default() };
    let arms = loadout_arms(Kind::Pistolet).code();
    Input { sequence, intent: Intent { controls, combat }, arms, seen: room.clock(), ..Input::default() }
}

#[test]
fn a_kill_drops_an_ammo_box_by_the_foes_rank() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    for (rank, least, most) in
        [(::foes::Rank::Minor, 25, 55), (::foes::Rank::Major, 50, 90), (::foes::Rank::Elite, 100, 140)]
    {
        room.drops.clear();
        for _ in 0..200 {
            kill(&mut room, player, rank, -30.0);
        }
        let boxes = lying(&room, player, Dropped::AmmoBox);
        assert!((least..=most).contains(&boxes), "{rank:?}: {boxes} boxes from 200 kills");
    }
    room.drops.clear();
    kill(&mut room, player, ::foes::Rank::Miniboss, -30.0);
    assert_eq!(lying(&room, player, Dropped::AmmoBox), 1, "a Miniboss always drops one");
}

#[test]
fn a_miniboss_or_a_boss_gives_a_crate_into_the_five_or_lays_it_when_they_are_full() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    kill(&mut room, player, ::foes::Rank::Boss, -30.0);
    let crates = |room: &Room| room.player(player).expect("in").character.materials.crates;
    assert_eq!((crates(&room), lying(&room, player, Dropped::Crate)), (1, 0), "straight into the counter");
    for _ in 1..CRATES_MOST {
        kill(&mut room, player, ::foes::Rank::Miniboss, -30.0);
    }
    assert_eq!(crates(&room), CRATES_MOST);
    kill(&mut room, player, ::foes::Rank::Boss, -30.0);
    assert_eq!((crates(&room), lying(&room, player, Dropped::Crate)), (CRATES_MOST, 1), "a sixth lies for them");
}

#[test]
fn a_drop_stays_where_it_was_thrown_from_behind_a_thin_wall_off_a_drop_or_past_the_ring() {
    use movement::Block;
    let from = [0.0, 0.0, 0.0];
    let north = 0.0;
    let wall = Block { min_x: -5.0, min_y: -1.1, max_x: 5.0, max_y: -0.9, top: 3.0, bottom: 0.0 };
    let room = Room::new(vec![wall], (0.0, 0.0));
    assert_eq!(room.rest_at(from, north), from, "not through a thin wall");
    let south = room.rest_at(from, core::f64::consts::PI);
    assert!((south[1] - THROW_M).abs() < 1e-9, "the open side is open: {south:?}");
    let ledge = Block { min_x: -1.0, min_y: -1.0, max_x: 1.0, max_y: 1.0, top: 3.0, bottom: 0.0 };
    let room = Room::new(vec![ledge], (0.0, 0.0));
    assert_eq!(room.rest_at([0.0, 0.0, 3.0], north), [0.0, 0.0, 3.0], "not off a ledge");
    let step = Block { top: 0.2, ..ledge };
    let room = Room::new(vec![step], (0.0, 0.0));
    assert!((room.rest_at([0.0, 0.0, 0.2], north)[1] + THROW_M).abs() < 1e-9, "but down a step");
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.section =
        Some(crate::Section { ring: vec![[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]], spawns: vec![] });
    assert_eq!(room.rest_at(from, north), from, "not past the section's ring");
}

#[test]
fn a_kills_drops_are_thrown_out_in_a_fan_toward_the_player_and_taken_at_rest() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    hold(&mut room, player, Kind::Bow);
    if let Some(found) = room.players.get_mut(&player) {
        found.character.materials.crates = CRATES_MOST;
        found.character.ammo = 0;
    }
    kill(&mut room, player, ::foes::Rank::Boss, -10.0);
    let drops: Vec<Drop> = room.drops_for(player).cloned().collect();
    assert_eq!(drops.len(), 3, "a Vestige, a box and a crate: {drops:?}");
    for drop in &drops {
        assert_eq!(drop.from, [0.0, -10.0, 0.0], "thrown from the body");
        let out = libm::hypot(drop.at[0], drop.at[1] + 10.0);
        assert!((out - THROW_M).abs() < 1e-9 && drop.at[1] > -10.0, "out toward the player: {drop:?}");
    }
    assert!(drops[0].at != drops[1].at && drops[1].at != drops[2].at, "each its own place in the fan");
    let ammo_box = drops.iter().find(|drop| drop.what == Dropped::AmmoBox).expect("a box");
    let mut fighter = *room.fighter(player).expect("in");
    (fighter.body.x, fighter.body.y) = (ammo_box.at[0], ammo_box.at[1]);
    room.set_fighter(player, fighter);
    room.tick();
    let ammo = |room: &Room| room.player(player).expect("in").character.ammo;
    assert_eq!(ammo(&room), 0, "in the air, it is not taken yet");
    for _ in 0..REST_TICKS {
        room.tick();
    }
    assert_eq!(ammo(&room), gear::ammo::BOX_SHARE, "at rest, walked over, a quarter back");
    assert_eq!(lying(&room, player, Dropped::AmmoBox), 0);
    if let Some(found) = room.players.get_mut(&player) {
        found.character.ammo = AMMO_FULL;
    }
    room.lay_drop(player, Dropped::AmmoBox, ammo_box.at);
    for _ in 0..=REST_TICKS {
        room.tick();
    }
    assert_eq!(lying(&room, player, Dropped::AmmoBox), 1, "full, the box stays where it lies");
}

#[test]
fn a_players_shots_spend_their_gears_ammunition_and_at_none_the_room_refuses_them() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    hold(&mut room, player, Kind::Pistolet);
    if let Some(found) = room.players.get_mut(&player) {
        found.character.ammo = 2 * AMMO_FULL / 24;
    }
    for sequence in 1..=600 {
        room.input(player, trigger(sequence, &room)).expect("taken");
        room.tick();
    }
    assert_eq!(room.take_lines().len(), 2, "two balls, then the trigger does nothing");
    let found = room.player(player).expect("in");
    assert_eq!((found.character.shots(), found.character.ammo, found.fighter.ammo), (0, 0, Some(0)));
    let kept = gear::Character::from_json(&found.character.to_json()).expect("kept");
    assert_eq!(kept.shots(), 0, "kept empty across a session");
}

#[test]
fn a_player_walking_over_a_kills_ammo_box_takes_it_and_their_bow_holds_its_shots() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    hold(&mut room, player, Kind::Bow);
    if let Some(found) = room.players.get_mut(&player) {
        found.character.ammo = 0;
    }
    kill(&mut room, player, ::foes::Rank::Miniboss, -10.0);
    assert_eq!(lying(&room, player, Dropped::AmmoBox), 1, "a Miniboss's box, thrown toward the player");
    // Walking north by the player's own inputs, past where it rests.
    let walk = Controls { forward: 1.0, yaw: 0.0, ..Controls::default() };
    let arms = loadout_arms(Kind::Bow).code();
    for sequence in 1..=150 {
        let intent = Intent { controls: walk, ..Intent::default() };
        room.input(player, Input { sequence, intent, arms, seen: room.clock(), ..Input::default() }).expect("taken");
        room.tick();
    }
    let found = room.player(player).expect("in");
    assert!(found.fighter.body.y < -10.0, "walked past it: {:?}", found.fighter.body);
    assert_eq!(lying(&room, player, Dropped::AmmoBox), 0, "taken");
    assert_eq!(found.character.ammo, gear::ammo::BOX_SHARE, "a quarter back");
    assert_eq!(found.fighter.ammo, Some(15), "the bow holds a quarter of its 60");
}

#[test]
fn a_test_ground_player_who_takes_up_a_crossbow_by_its_grant_fires_it_and_takes_an_ammo_box() {
    use crate::asks::{Asked, Grant};
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.answer(player, Asked::Grant(Grant::Worn(Kind::Crossbow)));
    let worn =
        |room: &Room| room.player(player).and_then(|found| found.character.worn(Slot::Ranged)).map(|item| item.kind);
    assert_eq!(worn(&room), Some(Kind::Crossbow), "a Normal one handed out and worn");
    let arms = loadout_arms(Kind::Crossbow).code();
    assert!(
        crate::power::arms_allowed(&room.player(player).expect("in").character).iter().any(|each| each.code() == arms)
    );
    let controls = Controls { yaw: 0.0, ..Controls::default() };
    let combat = CombatInput { shoot: true, ..CombatInput::default() };
    for sequence in 1..=30 {
        let intent = Intent { controls, combat };
        room.input(player, Input { sequence, intent, arms, seen: room.clock(), ..Input::default() }).expect("taken");
        room.tick();
    }
    let spent = room.player(player).expect("in").character.ammo;
    assert!(spent < AMMO_FULL, "a bolt spent from the crossbow's ammunition");
    let feet = room.player(player).expect("in").fighter.body;
    room.lay_drop(player, Dropped::AmmoBox, [feet.x, feet.y, feet.z]);
    for sequence in 31..=(31 + REST_TICKS as u32 + 2) {
        let intent = Intent { controls, ..Intent::default() };
        room.input(player, Input { sequence, intent, arms, seen: room.clock(), ..Input::default() }).expect("taken");
        room.tick();
    }
    assert_eq!(lying(&room, player, Dropped::AmmoBox), 0, "taken");
    assert!(room.player(player).expect("in").character.ammo > spent, "a quarter back");
    room.answer(player, Asked::Grant(Grant::Worn(Kind::Bow)));
    room.answer(player, Asked::Grant(Grant::Worn(Kind::Crossbow)));
    let crossbows =
        room.player(player).expect("in").character.items.values().filter(|(item, _)| item.kind == Kind::Crossbow);
    assert_eq!((worn(&room), crossbows.count()), (Some(Kind::Crossbow), 1), "the carried one worn again, none more");
}

#[test]
fn a_drop_that_lay_its_time_is_gone_from_its_players_gear_too() {
    use crate::players::GEAR_EVERY_TICKS;
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.lay_drop(player, Dropped::AmmoBox, [0.0, -30.0, 0.0]);
    for _ in 0..crate::DROP_TICKS - GEAR_EVERY_TICKS {
        room.tick();
    }
    assert!(room.take_gear_change(player), "told of it");
    assert_eq!(lying(&room, player, Dropped::AmmoBox), 1);
    for _ in 0..GEAR_EVERY_TICKS {
        room.tick();
    }
    assert_eq!(lying(&room, player, Dropped::AmmoBox), 0, "gone after two minutes");
    assert!(room.take_gear_change(player), "told it is gone, so their page no longer shows it lying");
}
