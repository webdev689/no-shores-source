//! What a fight and the land give a player: a kill's XP and Aurem and the chance of a Vestige, for each player who
//! struck the foe; and a resource node's yield. Each foe is worth its kind's own times its rank's, more at a higher
//! level.

use crate::character::{At, CARRIED_MOST, Character, Stuff, VAULT_MOST, Vestige};
use crate::dice::Dice;
use crate::item::Item;
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
/// as it took to bring down. The kinds' own pay spans less than one rank's step, and their Aurem so little that a
/// higher rank pays more even at level 0, where a kill pays half.
pub const RANK_PAY: [f64; 5] = [0.6, 1.0, 2.2, 4.0, 7.0];

/// What a foe of its kind and rank (1 Minor to 5 Boss) is worth at level 5: its kind's XP and Aurem as a Major, times
/// its rank's pay, and its rank's chance of a Vestige.
#[must_use]
pub fn worth(foe: Foe, rank: u8) -> Worth {
    let (xp, aurem) = match foe {
        Foe::Skirmisher => (80.0, 7.0),
        Foe::Archer => (85.0, 7.0),
        Foe::Swordsman => (95.0, 7.0),
        Foe::Brute => (110.0, 8.0),
        Foe::Captain => (120.0, 8.0),
    };
    let pay = RANK_PAY[usize::from(rank.clamp(1, 5) - 1)];
    let rounded = |amount: f64| libm::round(amount * pay) as u32;
    Worth { xp: rounded(xp), aurem: rounded(aurem), vestige: vestige::chance(rank) }
}

/// A worth at the foe's level: times (5 + its level) ÷ 10.
fn at_level(amount: u32, foe_level: u8) -> u32 {
    amount * (5 + u32::from(foe_level)) / 10
}

/// What one player was paid for a kill.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reward {
    pub xp: u32,
    pub aurem: u32,
}

/// A node whose garrison, cleared, pays each player who fought it, as Destiny 1's strikes paid on completion: a
/// mission's, a dungeon's or a world boss's, each more than the last, so a node's pay keeps the content's order where
/// its foes alone would not.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Clear {
    Mission,
    Dungeon,
    WorldBoss,
}

impl Clear {
    /// Its XP and Aurem at level 5: at level 20 a mission's 1,000 and 75, a dungeon's twice that, a world boss's four
    /// times.
    #[must_use]
    pub fn worth(self) -> (u32, u32) {
        match self {
            Clear::Mission => (400, 30),
            Clear::Dungeon => (800, 60),
            Clear::WorldBoss => (1_600, 120),
        }
    }
}

/// A Miniboss's rank, whose drops a dungeon's clear gives.
const MINIBOSS: u8 = 4;

impl Character {
    /// Rewards a kill of a foe of this kind and rank (1 Minor to 5 Boss) this player had a hand in: the XP, to them
    /// and to the weapon whose blow last landed (`weapon`) and their armour, to their worn Art, and as reputation to
    /// the faction pledged while its cape is worn; and the Aurem. A harder voyage pays more of each. What it drops is
    /// `loot_kill`'s.
    pub fn reward_kill(
        &mut self,
        foe: Foe,
        rank: u8,
        foe_level: u8,
        weapon: Option<Slot>,
        difficulty: Difficulty,
    ) -> Reward {
        let worth = worth(foe, rank);
        if difficulty == Difficulty::Abyss {
            self.earn(crate::emblems::Deed::AbyssFoe);
        }
        self.pay((worth.xp, worth.aurem), foe_level, weapon, difficulty)
    }

    /// What a kill of a foe of this rank and level leaves this player: Vestiges by its rank's chance, and from a
    /// Miniboss or a Boss items as themselves, each chance raised by a harder voyage. The items are kept
    /// (`keep_found`); the Vestiges, with any item there was no room for, are numbered here and returned to be laid.
    pub fn loot_kill(&mut self, rank: u8, foe_level: u8, difficulty: Difficulty, dice: &Dice) -> Vec<Vestige> {
        let raised = difficulty.reward();
        self.loot((vestige::chance(rank) * raised, vestige::item_chance(rank) * raised), rank, foe_level, dice)
    }

    /// Pays a cleared node to a player who fought it: its clear's XP and Aurem at its level, raised by a harder voyage
    /// as a kill's are; and from a dungeon an item as itself, coloured as its Miniboss's, and a Vestige as often as its
    /// Miniboss leaves one, returned to be laid as `loot_kill`'s are.
    pub fn reward_clear(&mut self, clear: Clear, level: u8, difficulty: Difficulty, dice: &Dice) -> Vec<Vestige> {
        self.pay(clear.worth(), level, None, difficulty);
        if clear != Clear::Dungeon {
            return Vec::new();
        }
        let raised = difficulty.reward();
        self.loot((vestige::chance(MINIBOSS) * raised, raised), MINIBOSS, level, dice)
    }

    /// Pays XP and Aurem worth so much at level 5, at `level` and the voyage's tier: the worn Art and the faction
    /// pledged grow by the XP before Scholar's share, which is the gear's.
    fn pay(&mut self, (xp, aurem): (u32, u32), level: u8, weapon: Option<Slot>, difficulty: Difficulty) -> Reward {
        let times = |amount: u32| {
            let raised = libm::round(f64::from(at_level(amount, level)) * difficulty.reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        let (xp, aurem) = (times(xp), times(aurem));
        self.earn_art_xp(xp);
        self.earn_reputation(xp);
        self.earn_xp(xp, weapon);
        self.materials.add_aurem(aurem);
        Reward { xp, aurem }
    }

    /// Vestiges and items by their chances, coloured by `rank` at `level`: the items kept, the Vestiges returned.
    fn loot(&mut self, (vestiges, items): (f64, f64), rank: u8, level: u8, dice: &Dice) -> Vec<Vestige> {
        let mut laid: Vec<Vestige> = vestige::dropped(vestiges, rank, level, dice)
            .into_iter()
            .map(|(rarity, slot, level)| Vestige::new(self.take_id(), rarity, slot, level))
            .collect();
        for item in vestige::found_items(items, rank, level, dice) {
            laid.extend(self.keep_found(item));
        }
        laid
    }

    /// Keeps an item found as itself, numbered as it is taken: carried with its slot's, else in the vault. With both
    /// full it comes back as a Vestige of its colour, slot and level to be laid, so nothing found is lost.
    pub fn keep_found(&mut self, item: Item) -> Option<Vestige> {
        let at = if self.carried_in(item.bucket) < CARRIED_MOST {
            At::Carried
        } else if self.vaulted(item.kind.stock()) < VAULT_MOST {
            At::Vault
        } else {
            return Some(Vestige::new(self.take_id(), item.rarity, item.bucket, item.level));
        };
        let id = self.take_id();
        self.items.insert(id, (Item { id, ..item }, at));
        None
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
