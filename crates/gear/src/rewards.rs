//! What a fight and the land give a player: a kill's XP and Aurem and the chance of a Vestige, for each player who
//! struck the foe; and a resource node's yield. Each foe is worth its kind's own times its rank's, more at a higher
//! level.

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

/// What a foe of its kind and rank is worth at level 5: XP, Aurem and its chance of a Vestige.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Worth {
    pub xp: u32,
    pub aurem: u32,
    pub vestige: f64,
}

/// What a resource node gives, and one more with Forager worn.
pub const NODE_YIELD: u16 = 3;
/// How long a player must have struck a foe before its death to share its kill, in the room's ticks of 1/60 s.
pub const SHARE_TICKS: u64 = 600;
/// A kill's pay by the foe's rank, Minor to Boss: its rank's health against a Major's (`foes::ranks`), so a kill pays
/// as it took to bring down. A kind's own pay spans less than one rank's step, so a higher rank always pays more.
pub const RANK_PAY: [f64; 5] = [0.6, 1.0, 2.2, 4.0, 7.0];

/// What a foe of its kind and rank (1 Minor to 5 Boss) is worth at level 5: its kind's XP and Aurem as a Major, times
/// its rank's pay, and its rank's chance of a Vestige.
#[must_use]
pub fn worth(foe: Foe, rank: u8) -> Worth {
    let (xp, aurem) = match foe {
        Foe::Skirmisher => (80.0, 7.0),
        Foe::Archer => (85.0, 7.0),
        Foe::Swordsman => (95.0, 8.0),
        Foe::Brute => (110.0, 9.0),
        Foe::Captain => (120.0, 10.0),
    };
    let pay = RANK_PAY[usize::from(rank.clamp(1, 5) - 1)];
    let rounded = |amount: f64| libm::round(amount * pay) as u32;
    Worth { xp: rounded(xp), aurem: rounded(aurem), vestige: vestige::chance(rank) }
}

/// A worth at the foe's level: times (5 + its level) ÷ 10.
fn at_level(amount: u32, foe_level: u8) -> u32 {
    amount * (5 + u32::from(foe_level)) / 10
}

/// What one player got from a kill.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reward {
    pub xp: u32,
    pub aurem: u32,
    /// The Vestige left on the ground for this player alone, if one dropped.
    pub vestige: Option<Vestige>,
}

impl Character {
    /// Rewards a kill of a foe of this kind and rank (1 Minor to 5 Boss) this player had a hand in: the XP, to them
    /// and to the weapon whose blow last landed (`weapon`) and their armour, to their worn Art, and as reputation to
    /// the faction pledged while its cape is worn; the Aurem; and maybe a Vestige, numbered here and returned to be
    /// laid on the ground. A harder voyage pays more of each.
    pub fn reward_kill(
        &mut self,
        foe: Foe,
        rank: u8,
        foe_level: u8,
        weapon: Option<Slot>,
        difficulty: Difficulty,
        dice: &Dice,
    ) -> Reward {
        let worth = worth(foe, rank);
        let times = |amount: u32| {
            let raised = libm::round(f64::from(at_level(amount, foe_level)) * difficulty.reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        let (xp, aurem) = (times(worth.xp), times(worth.aurem));
        // The worn Art and the faction pledged grow by the kill's XP before Scholar's share, which is the gear's.
        self.earn_art_xp(xp);
        self.earn_reputation(xp);
        self.earn_xp(xp, weapon);
        if difficulty == Difficulty::Abyss {
            self.earn(crate::emblems::Deed::AbyssFoe);
        }
        self.materials.add_aurem(aurem);
        let chance = (worth.vestige * difficulty.reward()).min(1.0);
        let vestige = vestige::dropped(chance, rank, foe_level, dice)
            .map(|(rarity, slot, level)| Vestige::new(self.take_id(), rarity, slot, level));
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
