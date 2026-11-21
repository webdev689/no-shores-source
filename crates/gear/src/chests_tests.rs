//! A public event's chest pays more with each tier, always a Vestige, and reputation as a kill does.

use crate::asks::{Ask, Here};
use crate::character::Character;
use crate::chests::{CHEST_AUREM, CHEST_XP};
use crate::dice::Dice;
use crate::kinds::{Slot, Stock};

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };

#[test]
fn each_tier_pays_more_and_always_holds_a_vestige_and_no_tier_past_four_opens() {
    let mut paid = Vec::new();
    for tier in 1..=4 {
        let mut character = Character::starting();
        let chest = character.open_chest(tier, 5, Some(0), &DICE).expect("a chest of this tier");
        assert_eq!((chest.xp, chest.aurem), (CHEST_XP[usize::from(tier) - 1], CHEST_AUREM[usize::from(tier) - 1]));
        assert_eq!(character.materials.aurem, Character::starting().materials.aurem + chest.aurem);
        paid.push((chest.xp, character.materials.fragments(Stock::Weapon), character.materials.resource(0)));
    }
    assert!(paid.windows(2).all(|pair| pair[0].0 < pair[1].0 && pair[0].1 < pair[1].1 && pair[0].2 < pair[1].2));
    assert_eq!(Character::starting().open_chest(5, 5, None, &DICE), None);
    assert_eq!(Character::starting().open_chest(0, 5, None, &DICE), None);
}

#[test]
fn a_heroic_chest_draws_the_better_colours_and_the_bonus_keeps_the_better_of_two() {
    let colour = |tier: u8| {
        (0..200_u64)
            .map(|tick| {
                let dice = Dice { tick, ..DICE };
                Character::starting().open_chest(tier, 20, None, &dice).expect("a chest").vestige.rarity as u32
            })
            .sum::<u32>()
    };
    let (won, bonus, heroic, both) = (colour(1), colour(2), colour(3), colour(4));
    assert!(won < bonus && bonus < heroic && heroic < both, "{won} {bonus} {heroic} {both}");
}

#[test]
fn a_chest_pays_reputation_to_the_faction_pledged_while_its_cape_is_worn() {
    let here = Here { social: true, day: 0, pledge: 0, rank: 0, week: 0 };
    let mut character = Character::starting();
    character.materials.aurem = 20_000;
    assert!(character.ask(Ask::Pledge { faction: 1 }, here, &DICE).is_ok());
    assert!(character.ask(Ask::BuyFactionWare { faction: 1, ware: 0 }, here, &DICE).is_ok());
    let cape = character.items.iter().find(|(_, (item, _))| item.kind.slot() == Slot::Cloak).map(|(id, _)| *id);
    let afield = Here { social: false, ..here };
    assert!(character.ask(Ask::Wear { item: cape.unwrap(), slot: Slot::Cloak }, afield, &DICE).is_ok());
    let chest = character.open_chest(2, 5, None, &DICE).unwrap();
    assert_eq!(character.reputation(1), u64::from(chest.xp));
}
