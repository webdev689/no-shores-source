//! A public event's chest pays more with each tier, always a Vestige, and reputation as a kill does.

use crate::asks::{Ask, Here};
use crate::character::Character;
use crate::dice::Dice;
use crate::kinds::{Slot, Stock};
use crate::world::Difficulty;

const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };

#[test]
fn each_tier_pays_more_and_always_holds_a_vestige_and_no_tier_past_four_opens() {
    // Each tier's XP, Aurem, Fragments and Essence of each stock and the island's resource, at level 5 and level 10.
    let at_five = [(1_500, 120, 2, 0, 3), (2_200, 180, 3, 0, 4), (3_200, 260, 5, 1, 6), (4_500, 360, 7, 2, 8)];
    let at_ten = [(2_250, 180), (3_300, 270), (4_800, 390), (6_750, 540)];
    for (tier, (five, ten)) in (1..=4).zip(at_five.into_iter().zip(at_ten)) {
        let mut character = Character::starting();
        let chest = character.open_chest(tier, (5, Difficulty::Normal), Some(0), &DICE).expect("a chest of this tier");
        assert_eq!((chest.xp, chest.aurem), (five.0, five.1), "tier {tier} at level 5");
        assert_eq!(character.materials.aurem, Character::starting().materials.aurem + chest.aurem);
        let starting = Character::starting().materials;
        for stock in [Stock::Weapon, Stock::Armor] {
            assert_eq!(character.materials.fragments(stock), starting.fragments(stock) + five.2, "tier {tier}");
            assert_eq!(character.materials.essence(stock), starting.essence(stock) + five.3, "tier {tier}");
        }
        assert_eq!(character.materials.resource(0), starting.resource(0) + five.4, "tier {tier}");
        let chest = Character::starting().open_chest(tier, (10, Difficulty::Normal), None, &DICE).expect("a chest");
        assert_eq!((chest.xp, chest.aurem), ten, "tier {tier} at level 10");
    }
    assert_eq!(Character::starting().open_chest(5, (5, Difficulty::Normal), None, &DICE), None);
    assert_eq!(Character::starting().open_chest(0, (5, Difficulty::Normal), None, &DICE), None);
}

#[test]
fn a_heroic_chest_draws_the_better_colours_and_the_bonus_keeps_the_better_of_two() {
    let colour = |tier: u8| {
        (0..200_u64)
            .map(|tick| {
                let dice = Dice { tick, ..DICE };
                Character::starting()
                    .open_chest(tier, (20, Difficulty::Normal), None, &dice)
                    .expect("a chest")
                    .vestige
                    .rarity as u32
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
    let chest = character.open_chest(2, (5, Difficulty::Normal), None, &DICE).unwrap();
    assert_eq!(character.reputation(1), u64::from(chest.xp));
}

#[test]
fn a_chest_on_a_harder_voyage_pays_its_xp_and_aurem_times_the_seas_reward_as_a_kill_does() {
    let calm = Character::starting().open_chest(4, (5, Difficulty::Normal), None, &DICE).unwrap();
    let storm = Character::starting().open_chest(4, (5, Difficulty::Abyss), None, &DICE).unwrap();
    let reward = Difficulty::Abyss.reward();
    assert_eq!(reward, 2.0, "the Abyss pays twice a calm sea's");
    let raised = |amount: u32| (f64::from(amount) * reward) as u32;
    assert_eq!((storm.xp, storm.aurem), (raised(calm.xp), raised(calm.aurem)));
}
