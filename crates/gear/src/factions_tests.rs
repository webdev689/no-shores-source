//! The factions: their file read whole, pledging and switching, reputation earned only pledged with the cape worn,
//! the ranks' emblem, dye and packages, and the cape sold only to the pledged.

use crate::asks::{Ask, Here, Refusal};
use crate::character::{At, Character, VESTIGES_MOST, Vestige};
use crate::cosmetics::{CosmeticKind, cosmetics};
use crate::dice::Dice;
use crate::emblems::{Source, emblems};
use crate::factions::factions;
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::rewards::Foe;
use crate::world::Difficulty;

const AT_COUNTER: Here = Here { social: true, day: 0, week: 0 };
const AFIELD: Here = Here { social: false, day: 0, week: 0 };
const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };

fn rich() -> Character {
    let mut character = Character::starting();
    character.materials.aurem = 20_000;
    character
}

/// Pledges, buys the cape and wears it.
fn caped(faction: u8) -> Character {
    let mut character = rich();
    assert_eq!(character.ask(Ask::Pledge { faction }, AT_COUNTER, &DICE).map(|_| ()), Ok(()));
    assert_eq!(character.ask(Ask::BuyCape { faction }, AT_COUNTER, &DICE).map(|_| ()), Ok(()));
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
    }
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
    assert_eq!(character.ask(Ask::BuyCape { faction: 1 }, AT_COUNTER, &DICE), Err(Refusal::NotPledged));
    let mut caped = caped(1);
    assert_eq!(caped.materials.aurem, 20_000 - factions().cape_aurem);
    assert_eq!(caped.cape_worn(), Some(1));
    assert_eq!(caped.ask(Ask::BuyCape { faction: 1 }, AT_COUNTER, &DICE), Err(Refusal::Kept));
    let worn = caped.worn(Slot::Cloak).expect("the cape worn");
    assert_eq!(worn.level, 1, "any level may wear it");
}

#[test]
fn reputation_comes_from_kills_only_pledged_with_its_cape_worn() {
    let mut bare = rich();
    assert!(bare.ask(Ask::Pledge { faction: 1 }, AT_COUNTER, &DICE).is_ok());
    let reward = bare.reward_kill(Foe::Brute, 5, None, Difficulty::Calm, &DICE);
    assert_eq!(bare.reputation(1), 0, "no cape, no reputation");
    let mut caped = caped(1);
    let rewarded = caped.reward_kill(Foe::Brute, 5, None, Difficulty::Calm, &DICE);
    assert_eq!(caped.reputation(1), u64::from(rewarded.xp));
    assert_eq!(reward.xp, rewarded.xp);
    // Pledged to another, the cape earns nothing.
    assert!(caped.ask(Ask::Pledge { faction: 3 }, AT_COUNTER, &DICE).is_ok());
    caped.reward_kill(Foe::Brute, 5, None, Difficulty::Calm, &DICE);
    assert_eq!((caped.reputation(1), caped.reputation(3)), (u64::from(rewarded.xp), 0));
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
    let (opened, _) = character.vestiges.values().last().copied().expect("the package's Vestige");
    assert!(matches!(opened.rarity, Rarity::Rare | Rarity::Legendary));
    assert_eq!(character.ask(Ask::CollectPackage { faction: 1 }, AT_COUNTER, &DICE), Err(Refusal::NoPackage));
    while character.vestiges.len() < VESTIGES_MOST {
        let id = character.take_id();
        character.vestiges.insert(id, (Vestige { id, rarity: Rarity::Magic, slot: Slot::Head, level: 1 }, false));
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
