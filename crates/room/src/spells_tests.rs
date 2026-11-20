//! Each of the Arts' nine spells in the room, with each Core fragment that changes it: what it strikes and gives, its
//! numbers as the Arts' file has them, its element against a foe's shield, and the entities every player is sent.

use crate::arts::arts_tests::{cast, room_with_player, stand_foe, wearing};
use crate::power::PLAYER_HARM;
use crate::{BOLT, FighterId, PlayerId, Room, SpellSeen};
use combat::Status;
use combat::status::charge_ticks;
use gear::arts::arts;

/// The spells by their numbers.
const TEMPEST: u8 = 1;
const QUICKEN: u8 = 2;
const ARC_LASH: u8 = 3;
const SUNWELL: u8 = 4;
const MEND: u8 = 5;
const DAWNFLARE: u8 = 6;
const DUSKRAVEN: u8 = 7;
const DUSK_DAGGERS: u8 = 8;
const VANISH: u8 = 9;

fn health(room: &Room, id: FighterId) -> f64 {
    room.fighter(id).expect("in the room").health
}

fn has(room: &Room, id: FighterId, status: Status) -> u32 {
    room.fighter(id).expect("in the room").statuses.left(status)
}

fn seen(room: &Room, kind: u8) -> Vec<SpellSeen> {
    room.spells_seen().filter(|spell| spell.kind == kind).collect()
}

/// A second player standing at (x, y).
fn other_at(room: &mut Room, x: f64, y: f64) -> PlayerId {
    let other = room.join().expect("a room with space");
    let mut fighter = *room.fighter(other).expect("in");
    fighter.body = movement::standing(x, y);
    room.set_fighter(other, fighter);
    other
}

#[test]
fn tempest_sends_six_orbs_over_a_second_eight_with_pursuit_each_seeking_a_foe_for_its_damage() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[]);
    let foe = stand_foe(&mut room, 0.0, -10.0, 1000.0);
    cast(&mut room, player, TEMPEST, None, 0);
    assert_eq!(seen(&room, TEMPEST).len(), 1, "the first leaves at once, the rest in turn");
    for _ in 0..60 {
        room.tick();
    }
    let def = &arts().art(1).expect("Storm").anima;
    let orbs = seen(&room, TEMPEST);
    assert!(orbs.iter().all(|orb| orb.seeks == Some(foe) && orb.life == combat::ticks(def.life_s)));
    for _ in 0..240 {
        room.tick();
    }
    let lost = 1000.0 - health(&room, foe);
    assert!((lost - 6.0 * def.damage * PLAYER_HARM).abs() < 1e-6, "all six struck: {lost}");
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[0]);
    cast(&mut room, player, TEMPEST, None, 60);
    assert_eq!(seen(&room, TEMPEST).len(), 8, "Pursuit sends two more");
}

#[test]
fn quicken_hastes_every_player_within_twelve_metres_and_further_and_longer_with_gale_with_crit_by_momentum() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[]);
    let (near, far) = (other_at(&mut room, 10.0, 0.0), other_at(&mut room, 15.0, 0.0));
    cast(&mut room, player, QUICKEN, None, 0);
    assert!(has(&room, player, Status::Haste) > 0 && has(&room, near, Status::Haste) > 0);
    assert_eq!(has(&room, far, Status::Haste), 0, "past 12 m");
    assert_eq!(has(&room, player, Status::Crit), 0);
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[5, 2]);
    let far = other_at(&mut room, 15.0, 0.0);
    cast(&mut room, player, QUICKEN, None, 0);
    assert!(has(&room, far, Status::Haste) > 0, "Gale reaches 18 m");
    assert_eq!(has(&room, player, Status::Haste), Status::Haste.ticks() + 180, "3 s longer");
    assert_eq!(has(&room, player, Status::Crit), has(&room, player, Status::Haste), "Momentum's Crit as long");
}

