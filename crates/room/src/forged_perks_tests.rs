//! The Breaches' perks at their Forged grade, which a piece won at Hard gives: each does what its plain grade does,
//! more strongly ([[Forged Perks Are Stronger, and Hard Armour Is Forged Too]]).

use super::breach_perks_tests::{HIT, KILL, WORN, place, room_wearing};
use super::verbs_tests::{SWING, blow, shoot, stand, swing};
use crate::perks::trim_of;
use crate::{FighterId, How, PlayerId, Room};
use combat::{BlowKind, Ranged, Status, Verdict};
use gear::{At, Item, Kind, Rarity, Slot};

/// `room_wearing`'s piece, won at Hard: its Breach perk is Forged.
fn room_forged(kind: Kind, perk: &str) -> (Room, PlayerId, [FighterId; 2]) {
    let (mut room, player, foes) = room_wearing(kind, perk);
    room.players.get_mut(&player).expect("in").character.items.get_mut(&WORN).expect("worn").0.hard = true;
    room.retrim(player);
    (room, player, foes)
}

/// The ticks a fighter has left of a status.
fn left(room: &Room, fighter: FighterId, status: Status) -> u32 {
    room.fighter(fighter).expect("in").statuses.left(status)
}

#[test]
fn forged_vein_strike_strikes_an_exposed_foe_a_fifth_harder_with_a_blow_or_a_shot() {
    let (mut room, player, [exposed, plain]) = room_forged(Kind::Sword, "vein_strike");
    assert!(room.give(exposed, Status::Expose, None, None));
    let ratio = room.empower(blow(player, SWING), exposed).damage / room.empower(blow(player, SWING), plain).damage;
    assert!((ratio - 1.2).abs() < 1e-9, "a swing: {ratio}");
    let (mut room, player, [exposed, plain]) = room_forged(Kind::Bow, "vein_strike");
    assert!(room.give(exposed, Status::Expose, None, None));
    let shot = blow(player, BlowKind::Shot(Ranged::Bow));
    let loosed = room.held(player, Slot::Ranged);
    let ratio = room.empower_as(shot, exposed, loosed).damage / room.empower_as(shot, plain, loosed).damage;
    assert!((ratio - 1.2).abs() < 1e-9, "a shot: {ratio}");
}

#[test]
fn forged_bloom_splinter_shardburst_and_crystal_sight_reach_further() {
    let reached = |forged: bool| {
        let lay = if forged { room_forged } else { room_wearing };
        // Bloom: a foe 5 m from the slain.
        let (mut room, player, [slain, _]) = lay(Kind::Sword, "bloom");
        let far = stand(&mut room, 0.0, -6.5);
        swing(&mut room, player, &[slain], KILL);
        let bloom = left(&room, far, Status::Expose) > 0;
        // Splinter: a foe 4.5 m from the one a riposte lands on.
        let (mut room, player, [foe, _]) = lay(Kind::Sword, "splinter");
        let far = stand(&mut room, 0.0, -6.0);
        let riposte = combat::Blow { parryable: false, ..blow(player, SWING) };
        room.settle(&riposte, How::Riposte, foe, HIT, Some(Slot::Melee));
        let splinter = left(&room, far, Status::Expose) > 0;
        // Shardburst: a foe 4.5 m from the wearer whose guard is broken.
        let (mut room, player, [striker, _]) = lay(Kind::Head, "shardburst");
        place(&mut room, player, 0.0, 0.0);
        let far = stand(&mut room, 0.0, -4.5);
        room.settle(&blow(striker, SWING), How::Swing, player, Verdict::GuardBroken { damage: 5.0 }, None);
        let shardburst = left(&room, far, Status::Expose) > 0;
        // Crystal Sight: a shot landing 17 m off.
        let (mut room, player, [foe, _]) = lay(Kind::Bow, "crystal_sight");
        place(&mut room, player, 0.0, 0.0);
        place(&mut room, foe, 0.0, -17.0);
        shoot(&mut room, player, Ranged::Bow, foe, HIT);
        let sight = left(&room, foe, Status::Expose) > 0;
        [bloom, splinter, shardburst, sight]
    };
    assert_eq!(reached(false), [false; 4], "the plain grade falls short");
    assert_eq!(reached(true), [true; 4], "the Forged reaches");
}

