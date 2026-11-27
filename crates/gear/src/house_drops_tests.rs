//! A house's pieces in the loot: one in ten of the Magic and Rare pieces a Vestige of the world or a dungeon (a
//! patrol's, the Elite and Abyss Dungeons', the sea's and the Breaches') opens to is a piece of the player's pledged
//! house, its four armour pieces and its weapons, at the rarity and level opened, the rest of a dungeon's its own sets;
//! none for a player not pledged, and never a ware.

use crate::asks::{Ask, Done, Here};
use crate::character::{Character, Vestige};
use crate::dice::Dice;
use crate::factions::{factions, wares};
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::source::Source;

const SOCIAL: Here = Here { social: true, day: 4, pledge: 0, rank: 0, week: 0 };
const OPENED: u64 = 4_000;

/// A character pledged to `house` (0 none) at level 10.
fn pledged(house: u8) -> Character {
    let mut character = Character::starting();
    character.xp = crate::power::xp_for_level(10);
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.pledge = house;
    character
}

/// Opens `count` sealed Vestiges of `colour` from `source` at the Mage's, each on dice of its own, and gives back what
/// each opened to, taking it away so the slot never fills.
fn opened(character: &mut Character, colour: Rarity, source: Source, count: u64) -> Vec<crate::item::Item> {
    let slots = [Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs, Slot::Melee, Slot::Ranged];
    (0..count)
        .filter_map(|seed| {
            let slot = slots[usize::try_from(seed).unwrap_or(0) % slots.len()];
            let id = character.take_id();
            character.vestiges.insert(id, (Vestige { id, ..Vestige::new(id, colour, slot, 10).from(source) }, false));
            let dice = Dice { seed, tick: 7, player: 1 };
            let Ok(Done::Identified(item)) = character.ask(Ask::Identify { vestige: id }, SOCIAL, &dice) else {
                return None;
            };
            character.items.remove(&item).map(|(item, _)| item)
        })
        .collect()
}

#[test]
fn one_in_ten_of_the_worlds_magic_and_rare_pieces_is_the_pledged_houses_own_and_none_for_the_unpledged() {
    let key = &factions().faction(2).expect("a house").key;
    let own: Vec<&str> =
        wares(2).iter().filter(|named| named.kind.slot() != Slot::Cloak).map(|named| named.id.as_str()).collect();
    for colour in [Rarity::Magic, Rarity::Rare] {
        let mut character = pledged(2);
        let opened_all = opened(&mut character, colour, Source::World, OPENED);
        // The share is of the Magic and Rare pieces opened: a Vestige may open below or above its colour.
        let pieces: Vec<_> =
            opened_all.iter().filter(|item| matches!(item.rarity, Rarity::Magic | Rarity::Rare)).collect();
        let house: Vec<_> = pieces.iter().copied().filter(|item| item.named.is_some()).collect();
        let share = house.len() as f64 / pieces.len() as f64;
        assert!((0.08..0.12).contains(&share), "{colour:?}: {share}");
        for item in &house {
            let named = item.named.as_deref().expect("named");
            assert!(own.contains(&named), "{named}: the Lamplighters' armour or weapons alone, never the cape");
            assert!(matches!(item.rarity, Rarity::Magic | Rarity::Rare), "{named}: {:?}", item.rarity);
            assert_eq!((item.level, item.source), (10, Source::Faction), "{named}");
            assert!(!item.layout.is_empty(), "{named}: its perks rolled");
            let entry = crate::catalogue::catalogue().named(named).expect("its entry");
            assert_eq!((entry.kind, entry.faction.as_ref()), (item.kind, Some(key)), "{named}: its kind and house");
        }
        let kinds: std::collections::BTreeSet<_> = house.iter().map(|item| item.named.clone()).collect();
        assert_eq!(kinds.len(), own.len(), "each of its pieces drops: {kinds:?}");
        assert!(opened(&mut pledged(0), colour, Source::World, OPENED / 4).iter().all(|item| item.named.is_none()));
    }
}

#[test]
fn the_dungeons_drop_the_houses_pieces_too_and_their_own_sets_otherwise_and_a_legendary_is_never_one() {
    for source in [Source::Dungeon, Source::Elite, Source::Abyss, Source::Sea, Source::Breach] {
        let pieces = opened(&mut pledged(1), Rarity::Rare, source, 600);
        let house = pieces.iter().filter(|item| item.named.is_some()).count();
        assert!((30..90).contains(&house), "{source:?}: about one in ten its house's, {house} of 600");
        let lesser = |item: &&crate::item::Item| matches!(item.rarity, Rarity::Magic | Rarity::Rare);
        let own: Vec<_> = pieces.iter().filter(lesser).filter(|item| item.named.is_none()).collect();
        assert!(own.len() > 400 && own.iter().all(|item| item.source == source), "{source:?}: the rest its own");
    }
    let legendary = opened(&mut pledged(1), Rarity::Legendary, Source::World, 600);
    let house = |item: &&crate::item::Item| item.named.as_deref().is_some_and(crate::factions::sold_by_faction);
    assert!(legendary.iter().filter(house).all(|item| matches!(item.rarity, Rarity::Magic | Rarity::Rare)));
    // Nothing a house sells changes: its wares are still its Legendary pieces.
    for house in 1..=3 {
        assert!(wares(house).iter().all(|named| named.rarity == Rarity::Legendary));
    }
}