#[test]
fn arc_lash_strikes_and_charges_each_foe_in_its_cone_longer_with_conduction_and_exposed_with_overload() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[]);
    let (ahead, behind, aside) = (
        stand_foe(&mut room, 0.0, -4.0, 1000.0),
        stand_foe(&mut room, 0.0, 4.0, 1000.0),
        stand_foe(&mut room, 5.0, -1.0, 1000.0),
    );
    cast(&mut room, player, ARC_LASH, None, 0);
    let def = &arts().art(1).expect("Storm").tenets[1];
    assert!((1000.0 - health(&room, ahead) - def.damage * PLAYER_HARM).abs() < 1e-6, "16 ahead, a player's");
    assert_eq!(has(&room, ahead, Status::Charge), charge_ticks(2), "a Major's Charge");
    assert_eq!(health(&room, behind), 1000.0);
    assert_eq!(health(&room, aside), 1000.0, "outside the 70 degree cone");
    assert_eq!(has(&room, ahead, Status::Expose), 0);
    let lash = seen(&room, ARC_LASH);
    assert_eq!(lash.first().and_then(|lash| lash.heads).map(|heads| heads[1].round()), Some(-7.0), "7 m ahead");
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[1, 4]);
    let foe = stand_foe(&mut room, 0.0, -4.0, 1000.0);
    cast(&mut room, player, ARC_LASH, None, 0);
    assert_eq!(has(&room, foe, Status::Charge), charge_ticks(2) * 3 / 2, "Conduction: half as long again");
    assert!(has(&room, foe, Status::Expose) > 0, "Overload Exposes what the player Charges");
}

#[test]
fn a_spell_strikes_in_its_art_s_element_three_times_on_a_matching_shield_half_on_another() {
    for (element, times) in [(gear::Element::Volt, 3.0), (gear::Element::Blaze, 0.5)] {
        let (mut room, player) = room_with_player();
        wearing(&mut room, player, 1, &[]);
        let foe = stand_foe(&mut room, 0.0, -4.0, 1000.0);
        room.gird(foe, 0, Some(element));
        let whole = room.foes[&foe].shield.expect("a shield").left;
        cast(&mut room, player, ARC_LASH, None, 0);
        let took = whole - room.foes[&foe].shield.expect("a shield").left;
        assert!((took - 16.0 * PLAYER_HARM * times).abs() < 1e-6, "{element:?}: {took}");
    }
}

#[test]
fn the_sunwell_links_every_player_within_ten_metres_for_twelve_seconds_further_and_longer_with_radiance() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 2, &[]);
    let (near, far) = (other_at(&mut room, 8.0, 0.0), other_at(&mut room, 12.0, 0.0));
    cast(&mut room, player, SUNWELL, None, 0);
    let well = seen(&room, SUNWELL);
    assert_eq!(well.first().map(|well| (well.life, well.radius)), Some((720, 10.0)));
    assert!(has(&room, player, Status::Linked) > 0 && has(&room, near, Status::Linked) > 0);
    assert_eq!(has(&room, far, Status::Linked), 0);
    for _ in 0..720 {
        room.tick();
    }
    assert!(seen(&room, SUNWELL).is_empty(), "gone after 12 s");
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 2, &[0]);
    let far = other_at(&mut room, 12.0, 0.0);
    cast(&mut room, player, SUNWELL, None, 0);
    assert_eq!(seen(&room, SUNWELL).first().map(|well| (well.life, well.radius)), Some((960, 13.0)));
    assert!(has(&room, far, Status::Linked) > 0, "Radiance reaches 3 m further");
}

#[test]
fn mend_heals_forty_and_half_as_much_to_those_near_with_mercy_and_gives_crit_with_resolve() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 2, &[1, 5]);
    let near = other_at(&mut room, 5.0, 0.0);
    for id in [player, near] {
        let mut hurt = *room.fighter(id).expect("in");
        hurt.health = 10.0;
        room.set_fighter(id, hurt);
    }
    cast(&mut room, player, MEND, None, 0);
    assert_eq!((health(&room, player), health(&room, near)), (50.0, 30.0));
    assert_eq!(has(&room, player, Status::Crit), Status::Crit.ticks(), "Resolve");
}

#[test]
fn the_dawnflare_flies_its_line_burning_each_foe_near_it_once_and_back_with_wings_exposing_with_searing() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 2, &[]);
    let (near, off_path) = (stand_foe(&mut room, 2.0, -10.0, 1000.0), stand_foe(&mut room, 7.0, -10.0, 1000.0));
    cast(&mut room, player, DAWNFLARE, None, 0);
    let bird = seen(&room, DAWNFLARE);
    let path = bird.first().and_then(|bird| bird.heads.map(|heads| (bird.at[1].round(), heads[1].round())));
    assert_eq!(path, Some((3.0, -21.0)), "from 3 m behind, 24 m along");
    for _ in 0..120 {
        room.tick();
    }
    assert!((1000.0 - health(&room, near) - 14.0 * PLAYER_HARM).abs() < 1e-6, "burnt once");
    assert_eq!(health(&room, off_path), 1000.0, "past 3 m of its path");
    assert!(seen(&room, DAWNFLARE).is_empty(), "flown in 1.6 s");
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 2, &[2, 4]);
    let foe = stand_foe(&mut room, 2.0, -10.0, 1000.0);
    cast(&mut room, player, DAWNFLARE, None, 200);
    let twice = (14.0 + 14.0 * combat::status::EXPOSE_TIMES) * PLAYER_HARM;
    assert!((1000.0 - health(&room, foe) - twice).abs() < 1e-6, "Wings: burnt again on the way back, Exposed");
    assert!(has(&room, foe, Status::Expose) > 0, "Searing");
}

