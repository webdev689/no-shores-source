use crate::asks::{Ask, Done, Here, Refusal};
use crate::character::{At, CARRIED_MOST, Character, FRUIT_XP, Stuff, Vestige};
use crate::dice::Dice;
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::{Kind, Slot, Stock};
use crate::power::xp_for_level;
use crate::rarity::Rarity;

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };
const AFIELD: Here = Here { social: false, day: 0, pledge: 0, rank: 0, week: 0 };
const IN_TOWN: Here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };

fn give(character: &mut Character, kind: Kind, rarity: Rarity, level: u8, bucket: Slot) -> u32 {
    let id = character.take_id();
    character.items.insert(id, (Item::new(id, kind, rarity, level, bucket), At::Carried));
    id
}

fn at_level_20() -> Character {
    let mut character = Character::starting();
    character.xp = xp_for_level(20);
    character
}

#[test]
fn a_new_player_starts_as_destiny_1s_guardians_did() {
    let character = Character::starting();
    assert_eq!(character.level(), 1);
    let sword = character.worn(Slot::Melee).expect("a sword for Melee");
    assert_eq!((sword.kind, sword.rarity, sword.level), (Kind::Sword, Rarity::Normal, 1));
    for slot in [Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs] {
        assert!(character.worn(slot).is_some_and(|item| item.rarity == Rarity::Normal), "{slot:?}");
    }
    assert!(character.worn(Slot::Ranged).is_none() && character.worn(Slot::Cloak).is_none());
    assert_eq!(character.prestige(), 0);
    assert_eq!(character.materials.aurem, 0);
}

