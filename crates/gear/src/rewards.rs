//! What a fight and the land give a player: a kill's XP and Aurem and the chance of a Vestige, for each player who
//! struck the foe; and a resource node's yield. Each foe is worth its kind's own times its rank's, more at a higher
//! level.

use crate::character::{At, CARRIED_MOST, Character, Stuff, VAULT_MOST, Vestige};
use crate::dice::Dice;
use crate::guild::Boons;
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::Slot;
use crate::rarity::Rarity;
use crate::source::Source;
use crate::vestige;
use crate::world::Difficulty;

/// The stream a Normal Vestige's item is rolled on (`unsealed`), apart from the roll of its colour.
const COMMON_STREAM: u64 = 0x636f_6d6d_6f6e;

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
pub(crate) fn at_level(amount: u32, foe_level: u8) -> u32 {
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
    /// the faction pledged while its cape is worn; and the Aurem. A harder voyage pays more of each, and a guild's
    /// outposts more again (`guild::Boons`). What it drops is `loot_kill`'s.
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
    /// Miniboss or a Boss items as themselves, each chance raised by a harder voyage, all from `source`, the content
    /// the kill was in. The items are kept (`keep_found`); the Vestiges, with any item there was no room for, are
    /// numbered here and returned to be laid.
    pub fn loot_kill(
        &mut self,
        rank: u8,
        foe_level: u8,
        difficulty: Difficulty,
        source: Source,
        dice: &Dice,
    ) -> Vec<Vestige> {
        let raised = difficulty.reward();
        let chances = (vestige::chance(rank) * raised, vestige::item_chance(rank) * raised);
        self.loot(chances, rank, foe_level, source, dice)
    }

    /// Pays a cleared node to a player who fought it: its clear's XP and Aurem at its level, raised by a harder voyage
    /// as a kill's are; and from a dungeon an item as itself, coloured as its Miniboss's, and a Vestige as often as its
    /// Miniboss leaves one, returned to be laid as `loot_kill`'s are, both from `source`.
    pub fn reward_clear(
        &mut self,
        clear: Clear,
        level: u8,
        difficulty: Difficulty,
        source: Source,
        dice: &Dice,
    ) -> Vec<Vestige> {
        self.pay(clear.worth(), level, None, difficulty);
        if clear != Clear::Dungeon {
            return Vec::new();
        }
        let raised = difficulty.reward();
        self.loot((vestige::chance(MINIBOSS) * raised, raised), MINIBOSS, level, source, dice)
    }

    /// Pays XP and Aurem worth so much at level 5, at `level` and the voyage's tier, as `earn_play_xp` takes XP.
    pub(crate) fn pay(
        &mut self,
        (xp, aurem): (u32, u32),
        level: u8,
        weapon: Option<Slot>,
        difficulty: Difficulty,
    ) -> Reward {
        let times = |amount: u32| {
            let raised = libm::round(f64::from(at_level(amount, level)) * difficulty.reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        let (base, aurem) = (times(xp), times(aurem));
        let boons = self.boons;
        let (xp, aurem) = (Boons::more(base, boons.xp), Boons::more(aurem, boons.aurem));
        // Reputation grows by the XP before the guild's XP boon: its own boon is applied as it is earned.
        self.earn_art_xp(xp);
        self.earn_reputation(base);
        self.earn_xp(xp, weapon);
        self.materials.add_aurem(aurem);
        Reward { xp, aurem }
    }

    /// XP earned by play, from a kill, a clear, a chest, a sinking or a bounty: the worn Art and the faction pledged
    /// (while its cape is worn) grow by it before Scholar's share, which is the gear's; then the character, their
    /// armour and `weapon`, as Destiny 1's every activity paid its reputation beside its XP.
    pub fn earn_play_xp(&mut self, xp: u32, weapon: Option<Slot>) {
        self.earn_art_xp(xp);
        self.earn_reputation(xp);
        self.earn_xp(xp, weapon);
    }

    /// Vestiges and items by their chances, coloured by `rank` at `level`, from `source`: the items kept, the
    /// Vestiges returned, a Normal one's item among the kept (`unsealed`).
    pub(crate) fn loot(
        &mut self,
        (vestiges, items): (f64, f64),
        rank: u8,
        level: u8,
        source: Source,
        dice: &Dice,
    ) -> Vec<Vestige> {
        let rolled = vestige::dropped(vestiges, rank, level, dice);
        let mut laid: Vec<Vestige> = rolled.into_iter().filter_map(|drop| self.unsealed(drop, source, dice)).collect();
        // An item there is no room for is laid as a Vestige of the content it dropped in, as a kill's own are.
        for item in vestige::found_items(items, rank, level, source, dice) {
            laid.extend(self.keep_found(item, level.clamp(1, NAMED_LEVEL)).map(|vestige| vestige.from(source)));
        }
        laid
    }

    /// Keeps an item found as itself, numbered as it is taken: carried with its slot's, else in the vault. With both
    /// full a Normal one is posted as itself, as no common is ever sealed; anything finer comes back as a Vestige of
    /// its colour and slot at `level`, its foe's, to be laid, so nothing found is lost and none opens above what that
    /// foe could drop (a named item stands at 20, a cloak at 1, whatever its foe).
    pub fn keep_found(&mut self, item: Item, level: u8) -> Option<Vestige> {
        let at = if self.carried_in(item.bucket) < CARRIED_MOST {
            At::Carried
        } else if self.vaulted(item.kind.stock()) < VAULT_MOST {
            At::Vault
        } else if item.rarity == Rarity::Normal {
            self.post(crate::mail::Source::Found, crate::mail::Posted::Item(item));
            return None;
        } else {
            return Some(Vestige::new(self.take_id(), item.rarity, item.bucket, level).from(item.source));
        };
        let id = self.take_id();
        self.items.insert(id, (Item { id, ..item }, at));
        None
    }

    /// A Vestige rolled for this player, its colour, slot and level, from `source`: Magic or finer comes sealed,
    /// numbered and returned; a Normal one comes as the item it would have opened to, kept as a found item is
    /// (`keep_found`), so no common is ever sealed.
    pub fn unsealed(
        &mut self,
        (rarity, slot, level): (Rarity, Slot, u8),
        source: Source,
        dice: &Dice,
    ) -> Option<Vestige> {
        if rarity > Rarity::Normal {
            return Some(Vestige::new(self.take_id(), rarity, slot, level).from(source));
        }
        // Each on dice of its own, by the number it will take, so two commons of one kill are never one twice, and
        // apart from the kill's found items' stream.
        let seed = dice.seed ^ COMMON_STREAM ^ u64::from(self.id_to_take()).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        let item = vestige::make(0, Rarity::Normal, slot, level, source, &Dice { seed, ..*dice })?;
        self.keep_found(item, level)
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
