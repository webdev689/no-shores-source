//! The loadouts in the room: each kind's arms, either worn loadout's taken up with a swap between them, and each
//! blow or shot carrying the power of the loadout it came from.

use super::*;
use crate::power::{hold, loadout_arms};
use combat::arms::{Arms, OffHand, Ranged, Stroke, WeaponClass};
use combat::{CombatInput, Intent};
use gear::{Kind, Slot};
use movement::Controls;

fn input(sequence: u32, room: &Room, arms: Arms, combat: CombatInput) -> Input {
    let controls = Controls { yaw: 0.0, ..Controls::default() };
    Input { sequence, intent: Intent { controls, combat }, arms: arms.code(), seen: room.clock(), ..Input::default() }
}

#[test]
fn each_loadout_holds_what_its_kind_names() {
    let arms = |kind| {
        let arms = loadout_arms(kind);
        (arms.melee, arms.ranged, arms.off_hand)
    };
    assert_eq!(arms(Kind::SwordAndShield), (WeaponClass::Sword, None, OffHand::Shield));
    assert_eq!(arms(Kind::MaceAndShield), (WeaponClass::Mace, None, OffHand::Shield));
    assert_eq!(arms(Kind::DoubleDaggers), (WeaponClass::Dagger, None, OffHand::Weapon), "a pair takes turns");
    assert_eq!(arms(Kind::Sword), (WeaponClass::Sword, None, OffHand::Empty), "the left hand free");
    assert_eq!(arms(Kind::GreatAxe), (WeaponClass::Axe, None, OffHand::Empty), "the great axe fights as the axe");
    assert_eq!(arms(Kind::Greatsword), (WeaponClass::Greatsword, None, OffHand::Empty));
    assert_eq!(arms(Kind::DoublePistolet), (WeaponClass::Fists, Some(Ranged::DoublePistolet), OffHand::Empty));
    assert_eq!(loadout_arms(Kind::Head), combat::arms::BARE_HANDS);
    for kind in Kind::ALL.into_iter().filter(|kind| kind.weapon()) {
        assert_eq!(Arms::from_code(loadout_arms(kind).code()), loadout_arms(kind), "{kind:?} crosses whole");
    }
}

#[test]
fn either_worn_loadout_is_taken_up_and_a_swap_holds_off_the_next_blow() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    hold(&mut room, player, Kind::Pistolet);
    let character = &room.player(player).expect("in").character;
    let sword = loadout_arms(Kind::Sword);
    let pistolet = loadout_arms(Kind::Pistolet);
    let torch = |arms: Arms| Arms { off_hand: OffHand::Torch, ..arms };
    assert_eq!(arms_allowed(character), [sword, torch(sword), pistolet, torch(pistolet)]);
    room.input(player, input(1, &room, sword, CombatInput::default())).unwrap();
    room.tick();
    assert_eq!(room.fighter(player).expect("in").arms, sword, "Melee, drawn from bare hands at once");
    room.input(player, input(2, &room, pistolet, CombatInput::default())).unwrap();
    room.tick();
    let swapped = room.fighter(player).expect("in");
    assert_eq!((swapped.arms, swapped.swap), (pistolet, combat::tuning::SWAP_TICKS - 1), "Ranged, swapped to");
    let bow = loadout_arms(Kind::Bow);
    room.input(player, input(3, &room, bow, CombatInput::default())).unwrap();
    room.tick();
    assert_eq!(room.fighter(player).expect("in").arms, combat::arms::BARE_HANDS, "no bow is worn");
    hold(&mut room, player, Kind::Greatsword);
    let both = room.player(player).expect("in").character.worn(Slot::Melee).map(|item| item.kind);
    assert_eq!(both, Some(Kind::Greatsword));
    let allowed = arms_allowed(&room.player(player).expect("in").character);
    assert!(!allowed.contains(&torch(loadout_arms(Kind::Greatsword))), "no hand is left for a torch");
}

#[test]
fn a_swing_strikes_with_melees_power_and_a_shot_with_rangeds() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    hold(&mut room, player, Kind::Bow);
    let character = &mut room.players.get_mut(&player).expect("in").character;
    let bow = character.worn(Slot::Ranged).expect("the bow").id;
    character.items.get_mut(&bow).expect("the bow").0.element = Some(gear::Element::Volt);
    let melee = character.attack(Slot::Melee);
    let ranged = character.attack(Slot::Ranged);
    assert_eq!(room.striking(player), Slot::Melee, "Melee while it is drawn");
    assert_eq!(room.held(player, room.striking(player)).map(|held| held.attack), melee);
    let shot = room.held(player, Slot::Ranged).expect("a player");
    assert_eq!((Some(shot.attack), shot.element), (ranged, Some(gear::Element::Volt)));
    room.input(player, input(1, &room, loadout_arms(Kind::Bow), CombatInput::default())).unwrap();
    room.tick();
    assert_eq!(room.striking(player), Slot::Ranged, "a swing with the bow drawn is the fists', by Ranged's Attack");
    let striker = *room.fighter(player).expect("in");
    let attack = combat::fighter::Attack {
        stroke: Stroke::Down,
        elapsed: 0,
        strike: 24,
        end: 60,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    let fists = combat::judge::swing_blow(player, &striker, &attack, player);
    assert_eq!(room.empower(fists, player).element, 0, "the fists carry no element");
}