#[test]
fn forged_exposes_and_charges_last_half_again_as_long() {
    let broken = Verdict::GuardBroken { damage: 5.0 };
    let blocked = Verdict::Blocked { damage: 1.0, stamina: 5.0 };
    let (mut room, player, [foe, other]) = room_forged(Kind::Sword, "shatterpoint");
    swing(&mut room, player, &[foe], broken);
    let lasting = room.lasts(foe, Status::Expose);
    assert_eq!(left(&room, foe, Status::Expose), lasting * 3 / 2, "Shatterpoint");
    let (mut room, player, _) = room_wearing(Kind::Sword, "shatterpoint");
    swing(&mut room, player, &[other], broken);
    assert_eq!(left(&room, other, Status::Expose), lasting, "Shatterpoint plain");
    for (kind, perk, verdict) in [
        (Kind::Head, "fracture", Verdict::Parried),
        (Kind::Head, "resonance", Verdict::Dodged { perfect: true }),
        (Kind::SwordAndShield, "lattice_wall", blocked),
    ] {
        let (mut room, player, [foe, _]) = room_forged(kind, perk);
        room.settle(&blow(foe, SWING), How::Swing, player, verdict, None);
        assert_eq!(left(&room, foe, Status::Expose), lasting * 3 / 2, "{perk}");
    }
    let (mut room, player, [exposed, _]) = room_forged(Kind::Bow, "shard_round");
    assert!(room.give(exposed, Status::Expose, None, None));
    shoot(&mut room, player, Ranged::Bow, exposed, HIT);
    assert_eq!(left(&room, exposed, Status::Charge), room.lasts(exposed, Status::Charge) * 3 / 2, "Shard Round");
}

#[test]
fn forged_armour_trims_more_and_regrows_more() {
    let (room, player, _) = room_forged(Kind::Head, "crystal_skin");
    assert!((trim_of(&room.player(player).expect("in").character, Slot::Melee).hale_taken - 0.85).abs() < 1e-9);
    let (room, player, _) = room_forged(Kind::Head, "lattice_shell");
    assert!((trim_of(&room.player(player).expect("in").character, Slot::Ranged).low_taken - 0.7).abs() < 1e-9);
    let (mut room, player, [foe, _]) = room_forged(Kind::Head, "regrowth");
    let mut wounded = *room.fighter(player).expect("in");
    wounded.health = wounded.health_max / 2.0;
    room.set_fighter(player, wounded);
    swing(&mut room, player, &[foe], KILL);
    let healed = room.fighter(player).expect("in").health;
    assert!((healed - wounded.health_max * 0.58).abs() < 1e-9, "{healed}");
}

#[test]
fn a_perk_given_by_a_normal_piece_and_a_hard_one_is_counted_once_and_forged() {
    let (mut room, player, _) = room_wearing(Kind::Head, "crystal_skin");
    let character = &mut room.players.get_mut(&player).expect("in").character;
    let mut chest = Item::new(WORN + 1, Kind::Torso, Rarity::Legendary, 20, Kind::Torso.slot());
    chest.breach = true;
    chest.hard = true;
    chest.source = gear::Source::Breach;
    chest.layout = vec![vec!["crystal_skin".to_owned()]];
    chest.bought |= chest.node_bit(0, 0).expect("a node");
    chest.chosen[0] = 0;
    if let Some(worn) = character.worn(Slot::Torso).map(|worn| worn.id) {
        character.items.remove(&worn);
    }
    character.items.insert(WORN + 1, (chest, At::Worn(Slot::Torso)));
    room.retrim(player);
    assert!((trim_of(&room.player(player).expect("in").character, Slot::Melee).hale_taken - 0.85).abs() < 1e-9);
}
