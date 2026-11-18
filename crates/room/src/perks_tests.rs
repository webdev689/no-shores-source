//! Perks in the room: worn traits make the trim a player's fighter carries; a kill, a parry and a block give stamina
//! back; and the perks a blow takes on as it is struck.

use super::*;
use crate::perks::trim_of;
use combat::Trim;
use combat::fighter::Cause;
use gear::{At, Item, Kind, Rarity, Slot};
use std::collections::BTreeMap;

/// A character wearing a Legendary sword whose first trait column offers these, the one at `chosen` bought and chosen.
fn wearing(traits: &[&str], chosen: u8) -> gear::Character {
    let mut character = gear::Character::starting();
    let mut sword = Item::new(99, Kind::Sword, Rarity::Legendary, 20, Slot::MainHand);
    sword.layout = vec![
        traits.iter().map(|id| (*id).to_owned()).collect(),
        vec!["bloodletter".into(), "executioner".into()],
        vec!["steady".into(), "balanced".into()],
        vec!["guardbreaker".into(), "riposte_master".into()],
    ];
    sword.bought |= sword.node_bit(0, chosen).expect("a node");
    sword.chosen[0] = chosen;
    let main = character.worn(Slot::MainHand).expect("the starting sword").id;
    character.items.remove(&main);
    character.items.insert(99, (sword, At::Worn(Slot::MainHand)));
    character
}

#[test]
fn worn_traits_trim_the_fight_and_only_chosen_bought_ones() {
    assert_eq!(trim_of(&gear::Character::starting()), Trim::PLAIN, "the starting kit trims nothing");
    let light = trim_of(&wearing(&["light_grip", "weighted", "keen_edge"], 0));
    assert_eq!(light, Trim { swing_stamina: 0.85, ..Trim::PLAIN });
    let keen = trim_of(&wearing(&["light_grip", "weighted", "keen_edge"], 2));
    assert_eq!(keen, Trim { guard_through: 1.5, ..Trim::PLAIN });
}

fn room_with_brute() -> (Room, PlayerId, FighterId) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let id = room.next_id();
    let (fighter, brain) = ::foes::spawn(::foes::Kind::Brute, 0.0, -1.5, core::f64::consts::PI);
    room.foes.insert(id, Foe { fighter, kind: 3, brain, level: 0, struck_by: BTreeMap::new() });
    (room, player, id)
}

fn trimmed(room: &mut Room, player: PlayerId, trim: Trim) {
    let found = room.players.get_mut(&player).expect("in the room");
    found.trim = trim;
    found.fighter.trim = trim;
}

#[test]
fn a_kill_gives_back_stamina_and_reloads_with_last_light() {
    let (mut room, player, brute) = room_with_brute();
    trimmed(&mut room, player, Trim { kill_stamina: 25.0, kill_reload: true, ..Trim::PLAIN });
    let mut tired = *room.fighter(player).expect("in");
    tired.stamina = 40.0;
    tired.action = combat::Action::Reload { left: 90 };
    room.set_fighter(player, tired);
    room.perks_after(player, brute, &combat::Verdict::Hit { damage: 999.0, poise: 0.0 }, true);
    let after = room.fighter(player).expect("in");
    assert_eq!((after.stamina, after.action), (65.0, combat::Action::Idle));
    room.perks_after(player, brute, &combat::Verdict::Hit { damage: 1.0, poise: 0.0 }, false);
    assert_eq!(room.fighter(player).expect("in").stamina, 65.0, "no kill, nothing back");
}

#[test]
fn a_parry_and_a_block_give_back_stamina() {
    let (mut room, player, brute) = room_with_brute();
    trimmed(&mut room, player, Trim { parry_stamina: 30.0, block_stamina: 10.0, ..Trim::PLAIN });
    let mut tired = *room.fighter(player).expect("in");
    tired.stamina = 20.0;
    room.set_fighter(player, tired);
    room.perks_after(brute, player, &combat::Verdict::Parried, false);
    assert_eq!(room.fighter(player).expect("in").stamina, 50.0, "Ebb");
    room.perks_after(brute, player, &combat::Verdict::Blocked { damage: 1.0, stamina: 5.0 }, false);
    assert_eq!(room.fighter(player).expect("in").stamina, 60.0, "Coral Guard");
}