#[test]
fn wearing_keeps_loadouts_levels_and_one_atheric_to_each_of_loadouts_and_armour() {
    let mut character = at_level_20();
    let shielded = give(&mut character, Kind::SwordAndShield, Rarity::Rare, 20, Slot::Melee);
    let gun = give(&mut character, Kind::DoublePistolet, Rarity::Rare, 20, Slot::Ranged);
    assert_eq!(
        character.ask(Ask::Wear { item: shielded, slot: Slot::Ranged }, AFIELD, &DICE),
        Err(Refusal::DoesNotFit)
    );
    assert_eq!(character.ask(Ask::Wear { item: gun, slot: Slot::Melee }, AFIELD, &DICE), Err(Refusal::DoesNotFit));
    assert_eq!(character.ask(Ask::Wear { item: shielded, slot: Slot::Melee }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(character.ask(Ask::Wear { item: gun, slot: Slot::Ranged }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(character.at(shielded), Some(At::Worn(Slot::Melee)), "both loadouts are worn at once");
    let high = give(&mut character, Kind::Legs, Rarity::Magic, 20, Slot::Legs);
    let mut low = Character::starting();
    low.items.insert(high, (Item::new(high, Kind::Legs, Rarity::Magic, 20, Slot::Legs), At::Carried));
    assert_eq!(low.ask(Ask::Wear { item: high, slot: Slot::Legs }, AFIELD, &DICE), Err(Refusal::TooLow));
    let oath = give(&mut character, Kind::Sword, Rarity::Atheric, NAMED_LEVEL, Slot::Melee);
    let wing = give(&mut character, Kind::Bow, Rarity::Atheric, NAMED_LEVEL, Slot::Ranged);
    let crown = give(&mut character, Kind::Head, Rarity::Atheric, NAMED_LEVEL, Slot::Head);
    let hide = give(&mut character, Kind::Torso, Rarity::Atheric, NAMED_LEVEL, Slot::Torso);
    assert_eq!(character.ask(Ask::Wear { item: oath, slot: Slot::Melee }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(character.ask(Ask::Wear { item: wing, slot: Slot::Ranged }, AFIELD, &DICE), Err(Refusal::OneAtheric));
    assert_eq!(character.ask(Ask::Wear { item: crown, slot: Slot::Head }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(character.ask(Ask::Wear { item: hide, slot: Slot::Torso }, AFIELD, &DICE), Err(Refusal::OneAtheric));
    assert_eq!(character.ask(Ask::TakeOff { slot: Slot::Melee }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(character.ask(Ask::Wear { item: wing, slot: Slot::Ranged }, AFIELD, &DICE), Ok(Done::Done));
    assert!(character.worn(Slot::Melee).is_none());
}

#[test]
fn a_slot_carries_nine_beside_the_one_worn() {
    let mut character = Character::starting();
    for _ in 0..CARRIED_MOST {
        give(&mut character, Kind::DoubleDaggers, Rarity::Normal, 1, Slot::Melee);
    }
    let worn = character.worn(Slot::Melee).expect("the sword").id;
    assert_eq!(character.ask(Ask::TakeOff { slot: Slot::Melee }, AFIELD, &DICE), Err(Refusal::CarriedFull));
    assert_eq!(character.at(worn), Some(At::Worn(Slot::Melee)), "a refused ask changes nothing");
    let dagger = character.items.iter().find(|(_, (item, _))| item.kind == Kind::DoubleDaggers).map(|(id, _)| *id);
    let dagger = dagger.expect("carried daggers");
    assert_eq!(
        character.ask(Ask::Wear { item: dagger, slot: Slot::Melee }, AFIELD, &DICE),
        Ok(Done::Done),
        "a swap fits"
    );
    assert_eq!(character.at(worn), Some(At::Carried));
}

#[test]
fn a_node_is_bought_once_its_column_unlocks_and_its_cost_is_paid() {
    let mut character = at_level_20();
    let sword = give(&mut character, Kind::Sword, Rarity::Rare, 20, Slot::Melee);
    let buy = |column, node| Ask::Buy { item: sword, column, node };
    assert_eq!(character.ask(buy(0, 0), AFIELD, &DICE), Err(Refusal::Locked));
    character.items.get_mut(&sword).expect("the sword").0.xp = 6_000;
    assert_eq!(character.ask(buy(0, 0), AFIELD, &DICE), Err(Refusal::Short));
    character.materials.aurem = 1_000;
    character.materials.add(Stuff::Fragments(Stock::Weapon), 4);
    assert_eq!(character.ask(buy(0, 2), AFIELD, &DICE), Err(Refusal::NoSuchNode), "a Rare's first column offers two");
    assert_eq!(character.ask(buy(2, 0), AFIELD, &DICE), Err(Refusal::Locked), "the third column waits on 9,000");
    assert_eq!(character.ask(buy(0, 1), AFIELD, &DICE), Ok(Done::Done));
    assert_eq!((character.materials.aurem, character.materials.weapon_fragments), (600, 3), "400 Aurem and a fragment");
    let item = character.item(sword).expect("the sword");
    assert_eq!(item.chosen[0], 1, "the first node bought in a column is chosen");
    assert_eq!(character.ask(buy(0, 1), AFIELD, &DICE), Err(Refusal::AlreadyBought));
    assert_eq!(character.ask(Ask::Choose { item: sword, column: 0, node: 0 }, AFIELD, &DICE), Err(Refusal::NotBought));
    assert_eq!(character.ask(buy(1, 0), AFIELD, &DICE), Ok(Done::Done), "the upgrade: 600 Aurem and 3 fragments");
    assert_eq!((character.materials.aurem, character.materials.weapon_fragments), (0, 0));
    assert_eq!(character.item(sword).and_then(Item::attack), Some(254), "one of a Rare's three upgrades");
}

#[test]
fn a_legendarys_upgrade_asks_for_its_islands_resource() {
    let mut character = at_level_20();
    let shield = give(&mut character, Kind::Head, Rarity::Legendary, NAMED_LEVEL, Slot::Head);
    let entry = character.items.get_mut(&shield).expect("the helm");
    entry.0.xp = 20_000;
    entry.0.resource = Some(2);
    character.materials.aurem = 5_000;
    character.materials.add(Stuff::Fragments(Stock::Armor), 10);
    let upgrade = Ask::Buy { item: shield, column: 1, node: 0 };
    assert_eq!(character.ask(upgrade, AFIELD, &DICE), Err(Refusal::Short), "a Legendary armour upgrade needs Essence");
    character.materials.add(Stuff::Essence(Stock::Armor), 6);
    assert_eq!(character.ask(upgrade, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!((character.materials.aurem, character.materials.armor_essence), (3_500, 0));
    let perk = Ask::Buy { item: shield, column: 0, node: 0 };
    assert_eq!(character.ask(perk, AFIELD, &DICE), Err(Refusal::Short), "5 of the island's resource");
    character.materials.add(Stuff::Resource(2), 5);
    assert_eq!(character.ask(perk, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(character.materials.resource(2), 0);
}

#[test]
fn dismantling_gives_back_fragments_essence_and_a_third_of_what_was_spent() {
    let mut character = at_level_20();
    let worn = character.worn(Slot::Head).expect("a cap").id;
    assert_eq!(character.ask(Ask::Dismantle { item: worn }, AFIELD, &DICE), Err(Refusal::WrongPlace));
    let magic = give(&mut character, Kind::Bow, Rarity::Magic, 5, Slot::Melee);
    assert_eq!(character.ask(Ask::Dismantle { item: magic }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!((character.materials.aurem, character.materials.weapon_fragments), (50, 1));
    assert!(character.item(magic).is_none());
    let atheric = give(&mut character, Kind::Torso, Rarity::Atheric, NAMED_LEVEL, Slot::Torso);
    let item = &mut character.items.get_mut(&atheric).expect("the torso").0;
    for column in [1, 3, 5] {
        item.bought |= item.node_bit(column, 0).expect("an upgrade");
    }
    assert_eq!(item.essence_spent(), 18);
    assert_eq!(character.ask(Ask::Dismantle { item: atheric }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!(
        character.materials.armor_essence,
        3 + 6,
        "three, never less than a Legendary's, and a third of the 18 spent"
    );
    assert_eq!(character.materials.armor_fragments, 5);
}

#[test]
fn a_vestige_opens_only_in_a_social_space_into_the_slot_it_holds() {
    let mut character = Character::starting();
    let id = character.take_id();
    character.vestiges.insert(id, (Vestige::new(id, Rarity::Magic, Slot::Arms, 4), false));
    assert_eq!(character.ask(Ask::Identify { vestige: id }, AFIELD, &DICE), Err(Refusal::NotHere));
    let Ok(Done::Identified(item)) = character.ask(Ask::Identify { vestige: id }, IN_TOWN, &DICE) else {
        panic!("identified in town");
    };
    let item = character.item(item).expect("what it opened to");
    assert_eq!((item.kind, item.bucket, item.level), (Kind::Arms, Slot::Arms, 4));
    assert!(character.vestiges.is_empty());
    assert_eq!(character.ask(Ask::Identify { vestige: id }, IN_TOWN, &DICE), Err(Refusal::NoSuchVestige));
}

#[test]
fn a_vestige_opens_into_a_number_no_item_holds() {
    let mut character = Character::starting();
    let id = character.take_id();
    character.vestiges.insert(id, (Vestige::new(id, Rarity::Magic, Slot::Arms, 4), false));
    let held = *character.items.keys().next().expect("a starting item");
    let before = character.item(held).cloned();
    character.next_id = held;
    let Ok(Done::Identified(opened)) = character.ask(Ask::Identify { vestige: id }, IN_TOWN, &DICE) else {
        panic!("identified in town");
    };
    assert_ne!(opened, held, "a number an item holds is passed over");
    assert_eq!(character.item(held).cloned(), before, "and the item holding it is kept");
    assert!(character.item(opened).is_some(), "what it opened to");
}

#[test]
fn fruit_of_dagon_grows_past_level_20_and_feeds_an_item() {
    let mut character = at_level_20();
    character.earn_xp(19_999, None);
    assert_eq!(character.materials.fruit, 0);
    character.earn_xp(1, None);
    assert_eq!(character.materials.fruit, 1);
    character.earn_xp(u32::try_from(FRUIT_XP * 2).expect("small"), None);
    assert_eq!(character.materials.fruit, 3);
    let worn = character.worn(Slot::Head).expect("the cap").id;
    assert_eq!(character.item(worn).map(|item| item.xp), Some(1_000), "a Normal's XP stops at its last column");
    let fresh = give(&mut character, Kind::Sword, Rarity::Legendary, NAMED_LEVEL, Slot::Melee);
    assert_eq!(character.ask(Ask::Feed { item: worn }, AFIELD, &DICE), Err(Refusal::FullOfXp));
    assert_eq!(character.ask(Ask::Feed { item: fresh }, AFIELD, &DICE), Ok(Done::Done));
    assert_eq!((character.item(fresh).map(|item| item.xp), character.materials.fruit), (Some(5_000), 2));
}

#[test]
fn a_kill_teaches_the_weapon_that_struck_and_every_armour_piece() {
    let mut character = Character::starting();
    give(&mut character, Kind::DoubleDaggers, Rarity::Normal, 1, Slot::Melee);
    character.earn_xp(400, Some(Slot::Melee));
    let xp = |slot| character.worn(slot).map(|item| item.xp);
    assert_eq!((xp(Slot::Melee), xp(Slot::Head), xp(Slot::Legs)), (Some(400), Some(400), Some(400)));
    let carried = character.items.values().find(|(item, _)| item.kind == Kind::DoubleDaggers).map(|(item, _)| item.xp);
    assert_eq!(carried, Some(0), "what is carried earns nothing");
    character.earn_xp(100, None);
    assert_eq!(character.worn(Slot::Melee).map(|item| item.xp), Some(400), "XP no weapon earned");
    assert_eq!(character.xp, 500);
}

#[test]
fn the_vault_is_reached_in_a_social_space_and_holds_twenty_of_each() {
    let mut character = Character::starting();
    let axe = give(&mut character, Kind::GreatAxe, Rarity::Normal, 1, Slot::Melee);
    assert_eq!(character.ask(Ask::Store { item: axe }, AFIELD, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(Ask::Store { item: axe }, IN_TOWN, &DICE), Ok(Done::Done));
    assert_eq!(character.at(axe), Some(At::Vault));
    assert_eq!(character.ask(Ask::Wear { item: axe, slot: Slot::Melee }, IN_TOWN, &DICE), Err(Refusal::WrongPlace));
    for _ in 0..19 {
        let more = give(&mut character, Kind::GreatAxe, Rarity::Normal, 1, Slot::Melee);
        character.items.get_mut(&more).expect("an axe").1 = At::Vault;
    }
    let one_more = give(&mut character, Kind::Mace, Rarity::Normal, 1, Slot::Melee);
    assert_eq!(character.ask(Ask::Store { item: one_more }, IN_TOWN, &DICE), Err(Refusal::VaultFull));
    assert_eq!(character.ask(Ask::Withdraw { item: axe }, IN_TOWN, &DICE), Ok(Done::Done));
    assert_eq!(character.at(axe), Some(At::Carried));
}

#[test]
fn a_vendor_sells_the_days_wares_in_a_social_space_for_aurem_at_the_buyers_level() {
    use crate::vendor::{Vendor, WARES, price, wares};
    let today = wares(Vendor::Weaponsmith, 20_400, 12);
    assert_eq!(today.len(), WARES);
    // The page cuts the message's wares into each vendor's six, so every vendor sends six, every day.
    for (vendor, day) in Vendor::ALL.into_iter().flat_map(|vendor| (20_400..20_430).map(move |day| (vendor, day))) {
        assert_eq!(wares(vendor, day, 12).len(), WARES, "{vendor:?} on day {day}");
    }
    assert_eq!(today, wares(Vendor::Weaponsmith, 20_400, 12), "the same for everyone that day");
    assert_ne!(today, wares(Vendor::Weaponsmith, 20_401, 12), "and new the next");
    assert!(today.iter().all(|item| item.level == 12 && !item.rarity.named()));
    assert_eq!(today.iter().filter(|item| item.rarity == Rarity::Rare).count(), WARES / 2);
    assert!(wares(Vendor::Armorsmith, 20_400, 12).iter().all(|item| item.kind.armour()));
    let ranged = today.iter().filter(|item| item.kind.ranged()).count();
    assert_eq!((today.len() - ranged, ranged), (4, 2), "two Melee to each Ranged");
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(12);
    let here = Here { social: true, day: 20_400, pledge: 0, rank: 0, week: 0 };
    let vend = Ask::Vend { vendor: Vendor::Weaponsmith, ware: 0, day: 20_400 };
    assert_eq!(character.ask(vend, here, &DICE), Err(Refusal::Short), "no Aurem yet");
    character.materials.add_aurem(5_000);
    let yesterdays = Ask::Vend { vendor: Vendor::Weaponsmith, ware: 0, day: 20_399 };
    assert_eq!(character.ask(yesterdays, here, &DICE), Err(Refusal::NotSold), "a ware shown as the day turned");
    let unnamed = Ask::Vend { vendor: Vendor::Weaponsmith, ware: 0, day: 0 };
    assert_eq!(character.ask(unnamed, here, &DICE), Err(Refusal::NotSold), "an ask that names no day");
    assert_eq!(character.ask(vend, Here { social: false, ..here }, &DICE), Err(Refusal::NotHere));
    let before = character.items.len();
    assert_eq!(character.ask(vend, here, &DICE), Ok(Done::Done));
    assert_eq!(character.items.len(), before + 1);
    assert_eq!(character.materials.aurem, 5_000 - price(Rarity::Rare));
    let bought = character.items.values().find(|(item, _)| item.level == 12).expect("the ware");
    assert_eq!(bought.1, At::Carried);
    assert_eq!(
        character.ask(Ask::Vend { vendor: Vendor::Weaponsmith, ware: 9, day: 20_400 }, here, &DICE),
        Err(Refusal::NoSuchItem)
    );
}

#[test]
fn over_four_days_the_armorsmith_sells_every_armour_piece_at_each_rarity() {
    use crate::vendor::{Vendor, wares};
    let mut seen = std::collections::BTreeSet::new();
    for day in 20_000..20_004 {
        for ware in wares(Vendor::Armorsmith, day, 20) {
            seen.insert((ware.bucket, ware.rarity));
        }
    }
    for slot in [Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs] {
        for rarity in [Rarity::Rare, Rarity::Magic] {
            assert!(seen.contains(&(slot, rarity)), "{slot:?} at {rarity:?}");
        }
    }
}
