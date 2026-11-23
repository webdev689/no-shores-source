//! The Breaches' own perks: offered by no shared pool and fitting only a Breach's pieces, every node of a Breach
//! piece's perk columns rolled from them while its other columns roll from the shared pools, and kept as rolled when a
//! character is read.

use crate::catalogue::{TraitColumn, TraitDef, catalogue};
use crate::character::Character;
use crate::dice::Dice;
use crate::grid::{Column, columns};
use crate::item::{Item, NONE_CHOSEN};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;
use crate::source::Source;

fn breach_perks() -> Vec<&'static TraitDef> {
    catalogue().traits.iter().filter(|found| found.breach).collect()
}

/// Breach pieces made by a Vestige across many dice: every armour and weapon slot, at each rarity with perk columns.
fn breach_pieces() -> Vec<Item> {
    let mut pieces = Vec::new();
    for seed in 0..40 {
        let dice = Dice { seed, tick: 3, player: 1 };
        for slot in Slot::VESTIGE {
            for rarity in [Rarity::Magic, Rarity::Rare, Rarity::Legendary] {
                pieces.push(crate::vestige::make(1, rarity, slot, 20, Source::Breach, &dice).expect("a piece"));
            }
        }
    }
    pieces
}

/// Each trait column of an item beside the traits it offers.
fn offered(item: &Item) -> Vec<(Column, &Vec<String>)> {
    item.columns().iter().copied().filter(|column| column.traits()).zip(&item.layout).collect()
}

#[test]
fn the_eight_breach_perks_are_perks_of_the_breaches_alone() {
    let perks = breach_perks();
    let named: Vec<(&str, &str)> = perks.iter().map(|found| (found.name.as_str(), found.fits.as_str())).collect();
    assert_eq!(
        named,
        [
            ("Shatterpoint", "melee"),
            ("Vein Strike", "weapon"),
            ("Bloom", "weapon"),
            ("Crystal Sight", "ranged"),
            ("Crystal Skin", "armour"),
            ("Regrowth", "armour"),
            ("Resonance", "armour"),
            ("Lattice Wall", "shield"),
        ]
    );
    assert!(perks.iter().all(|found| found.column == TraitColumn::Perk && found.faction.is_none()));
    assert!(catalogue().problems().is_empty(), "{:?}", catalogue().problems());
}

#[test]
fn a_breach_perk_that_is_no_perk_or_a_factions_too_is_a_problem() {
    for spoil in [
        |found: &mut TraitDef| found.column = TraitColumn::Finish,
        |found: &mut TraitDef| {
            found.faction = Some("veiled".to_owned());
        },
    ] {
        let mut content = catalogue().clone();
        spoil(content.traits.iter_mut().find(|found| found.id == "bloom").expect("Bloom"));
        assert!(content.problems().iter().any(|problem| problem.contains("bloom")), "{:?}", content.problems());
    }
}

#[test]
fn the_shared_pools_and_the_factions_never_offer_a_breach_perk() {
    for kind in Kind::ALL {
        for rarity in Rarity::ALL {
            for column in columns(rarity, kind.weapon_grid()) {
                let pool = catalogue().pool(*column, kind);
                assert!(pool.iter().all(|found| !found.breach), "{kind:?} {rarity:?} {column:?}");
            }
        }
        for faction in &crate::factions::factions().factions {
            assert!(catalogue().faction_perks(&faction.key, kind).iter().all(|found| !found.breach));
        }
    }
    let wares = catalogue().items.iter().filter(|named| named.faction.is_some() && named.kind != Kind::Cloak);
    for (nth, named) in wares.enumerate() {
        let dice = Dice { seed: u64::try_from(nth).unwrap_or_default(), tick: 1, player: 1 };
        let piece = crate::vestige::made_named(1, named, named.kind.slot(), &dice);
        assert!(!piece.breach, "{}", named.id);
        assert!(piece.layout.iter().flatten().all(|id| breach_perks().iter().all(|found| found.id != *id)));
    }
}

