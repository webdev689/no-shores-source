//! The factions' own perks: offered by no shared pool and fitting only their faction's pieces, rolled onto every
//! faction armour piece and weapon bought beside the shared pools' traits, and kept as rolled when a character is read.

use crate::asks::{Ask, Here};
use crate::catalogue::{TraitColumn, TraitDef, catalogue};
use crate::character::Character;
use crate::dice::Dice;
use crate::factions::{factions, wares};
use crate::grid::columns;
use crate::item::{Item, NONE_CHOSEN};
use crate::kinds::Kind;
use crate::rarity::Rarity;

const AT_COUNTER: Here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };

fn faction_perks() -> Vec<&'static TraitDef> {
    catalogue().traits.iter().filter(|found| found.faction.is_some()).collect()
}

/// A level-20 character rich enough and ranked high enough with every faction to buy any of its wares.
fn ranked() -> Character {
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(20);
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    let rank = u64::from(factions().weapon_rank.max(factions().armour_rank));
    for reputation in &mut character.allegiance.reputation {
        *reputation = rank * factions().reputation_per_rank;
    }
    character
}

/// Buys a faction's ware with these dice, answering the piece made.
fn buy(character: &mut Character, faction: u8, ware: u8, dice: &Dice) -> Item {
    character.materials.aurem = 25_000;
    character.items.clear();
    assert!(character.ask(Ask::BuyFactionWare { faction, ware }, AT_COUNTER, dice).is_ok(), "{faction}/{ware}");
    character.items.values().map(|(item, _)| item.clone()).next().expect("the piece bought")
}

#[test]
fn the_nine_faction_perks_are_three_a_faction_each_a_perk_of_a_faction_the_file_holds() {
    let perks = faction_perks();
    assert_eq!(perks.len(), 9);
    for faction in &factions().factions {
        let own: Vec<&str> = (perks.iter())
            .filter(|found| found.faction.as_deref() == Some(faction.key.as_str()))
            .map(|found| found.fits.as_str())
            .collect();
        assert_eq!(own.len(), 3, "{}", faction.key);
        assert_eq!(own.iter().filter(|fits| **fits == "armour").count(), 1, "one for armour: {}", faction.key);
    }
    assert!(perks.iter().all(|found| found.column == TraitColumn::Perk));
    assert!(catalogue().problems().is_empty(), "{:?}", catalogue().problems());
}

#[test]
fn a_faction_perk_naming_no_faction_is_a_problem() {
    let mut content = catalogue().clone();
    let found = content.traits.iter_mut().find(|found| found.id == "kindling").expect("Kindling");
    found.faction = Some("nobody".to_owned());
    assert!(content.problems().iter().any(|problem| problem.contains("kindling")), "{:?}", content.problems());
}

#[test]
fn the_shared_pools_never_offer_a_faction_perk() {
    for kind in Kind::ALL {
        for rarity in Rarity::ALL {
            for column in columns(rarity, kind.weapon_grid()) {
                let pool = catalogue().pool(*column, kind);
                assert!(pool.iter().all(|found| found.faction.is_none()), "{kind:?} {rarity:?} {column:?}");
            }
        }
    }
}

#[test]
fn a_faction_perk_fits_only_its_own_factions_pieces() {
    for perk in faction_perks() {
        for kind in Kind::ALL {
            assert!(!catalogue().trait_fits(&perk.id, kind, None, false), "{} on a rolled {kind:?}", perk.id);
        }
        for named in &catalogue().items {
            let own = named.faction == perk.faction;
            let fits = catalogue().trait_fits(&perk.id, named.kind, Some(&named.id), false);
            let shaped = match perk.fits.as_str() {
                "armour" => named.kind.armour(),
                "melee" => named.kind.weapon() && !named.kind.ranged(),
                _ => named.kind.weapon(),
            };
            assert_eq!(fits, own && shaped, "{} on {}", perk.id, named.id);
        }
    }
}

