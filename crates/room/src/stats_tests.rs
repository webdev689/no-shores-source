//! An item's fight numbers: a weapon's are its class's as combat swings or shoots it, its traits move them as they
//! trim a player wearing it, and armour has only its trim.

use super::*;
use crate::foes::Foe;
use crate::perks::trim_of;
use crate::power::PLAYER_HARM;
use crate::{FighterId, Room};
use combat::arms::{PAIR_PACE, weapon};
use combat::{Blow, BlowKind, CombatInput, Happening, Intent, Surroundings, step_fighter};
use gear::{At, Item, Rarity, Slot};
use std::collections::BTreeMap;

const NONE: [&str; 0] = [];

#[test]
fn a_sword_fights_with_its_class_numbers() {
    let (sword, trim) = stats(Kind::Sword, NONE);
    let held = weapon(WeaponClass::Sword);
    assert_eq!(trim, Trim::PLAIN);
    assert_eq!(sword.loadout, Loadout::Melee);
    assert_eq!([sword.impact, sword.stamina], [held.damage * PLAYER_HARM, held.stamina]);
    assert_eq!(sword.reach, combat::strike::stroke_reach(WeaponClass::Sword, Stroke::DownLeft, true));
    assert!(sword.reach > held.reach, "a player's blow reaches past its class's own, to a body's middle");
    assert_eq!(sword.poise, held.weight * POISE_PER_WEIGHT);
    assert_eq!(sword.rate, 1.0 / (f64::from(swing_ticks(WeaponClass::Sword).1) * TICK_SECONDS));
    assert_eq!(sword.hands, Hands::Free, "a sword alone leaves the left hand for a torch");
    assert_eq!([sword.aimed, sword.ammo, sword.aim_pace], [0.0; 3], "a blade shoots nothing");
}

#[test]
fn traits_move_the_numbers_they_trim() {
    let (plain, _) = stats(Kind::Sword, NONE);
    let (light, trim) = stats(Kind::Sword, ["light_grip"]);
    assert_eq!(trim.swing_stamina, 0.85);
    assert!((light.stamina - plain.stamina * 0.85).abs() < 1e-9, "Light Grip costs 15% less a swing");
    let (heavy, _) = stats(Kind::Sword, ["heavy_head", "honed"]);
    assert!((heavy.impact - plain.impact * 1.12 * 1.05).abs() < 1e-9, "both strike harder, together");
    assert!(heavy.stamina > plain.stamina, "Heavy Head's cost stands beside its gain");
    let (weighted, _) = stats(Kind::Sword, ["weighted"]);
    assert!((weighted.poise - plain.poise * 1.2).abs() < 1e-9);
}

#[test]
fn a_pair_swings_faster_and_lighter_than_its_lone_blade() {
    let (lone, _) = stats(Kind::Sword, NONE);
    let (pair, _) = stats(Kind::DoubleSwords, NONE);
    assert_eq!(pair.hands, Hands::Pair);
    assert!((pair.impact - lone.impact * PAIR_DAMAGE).abs() < 1e-9);
    assert!(pair.rate > lone.rate && pair.rate <= lone.rate / PAIR_PACE + 0.1, "about 1 / PAIR_PACE as often");
    assert_eq!(stats(Kind::SwordAndShield, NONE).0.hands, Hands::Shield);
    assert_eq!(stats(Kind::Greatsword, NONE).0.hands, Hands::Both);
}

#[test]
fn a_gun_shoots_its_shot_and_carries_its_ammunition() {
    let (gun, _) = stats(Kind::Thunderlock, NONE);
    let (speed, damage, _, _) = shot_numbers(Ranged::Thunderlock);
    assert_eq!(gun.loadout, Loadout::Ranged);
    assert_eq!(gun.impact, damage * PLAYER_HARM);
    assert_eq!(gun.aimed, gun.impact * combat::shots::AIMED_POWER, "a gun aims at once to its full power");
    assert_eq!([gun.flight, gun.stamina, gun.reach], [speed, 0.0, 0.0]);
    assert_eq!(gun.ammo, f64::from(gear::ammo::capacity(Kind::Thunderlock).expect("a gun carries shots")));
    assert_eq!(gun.hands, Hands::Both, "held in both hands, no torch");
    assert!(stats(Kind::Thunderlock, ["quick_hands"]).0.rate > gun.rate, "Quick Hands reloads sooner");
}

