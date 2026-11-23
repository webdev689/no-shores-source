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
    assert_eq!(character.defense(), without, "its modules' Defense is its, not the player's");
    assert_eq!(character.shown().worn.len(), 5);
}

#[test]
fn a_kept_ship_is_fitted_once_and_its_modules_once_taken_off_stay_off() {
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
    assert_eq!(first.all_fitted().count(), 4, "a ship kept before modules is fitted as it is read");
}

#[test]
fn its_level_climbs_by_its_own_experience_then_by_its_modules_prestige() {
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
fn a_module_is_fitted_only_at_its_level_in_its_own_slot_and_one_atheric_among_its_modules() {
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
    assert_eq!(character.materials.ship.heartwood, 3, "an Atheric's Essence, as Heartwood");
    assert_eq!(character.materials.armor_fragments, 0);
}

#[test]
fn salvage_gives_ship_materials_and_its_modules_never_past_what_its_level_could_drop() {
    let mut legendary = 0;
    for tick in 0..2_000 {
        let low = salvage(Source::Breach, 10, 1.0, &dice(tick));
        let module = low.module.expect("a Breach always holds a module");
        assert!(module.kind.module() && module.rarity <= Rarity::Rare && module.level == 10);
        assert!(low.materials.heartwood == 2 && low.materials.timber + low.materials.canvas + low.materials.iron >= 12);
        let high = salvage(Source::Breach, 20, 1.0, &dice(tick));
        legendary += usize::from(high.module.is_some_and(|module| module.rarity >= Rarity::Legendary));
    }
    assert!((140..250).contains(&legendary), "a Breach, coloured as a Boss's drop, about 96 in 1,000: {legendary}");
    let found = |raised: f64| {
        (0..2_000)
            .filter(|tick| salvage(Source::Flotsam { rank: 1, chest: false }, 5, raised, &dice(*tick)).module.is_some())
            .count()
    };
    assert!((50..120).contains(&found(1.0)), "a Minor's piece holds a module about one time in 25: {}", found(1.0));
    assert!((130..200).contains(&found(2.0)), "twice as often at Abyss: {}", found(2.0));
}

#[test]
fn a_coves_wreckage_holds_less_than_a_minor_ships_whole_lot_and_an_isles_more_and_better() {
    let lot = |source: Source, pieces: u64| {
        let (mut commons, mut modules, mut better) = (0_u32, 0_u32, 0_u32);
        for tick in 0..2_000 {
            for piece in 0..pieces {
                let found = salvage(source, 20, 1.0, &dice(tick * 8 + piece));
                commons += u32::from(found.materials.timber + found.materials.canvas + found.materials.iron);
                modules += u32::from(found.module.is_some());
                better += u32::from(found.module.is_some_and(|module| module.rarity >= Rarity::Rare));
            }
        }
        (commons, modules, better)
    };
    let cove = lot(Source::Wreckage { isle: false }, 1);
    let minor_ship = lot(Source::Flotsam { rank: 1, chest: false }, 3);
    let isle = lot(Source::Wreckage { isle: true }, 1);
    assert!(cove.0 < minor_ship.0 && cove.1 < minor_ship.1, "{cove:?} under {minor_ship:?}");
    assert!(isle.0 > cove.0 && isle.1 > cove.1 && isle.2 > cove.2, "{isle:?} over {cove:?}");
}

#[test]
fn salvage_taken_fills_its_stocks_to_their_most_and_carries_its_module() {
    let mut character = Character::starting();
    character.materials.ship = ShipStock { timber: 199, ..ShipStock::default() };
    let found = salvage(Source::Breach, 20, 1.0, &dice(3));
    let taken = character.take_salvage(found.clone());
    assert!(taken.materials.timber <= 1 && character.materials.ship.timber <= 200);
    let id = taken.module.expect("carried");
    assert_eq!(character.at(id), Some(At::Carried));
    assert_eq!(character.item(id).map(|module| module.kind), found.module.map(|module| module.kind));
}

#[test]
fn the_shipwright_sells_modules_at_its_level_and_a_sinking_pays_its_experience() {
    let mut character = Character::starting();
    character.earn_ship_xp(u32::try_from(power::xp_for_level(9)).expect("fits"));
    let wares = vendor::wares(Vendor::Shipwright, 3, character.ship_level());
    assert_eq!(wares.len(), vendor::WARES);
    assert!(wares.iter().all(|ware| ware.kind.module() && ware.level == 9));
    character.materials.aurem = 5_000;
    let social = Here { social: true, day: 3, pledge: 0, rank: 0, week: 0 };
    character.ask(Ask::Vend { vendor: Vendor::Shipwright, ware: 0, day: 3 }, social, &dice(0)).expect("sold");
    let before = character.ship_xp;
    let earned = character.reward_sinking(Foe::Brute, 2, 10, Difficulty::Normal);
    assert_eq!(earned, 165, "a Major brute's 110 at level 10");
    assert_eq!(character.ship_xp - before, 165);
    assert_eq!(character.xp, 0, "the player earns nothing from its sinking a ship");
}

#[test]
fn ship_power_meets_a_hostile_ships_level_by_the_characters_own_law() {
    let mut character = Character::starting();
    character.earn_ship_xp(u32::MAX);
    let power = character.ship_power();
    assert!((power.harm_dealt(power.level + 4) - 0.0).abs() < 1e-12, "four levels under, its balls do nothing");
    assert!(power.harm_taken(power.level + 2) > power.harm_taken(power.level));
    assert!((power.harm_dealt(1) - power::by_player(power.attack, power.level, 1)).abs() < 1e-12);
}

#[test]
fn infusion_raises_a_kept_module_to_the_fed_ones_level_keeping_its_nodes_for_aurem_and_material() {
    let mut character = Character::starting();
    let kept = character.fitted(Slot::Sails).expect("fitted").id;
    character.items.get_mut(&kept).expect("held").0.bought = 1;
    character.earn_ship_xp(u32::try_from(power::xp_for_level(6)).expect("fits"));
    let fed = carry(&mut character, Kind::Sails, Rarity::Magic, 6);
    let hull = carry(&mut character, Kind::Hull, Rarity::Magic, 9);
    let infuse = Ask::Infuse { item: kept, fed };
    assert_eq!(
        character.ask(Ask::Infuse { item: kept, fed: hull }, Here::default(), &dice(0)),
        Err(Refusal::DoesNotFit)
    );
    assert_eq!(
        character.ask(Ask::Infuse { item: fed, fed: kept }, Here::default(), &dice(0)),
        Err(Refusal::WrongPlace)
    );
    assert_eq!(character.ask(infuse, Here::default(), &dice(0)), Err(Refusal::Short));
    character.materials.aurem = 1_000;
    character.materials.ship.add(ShipMaterial::Canvas, 10);
    character.ask(infuse, Here::default(), &dice(0)).expect("infused");
    let module = character.item(kept).expect("kept");
    assert_eq!((module.level, module.rarity, module.bought), (6, Rarity::Normal, 1));
    assert!(character.item(fed).is_none());
    assert_eq!((character.materials.aurem, character.materials.ship.canvas), (250, 0));
    let lower = carry(&mut character, Kind::Sails, Rarity::Rare, 3);
    assert_eq!(character.ask(Ask::Infuse { item: kept, fed: lower }, Here::default(), &dice(0)), Err(Refusal::TooLow));
}

#[test]
fn a_fitted_module_is_infused_no_higher_than_it_could_fit_it() {
    let mut character = Character::starting();
    let kept = character.fitted(Slot::Hull).expect("fitted").id;
    let fed = carry(&mut character, Kind::Hull, Rarity::Normal, 8);
    character.materials.aurem = 5_000;
    character.materials.ship.add(ShipMaterial::Timber, 50);
    let infuse = Ask::Infuse { item: kept, fed };
    assert_eq!(character.ask(infuse, Here::default(), &dice(0)), Err(Refusal::TooLow), "it is level 1");
    character.earn_ship_xp(u32::try_from(power::xp_for_level(8)).expect("fits"));
    character.ask(infuse, Here::default(), &dice(0)).expect("infused");
    assert_eq!(character.item(kept).map(|module| module.level), Some(8));
}

#[test]
fn a_modules_bought_node_that_no_longer_fits_is_given_back_in_its_own_materials_on_load() {
    let mut character = Character::starting();
    let id = carry(&mut character, Kind::Hull, Rarity::Legendary, 20);
    let mut hull = character.items[&id].0.clone();
    // A perk column that costs its two materials in different counts, so a swap of them would show.
    let column = (0..hull.columns().len())
        .filter(|column| hull.columns()[*column].traits())
        .find(|column| {
            let cost = hull.cost_of(*column);
            cost.fragments > 0 && cost.resource > 0 && cost.fragments != cost.resource
        })
        .expect("a perk column that costs both its materials");
    // A weapon's perk in the hull's perk column, as content changed under a node already bought.
    let mut layout = vec![Vec::new(); hull.columns().len()];
    layout[column] = vec!["keen_edge".to_owned()];
    hull.layout = layout;
    hull.bought |= hull.node_bit(column, 0).expect("its first node");
    hull.chosen[column] = 0;
    let aurem = character.materials.aurem;
    assert_eq!(character.materials.ship, ShipStock::default(), "nothing held before");
    let cost = hull.cost_of(column);
    let kept = crate::old_hands::unfit(&mut character, hull);
    assert_eq!(character.materials.aurem, aurem + cost.aurem, "its Aurem back");
    let [first, second] = made_of(Kind::Hull);
    let back = character.materials.ship;
    assert_eq!(
        (back.of(first), back.of(second), back.of(ShipMaterial::Heartwood)),
        (cost.fragments, cost.resource, cost.essence),
        "its first material for fragments, its second for the resource, Heartwood for any Essence",
    );
    assert_eq!(kept.bought & kept.node_bit(column, 0).unwrap_or(0), 0, "the node unbought");
    assert_eq!(kept.chosen[column], crate::item::NONE_CHOSEN, "and unchosen");
}
