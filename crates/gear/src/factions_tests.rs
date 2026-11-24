//! The factions: their file read whole, pledging and switching, reputation earned only pledged with the cape worn,
//! the ranks' emblem, dye and packages, the cape sold only to the pledged, and their armour and weapons by rank.

use crate::asks::{Ask, Here, Refusal};
use crate::character::{At, Character, VESTIGES_MOST, Vestige};
use crate::cosmetics::{CosmeticKind, cosmetics};
use crate::dice::Dice;
use crate::emblems::{Source, emblems};
use crate::factions::{factions, wares};
use crate::item::Item;
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use crate::rewards::Foe;
use crate::world::Difficulty;

const AT_COUNTER: Here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };
const AFIELD: Here = Here { social: false, day: 0, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };
/// The cape's place among a faction's wares.
const CAPE: u8 = 0;

fn rich() -> Character {
    let mut character = Character::starting();
    character.materials.aurem = 20_000;
    character
}

/// A rich character at level 20, the level a faction's armour and weapons are made at.
fn seasoned() -> Character {
    let mut character = rich();
    character.xp = crate::power::xp_for_level(20);
    character
}

/// Pledges, buys the cape and wears it.
pub(crate) fn caped(faction: u8) -> Character {
    let mut character = rich();
    assert_eq!(character.ask(Ask::Pledge { faction }, AT_COUNTER, &DICE).map(|_| ()), Ok(()));
    assert_eq!(character.ask(Ask::BuyFactionWare { faction, ware: CAPE }, AT_COUNTER, &DICE).map(|_| ()), Ok(()));
    let cape = character.items.iter().find(|(_, (item, _))| item.kind.slot() == Slot::Cloak).map(|(id, _)| *id);
    let wear = Ask::Wear { item: cape.expect("the cape carried"), slot: Slot::Cloak };
    assert_eq!(character.ask(wear, AFIELD, &DICE).map(|_| ()), Ok(()));
    character
}

#[test]
fn the_factions_file_reads_whole() {
    let file = factions();
    let names: Vec<(&str, u8)> = file.factions.iter().map(|faction| (faction.name.as_str(), faction.art)).collect();
    assert_eq!(names, [("Stormcallers", 1), ("Lamplighters", 2), ("The Veiled", 3)]);
    for faction in &file.factions {
        let cape = crate::catalogue::catalogue().named(&faction.cape).expect("its cape is a named item");
        assert_eq!((cape.kind.slot(), cape.rarity), (Slot::Cloak, Rarity::Legendary));
        assert_eq!(cape.faction.as_deref(), Some(faction.key.as_str()), "the cape names its faction");
        let emblem = emblems().iter().find(|found| found.id == faction.emblem).expect("its emblem");
        assert_eq!(emblem.source, Source::Faction { faction: faction.id, rank: 1 });
        let dye = cosmetics().iter().find(|found| found.id == faction.dye).expect("its dye");
        assert_eq!((dye.kind, dye.source), (CosmeticKind::Dye, Source::Faction { faction: faction.id, rank: 2 }));
        let slots: Vec<Slot> = wares(faction.id).iter().map(|named| named.kind.slot()).collect();
        let armour = [Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs];
        assert_eq!(
            slots,
            [[Slot::Cloak].as_slice(), &armour, &[Slot::Melee, Slot::Ranged]].concat(),
            "{}",
            faction.key
        );
        assert!(wares(faction.id).iter().all(|named| named.rarity == Rarity::Legendary));
        assert_eq!(wares(faction.id)[usize::from(CAPE)].id, faction.cape);
    }
}

#[test]
fn no_vestige_and_no_shape_opens_to_a_factions_piece() {
    let catalogue = crate::catalogue::catalogue();
    for rarity in Rarity::ALL {
        for slot in Slot::VESTIGE {
            assert!(catalogue.vestige_pool(rarity, slot).all(|named| named.faction.is_none()), "{rarity:?} {slot:?}");
        }
    }
}

