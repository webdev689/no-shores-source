//! Elements: Blaze, which is fire; Volt, which is electric; and Cosmic, which is purple energy. A weapon may be made
//! with one, never surely, and a foe may stand with a shield of one. Against a shield a weapon of its element is very
//! effective, one of another element less so, and one with none does what it would; what the shield cannot hold
//! reaches the foe's health.

use crate::dice::{Dice, Purpose};
use crate::kinds::Kind;
use crate::rarity::Rarity;

/// An element, by its number on the wire (0 is none).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Element {
    Blaze = 1,
    Volt = 2,
    Cosmic = 3,
}

impl Element {
    pub const ALL: [Element; 3] = [Element::Blaze, Element::Volt, Element::Cosmic];

    /// The element a number names, or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|element| *element as u8 == number)
    }
}

/// What a blow does to a shield, times what it would do to health: of the shield's own element, of another, and of
/// none.
pub const MATCHED: f64 = 3.0;
pub const MISMATCHED: f64 = 0.5;
pub const UNMATCHED: f64 = 1.0;

/// What a blow of `element` does to a shield of `shield`'s, times what it would do to health.
#[must_use]
pub fn against_shield(element: Option<Element>, shield: Element) -> f64 {
    match element {
        None => UNMATCHED,
        Some(element) if element == shield => MATCHED,
        Some(_) => MISMATCHED,
    }
}

/// The chance a weapon of a rarity is made with an element: never sure, likelier the finer it is.
#[must_use]
pub fn chance(rarity: Rarity) -> f64 {
    match rarity {
        Rarity::Normal => 0.1,
        Rarity::Magic => 0.2,
        Rarity::Rare => 0.35,
        Rarity::Legendary | Rarity::Atheric => 0.5,
    }
}

/// The element a weapon of `kind` is made with, if it rolls one; armour and shields carry none.
#[must_use]
pub fn rolled(kind: Kind, rarity: Rarity, dice: &Dice) -> Option<Element> {
    if !kind.weapon() || dice.roll(Purpose::Element, 0) >= chance(rarity) {
        return None;
    }
    Element::ALL.get(dice.pick(Purpose::Element, 1, Element::ALL.len())).copied()
}

/// A Forged weapon's element (a Breach's weapon won at Hard): always one, chosen evenly as a rolled weapon's is; a
/// Breach's weapon won at Normal carries none.
#[must_use]
pub fn forged(kind: Kind, dice: &Dice) -> Option<Element> {
    if !kind.weapon() {
        return None;
    }
    Element::ALL.get(dice.pick(Purpose::Element, 1, Element::ALL.len())).copied()
}

/// The share of foes that stand with a shield, and the share of a foe's health its shield holds.
pub const SHIELD_CHANCE: f64 = 0.2;
pub const SHIELD_SHARE: f64 = 0.5;
/// How long, in the room's ticks of 1/60 s, a foe whose shield broke goes unstruck before the shield grows back whole:
/// as long as a blow on a foe still shares its kill (`rewards::SHARE_TICKS`), so it regrows once that fight lapses.
pub const SHIELD_REGROWS: u64 = crate::rewards::SHARE_TICKS;

/// A foe's shield: its element, what it holds still, what it held whole, and the room's tick a blow last landed on its
/// foe.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Shield {
    pub element: Element,
    pub left: f64,
    pub most: f64,
    pub struck_at: u64,
}

impl Shield {
    /// The shield the `nth` foe a roll stands is given, if it is given one at `chance` (`SHIELD_CHANCE` for most):
    /// of an element chosen evenly, holding `SHIELD_SHARE` of a foe with `health`. The same roll at a higher chance
    /// shields every foe it shielded at a lower one, with the same element.
    #[must_use]
    pub fn rolled(dice: &Dice, nth: u32, health: f64, chance: f64) -> Option<Self> {
        if dice.roll(Purpose::Shield, nth * 2) >= chance {
            return None;
        }
        let element = *Element::ALL.get(dice.pick(Purpose::Shield, nth * 2 + 1, Element::ALL.len()))?;
        Some(Self::whole(element, health))
    }

    /// A whole shield of `element` for a foe with `health`.
    #[must_use]
    pub fn whole(element: Element, health: f64) -> Self {
        let most = health * SHIELD_SHARE;
        Self { element, left: most, most, struck_at: 0 }
    }

    /// Grows a broken shield back whole once its foe has gone `SHIELD_REGROWS` unstruck by the room's tick `now`; one
    /// only worn stays as it is.
    pub fn regrow(&mut self, now: u64) {
        if self.left <= 0.0 && now >= self.struck_at.saturating_add(SHIELD_REGROWS) {
            self.left = self.most;
        }
    }