#[test]
fn the_duskraven_bolts_the_nearest_foe_exposing_it_and_healing_its_caster_half_all_with_hunger() {
    for (fragments, share) in [(&[][..], 0.5), (&[0][..], 1.0)] {
        let (mut room, player) = room_with_player();
        wearing(&mut room, player, 3, fragments);
        let mut hurt = *room.fighter(player).expect("in");
        hurt.health = 50.0;
        room.set_fighter(player, hurt);
        let (near, far) = (stand_foe(&mut room, 0.0, -15.0, 1000.0), stand_foe(&mut room, 0.0, -30.0, 1000.0));
        cast(&mut room, player, DUSKRAVEN, None, 0);
        assert_eq!(seen(&room, BOLT).first().and_then(|bolt| bolt.seeks), Some(near), "the nearest within 22 m");
        for _ in 0..40 {
            room.tick();
        }
        assert!((1000.0 - health(&room, near) - 7.0 * PLAYER_HARM).abs() < 1e-6, "7 damage, a player's");
        assert!(has(&room, near, Status::Expose) > 0);
        assert!((health(&room, player) - (50.0 + 7.0 * PLAYER_HARM * share)).abs() < 1e-6, "healed {share} of it");
        assert_eq!(health(&room, far), 1000.0);
        assert_eq!(seen(&room, DUSKRAVEN).first().map(|raven| raven.life), Some(720));
    }
}

#[test]
fn dread_keeps_the_duskraven_two_seconds_longer_for_a_cosmic_kill_on_an_exposed_foe() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[4]);
    let foe = stand_foe(&mut room, 0.0, -10.0, 7.0);
    cast(&mut room, player, DUSKRAVEN, None, 0);
    room.give(foe, Status::Expose, None, None);
    for _ in 0..40 {
        room.tick();
    }
    assert!(room.fighter(foe).expect("lying there").dead());
    assert_eq!(seen(&room, DUSKRAVEN).first().map(|raven| raven.life), Some(840));
}

#[test]
fn dusk_daggers_whirl_where_aimed_within_sixteen_metres_striking_and_exposing_every_half_second() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[]);
    let (inside, outside) = (stand_foe(&mut room, 0.0, -10.0, 1000.0), stand_foe(&mut room, 0.0, -15.0, 1000.0));
    // Held still by a long Charge, so each stands where it was put.
    for foe in [inside, outside] {
        room.give(foe, Status::Charge, Some(400), None);
    }
    cast(&mut room, player, DUSK_DAGGERS, Some([0.0, -10.0, 0.0]), 0);
    let ring = seen(&room, DUSK_DAGGERS);
    assert_eq!(ring.first().map(|ring| (ring.at, ring.life, ring.radius)), Some(([0.0, -10.0, 0.0], 300, 4.0)));
    let first = 3.0 * PLAYER_HARM * combat::tuning::STAGGER_TAKEN;
    assert!((1000.0 - health(&room, inside) - first).abs() < 1e-6, "3 at once, on a foe held staggered");
    assert!(has(&room, inside, Status::Expose) > 0);
    room.take_events();
    for _ in 0..300 {
        room.tick();
    }
    let struck = room
        .take_events()
        .iter()
        .filter(|event| event.defender == inside && event.how == Some(crate::How::Spell))
        .count();
    assert_eq!(struck, 9, "then every 0.5 s to its fifth second");
    assert!(seen(&room, DUSK_DAGGERS).is_empty());
    assert_eq!(health(&room, outside), 1000.0);
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[2]);
    cast(&mut room, player, DUSK_DAGGERS, Some([0.0, -40.0, 0.0]), 0);
    let ring = seen(&room, DUSK_DAGGERS);
    assert_eq!(ring.first().map(|ring| (ring.at[1], ring.life, ring.radius)), Some((-16.0, 420, 5.5)), "Blades");
}

#[test]
fn vanish_rolls_three_metres_back_from_standing_into_a_veil_two_seconds_longer_with_night() {
    for (fragments, veil) in [(&[][..], Status::Veiled.ticks()), (&[1][..], Status::Veiled.ticks() + 120)] {
        let (mut room, player) = room_with_player();
        wearing(&mut room, player, 3, fragments);
        cast(&mut room, player, VANISH, None, 0);
        assert_eq!(has(&room, player, Status::Veiled), veil);
        for _ in 0..30 {
            room.tick();
        }
        let body = room.fighter(player).expect("in").body;
        assert!((body.y - 3.0).abs() < 0.2 && body.x.abs() < 1e-6, "back 3 m: {}", body.y);
    }
}