#[test]
fn armour_sells_from_the_second_rank_and_weapons_from_the_third_pledged_or_not() {
    let numbers = factions();
    let mut character = seasoned();
    character.materials.aurem = 100_000;
    let [helm, weapon] = [1, 5];
    assert_eq!(
        character.ask(Ask::BuyFactionWare { faction: 2, ware: helm }, AT_COUNTER, &DICE),
        Err(Refusal::RankTooLow)
    );
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.reputation[1] = u64::from(numbers.armour_rank) * numbers.reputation_per_rank;
    assert_eq!(character.ask(Ask::BuyFactionWare { faction: 2, ware: helm }, AFIELD, &DICE), Err(Refusal::NotHere));
    let before = character.clone();
    assert_eq!(
        character.ask(Ask::BuyFactionWare { faction: 2, ware: weapon }, AT_COUNTER, &DICE),
        Err(Refusal::RankTooLow),
        "weapons wait a rank more"
    );
    assert_eq!(character, before, "a refusal changes nothing");
    assert!(character.ask(Ask::BuyFactionWare { faction: 2, ware: helm }, AT_COUNTER, &DICE).is_ok(), "unpledged");
    assert_eq!(character.materials.aurem, 100_000 - numbers.armour_aurem);
    let bought = character.items.values().map(|(item, _)| item).find(|item| item.named.is_some());
    let bought = bought.expect("the hood carried");
    assert_eq!(
        (bought.named.as_deref(), bought.rarity, bought.level),
        (Some("lamplighters_hood"), Rarity::Legendary, 20)
    );
    assert_eq!(character.carried_in(Slot::Head), 1 + before.carried_in(Slot::Head));
    character.allegiance.reputation[1] = u64::from(numbers.weapon_rank) * numbers.reputation_per_rank;
    assert!(character.ask(Ask::BuyFactionWare { faction: 2, ware: weapon }, AT_COUNTER, &DICE).is_ok());
    assert_eq!(character.materials.aurem, 100_000 - numbers.armour_aurem - numbers.weapon_aurem);
    assert_eq!(character.ask(Ask::BuyFactionWare { faction: 2, ware: 7 }, AT_COUNTER, &DICE), Err(Refusal::NoSuchItem));
    character.materials.aurem = numbers.armour_aurem - 1;
    assert_eq!(character.ask(Ask::BuyFactionWare { faction: 2, ware: helm }, AT_COUNTER, &DICE), Err(Refusal::Short));
}

#[test]
fn a_factions_piece_is_refused_with_its_slot_full() {
    let mut character = seasoned();
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.reputation[0] = 3 * factions().reputation_per_rank;
    character.materials.aurem = 1_000_000;
    let helm = 1;
    while character.carried_in(Slot::Head) < crate::character::CARRIED_MOST {
        assert!(character.ask(Ask::BuyFactionWare { faction: 1, ware: helm }, AT_COUNTER, &DICE).is_ok());
    }
    assert_eq!(
        character.ask(Ask::BuyFactionWare { faction: 1, ware: helm }, AT_COUNTER, &DICE),
        Err(Refusal::CarriedFull)
    );
}

