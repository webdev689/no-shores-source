use super::found::{Source, salvage};
use super::materials::{ShipMaterial, ShipStock, made_of, price_of};
use crate::asks::{Ask, Here, Refusal};
use crate::character::{At, Character};
use crate::dice::Dice;
use crate::grid::Cost;
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::power;
use crate::rarity::Rarity;
use crate::rewards::Foe;
use crate::vendor::{self, Vendor};
use crate::world::Difficulty;

fn dice(tick: u64) -> Dice {
    Dice { seed: 7, tick, player: 1 }
}

fn carry(character: &mut Character, kind: Kind, rarity: Rarity, level: u8) -> u32 {
    let id = character.take_id();
    character.items.insert(id, (Item::new(id, kind, rarity, level, kind.slot()), At::Carried));
    id
}

#[test]
fn a_new_ship_is_fitted_with_four_plain_modules_and_none_count_toward_the_character() {
    let character = Character::starting();
    for slot in Slot::SHIP {
        let module = character.fitted(slot).expect("fitted");
        assert_eq!((module.rarity, module.level), (Rarity::Normal, 1));
    }
    assert_eq!(character.ship_level(), 1);
    assert!(character.ship_attack() > 0 && character.ship_defense() > 0);
    let without: u32 =
        character.all_worn().filter(|(slot, _)| !slot.ship()).filter_map(|(_, item)| item.defense()).sum();
    assert_eq!(character.defense(), without, "her modules' Defense is hers, not the player's");
    assert_eq!(character.shown().worn.len(), 5);
}

#[test]
fn a_kept_ship_is_fitted_once_and_her_modules_once_taken_off_stay_off() {
    let mut character = Character::starting();
    character.ask(Ask::TakeOff { slot: Slot::Guns }, Here::default(), &dice(0)).expect("off");
    let read = Character::from_json(&character.to_json()).expect("read");
    assert!(read.fitted(Slot::Guns).is_none());
    let modules = read.items.values().filter(|(item, _)| item.kind.module()).count();
    assert_eq!(modules, 4, "no second set is fitted");
    let mut old: serde_json::Value = serde_json::from_str(&character.to_json()).expect("json");
    let object = old.as_object_mut().expect("object");
    object.remove("ship_fitted");
    object.insert("items".into(), serde_json::json!({}));
    let first = Character::from_json(&old.to_string()).expect("read");
    assert_eq!(first.all_fitted().count(), 4, "a ship kept before modules is fitted as she is read");
}

#[test]
fn her_level_climbs_by_her_own_experience_then_by_her_modules_prestige() {
    let mut character = Character::starting();
    character.earn_ship_xp(u32::try_from(power::xp_for_level(12)).expect("fits"));
    assert_eq!(character.ship_level(), 12);
    assert_eq!(character.level(), 1, "the ship's experience is not the player's");
    character.earn_ship_xp(u32::MAX);
    assert_eq!(character.ship_level(), 20);
    for kind in Kind::MODULES {
        let id = carry(&mut character, kind, Rarity::Legendary, 20);
        character.ask(Ask::Wear { item: id, slot: kind.slot() }, Here::default(), &dice(1)).expect("worn");
    }
    assert_eq!(character.ship_prestige(), 72);
    assert_eq!(character.ship_level(), 25);
    assert_eq!(character.level(), 1);
}

#[test]
fn a_module_is_fitted_only_at_her_level_in_its_own_slot_and_one_atheric_among_her_modules() {
    let mut character = Character::starting();
    let guns = carry(&mut character, Kind::Guns, Rarity::Rare, 10);
    let here = Here::default();
    assert_eq!(character.ask(Ask::Wear { item: guns, slot: Slot::Guns }, here, &dice(0)), Err(Refusal::TooLow));
    character.earn_ship_xp(u32::MAX);
    assert_eq!(character.ask(Ask::Wear { item: guns, slot: Slot::Hull }, here, &dice(0)), Err(Refusal::DoesNotFit));
    assert!(character.ask(Ask::Wear { item: guns, slot: Slot::Guns }, here, &dice(0)).is_ok());
    let hull = carry(&mut character, Kind::Hull, Rarity::Atheric, 20);
    let sails = carry(&mut character, Kind::Sails, Rarity::Atheric, 20);
    let head = carry(&mut character, Kind::Head, Rarity::Atheric, 20);
    character.earn_xp(u32::MAX, None);
    assert!(character.ask(Ask::Wear { item: hull, slot: Slot::Hull }, here, &dice(0)).is_ok());
    assert!(character.ask(Ask::Wear { item: head, slot: Slot::Head }, here, &dice(0)).is_ok(), "armour is apart");
    assert_eq!(character.ask(Ask::Wear { item: sails, slot: Slot::Sails }, here, &dice(0)), Err(Refusal::OneAtheric));
}

