//! What a first clear pays, once in its period, beside a run's kills and its cache: the dungeon of the day at each
//! tier each day, the week's Elite and Abyss Dungeons each week, and the Abyss boon's quarter more XP until the week
//! turns. Each is written into the character's record (`crate::activity`), and a record never pays for a day or a week
//! behind the one it holds, so a room whose clock is a few seconds behind cannot write yesterday into today.

use crate::activities::Weekly;
use crate::character::{Character, Stuff, Vestige};
use crate::dice::Dice;
use crate::kinds::{Slot, Stock};
use crate::rewards::{Foe, Reward, at_level, worth};
use crate::vestige::{FROM_BOSSES, of_colours};
use crate::world::Difficulty;

/// The Abyss boon gives a kill's XP over this more: a quarter.
pub const BOON_SHARE: u32 = 4;

impl Weekly {
    /// The colour weights of the Vestige its first clear pays, Normal to Atheric: the Elite's Legendary, the Abyss's
    /// Atheric one time in five.
    const fn colours(self) -> [u32; 5] {
        match self {
            Weekly::Elite => [0, 0, 0, 1, 0],
            Weekly::Abyss => [0, 0, 0, 4, 1],
        }
    }

    /// The Essence of each stock its first clear pays.
    const fn essence(self) -> u16 {
        match self {
            Weekly::Elite => 3,
            Weekly::Abyss => 5,
        }
    }
}

impl Character {
    /// The dungeon of the day's first clear at `tier` today: a Captain's kill at `level` (the run's, the tier applied),
    /// its XP and Aurem times the tier's reward, and a sure Vestige in a boss's colours at `level`, returned to be laid
    /// on the ground. None once taken today, or when `day` is behind the record's.
    pub fn clear_of_the_day(&mut self, day: u64, tier: Difficulty, level: u8, dice: &Dice) -> Option<Reward> {
        if day < self.activity.today.day || !self.activity.today(day).cleared.insert(tier) {
            return None;
        }
        let worth = worth(Foe::Captain);
        let times = |amount: u32| {
            let raised = libm::round(f64::from(at_level(amount, level)) * tier.reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        let (xp, aurem) = (times(worth.xp), times(worth.aurem));
        self.earn_xp(xp, None);
        self.materials.add_aurem(aurem);
        let (rarity, slot, level) = of_colours(FROM_BOSSES, level, dice);
        Some(Reward { xp, aurem, vestige: Some(Vestige::new(self.take_id(), rarity, slot, level)) })
    }

    /// The week's Elite or Abyss Dungeon's first clear this week: a Legendary Vestige (the Abyss's Atheric one in
    /// five), returned to be laid on the ground, Essence of each stock, and for the Abyss its boon. None once taken, or
    /// when `week` is behind the record's.
    pub fn clear_of_the_week(&mut self, week: u64, weekly: Weekly, dice: &Dice) -> Option<Vestige> {
        if week < self.activity.this_week.week {
            return None;
        }
        let record = self.activity.this_week(week);
        let cleared = match weekly {
            Weekly::Elite => &mut record.elite,
            Weekly::Abyss => &mut record.abyss,
        };
        if std::mem::replace(cleared, true) {
            return None;
        }
        if weekly == Weekly::Abyss {
            record.boon = true;
        }
        for stock in [Stock::Weapon, Stock::Armor] {
            self.materials.add(Stuff::Essence(stock), weekly.essence());
        }
        let (rarity, slot, level) = of_colours(weekly.colours(), weekly.foes_at(), dice);
        Some(Vestige::new(self.take_id(), rarity, slot, level))
    }

    /// A quarter more of a kill's XP while the Abyss boon is held this week, to the player and to `weapon` as the
    /// kill's own XP goes; the XP it gave.
    pub fn boon_xp(&mut self, week: u64, xp: u32, weapon: Option<Slot>) -> u32 {
        if !self.activity.this_week(week).boon {
            return 0;
        }
        let more = xp / BOON_SHARE;
        self.earn_xp(more, weapon);
        more
    }
}