#[test]
fn the_first_pledge_is_free_and_a_switch_costs_aurem_keeping_reputation() {
    let mut character = rich();
    assert_eq!(character.ask(Ask::Pledge { faction: 2 }, AFIELD, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(Ask::Pledge { faction: 4 }, AT_COUNTER, &DICE), Err(Refusal::NoSuchFaction));
    assert!(character.ask(Ask::Pledge { faction: 2 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!((character.allegiance.pledge, character.materials.aurem), (2, 20_000), "free the first time");
    assert_eq!(character.ask(Ask::Pledge { faction: 2 }, AT_COUNTER, &DICE), Err(Refusal::Pledged));
    character.allegiance.reputation[1] = 12_345;
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!((character.allegiance.pledge, character.materials.aurem), (1, 17_500));
    assert_eq!(character.reputation(2), 12_345, "reputation with the last is kept");
    character.materials.aurem = 100;
    let before = character.clone();
    assert_eq!(character.ask(Ask::Pledge { faction: 3 }, AT_COUNTER, &DICE), Err(Refusal::Short));
    assert_eq!(character, before, "a refusal changes nothing");
}

#[test]
fn the_cape_is_sold_only_to_the_pledged_and_kept_once() {
    let mut character = rich();
    assert_eq!(
        character.ask(Ask::BuyFactionWare { faction: 1, ware: CAPE }, AT_COUNTER, &DICE),
        Err(Refusal::NotPledged)
    );
    let mut caped = caped(1);
    assert_eq!(caped.materials.aurem, 20_000 - factions().cape_aurem);
    assert_eq!(caped.cape_worn(), Some(1));
    assert_eq!(caped.ask(Ask::BuyFactionWare { faction: 1, ware: CAPE }, AT_COUNTER, &DICE), Err(Refusal::Kept));
    let worn = caped.worn(Slot::Cloak).expect("the cape worn");
    assert_eq!(worn.level, 1, "any level may wear it");
}

#[test]
fn reputation_comes_from_kills_only_pledged_with_its_cape_worn() {
    let mut bare = rich();
    assert!(bare.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    let reward = bare.reward_kill(Foe::Brute, 2, 5, None, Difficulty::Normal);
    assert_eq!(bare.reputation(1), 0, "no cape, no reputation");
    let mut caped = caped(1);
    let rewarded = caped.reward_kill(Foe::Brute, 2, 5, None, Difficulty::Normal);
    assert_eq!(caped.reputation(1), u64::from(rewarded.xp));
    assert_eq!(reward.xp, rewarded.xp);
    // Pledged to another, the cape earns nothing.
    assert!(caped.ask(Ask::Pledge { faction: 3 }, AT_COUNTER, &DICE).is_ok());
    caped.reward_kill(Foe::Brute, 2, 5, None, Difficulty::Normal);
    assert_eq!((caped.reputation(1), caped.reputation(3)), (u64::from(rewarded.xp), 0));
}

#[test]
fn a_guilds_outposts_raise_what_a_kill_pays_each_boon_by_its_own_share() {
    let mut plain = caped(1);
    let paid = plain.reward_kill(Foe::Brute, 2, 5, None, Difficulty::Normal);
    let mut member = caped(1);
    member.boons = crate::guild::Boons { xp: 10, aurem: 15, reputation: 5 };
    let (xp, aurem) = (member.xp, member.materials.aurem);
    let boosted = member.reward_kill(Foe::Brute, 2, 5, None, Difficulty::Normal);
    assert_eq!(boosted.xp, paid.xp + paid.xp / 10);
    assert_eq!(boosted.aurem, paid.aurem + paid.aurem * 15 / 100);
    assert_eq!((member.xp - xp, member.materials.aurem - aurem), (u64::from(boosted.xp), boosted.aurem));
    assert_eq!(member.reputation(1), u64::from(paid.xp + paid.xp * 5 / 100), "reputation by its own boon alone");
}

#[test]
fn the_reputation_boon_raises_a_chest_s_and_the_abyss_boon_s_reputation_too() {
    let mut member = caped(1);
    member.boons = crate::guild::Boons { xp: 0, aurem: 0, reputation: 20 };
    let chest = member.open_chest(2, (5, Difficulty::Normal), None, &DICE).expect("a chest of tier 2");
    assert_eq!(member.reputation(1), u64::from(chest.xp + chest.xp / 5), "a chest's");
    let before = member.reputation(1);
    member.activity.this_week(0).boon = true;
    let more = member.boon_xp(0, 400, None);
    assert_eq!(member.reputation(1) - before, u64::from(more + more / 5), "the Abyss boon's");
}

#[test]
fn ranks_keep_the_emblem_then_the_dye_then_leave_packages_without_end() {
    let mut character = caped(3);
    let per_rank = factions().reputation_per_rank;
    character.allegiance.reputation[2] = per_rank;
    character.earn_due();
    assert!(character.keeps_emblem("veiled") && !character.keeps_cosmetic("veiled_dusk"), "rank 1");
    character.allegiance.reputation[2] = 2 * per_rank;
    character.earn_due();
    assert!(character.keeps_cosmetic("veiled_dusk"), "rank 2");
    assert_eq!(character.packages(3), 0);
    character.allegiance.reputation[2] = 41 * per_rank;
    assert_eq!((character.rank(3), character.packages(3)), (41, 39), "no rank is the last");
    let carried = character.vestiges.len();
    let aurem = character.materials.aurem;
    assert!(character.ask(Ask::CollectPackage { faction: 3 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!((character.packages(3), character.vestiges.len()), (38, carried + 1));
    assert_eq!(character.materials.aurem, aurem + factions().package_aurem);
    let (opened, _) = character.vestiges.values().last().cloned().expect("the package's Vestige");
    assert!(matches!(opened.rarity, Rarity::Rare | Rarity::Legendary));
    assert_eq!(character.ask(Ask::CollectPackage { faction: 1 }, AT_COUNTER, &DICE), Err(Refusal::NoPackage));
    while character.vestiges.len() < VESTIGES_MOST {
        let id = character.take_id();
        character.vestiges.insert(id, (Vestige::new(id, Rarity::Magic, Slot::Head, 1), false));
    }
    assert_eq!(character.ask(Ask::CollectPackage { faction: 3 }, AT_COUNTER, &DICE), Err(Refusal::VestigesFull));
}

#[test]
fn a_save_from_before_the_factions_reads_pledged_to_none() {
    let mut kept: serde_json::Value = serde_json::from_str(&caped(2).to_json()).expect("a character");
    kept.as_object_mut().expect("an object").remove("allegiance");
    let back = Character::from_json(&kept.to_string()).expect("an old save reads");
    assert_eq!((back.allegiance.pledge, back.reputation(2), back.packages(2)), (0, 0, 0));
    assert!(back.items.values().any(|(item, at)| item.kind.slot() == Slot::Cloak && *at == At::Worn(Slot::Cloak)));
    let broken = kept.to_string().replacen('{', "{\"allegiance\":{\"pledge\":9,\"reputation\":[5]},", 1);
    let back = Character::from_json(&broken).expect("a broken save reads");
    assert_eq!((back.allegiance.pledge, back.reputation(1), back.allegiance.reputation.len()), (0, 5, 3));
}

#[test]
fn a_dismantled_factions_weapon_gives_back_as_a_normal_piece_so_faction_gear_makes_no_essence() {
    let mut character = seasoned();
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.reputation[2] = 3 * factions().reputation_per_rank;
    assert!(character.ask(Ask::BuyFactionWare { faction: 3, ware: 6 }, AT_COUNTER, &DICE).is_ok());
    let bow = character.items.values().find(|(item, _)| item.named.as_deref() == Some("nightpin"));
    let bow = bow.expect("the bow carried").0.id;
    let before = character.materials.clone();
    assert!(character.ask(Ask::Dismantle { item: bow }, AFIELD, &DICE).is_ok());
    assert_eq!((character.materials.weapon_essence, character.materials.weapon_fragments), (0, 0));
    assert_eq!(character.materials.aurem, before.aurem + 20);
}

#[test]
fn a_dismantled_cape_gives_back_as_a_normal_piece_so_capes_make_no_essence() {
    let mut character = caped(2);
    let cape = character.worn(Slot::Cloak).expect("worn").id;
    assert!(character.ask(Ask::TakeOff { slot: Slot::Cloak }, AFIELD, &DICE).is_ok());
    let before = character.materials.clone();
    assert!(character.ask(Ask::Dismantle { item: cape }, AFIELD, &DICE).is_ok());
    assert_eq!((character.materials.armor_essence, character.materials.armor_fragments), (0, 0));
    assert_eq!(character.materials.aurem, before.aurem + 20);
}

#[test]
fn a_factions_armour_and_weapons_wait_on_level_20_and_the_cape_does_not() {
    let mut character = rich();
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.reputation[0] = 3 * factions().reputation_per_rank;
    character.xp = crate::power::xp_for_level(19);
    let before = character.clone();
    for ware in [1, 5] {
        let ask = Ask::BuyFactionWare { faction: 1, ware };
        assert_eq!(character.ask(ask, AT_COUNTER, &DICE), Err(Refusal::TooLow), "ware {ware}");
    }
    assert_eq!(character, before, "a refusal changes nothing");
    assert!(character.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    character.xp = 0;
    assert!(character.ask(Ask::BuyFactionWare { faction: 1, ware: CAPE }, AT_COUNTER, &DICE).is_ok(), "the cape");
}

#[test]
fn a_factions_weapon_may_roll_an_element_as_every_weapon_made_does() {
    let mut character = seasoned();
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.reputation[0] = 3 * factions().reputation_per_rank;
    let mut rolled = 0;
    for tick in 0..40 {
        let dice = Dice { seed: 9, tick, player: 1 };
        character.materials.aurem = 20_000;
        for ware in [1, 5] {
            assert!(character.ask(Ask::BuyFactionWare { faction: 1, ware }, AT_COUNTER, &dice).is_ok());
        }
        let bought: Vec<Item> = character.items.values().map(|(item, _)| item.clone()).collect();
        assert!(bought.iter().filter(|item| item.kind.armour()).all(|item| item.element.is_none()), "armour, never");
        rolled += bought.iter().filter(|item| item.kind.weapon() && item.element.is_some()).count();
        character.items.retain(|_, (item, _)| item.named.is_none());
    }
    assert!((8..32).contains(&rolled), "{rolled} of 40 Squallbreaks with an element, about one in two");
}

#[test]
fn a_dismantled_factions_piece_gives_back_a_third_of_the_essence_spent_on_it() {
    let mut character = seasoned();
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.reputation[0] = 2 * factions().reputation_per_rank;
    assert!(character.ask(Ask::BuyFactionWare { faction: 1, ware: 1 }, AT_COUNTER, &DICE).is_ok());
    let (id, helm) = character.items.iter_mut().find(|(_, (item, _))| item.named.is_some()).expect("the helm");
    let id = *id;
    helm.0.bought = u32::MAX;
    let spent = helm.0.essence_spent();
    assert!(spent >= 3, "its upgrades cost Essence: {spent}");
    let before = character.materials.clone();
    assert!(character.ask(Ask::Dismantle { item: id }, AFIELD, &DICE).is_ok());
    let back = u32::from(character.materials.armor_essence - before.armor_essence);
    assert_eq!((back, character.materials.armor_fragments), (spent / 3, before.armor_fragments));
    assert_eq!(character.materials.aurem, before.aurem + 20, "as a Normal piece");
}

#[test]
fn a_cape_stored_in_the_vault_is_still_the_one_cape_kept() {
    let mut character = caped(2);
    let cape = character.worn(Slot::Cloak).map(|item| item.id).expect("the cape worn");
    assert!(character.ask(Ask::TakeOff { slot: Slot::Cloak }, AT_COUNTER, &DICE).is_ok());
    assert!(character.ask(Ask::Store { item: cape }, AT_COUNTER, &DICE).is_ok());
    assert_eq!(character.items.get(&cape).map(|(_, at)| *at), Some(At::Vault));
    let again = Ask::BuyFactionWare { faction: 2, ware: CAPE };
    assert_eq!(character.ask(again, AT_COUNTER, &DICE), Err(Refusal::Kept));
}

#[test]
fn a_package_opens_to_a_vestige_of_no_higher_level_than_items_are_made_at() {
    let mut character = caped(3);
    character.xp = crate::power::xp_for_level(20);
    for (kind, slot) in [(Kind::Head, Slot::Head), (Kind::Torso, Slot::Torso), (Kind::Arms, Slot::Arms)] {
        let id = character.take_id();
        character.items.insert(id, (Item::new(id, kind, Rarity::Atheric, 20, slot), At::Worn(slot)));
    }
    assert!(character.level() > crate::item::ITEM_LEVEL_MOST, "past 20 by Prestige");
    character.allegiance.reputation[2] = 3 * factions().reputation_per_rank;
    assert!(character.ask(Ask::CollectPackage { faction: 3 }, AT_COUNTER, &DICE).is_ok());
    let (opened, _) = character.vestiges.values().last().cloned().expect("the package's Vestige");
    assert_eq!(opened.level, crate::item::ITEM_LEVEL_MOST);
}
