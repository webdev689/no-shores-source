//! The Playlist beside each port: the Elite and the Abyss Playlist, each a queue for one of the 18 Elite Dungeons drawn
//! when a company is found, at the playlist's tier. Players
//! are banded by five levels from the level it opens at, and every foe of a band's run stands at the band's first
//! level raised by the tier, never past 32. Its modifiers turn with the day: the Elite Playlist carries the day's, the
//! Abyss Playlist the day's and one more of another kind. Each playlist's first clear each day pays as the dungeon of
//! the day does, and its third clear each week pays Essence and Vestiges, once.

use crate::activities::{MODIFIER_KINDS, Modifier, PLAYLIST_MODIFIER, burning, drawn, modifier_of_the_day};
use crate::character::{Character, Stuff, Vestige};
use crate::dice::Dice;
use crate::kinds::Stock;
use crate::power::LEVEL_MOST;
use crate::rewards::{Foe, at_level, worth};
use crate::source::Source;
use crate::vestige::{colours, of_colours};
use crate::world::Difficulty;

/// The levels a band spans.
pub const BAND_LEVELS: u8 = 5;
/// The clears in a week that pay its weekly reward.
pub const WEEK_CLEARS: u8 = 3;
/// A Boss's rank, whose kill the daily pays as and whose colours its Vestiges take, as the dungeon of the day's.
const BOSS: u8 = 5;

/// One of the two playlists.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Playlist {
    Elite,
    Abyss,
}

impl Playlist {
    pub const ALL: [Playlist; 2] = [Playlist::Elite, Playlist::Abyss];

    /// The tier its runs are at.
    #[must_use]
    pub const fn tier(self) -> Difficulty {
        match self {
            Playlist::Elite => Difficulty::Elite,
            Playlist::Abyss => Difficulty::Abyss,
        }
    }

    /// Its key, in rooms' names and as the page reads it: "elite" or "abyss".
    #[must_use]
    pub const fn key(self) -> &'static str {
        match self {
            Playlist::Elite => "elite",
            Playlist::Abyss => "abyss",
        }
    }

    /// Its name on screen.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Playlist::Elite => "Elite Playlist",
            Playlist::Abyss => "Abyss Playlist",
        }
    }

    /// The level it opens at, as its tier's seas do: 10 and 20.
    #[must_use]
    pub fn opens_at(self) -> u8 {
        self.tier().opens_at()
    }

    /// Its bands, each its first and last level: five levels each from the level it opens at, the last ending at the
    /// highest level (the Elite's 10 to 14, 15 to 19, 20 to 24, 25 to 29 and 30 alone).
    #[must_use]
    pub fn bands(self) -> Vec<(u8, u8)> {
        (self.opens_at()..=LEVEL_MOST)
            .step_by(usize::from(BAND_LEVELS))
            .map(|first| (first, (first + BAND_LEVELS - 1).min(LEVEL_MOST)))
            .collect()
    }

    /// The band a character's level is matched in; none below the level it opens at.
    #[must_use]
    pub fn band_of(self, level: u8) -> Option<(u8, u8)> {
        self.bands().into_iter().find(|&(first, last)| (first..=last).contains(&level.min(LEVEL_MOST)))
    }

    /// The level every foe of a band's run stands at: its first raised by the tier, never past 32.
    #[must_use]
    pub fn foes_at(self, (first, _): (u8, u8)) -> u8 {
        self.tier().raise(first)
    }

    /// The band whose runs stand their foes at `foes_at`; none for a level no band's are.
    #[must_use]
    pub fn band_at(self, foes_at: u8) -> Option<(u8, u8)> {
        self.bands().into_iter().find(|&band| self.foes_at(band) == foes_at)
    }

    /// Its modifiers on `day`: the day's, and on the Abyss one more of another kind, its Burn naming an Art drawn as
    /// the day's does.
    #[must_use]
    pub fn modifiers(self, day: u64) -> Vec<Modifier> {
        let first = modifier_of_the_day(day);
        if self == Playlist::Elite {
            return vec![first];
        }
        let others: Vec<usize> = (0..MODIFIER_KINDS).filter(|&kind| kind != first.kind()).collect();
        let kind = others[drawn(day, PLAYLIST_MODIFIER, 0, others.len())];
        vec![first, Modifier::of_kind(kind, burning(day, PLAYLIST_MODIFIER, 1))]
    }

    /// The Essence of each stock its weekly reward pays.
    #[must_use]
    pub const fn week_essence(self) -> u16 {
        match self {
            Playlist::Elite => 2,
            Playlist::Abyss => 3,
        }
    }

    /// The Vestiges in a Boss's colours its weekly reward pays.
    #[must_use]
    pub const fn week_vestiges(self) -> u8 {
        match self {
            Playlist::Elite => 1,
            Playlist::Abyss => 2,
        }
    }
}