#[test]
fn a_blow_takes_on_its_strikers_perks_as_it_is_struck() {
    let (mut room, player, brute) = room_with_brute();
    trimmed(&mut room, player, Trim { damage: 1.05, on_staggered: 1.15, on_low: 1.3, point_blank: 1.2, ..Trim::PLAIN });
    let striker = *room.fighter(player).expect("in");
    let attack = combat::fighter::Attack {
        stroke: combat::Stroke::Down,
        elapsed: 0,
        strike: 24,
        end: 60,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    let blow = combat::judge::swing_blow(player, &striker, &attack, brute);
    let close = |left: f64, right: f64| (left - right).abs() < 1e-9;
    assert!(close(room.empower(blow, brute, false).damage, blow.damage * 1.05), "Honed");
    let mut staggered = *room.fighter(brute).expect("standing");
    staggered.action = combat::Action::Staggered { left: 30, cause: Cause::Poise };
    staggered.health = staggered.health_max / 3.0;
    room.set_fighter(brute, staggered);
    assert!(close(room.empower(blow, brute, false).damage, blow.damage * 1.05 * 1.15 * 1.3), "Executioner, Undertow");
    let riposte = combat::judge::swing_blow(
        player,
        &striker,
        &combat::fighter::Attack { swing: combat::fighter::Swing::Riposte(brute), ..attack },
        brute,
    );
    assert!(
        close(room.empower(riposte, brute, false).damage, riposte.damage * 1.05 * 1.3),
        "a riposte is no execution"
    );
    let shot = combat::judge::Blow { kind: combat::BlowKind::Shot(combat::Ranged::Pistolet), ..blow };
    let trim = room.fighter(player).expect("in").trim;
    assert!(close(Room::at_range(shot, 4.0, &trim).damage, shot.damage * 1.2), "Point Blank");
    assert!(close(Room::at_range(shot, 10.0, &trim).damage, shot.damage), "neither near nor far");
    assert!(close(Room::at_range(blow, 4.0, &trim).damage, blow.damage), "a swing is no shot");
}

#[test]
fn a_players_trim_reaches_their_fighter_with_their_next_input() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let found = room.players.get_mut(&player).expect("in");
    found.character = wearing(&["light_grip", "weighted", "keen_edge"], 0);
    room.retrim(player);
    room.input(player, Input { sequence: 1, arms: 2, ..Input::default() }).unwrap();
    room.tick();
    assert_eq!(room.fighter(player).expect("in").trim.swing_stamina, 0.85);
}

#[test]
fn a_kept_character_comes_back_into_the_room_trimmed() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    // As kept, its next number already past the sword `wearing` slipped in.
    let kept = gear::Character::from_json(&wearing(&["light_grip", "weighted", "keen_edge"], 0).to_json())
        .expect("a character")
        .to_json();
    assert!(room.take_gear_change(player), "a new player's gear goes to them");
    assert!(room.restore_character(player, &kept));
    for _ in 0..crate::players::GEAR_EVERY_TICKS {
        room.tick();
    }
    assert!(room.take_gear_change(player), "and again once their own comes back");
    assert_eq!(room.kept_character(player), Some(kept));
    assert_eq!(room.fighter(player).expect("in").trim.swing_stamina, 0.85);
    assert!(!room.restore_character(player, "not a character"));
    assert!(!room.restore_character(player + 1, &gear::Character::starting().to_json()));
}

#[test]
fn an_arrow_strikes_with_what_it_was_loosed_with() {
    let struck_for = |changed_mid_flight: bool, loosed_with: Option<Trim>| {
        let (mut room, player, brute) = room_with_brute();
        room.foes.get_mut(&brute).expect("a brute").level = 1;
        trimmed(&mut room, player, Trim { damage: 1.05, ..Trim::PLAIN });
        let mut loosed = room.held(player, Slot::MainHand).expect("a player");
        if let Some(trim) = loosed_with {
            loosed.trim = trim;
        }
        let chest = room.fighter(brute).expect("standing").chest();
        let arrow = combat::Shot {
            owner: player,
            ranged: combat::Ranged::Bow,
            at: [chest[0], chest[1] + 0.5, chest[2]],
            velocity: [0.0, -45.0, 0.0],
            damage: 18.0,
            weight: 0.5,
            age: 0,
        };
        room.shots.push((arrow, Some(loosed)));
        if changed_mid_flight {
            trimmed(&mut room, player, Trim::PLAIN);
            let found = room.players.get_mut(&player).expect("in");
            let main = found.character.worn(Slot::MainHand).expect("a sword").id;
            found.character.items.remove(&main);
        }
        let before = room.fighter(brute).expect("standing").health;
        room.fly_shots();
        before - room.fighter(brute).expect("standing").health
    };
    let kept = struck_for(false, None);
    assert!(kept > 0.0, "the arrow struck");
    assert!((struck_for(true, None) - kept).abs() < 1e-9, "a weapon changed while it flies changes nothing of it");
    let sharper = struck_for(true, Some(Trim { damage: 2.0, ..Trim::PLAIN }));
    assert!(sharper > kept * 1.5, "it strikes with the trim it was loosed with");
}
