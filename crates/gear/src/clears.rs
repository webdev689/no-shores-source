//! What a first clear pays, once in its period, beside a run's kills and its cache: the dungeon of the day at each
//! tier each day, the week's Elite and Abyss Dungeons each week, and the Abyss boon's quarter more XP until the week
//! turns. Each is written into the character's record (`crate::activity`), and a record never pays for a day or a week
//! behind the one it holds, so a room whose clock is a few seconds behind cannot write yesterday into today.

use crate::activities::Weekly;
use crate::character::{Character, Stuff, Vestige};
use crate::dice::Dice;
use crate::kinds::{Slot, Stock};
use crate::rewards::{Foe, at_level, worth};
use crate::source::Source;
use crate::vestige::{colours, of_colours};
use crate::world::Difficulty;

/// The Abyss boon gives a kill's XP over this more: a quarter.
pub const BOON_SHARE: u32 = 4;
/// A Boss's rank, whose kill the dungeon of the day pays as and whose colours its Vestige takes.
const BOSS: u8 = 5;
/// The Shapes the week's Abyss Dungeon pays its first clear: Shapes come from the week's Abyss content alone, as the
/// owner chose; this many buy a Legendary of Shape's a week, an Atheric's armour in a week and a half and its weapon
/// in two and a half, about as Destiny 1's weekly Strange Coins bought Xûr's exotics.
pub const ABYSS_SHAPES: u16 = 10;

impl Weekly {
    /// The colour weights of the Vestige its first clear pays, Normal to Atheric: the Elite's Legendary, the Abyss's
    /// Atheric one time in five.
    pub(crate) const fn colours(self) -> [u32; 5] {
        match self {
            Weekly::Elite => [0, 0, 0, 1, 0],
            Weekly::Abyss => [0, 0, 0, 4, 1],
        }
    }

    /// The Essence of each stock its first clear pays.
    pub(crate) const fn essence(self) -> u16 {
        match self {
            Weekly::Elite => 3,
            Weekly::Abyss => 5,
        }
    }
}

impl Character {
    /// The dungeon of the day's first clear at `tier` today: a Boss Captain's kill at `level` (the run's, the tier
    /// applied), its XP and Aurem times the tier's reward, and a sure Vestige in a Boss's colours at `level`, returned
    /// to be laid on the ground, or none for a Normal one, kept as its item (`unsealed`). None at all once taken
    /// today, or when `day` is behind the record's.
    pub fn clear_of_the_day(&mut self, day: u64, tier: Difficulty, level: u8, dice: &Dice) -> Option<Option<Vestige>> {
        if day < self.activity.today.day || !self.activity.today(day).cleared.insert(tier) {
            return None;
        }
        let worth = worth(Foe::Captain, BOSS);
        let times = |amount: u32| {
            let raised = libm::round(f64::from(at_level(amount, level)) * tier.reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        let (xp, aurem) = (times(worth.xp), times(worth.aurem));
        self.earn_play_xp(xp, None);
        self.materials.add_aurem(aurem);
        Some(self.unsealed(of_colours(colours(BOSS), level, dice), Source::Dungeon, dice))
    }

    /// The week's Elite or Abyss Dungeon's first clear this week: a Legendary Vestige (the Abyss's Atheric one in
    /// five), returned to be laid on the ground, Essence of each stock, and for the Abyss its boon and its Shapes.
    /// None once taken, or when `week` is behind the record's.
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
            self.add_shapes(ABYSS_SHAPES);
        }
        for stock in [Stock::Weapon, Stock::Armor] {
            self.materials.add(Stuff::Essence(stock), weekly.essence());
        }
        let (rarity, slot, level) = of_colours(weekly.colours(), weekly.foes_at(), dice);
        Some(Vestige::new(self.take_id(), rarity, slot, level).from(Source::elite_at(weekly.tier())))
    }

    /// The share of a run of the week's `weekly` dungeon's pay and loot this character is paid in `week`: its share
    /// run again once its first clear is taken that week, else the whole.
    #[must_use]
    pub fn week_share(&self, week: u64, weekly: Weekly) -> f64 {
        let record = &self.activity.this_week;
        let cleared = record.week == week && if weekly == Weekly::Elite { record.elite } else { record.abyss };
        if cleared { weekly.run_again_share() } else { 1.0 }
    }

    /// A quarter more of a kill's XP while the Abyss boon is held this week, to the worn Art, the faction pledged, the
    /// player and `weapon` as the kill's own XP goes (`earn_play_xp`); the XP it gave.
    pub fn boon_xp(&mut self, week: u64, xp: u32, weapon: Option<Slot>) -> u32 {
        if !self.activity.this_week(week).boon {
            return 0;
        }
        let more = xp / BOON_SHARE;
        self.earn_play_xp(more, weapon);
        more
    }
}