#[test]
fn a_bought_faction_piece_always_offers_one_of_its_factions_perks_beside_the_shared_pools() {
    let mut character = ranked();
    for faction in &factions().factions {
        for (ware, named) in wares(faction.id).into_iter().enumerate().filter(|(_, named)| named.kind != Kind::Cloak) {
            let mut layouts = Vec::new();
            for tick in 0..12 {
                let dice = Dice { seed: 3, tick, player: 1 };
                let item = buy(&mut character, faction.id, u8::try_from(ware).expect("a ware"), &dice);
                assert_eq!((item.named.as_deref(), item.rarity), (Some(named.id.as_str()), named.rarity));
                let offered: Vec<&String> = item.layout.iter().flatten().collect();
                let own: Vec<&&String> = (offered.iter())
                    .filter(|id| catalogue().trait_def(id).is_some_and(|found| found.faction.is_some()))
                    .collect();
                assert_eq!(own.len(), 1, "one faction perk on {}: {offered:?}", named.id);
                let perk = catalogue().trait_def(own[0]).expect("a trait");
                assert_eq!(perk.faction.as_deref(), Some(faction.key.as_str()), "{}", named.id);
                assert!(
                    catalogue().trait_fits(&perk.id, item.kind, Some(&named.id), false),
                    "{} fits {}",
                    perk.id,
                    named.id
                );
                let mut unique = offered.clone();
                unique.sort();
                unique.dedup();
                assert_eq!(unique.len(), offered.len(), "no trait twice: {offered:?}");
                let trait_columns = item.columns().iter().filter(|column| column.traits());
                for (column, traits) in trait_columns.zip(&item.layout) {
                    assert_eq!(traits.len(), usize::from(column.nodes()), "{} {column:?}", named.id);
                    let pool = catalogue().pool(*column, item.kind);
                    let shared = |id: &String| pool.iter().any(|found| found.id == *id);
                    assert!(traits.iter().all(|id| shared(id) || *id == perk.id), "{} {traits:?}", named.id);
                }
                layouts.push(item.layout);
            }
            layouts.dedup();
            assert!(layouts.len() > 1, "{}'s traits are rolled, not written", named.id);
        }
    }
}

#[test]
fn a_kept_faction_piece_keeps_the_layout_it_rolled() {
    let mut character = ranked();
    let dice = Dice { seed: 5, tick: 2, player: 1 };
    let mut item = buy(&mut character, 3, 5, &dice);
    let perk_column = item.columns().iter().position(|column| matches!(column, crate::grid::Column::Perk(_)));
    let perk_column = perk_column.expect("a perk column");
    item.xp = item.xp_most();
    item.bought = u32::MAX;
    item.chosen[perk_column] = 0;
    let rolled = item.clone();
    let before = character.materials.clone();
    let kept = crate::old_hands::unfit(&mut character, item);
    assert_eq!(kept.layout, rolled.layout, "never its entry's written layout");
    assert_eq!((kept.bought, &kept.chosen), (rolled.bought, &rolled.chosen), "every node kept");
    assert_eq!(character.materials, before, "nothing given back");
    let own = kept.active_traits().find(|id| catalogue().trait_def(id).is_some_and(|found| found.faction.is_some()));
    assert!(own.is_some(), "its faction perk, chosen, is given while worn");
}

#[test]
fn a_faction_piece_kept_from_before_keeps_its_old_layout_where_its_traits_still_fit() {
    let mut character = ranked();
    let entry = catalogue().named("veiled_cowl").expect("the Veiled Cowl");
    let mut cowl = crate::vestige::named_item(1, entry, Kind::Head.slot());
    cowl.layout = vec![
        vec!["sure_footing".into(), "forager".into()],
        vec!["second_wind".into(), "hardy".into()],
        vec!["unshaken".into(), "scholar".into()],
    ];
    cowl.xp = cowl.xp_most();
    cowl.bought = u32::MAX;
    let kept = crate::old_hands::unfit(&mut character, cowl.clone());
    assert_eq!((kept.layout, kept.bought), (cowl.layout, cowl.bought));
    assert!(kept.chosen.iter().all(|node| *node == NONE_CHOSEN));
}

#[test]
fn a_rolled_piece_offering_a_faction_perk_gives_its_node_back() {
    let mut character = ranked();
    let mut helm = Item::new(1, Kind::Head, Rarity::Legendary, 20, Kind::Head.slot());
    helm.layout = vec![
        vec!["squall_step".into(), "forager".into()],
        vec!["second_wind".into(), "hardy".into()],
        vec!["unshaken".into(), "scholar".into()],
    ];
    helm.xp = helm.xp_most();
    helm.bought = helm.node_bit(0, 0).expect("a node");
    helm.chosen[0] = 0;
    let kept = crate::old_hands::unfit(&mut character, helm);
    assert!(kept.active_traits().all(|id| id != "squall_step"), "no faction perk on a rolled helm");
    assert_eq!(kept.chosen[0], NONE_CHOSEN);
}
