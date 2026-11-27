use crate::breach::{DROWNED_VALE, Tier};
use crate::gate::{Place, shut};
use crate::rarity::Rarity;
use crate::world::Difficulty;
use crate::{Character, Slot};

#[test]
fn the_test_character_is_level_30_in_hard_breach_armour_with_the_most_attack_in_each_weapon_slot() {
    let character = Character::max_test();
    assert_eq!(character.prestige(), 120, "four Hard Breach pieces at their most");
    assert_eq!(character.level(), 30);
    for slot in [Slot::Head, Slot::Torso, Slot::Arms, Slot::Legs, Slot::Melee, Slot::Ranged] {
        let item = character.worn(slot).expect("worn");
        assert!(item.breach && item.hard && item.rarity == Rarity::Legendary, "{slot:?} a Hard Breach piece");
        assert!(item.fully_upgraded(), "{slot:?} every node bought");
    }
    for slot in [Slot::Melee, Slot::Ranged] {
        assert_eq!(character.attack(slot), Some(315), "{slot:?} at the most Attack, a Forged weapon's");
        assert!(character.worn(slot).and_then(|item| item.element).is_some(), "{slot:?} Forged");
        assert!(!character.traits(slot).is_empty(), "{slot:?} with its perks");
    }
    assert!(character.worn(Slot::Ranged).is_some_and(|item| item.kind.ranged()));
    assert!(character.arts == crate::arts::WornArts::mastered(), "every Art mastered");
    assert!(character.breach_won(&DROWNED_VALE, Tier::Normal) && character.story.prologue);
    assert_eq!(shut(&character, Place::Breach(Tier::Hard), Difficulty::Normal), None, "Hard opens");
    assert_eq!(character.ammo, crate::ammo::AMMO_FULL, "ammo full");
}