#[test]
fn a_breach_piece_rolls_its_perks_from_the_breaches_pool_and_its_other_columns_from_the_shared_pools() {
    for piece in breach_pieces() {
        assert!(piece.breach && piece.source == Source::Breach, "{:?}", piece.kind);
        let own = catalogue().breach_perks(piece.kind);
        for (column, traits) in offered(&piece) {
            assert_eq!(traits.len(), usize::from(column.nodes()), "{:?} {column:?} filled", piece.kind);
            let mut unique = traits.clone();
            unique.sort_unstable();
            unique.dedup();
            assert_eq!(unique.len(), traits.len(), "never one trait twice in a column: {traits:?}");
            for id in traits {
                let shared = catalogue().pool(column, piece.kind).iter().any(|found| found.id == *id);
                let breach = own.iter().any(|found| found.id == *id);
                let from = if matches!(column, Column::Perk(_)) { breach } else { shared };
                assert!(from, "{id} in a {:?}'s {column:?}", piece.kind);
            }
        }
    }
}

#[test]
fn a_breach_legendary_armour_piece_climbs_to_thirty_prestige_and_its_weapon_carries_none() {
    let dice = Dice { seed: 9, tick: 3, player: 1 };
    let mut helm = crate::vestige::make(1, Rarity::Legendary, Slot::Head, 20, Source::Breach, &dice).expect("a helm");
    helm.xp = helm.xp_most();
    helm.bought = u32::MAX;
    assert_eq!(helm.prestige(), 30);
    let blade = crate::vestige::make(1, Rarity::Legendary, Slot::Melee, 20, Source::Breach, &dice).expect("a blade");
    assert!(blade.breach && blade.prestige() == 0);
}

#[test]
fn a_piece_from_anywhere_else_is_no_breach_piece_and_offers_no_breach_perk() {
    for source in Source::ALL.into_iter().filter(|source| *source != Source::Breach) {
        let dice = Dice { seed: 4, tick: 3, player: 1 };
        for slot in Slot::VESTIGE {
            let piece = crate::vestige::make(1, Rarity::Legendary, slot, 20, source, &dice).expect("a piece");
            assert!(!piece.breach, "{source:?} {slot:?}");
            assert!(piece.layout.iter().flatten().all(|id| breach_perks().iter().all(|found| found.id != *id)));
        }
    }
}

#[test]
fn a_kept_breach_piece_keeps_the_layout_it_rolled_and_gives_its_perks() {
    for piece in breach_pieces().into_iter().filter(|piece| piece.rarity == Rarity::Legendary) {
        let mut character = Character::starting();
        let mut item = piece;
        item.xp = item.xp_most();
        item.bought = u32::MAX;
        let perk_column = item.columns().iter().position(|column| matches!(column, Column::Perk(_)));
        item.chosen[perk_column.expect("a perk column")] = 0;
        let rolled = item.clone();
        let before = character.materials.clone();
        let kept = crate::old_hands::unfit(&mut character, item);
        assert_eq!(kept.layout, rolled.layout);
        assert_eq!((kept.bought, &kept.chosen), (rolled.bought, &rolled.chosen), "every node kept");
        assert_eq!(character.materials, before, "nothing given back");
        assert!(kept.active_traits().any(|id| breach_perks().iter().any(|found| found.id == id)), "its perk given");
    }
}

#[test]
fn a_rolled_piece_from_elsewhere_offering_a_breach_perk_gives_its_node_back() {
    let mut character = Character::starting();
    let mut helm = Item::new(1, Kind::Head, Rarity::Legendary, 20, Kind::Head.slot());
    helm.layout = vec![
        vec!["regrowth".into(), "forager".into()],
        vec!["second_wind".into(), "hardy".into()],
        vec!["unshaken".into(), "scholar".into()],
    ];
    helm.xp = helm.xp_most();
    helm.bought = helm.node_bit(0, 0).expect("a node");
    helm.chosen[0] = 0;
    let kept = crate::old_hands::unfit(&mut character, helm);
    assert!(kept.active_traits().all(|id| id != "regrowth"), "no Breach perk on a world helm");
    assert_eq!(kept.chosen[0], NONE_CHOSEN);
}