#[test]
fn dusk_daggers_lie_on_the_ground_whatever_height_the_page_sends() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[]);
    cast(&mut room, player, DUSK_DAGGERS, Some([0.0, -10.0, 30.0]), 0);
    let ring = seen(&room, DUSK_DAGGERS);
    assert_eq!(ring.first().map(|ring| ring.at), Some([0.0, -10.0, 0.0]), "on the flat floor, not 30 m up");
}

#[test]
fn a_dodge_passes_a_spell_whole_neither_its_harm_nor_its_charge() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[]);
    let foe = stand_foe(&mut room, 0.0, -4.0, 1000.0);
    room.ask_cast(player, Some(crate::arts::Cast { spell: ARC_LASH, aim: None }));
    for _ in 0..19 {
        // Kept in its dodge's safe frames through the release.
        let mut dodging = *room.fighter(foe).expect("in");
        dodging.action = combat::fighter::Action::Dodge { elapsed: combat::tuning::DODGE_SAFE.0, toward: [0.0, 1.0] };
        room.set_fighter(foe, dodging);
        room.tick();
    }
    assert_eq!((health(&room, foe), has(&room, foe, Status::Charge)), (1000.0, 0));
}

#[test]
fn vanish_out_of_a_reload_veils_without_the_roll_and_the_reload_runs_on() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[]);
    let mut reloading = *room.fighter(player).expect("in");
    reloading.action = combat::fighter::Action::Reload { left: 100 };
    room.set_fighter(player, reloading);
    cast(&mut room, player, VANISH, None, 0);
    let after = *room.fighter(player).expect("in");
    assert!(has(&room, player, Status::Veiled) > 0, "veiled");
    assert!(matches!(after.action, combat::fighter::Action::Reload { .. }), "{:?}", after.action);
    assert!(after.body.y.abs() < 1e-6, "no roll");
}

#[test]
fn casting_any_spell_but_vanish_ends_the_veil_and_a_spell_already_out_does_not() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[]);
    let foe = stand_foe(&mut room, 0.0, -10.0, 1000.0);
    cast(&mut room, player, DUSKRAVEN, None, 0);
    room.give(player, Status::Veiled, None, Some(player));
    for _ in 0..60 {
        room.tick();
    }
    assert!(health(&room, foe) < 1000.0, "the raven's bolts strike");
    assert!(has(&room, player, Status::Veiled) > 0, "and leave the veil");
    cast(&mut room, player, DUSK_DAGGERS, Some([0.0, -10.0, 0.0]), 0);
    assert!(has(&room, player, Status::Veiled) <= 1, "casting is attacking: the veil ends at its release");
    room.tick();
    assert_eq!(has(&room, player, Status::Veiled), 0);
}

#[test]
fn a_spell_never_takes_its_caster_s_soft_lock() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[]);
    let foe = stand_foe(&mut room, 0.0, -4.0, 1000.0);
    cast(&mut room, player, ARC_LASH, None, 0);
    assert!(health(&room, foe) < 1000.0, "Arc Lash strikes");
    assert_eq!(room.fighter(player).expect("in").target, None, "and the lock is the player's own");
}

#[test]
fn vanish_rolls_only_where_a_dodge_could_start_and_elsewhere_veils_without_the_roll() {
    use combat::fighter::Action;
    use combat::tuning::{FLINCH, FLINCH_DODGE};
    for (action, rolls) in [
        (Action::Dodge { elapsed: 4, toward: [1.0, 0.0] }, false),
        (Action::Flinch { left: FLINCH }, false),
        (Action::Flinch { left: FLINCH - FLINCH_DODGE }, true),
        (Action::Guard { elapsed: 3, window: 0 }, true),
    ] {
        let (mut room, player) = room_with_player();
        wearing(&mut room, player, 3, &[]);
        room.ask_cast(player, Some(crate::arts::Cast { spell: VANISH, aim: None }));
        for _ in 0..18 {
            room.tick();
        }
        let mut fighter = *room.fighter(player).expect("in");
        fighter.action = action;
        room.set_fighter(player, fighter);
        room.tick();
        let after = room.fighter(player).expect("in");
        assert!(has(&room, player, Status::Veiled) > 0, "veiled out of {action:?}");
        assert_eq!(after.body.mode == movement::Mode::Air, rolls, "out of {action:?}: {:?}", after.action);
        if !rolls {
            assert_eq!(after.action, action, "what it was doing runs on");
        }
    }
}
