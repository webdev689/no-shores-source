//! What a fight and the land give a player: a kill's XP and Aurem and the chance of a Vestige, for each player who
//! struck the foe; and a resource node's yield. Each foe is worth its kind's own, more at a higher level.

use crate::character::{Character, Stuff, Vestige};
use crate::dice::Dice;
use crate::kinds::Slot;
use crate::vestige;
use crate::world::Difficulty;

/// The foes that give loot, as rewards know them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Foe {
    Skirmisher,
    Swordsman,
    Brute,
    Archer,
    Captain,
}

/// What a foe of its kind is worth at level 5: XP, Aurem, its chance of a Vestige, and whether it is a boss, whose
/// Vestige is sure and better.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Worth {
    pub xp: u32,
    pub aurem: u32,
    pub vestige: f64,
    pub boss: bool,
}

/// What a resource node gives, and one more with Forager worn.
pub const NODE_YIELD: u16 = 3;
/// How long a player must have struck a foe before its death to share its kill, in the room's ticks of 1/60 s.
pub const SHARE_TICKS: u64 = 600;

#[must_use]
pub fn worth(foe: Foe) -> Worth {
    let foe_worth = |xp, aurem, vestige| Worth { xp, aurem, vestige, boss: false };
    match foe {
        Foe::Skirmisher => foe_worth(60, 5, 0.05),
        Foe::Archer => foe_worth(70, 6, 0.05),
        Foe::Swordsman => foe_worth(90, 8, 0.07),
        Foe::Brute => foe_worth(180, 15, 0.15),
        Foe::Captain => Worth { boss: true, ..foe_worth(2_000, 120, 1.0) },
    }
}

/// A worth at the foe's level: times (5 + its level) ÷ 10.
fn at_level(amount: u32, foe_level: u8) -> u32 {
    amount * (5 + u32::from(foe_level)) / 10
}

/// What one player got from a kill.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reward {
    pub xp: u32,
    pub aurem: u32,
    /// The Vestige left on the ground for this player alone, if one dropped.
    pub vestige: Option<Vestige>,
}

impl Character {
    /// Rewards a kill this player had a hand in: the XP, to them and to the weapon whose blow last landed (`weapon`)
    /// and their armour; the Aurem; and maybe a Vestige, numbered here and returned to be laid on the ground. A harder
    /// voyage pays more of each.
    pub fn reward_kill(
        &mut self,
        foe: Foe,
        foe_level: u8,
        weapon: Option<Slot>,
        difficulty: Difficulty,
        dice: &Dice,
    ) -> Reward {
        let worth = worth(foe);
        let times = |amount: u32| {
            let raised = libm::round(f64::from(at_level(amount, foe_level)) * difficulty.reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        let (xp, aurem) = (times(worth.xp), times(worth.aurem));
        self.earn_xp(xp, weapon);
        if difficulty == Difficulty::Storm {
            self.earn(crate::emblems::Deed::StormFoe);
        }
        self.materials.add_aurem(aurem);
        let chance = (worth.vestige * difficulty.reward()).min(1.0);
        let vestige = vestige::dropped(chance, worth.boss, foe_level, dice).map(|(rarity, slot, level)| Vestige {
            id: self.take_id(),
            rarity,
            slot,
            level,
        });
        Reward { xp, aurem, vestige }
    }

    /// Takes a Vestige off the ground into the carried ten; refused, leaving it lying, when they are full.
    pub fn pick_up(&mut self, vestige: Vestige) -> bool {
        if self.vestiges_held(false) >= crate::character::VESTIGES_MOST {
            return false;
        }
        // Numbered as it is taken, so a Vestige that fell for a character since replaced takes no number in use.
        let id = self.take_id();
        self.vestiges.insert(id, (Vestige { id, ..vestige }, false));
        true
    }

    /// Gathers a resource node of an island's resource (its place in the catalogue's list): three, four with Forager
    /// worn; what was taken under the stock's most.
    pub fn gather(&mut self, resource: usize) -> u16 {
        let count = NODE_YIELD + u16::from(self.has_trait("forager"));
        self.earn(crate::emblems::Deed::Gathered);
        self.materials.add(Stuff::Resource(resource), count)
    }
}