impl Character {
    /// Whether a playlist's daily reward is taken on `day`, as the record holds it.
    #[must_use]
    pub fn playlist_taken(&self, day: u64, playlist: Playlist) -> bool {
        let today = &self.activity.today;
        today.day == day
            && match playlist {
                Playlist::Elite => today.elite_playlist,
                Playlist::Abyss => today.abyss_playlist,
            }
    }

    /// A playlist's clears counted in `week`, to `WEEK_CLEARS`, as the record holds them.
    #[must_use]
    pub fn playlist_clears(&self, week: u64, playlist: Playlist) -> u8 {
        let this_week = &self.activity.this_week;
        let clears = match playlist {
            Playlist::Elite => this_week.elite_playlist,
            Playlist::Abyss => this_week.abyss_playlist,
        };
        if this_week.week == week { clears.min(WEEK_CLEARS) } else { 0 }
    }

    /// A playlist's first clear on `day`: a Boss Captain's kill at `level` (the run's), its XP and Aurem times the
    /// tier's reward, and a sure Vestige in a Boss's colours at `level`, returned to be kept, or none for a Normal
    /// one, kept as its item (`unsealed`). None at all once taken today, or when `day` is behind the record's.
    pub fn playlist_of_the_day(
        &mut self,
        day: u64,
        playlist: Playlist,
        level: u8,
        dice: &Dice,
    ) -> Option<Option<Vestige>> {
        if day < self.activity.today.day {
            return None;
        }
        let today = self.activity.today(day);
        let taken = match playlist {
            Playlist::Elite => &mut today.elite_playlist,
            Playlist::Abyss => &mut today.abyss_playlist,
        };
        if std::mem::replace(taken, true) {
            return None;
        }
        let worth = worth(Foe::Captain, BOSS);
        let times = |amount: u32| {
            let raised = libm::round(f64::from(at_level(amount, level)) * playlist.tier().reward());
            u32::try_from(raised as u64).unwrap_or(u32::MAX)
        };
        let (xp, aurem) = (times(worth.xp), times(worth.aurem));
        self.earn_play_xp(xp, None);
        self.materials.add_aurem(aurem);
        Some(self.unsealed(of_colours(colours(BOSS), level, dice), Source::elite_at(playlist.tier()), dice))
    }

    /// Counts a playlist's clear in `week`; at the `WEEK_CLEARS`th, its weekly reward: Essence of each stock and its
    /// Vestiges in a Boss's colours at `level`, returned to be kept, each Normal one kept as its item. Nothing past the
    /// third, or when `week` is behind the record's.
    pub fn playlist_of_the_week(&mut self, week: u64, playlist: Playlist, level: u8, dice: &Dice) -> Vec<Vestige> {
        if week < self.activity.this_week.week {
            return Vec::new();
        }
        let this_week = self.activity.this_week(week);
        let clears = match playlist {
            Playlist::Elite => &mut this_week.elite_playlist,
            Playlist::Abyss => &mut this_week.abyss_playlist,
        };
        if *clears >= WEEK_CLEARS {
            return Vec::new();
        }
        *clears += 1;
        if *clears < WEEK_CLEARS {
            return Vec::new();
        }
        for stock in [Stock::Weapon, Stock::Armor] {
            self.materials.add(Stuff::Essence(stock), playlist.week_essence());
        }
        (0..playlist.week_vestiges())
            .filter_map(|nth| {
                // Each on dice of its own, apart from the daily's too, so no two of a clear's Vestiges are one twice.
                let dice = Dice { tick: dice.tick ^ (u64::from(nth + 1) << 48), ..*dice };
                self.unsealed(of_colours(colours(BOSS), level, &dice), Source::elite_at(playlist.tier()), &dice)
            })
            .collect()
    }
}
