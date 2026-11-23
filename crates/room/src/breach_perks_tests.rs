//! The Breaches' own perks in the room: Shatterpoint, Vein Strike, Bloom and Crystal Sight on the weapons; Crystal
//! Skin, Regrowth and Resonance on the armour; Lattice Wall on a shield. Each is worn here on a Breach's piece, the
//! only one it fits.

use super::verbs_tests::{SWING, blow, has, shoot, stand, swing};
use crate::perks::trim_of;
use crate::{FighterId, How, PlayerId, Room, loadout_arms};
use combat::{BlowKind, Fighter, Ranged, Status, Verdict};
use gear::{At, Item, Kind, Rarity, Slot};

const HIT: Verdict = Verdict::Hit { damage: 10.0, poise: 0.0 };
const KILL: Verdict = Verdict::Hit { damage: 5_000.0, poise: 0.0 };
const WORN: u32 = 88;

/// A room with a player wearing a Breach's Legendary of `kind` whose first column offers `perk`, bought and chosen,
/// held drawn if it is a weapon, and two hostile swordsmen before them.
fn room_wearing(kind: Kind, perk: &str) -> (Room, PlayerId, [FighterId; 2]) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let character = &mut room.players.get_mut(&player).expect("in").character;
    let mut item = Item::new(WORN, kind, Rarity::Legendary, 20, kind.slot());
    item.breach = true;
    item.source = gear::Source::Breach;
    item.layout = vec![vec![perk.to_owned()]];
    item.bought |= item.node_bit(0, 0).expect("a node");
    item.chosen[0] = 0;
    if let Some(worn) = character.worn(kind.slot()).map(|worn| worn.id) {
        character.items.remove(&worn);
    }
    character.items.insert(WORN, (item, At::Worn(kind.slot())));
    if kind.weapon() {
        let fighter = *room.fighter(player).expect("in");
        room.set_fighter(player, Fighter { arms: loadout_arms(kind), ..fighter });
    }
    room.retrim(player);
    let foes = [stand(&mut room, 0.0, -1.5), stand(&mut room, 1.0, -1.5)];
    (room, player, foes)
}

/// The same piece, but no Breach's: the perk does not fit it, so it gives nothing.
fn room_wearing_unfit(kind: Kind, perk: &str) -> (Room, PlayerId, [FighterId; 2]) {
    let (mut room, player, foes) = room_wearing(kind, perk);
    let character = &mut room.players.get_mut(&player).expect("in").character;
    character.items.get_mut(&WORN).expect("worn").0.breach = false;
    room.retrim(player);
    (room, player, foes)
}

fn place(room: &mut Room, fighter: FighterId, x: f64, y: f64) {
    let mut moved = *room.fighter(fighter).expect("in");
    moved.body.x = x;
    moved.body.y = y;
    room.set_fighter(fighter, moved);
}

#[test]
fn shatterpoint_exposes_a_foe_whose_guard_a_blow_breaks() {
    let broken = Verdict::GuardBroken { damage: 5.0 };
    let (mut room, player, [first, second]) = room_wearing(Kind::Sword, "shatterpoint");
    swing(&mut room, player, &[second], HIT);
    assert!(!has(&room, second, Status::Expose), "a blow that breaks no guard");
    swing(&mut room, player, &[first], broken);
    assert!(has(&room, first, Status::Expose));
    let (mut room, player, [first, _]) = room_wearing_unfit(Kind::Sword, "shatterpoint");
    swing(&mut room, player, &[first], broken);
    assert!(!has(&room, first, Status::Expose), "not on a piece from elsewhere");
}

#[test]
fn vein_strike_strikes_an_exposed_foe_harder_with_a_blow_or_a_shot() {
    let (mut room, player, [exposed, plain]) = room_wearing(Kind::Sword, "vein_strike");
    assert!(room.give(exposed, Status::Expose, None, None));
    let ratio = room.empower(blow(player, SWING), exposed).damage / room.empower(blow(player, SWING), plain).damage;
    assert!((ratio - 1.15).abs() < 1e-9, "a swing: {ratio}");
    let (mut room, player, [exposed, plain]) = room_wearing(Kind::Bow, "vein_strike");
    assert!(room.give(exposed, Status::Expose, None, None));
    let shot = blow(player, BlowKind::Shot(Ranged::Bow));
    let loosed = room.held(player, Slot::Ranged);
    let ratio = room.empower_as(shot, exposed, loosed).damage / room.empower_as(shot, plain, loosed).damage;
    assert!((ratio - 1.15).abs() < 1e-9, "a shot: {ratio}");
}