    /// Takes a blow of `damage` with `element` on the shield, and answers what of it reaches the foe's health: none
    /// while the shield holds, the rest of the blow once it breaks.
    pub fn struck(&mut self, damage: f64, element: Option<Element>) -> f64 {
        // Written so that no damage, and damage that is not a number, wear nothing and reach nothing.
        if damage.is_nan() || damage <= 0.0 {
            return 0.0;
        }
        let times = against_shield(element, self.element);
        if self.left <= 0.0 || times <= 0.0 {
            return damage;
        }
        if damage * times < self.left {
            self.left -= damage * times;
            return 0.0;
        }
        let held = self.left / times;
        self.left = 0.0;
        (damage - held).max(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_matching_element_breaks_a_shield_fastest_and_none_does_what_it_would() {
        let fresh = Shield::whole(Element::Volt, 200.0);
        assert_eq!(fresh.most, 100.0);
        let mut matched = fresh;
        assert_eq!(matched.struck(20.0, Some(Element::Volt)), 0.0);
        assert_eq!(matched.left, 40.0, "three times as hard");
        let mut other = fresh;
        other.struck(20.0, Some(Element::Blaze));
        assert_eq!(other.left, 90.0, "half as hard");
        let mut plain = fresh;
        plain.struck(20.0, None);
        assert_eq!(plain.left, 80.0, "as hard as on health");
    }

    #[test]
    fn what_a_breaking_shield_cannot_hold_reaches_health() {
        let mut shield = Shield::whole(Element::Cosmic, 60.0);
        assert_eq!(shield.struck(40.0, Some(Element::Cosmic)), 30.0, "10 of it broke the 30 left");
        assert_eq!(shield.left, 0.0);
        assert_eq!(shield.struck(25.0, Some(Element::Blaze)), 25.0, "a broken shield holds nothing");
        let mut whole = Shield::whole(Element::Volt, 60.0);
        assert_eq!(whole.struck(f64::NAN, None), 0.0);
        assert_eq!(whole.struck(0.0, Some(Element::Volt)), 0.0);
        assert_eq!(whole.left, 30.0, "nothing wears it");
        assert!(whole.struck(10.0, Some(Element::Volt)) >= 0.0, "an exact break reaches no less than nothing");
    }

    #[test]
    fn a_broken_shield_regrows_whole_once_its_foe_has_gone_unstruck_a_while_and_a_worn_one_stays_worn() {
        let mut shield = Shield::whole(Element::Volt, 60.0);
        shield.struck(10.0, None);
        shield.regrow(SHIELD_REGROWS * 2);
        assert_eq!(shield.left, 20.0, "worn, not broken");
        shield.struck(100.0, None);
        shield.struck_at = 50;
        shield.regrow(50 + SHIELD_REGROWS - 1);
        assert_eq!(shield.left, 0.0, "not yet");
        shield.regrow(50 + SHIELD_REGROWS);
        assert_eq!(shield.left, shield.most, "whole again");
    }

    #[test]
    fn weapons_roll_an_element_by_rarity_never_surely_and_armour_never() {
        let count = |kind: Kind, rarity: Rarity| {
            (0..2_000_u64)
                .filter(|tick| rolled(kind, rarity, &Dice { seed: 7, tick: *tick, player: 1 }).is_some())
                .count()
        };
        let normal = count(Kind::Sword, Rarity::Normal);
        let legendary = count(Kind::Sword, Rarity::Legendary);
        assert!((150..250).contains(&normal), "about one in ten: {normal}");
        assert!((900..1_100).contains(&legendary), "about one in two: {legendary}");
        assert_eq!(count(Kind::Torso, Rarity::Legendary), 0);
        assert_eq!(count(Kind::Cloak, Rarity::Legendary), 0);
        let each = |element: Element| {
            (0..3_000_u64)
                .filter(|tick| {
                    rolled(Kind::Bow, Rarity::Atheric, &Dice { seed: 3, tick: *tick, player: 0 }) == Some(element)
                })
                .count()
        };
        for element in Element::ALL {
            assert!((400..600).contains(&each(element)), "each element alike: {element:?}");
        }
    }

    #[test]
    fn about_one_foe_in_five_stands_with_a_shield() {
        let shielded = (0..2_000_u32)
            .filter(|nth| Shield::rolled(&Dice { seed: 11, tick: 4, player: 0 }, *nth, 100.0, SHIELD_CHANCE).is_some())
            .count();
        assert!((300..500).contains(&shielded), "{shielded}");
    }
}