#[test]
fn a_bow_strikes_two_thirds_quick_and_draws_to_its_full_shot() {
    let (bow, _) = stats(Kind::Bow, NONE);
    let damage = shot_numbers(Ranged::Bow).1 * PLAYER_HARM;
    assert!((bow.impact - damage * 2.0 / 3.0).abs() < 1e-9);
    assert!((bow.aimed - damage).abs() < 1e-9, "a full draw strikes the bow's whole shot");
    assert_eq!(bow.aim_pace, AIM_PACE);
    let (stocked, _) = stats(Kind::Bow, ["light_stock", "overdrawn"]);
    assert!((stocked.aim_pace - 2.0 / 3.0).abs() < 1e-9, "Light Stock keeps two thirds of the pace");
    assert!(stocked.aimed > bow.aimed && stocked.rate < bow.rate, "Overdrawn strikes harder, reloads slower");
    assert_eq!(stats(Kind::DoublePistolet, NONE).0.hands, Hands::Pair);
    assert_eq!(stats(Kind::Pistolet, NONE).0.hands, Hands::Free, "a lone pistolet leaves a hand for a torch");
}

#[test]
fn armour_has_no_weapon_numbers_but_moves_the_body_its_perks_trim() {
    let (plain, _) = stats(Kind::Head, NONE);
    let (helm, trim) = stats(Kind::Head, ["second_wind", "unshaken"]);
    assert_eq!(helm.loadout, Loadout::None);
    assert_eq!([helm.impact, helm.rate, helm.ammo], [0.0; 3]);
    assert!((trim.regen - 1.15).abs() < 1e-9 && (trim.poise_taken - 1.0 / 1.15).abs() < 1e-9);
    assert_eq!(plain.stamina_back, 45.0, "a body rests back 45 stamina a second");
    assert_eq!([plain.dodge_cost, plain.poise_held, plain.healing], [DODGE_STAMINA, PLAYER_POISE, DRINK_HEALS]);
    assert!((helm.stamina_back - 45.0 * 1.15).abs() < 1e-9, "Second Wind: back 15% faster");
    assert!((helm.poise_held - PLAYER_POISE * 1.15).abs() < 1e-9, "Unshaken: poise holds 15% more");
    assert_eq!(stats(Kind::Legs, ["sure_footing"]).0.dodge_cost, DODGE_STAMINA * 0.85);
    assert!((stats(Kind::Torso, ["lightbearer"]).0.healing - DRINK_HEALS * 1.15).abs() < 1e-9);
}

#[test]
fn an_items_trim_is_what_wearing_it_trims_a_player() {
    let mut character = gear::Character::kitted();
    let mut sword = Item::new(99, Kind::Sword, Rarity::Legendary, 20, Slot::Melee);
    // Its trait columns in order (handling, perk, finish); the grid's handling is column 0 and its finish column 4.
    sword.layout = vec![
        vec!["heavy_head".into(), "light_grip".into()],
        vec!["bloodletter".into(), "executioner".into()],
        vec!["honed".into(), "balanced".into()],
    ];
    for column in [0, 4] {
        sword.bought |= sword.node_bit(column, 0).expect("a node");
        sword.chosen[column] = 0;
    }
    let main = character.worn(Slot::Melee).expect("the starting sword").id;
    character.items.remove(&main);
    let traits: Vec<String> = sword.active_traits().map(str::to_owned).collect();
    character.items.insert(99, (sword, At::Worn(Slot::Melee)));
    let (_, trim) = stats(Kind::Sword, traits.iter().map(String::as_str));
    assert_eq!(traits, ["heavy_head", "honed"]);
    assert_eq!(trim, trim_of(&character, Slot::Melee), "the kit's armour gives nothing, so the sword's is all of it");
}

