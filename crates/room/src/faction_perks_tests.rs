//! The factions' own perks in the room: Gathering Storm, Thunderhead and Squall Step, the Stormcallers'; Kindling,
//! Shared Flame and Lightbearer, the Lamplighters'; Nightfall, From the Dark and Shade Step, the Veiled's. Each is worn
//! here on its faction's own piece, the only one it fits.

use super::verbs_tests::{SWING, blow, has, shoot, stand, swing};
use crate::perks::trim_of;
use crate::{FighterId, How, PlayerId, Room, loadout_arms};
use combat::{BlowKind, Fighter, Ranged, Status, Verdict, ticks};
use gear::{At, Slot};

const HIT: Verdict = Verdict::Hit { damage: 10.0, poise: 0.0 };
const KILL: Verdict = Verdict::Hit { damage: 5_000.0, poise: 0.0 };
const WORN: u32 = 77;

/// A room with a player wearing the faction's piece `named`, its first column offering `perk`, bought and chosen,
/// held drawn if it is a weapon, and two hostile swordsmen before them.
fn room_wearing(named: &str, perk: &str) -> (Room, PlayerId, [FighterId; 2]) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    wear(&mut room, player, named, perk);
    let foes = [stand(&mut room, 0.0, -1.5), stand(&mut room, 1.0, -1.5)];
    (room, player, foes)
}

fn wear(room: &mut Room, player: PlayerId, named: &str, perk: &str) {
    let entry = gear::catalogue::catalogue().named(named).expect("a faction's piece");
    let slot = entry.kind.slot();
    let character = &mut room.players.get_mut(&player).expect("in").character;
    let mut item = gear::vestige::named_item(WORN, entry, slot);
    item.layout = vec![vec![perk.to_owned()]];
    item.bought |= item.node_bit(0, 0).expect("a node");
    item.chosen[0] = 0;
    if let Some(worn) = character.worn(slot).map(|worn| worn.id) {
        character.items.remove(&worn);
    }
    character.items.insert(WORN, (item, At::Worn(slot)));
    if entry.kind.weapon() {
        let fighter = *room.fighter(player).expect("in");
        room.set_fighter(player, Fighter { arms: loadout_arms(entry.kind), ..fighter });
    }
    room.retrim(player);
}

fn left(room: &Room, fighter: FighterId, status: Status) -> u32 {
    room.fighter(fighter).expect("in the room").statuses.left(status)
}

fn place(room: &mut Room, fighter: FighterId, x: f64, y: f64) {
    let mut moved = *room.fighter(fighter).expect("in");
    moved.body.x = x;
    moved.body.y = y;
    room.set_fighter(fighter, moved);
}

#[test]
fn gathering_storm_charges_a_foe_on_the_fourth_swing_in_a_row_to_land_on_it() {
    let (mut room, player, [foe, other]) = room_wearing("squallbreak", "gathering_storm");
    for nth in 1..=3 {
        swing(&mut room, player, &[foe], HIT);
        assert!(!has(&room, foe, Status::Charge), "swing {nth}");
    }
    swing(&mut room, player, &[foe], HIT);
    assert!(has(&room, foe, Status::Charge), "the fourth in a row");
    for _ in 0..3 {
        swing(&mut room, player, &[other], HIT);
    }
    swing(&mut room, player, &[other], Verdict::Parried);
    swing(&mut room, player, &[other], HIT);
    assert!(!has(&room, other, Status::Charge), "a parried swing ends the row");
}

#[test]
fn gathering_storm_charges_a_foe_on_the_fourth_shot_in_a_row_to_land_on_it() {
    let (mut room, player, [foe, other]) = room_wearing("thunderstring", "gathering_storm");
    for _ in 0..3 {
        shoot(&mut room, player, Ranged::Bow, foe, HIT);
    }
    shoot(&mut room, player, Ranged::Bow, other, HIT);
    shoot(&mut room, player, Ranged::Bow, foe, HIT);
    assert!(!has(&room, foe, Status::Charge), "a shot on another foe ends the row");
    for _ in 0..2 {
        shoot(&mut room, player, Ranged::Bow, foe, HIT);
    }
    shoot(&mut room, player, Ranged::Bow, foe, Verdict::Dodged { perfect: false });
    shoot(&mut room, player, Ranged::Bow, foe, HIT);
    assert!(!has(&room, foe, Status::Charge), "a dodged shot ends it too");
    for _ in 0..3 {
        shoot(&mut room, player, Ranged::Bow, foe, HIT);
    }
    assert!(has(&room, foe, Status::Charge), "four in a row");
}