#[test]
fn bloom_exposes_every_foe_within_four_metres_of_the_slain() {
    let (mut room, player, [slain, near]) = room_wearing(Kind::Sword, "bloom");
    let far = stand(&mut room, 0.0, -6.0);
    swing(&mut room, player, &[slain], HIT);
    assert!(!has(&room, near, Status::Expose), "no kill, no Bloom");
    swing(&mut room, player, &[slain], KILL);
    assert!(has(&room, near, Status::Expose), "a foe 1 m from the slain");
    assert!(!has(&room, far, Status::Expose), "a foe 4.5 m from it");
}

#[test]
fn crystal_sight_exposes_a_foe_a_shot_lands_on_past_twenty_metres() {
    let (mut room, player, [foe, other]) = room_wearing(Kind::Bow, "crystal_sight");
    place(&mut room, player, 0.0, 0.0);
    place(&mut room, foe, 0.0, -25.0);
    place(&mut room, other, 0.0, -10.0);
    shoot(&mut room, player, Ranged::Bow, other, HIT);
    assert!(!has(&room, other, Status::Expose), "10 m off");
    shoot(&mut room, player, Ranged::Bow, foe, Verdict::Dodged { perfect: false });
    assert!(!has(&room, foe, Status::Expose), "a shot that does not land");
    shoot(&mut room, player, Ranged::Bow, foe, HIT);
    assert!(has(&room, foe, Status::Expose), "25 m off");
}

#[test]
fn crystal_skin_trims_the_blows_on_a_hale_wearer() {
    let (room, player, _) = room_wearing(Kind::Head, "crystal_skin");
    let trim = trim_of(&room.player(player).expect("in").character, Slot::Melee);
    assert!((trim.hale_taken - 0.9).abs() < 1e-9);
    let (room, player, _) = room_wearing_unfit(Kind::Head, "crystal_skin");
    assert!((trim_of(&room.player(player).expect("in").character, Slot::Melee).hale_taken - 1.0).abs() < 1e-9);
}

#[test]
fn regrowth_gives_back_five_percent_of_the_most_health_on_a_kill() {
    let (mut room, player, [foe, other]) = room_wearing(Kind::Head, "regrowth");
    let mut wounded = *room.fighter(player).expect("in");
    wounded.health = wounded.health_max / 2.0;
    room.set_fighter(player, wounded);
    swing(&mut room, player, &[foe], HIT);
    assert!((room.fighter(player).expect("in").health - wounded.health).abs() < 1e-9, "no kill");
    swing(&mut room, player, &[foe], KILL);
    let healed = room.fighter(player).expect("in").health;
    assert!((healed - wounded.health_max * 0.55).abs() < 1e-9, "{healed}");
    let mut full = *room.fighter(player).expect("in");
    full.health = full.health_max;
    room.set_fighter(player, full);
    swing(&mut room, player, &[other], KILL);
    assert!((room.fighter(player).expect("in").health - full.health_max).abs() < 1e-9, "never past the most");
    let (mut room, player, [foe, _]) = room_wearing(Kind::Head, "regrowth");
    let mut dead = *room.fighter(player).expect("in");
    dead.health = 0.0;
    dead.action = combat::Action::Dead { elapsed: 0 };
    room.set_fighter(player, dead);
    shoot(&mut room, player, Ranged::Bow, foe, KILL);
    assert!(
        room.fighter(player).expect("in").health.abs() < 1e-9,
        "a shot landing after its shooter fell heals no one"
    );
}

#[test]
fn resonance_exposes_the_foe_whose_blow_was_perfectly_dodged() {
    let (mut room, player, [foe, other]) = room_wearing(Kind::Head, "resonance");
    room.settle(&blow(other, SWING), How::Swing, player, Verdict::Dodged { perfect: false }, None);
    assert!(!has(&room, other, Status::Expose), "a plain dodge");
    room.settle(&blow(foe, SWING), How::Swing, player, Verdict::Dodged { perfect: true }, None);
    assert!(has(&room, foe, Status::Expose));
}

#[test]
fn lattice_wall_exposes_the_striker_of_a_blocked_blow() {
    let blocked = Verdict::Blocked { damage: 1.0, stamina: 5.0 };
    let (mut room, player, [foe, other]) = room_wearing(Kind::SwordAndShield, "lattice_wall");
    room.settle(&blow(other, SWING), How::Swing, player, HIT, None);
    assert!(!has(&room, other, Status::Expose), "a blow that landed");
    room.settle(&blow(foe, SWING), How::Swing, player, blocked, None);
    assert!(has(&room, foe, Status::Expose));
    let (mut room, player, [foe, _]) = room_wearing_unfit(Kind::SwordAndShield, "lattice_wall");
    room.settle(&blow(foe, SWING), How::Swing, player, blocked, None);
    assert!(!has(&room, foe, Status::Expose), "not on a piece from elsewhere");
}