/// The ticks at which a player holding `kind`'s arms, trimmed by `traits`, swings or shoots, holding a stroke or the
/// trigger for `ticks` ticks as combat steps them, their stamina kept full.
fn paced(kind: Kind, traits: &[&str], ticks: u32) -> Vec<u32> {
    let (shown, trim) = stats(kind, traits.iter().copied());
    let mut fighter = combat::fighter::player(movement::standing(0.0, 0.0), loadout_arms(kind));
    fighter.trim = trim;
    let shooting = shown.loadout == Loadout::Ranged;
    let combat =
        CombatInput { attack: (!shooting).then_some(Stroke::DownLeft), shoot: shooting, ..CombatInput::default() };
    let intent = Intent { controls: movement::Controls::default(), combat };
    let around = Surroundings { blocks: &[], terrain: &movement::Flat, target_at: None };
    let mut at = Vec::new();
    for tick in 0..ticks {
        let (next, happening) = step_fighter(&fighter, &intent, &around);
        fighter = next;
        fighter.stamina = combat::tuning::STAMINA;
        if matches!(happening, Some(Happening::Swung(_) | Happening::Loosed(_))) {
            at.push(tick);
        }
    }
    at
}

#[test]
fn a_weapon_swings_and_shoots_as_often_as_combat_steps_it() {
    let cases: [(Kind, &[&str]); 9] = [
        (Kind::Sword, &[]),
        (Kind::DoubleSwords, &[]),
        (Kind::Warhammer, &[]),
        (Kind::Bow, &[]),
        (Kind::Bow, &["hair_trigger"]),
        (Kind::Crossbow, &[]),
        (Kind::Pistolet, &[]),
        (Kind::Thunderlock, &["quick_hands"]),
        (Kind::DoublePistolet, &[]),
    ];
    for (kind, traits) in cases {
        let at = paced(kind, traits, 900);
        // A pair of pistolets fires twice in each of its cycles; every other weapon once.
        let (shots, index) = if kind == Kind::DoublePistolet { (2.0, 2) } else { (1.0, 1) };
        let (first, later) = (at[0], at[index]);
        let stepped = shots / (f64::from(later - first) * TICK_SECONDS);
        let shown = stats(kind, traits.iter().copied()).0.rate;
        assert!(
            (stepped - shown).abs() < 1e-9,
            "{kind:?} {traits:?}: combat steps {stepped}/s, the page shows {shown}/s"
        );
    }
}

#[test]
fn a_blows_impact_is_what_the_room_strikes_a_foe_of_level_0_with() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let foe: FighterId = room.next_id();
    let (foe_type, rank) = crate::foes::hostile_in(::foes::Role::Brute).expect("the Tithe's Enforcer");
    let (fighter, brain) = ::foes::spawn(foe_type, rank, 0.0, -1.5, core::f64::consts::PI);
    room.foes.insert(foe, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    let swing = Blow {
        striker: player,
        kind: BlowKind::Swing(Stroke::DownLeft),
        from: [0.0, 0.0],
        damage: weapon(WeaponClass::Sword).damage,
        poise: 0.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    };
    let struck = room.empower(swing, foe).damage;
    assert!((struck - weapon(WeaponClass::Sword).damage * PLAYER_HARM).abs() < 1e-9, "a player's blow, half again");
    assert!((stats(Kind::Sword, NONE).0.impact - struck).abs() < 1e-9, "the page's Impact is that blow");
}

#[test]
fn a_weapons_finish_moves_the_body_while_it_is_drawn() {
    let (plain, _) = stats(Kind::Sword, NONE);
    let (reckless, _) = stats(Kind::Sword, ["reckless"]);
    assert!(reckless.impact > plain.impact && reckless.poise_held < plain.poise_held, "it gives and it takes");
    let (balanced, trim) = stats(Kind::Sword, ["balanced"]);
    let mut fighter = combat::fighter::player(movement::standing(0.0, 0.0), loadout_arms(Kind::Sword));
    fighter.trim = trim;
    assert!(
        (balanced.dodge_cost - fighter.dodge_stamina()).abs() < 1e-9,
        "a dodge with it drawn costs what combat takes"
    );
    assert!(balanced.dodge_cost < plain.dodge_cost);
    let (guarded, _) = stats(Kind::Bow, ["guarded"]);
    assert!(guarded.poise_held > stats(Kind::Bow, NONE).0.poise_held, "a bow's finish too");
}