#[test]
fn thunderhead_strikes_a_charged_foe_harder_with_a_blow_or_a_shot() {
    let (mut room, player, [charged, plain]) = room_wearing("squallbreak", "thunderhead");
    assert!(room.give(charged, Status::Charge, None, None));
    let ratio = room.empower(blow(player, SWING), charged).damage / room.empower(blow(player, SWING), plain).damage;
    assert!((ratio - 1.15).abs() < 1e-9, "a swing: {ratio}");
    let (mut room, player, [charged, plain]) = room_wearing("thunderstring", "thunderhead");
    assert!(room.give(charged, Status::Charge, None, None));
    let shot = blow(player, BlowKind::Shot(Ranged::Bow));
    let loosed = room.held(player, Slot::Ranged);
    let ratio = room.empower_as(shot, charged, loosed).damage / room.empower_as(shot, plain, loosed).damage;
    assert!((ratio - 1.15).abs() < 1e-9, "a shot: {ratio}");
}

#[test]
fn squall_step_gives_haste_for_three_seconds_on_a_perfect_dodge_alone() {
    let (mut room, player, [foe, _]) = room_wearing("stormcallers_helm", "squall_step");
    room.settle(&blow(foe, SWING), How::Swing, player, Verdict::Dodged { perfect: false }, None);
    assert!(!has(&room, player, Status::Haste), "a plain dodge");
    room.settle(&blow(foe, SWING), How::Swing, player, Verdict::Dodged { perfect: true }, None);
    assert_eq!(left(&room, player, Status::Haste), ticks(3.0));
}

#[test]
fn kindling_links_its_striker_and_their_nearest_ally_in_reach_on_a_kill() {
    let (mut room, player, [foe, _]) = room_wearing("wickstaff", "kindling");
    let [near, farther, far] = [3.0, 5.0, 30.0].map(|x| {
        let ally = room.join().expect("a room with space");
        place(&mut room, ally, x, 0.0);
        ally
    });
    place(&mut room, player, 0.0, 0.0);
    swing(&mut room, player, &[foe], HIT);
    assert!(!has(&room, player, Status::Linked), "no kill, no Link");
    swing(&mut room, player, &[foe], KILL);
    assert_eq!([player, near].map(|id| left(&room, id, Status::Linked)), [ticks(6.0); 2]);
    assert!(!has(&room, farther, Status::Linked) && !has(&room, far, Status::Linked), "the nearest ally alone");
    let (mut alone, player, [foe, _]) = room_wearing("wickstaff", "kindling");
    let ally = alone.join().expect("a room with space");
    place(&mut alone, ally, 30.0, 0.0);
    swing(&mut alone, player, &[foe], KILL);
    assert!(has(&alone, player, Status::Linked), "alone, the striker is Linked");
    assert!(!has(&alone, ally, Status::Linked), "an ally out of reach is not");
}

#[test]
fn shared_flame_strikes_harder_while_its_striker_is_linked() {
    let (mut room, player, [foe, _]) = room_wearing("wickstaff", "shared_flame");
    let plain = room.empower(blow(player, SWING), foe).damage;
    assert!(room.give(player, Status::Linked, None, None));
    let ratio = room.empower(blow(player, SWING), foe).damage / plain;
    assert!((ratio - 1.1).abs() < 1e-9, "{ratio}");
}

#[test]
fn lightbearer_and_shade_step_trim_the_healing_charges_and_a_veiled_dodge() {
    let (room, player, _) = room_wearing("lamplighters_hood", "lightbearer");
    assert!((trim_of(&room.player(player).expect("in").character, Slot::Melee).drink_heal - 1.15).abs() < 1e-9);
    let (room, player, _) = room_wearing("veiled_cowl", "shade_step");
    let trim = trim_of(&room.player(player).expect("in").character, Slot::Melee);
    assert!((trim.veiled_dodge_stamina - 0.8).abs() < 1e-9);
}

#[test]
fn nightfall_veils_its_striker_for_three_seconds_on_a_riposte_that_lands() {
    let (mut room, player, [foe, _]) = room_wearing("hushguard", "nightfall");
    swing(&mut room, player, &[foe], HIT);
    assert!(!has(&room, player, Status::Veiled), "a plain swing");
    let riposte = combat::Blow { parryable: false, ..blow(player, SWING) };
    room.settle(&riposte, How::Riposte, foe, HIT, Some(Slot::Melee));
    assert_eq!(left(&room, player, Status::Veiled), ticks(3.0));
}

#[test]
fn from_the_dark_crits_the_blow_or_shot_loosed_while_veiled() {
    let (mut room, player, [foe, _]) = room_wearing("hushguard", "from_the_dark");
    assert!(!room.empower(blow(player, SWING), foe).crit, "unveiled");
    assert!(room.give(player, Status::Veiled, None, None));
    assert!(room.empower(blow(player, SWING), foe).crit, "veiled");
    let (mut room, player, [foe, _]) = room_wearing("nightpin", "from_the_dark");
    assert!(room.give(player, Status::Veiled, None, None));
    let loosed = room.held(player, Slot::Ranged);
    let mut fighter = *room.fighter(player).expect("in");
    fighter.statuses = combat::Statuses::NONE;
    room.set_fighter(player, fighter);
    let shot = blow(player, BlowKind::Shot(Ranged::Bow));
    assert!(room.empower_as(shot, foe, loosed).crit, "loosed veiled, it lands a crit after the veil has gone");
}