#[test]
fn a_modules_nodes_are_paid_in_its_own_ship_materials() {
    assert_eq!(made_of(Kind::Guns), [ShipMaterial::Iron, ShipMaterial::Timber]);
    let price = price_of(Kind::Sails, Cost { aurem: 1, fragments: 2, resource: 3, essence: 4 });
    assert_eq!(price.0, [(ShipMaterial::Canvas, 2), (ShipMaterial::Timber, 3), (ShipMaterial::Heartwood, 4)]);
    let mut character = Character::starting();
    character.earn_ship_xp(u32::MAX);
    let guns = carry(&mut character, Kind::Guns, Rarity::Rare, 20);
    character.items.get_mut(&guns).expect("held").0.xp = u32::MAX / 2;
    character.materials.aurem = 10_000;
    let upgrade = Ask::Buy { item: guns, column: 1, node: 0 };
    assert_eq!(character.ask(upgrade, Here::default(), &dice(0)), Err(Refusal::Short), "a Rare's upgrade asks iron");
    character.materials.ship.add(ShipMaterial::Iron, 3);
    character.materials.weapon_fragments = 0;
    assert!(character.ask(upgrade, Here::default(), &dice(0)).is_ok());
    assert_eq!((character.materials.ship.iron, character.materials.aurem), (0, 9_400));
}

#[test]
fn a_module_dismantled_gives_back_its_own_material_and_no_fruit_feeds_one() {
    let mut character = Character::starting();
    let hull = carry(&mut character, Kind::Hull, Rarity::Atheric, 20);
    character.materials.fruit = 1;
    assert_eq!(character.ask(Ask::Feed { item: hull }, Here::default(), &dice(0)), Err(Refusal::DoesNotFit));
    character.ask(Ask::Dismantle { item: hull }, Here::default(), &dice(0)).expect("dismantled");
    assert_eq!(character.materials.ship.timber, 10);
    assert_eq!(character.materials.ship.heartwood, 2);
    assert_eq!(character.materials.armor_fragments, 0);
}

#[test]
fn salvage_gives_ship_materials_and_its_modules_never_past_what_its_level_could_drop() {
    let mut legendary = 0;
    for tick in 0..400 {
        let low = salvage(Source::Breach, 10, &dice(tick));
        let module = low.module.expect("a Breach always holds a module");
        assert!(module.kind.module() && module.rarity <= Rarity::Rare && module.level == 10);
        assert!(low.materials.heartwood == 2 && low.materials.timber + low.materials.canvas + low.materials.iron >= 12);
        let high = salvage(Source::Breach, 20, &dice(tick));
        legendary += usize::from(high.module.is_some_and(|module| module.rarity.named()));
    }
    assert!(legendary > 60, "a Breach at level 20 holds Legendary or Atheric modules: {legendary}");
    let found =
        (0..1_000).filter(|tick| salvage(Source::Flotsam { rank: 1, chest: false }, 5, &dice(*tick)).module.is_some());
    let share = found.count();
    assert!((20..70).contains(&share), "a Minor's piece holds a module about one time in 25: {share}");
}

#[test]
fn salvage_taken_fills_her_stocks_to_their_most_and_carries_its_module() {
    let mut character = Character::starting();
    character.materials.ship = ShipStock { timber: 199, ..ShipStock::default() };
    let found = salvage(Source::Breach, 20, &dice(3));
    let taken = character.take_salvage(found.clone());
    assert!(taken.materials.timber <= 1 && character.materials.ship.timber <= 200);
    let id = taken.module.expect("carried");
    assert_eq!(character.at(id), Some(At::Carried));
    assert_eq!(character.item(id).map(|module| module.kind), found.module.map(|module| module.kind));
}

#[test]
fn the_shipwright_sells_modules_at_her_level_and_a_sinking_pays_her_experience() {
    let mut character = Character::starting();
    character.earn_ship_xp(u32::try_from(power::xp_for_level(9)).expect("fits"));
    let wares = vendor::wares(Vendor::Shipwright, 3, character.ship_level());
    assert_eq!(wares.len(), vendor::WARES);
    assert!(wares.iter().all(|ware| ware.kind.module() && ware.level == 9));
    character.materials.aurem = 5_000;
    let social = Here { social: true, day: 3 };
    character.ask(Ask::Vend { vendor: Vendor::Shipwright, ware: 0 }, social, &dice(0)).expect("sold");
    let before = character.ship_xp;
    let earned = character.reward_sinking(Foe::Brute, 10, Difficulty::Normal);
    assert_eq!(earned, 270);
    assert_eq!(character.ship_xp - before, 270);
    assert_eq!(character.xp, 0, "the player earns nothing from her sinking a ship");
}

#[test]
fn ship_power_meets_a_hostile_ships_level_by_the_characters_own_law() {
    let mut character = Character::starting();
    character.earn_ship_xp(u32::MAX);
    let power = character.ship_power();
    assert!((power.harm_dealt(power.level + 4) - 0.0).abs() < 1e-12, "four levels under, her balls do nothing");
    assert!(power.harm_taken(power.level + 2) > power.harm_taken(power.level));
    assert!((power.harm_dealt(1) - power::by_player(power.attack, power.level, 1)).abs() < 1e-12);
}
