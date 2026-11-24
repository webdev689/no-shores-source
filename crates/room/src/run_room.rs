//! A dungeon's room for a run: a patrol's dungeon at any tier, an Elite Dungeon (four or five blocks to its own Boss)
//! at Normal or as the week's Elite or Abyss Dungeon, and a sea island's. The run is fixed as the room opens: what its
//! first clear pays and in which day or week, the day's or the week's modifiers, five revives at Abyss and the week's
//! fixed level. Its first
//! clear in its period pays as the cache opens (`pay_clear`), by the record each character keeps (`gear::clears`).

use super::{Pays, REVIVES, Run};
use crate::{PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::REEVE;
use dungeon::Dungeon;
use gear::Difficulty;
use gear::activities::{
    Weekly, dungeon_of_the_day, elite_dungeon, island_of, modifier_of_the_day, of_the_week, week_modifiers,
};
use gear::clock::{day_of, week_of};
use gear::gate::Place;
use gear::world::island_levels;

/// Which dungeon a run is of.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RunOf {
    /// A patrol's dungeon by its number.
    Patrol { patrol: String, number: usize },
    /// An Elite Dungeon by its node's id: the Elite Dungeon at Normal, the week's Elite or Abyss at those.
    Elite { place: String },
    /// A playlist's run of an Elite Dungeon by its node's id, every foe at `foes_at`, one of its bands' levels.
    Playlist { place: String, foes_at: u8 },
    /// A sea island's, by its seed, its style's key and its continent.
    Sea { seed: u32, style: String, continent: String },
}

/// An Elite Dungeon's seed and style, fixed by its place: none for a place that is none.
#[must_use]
pub fn elite_laid(place: &str) -> Option<(u32, dungeon::Style)> {
    let elite = elite_dungeon(place)?;
    Some((dungeon::lane::named(&format!("elite:{place}")), dungeon::style_of(elite.style)?))
}

impl Room {
    /// The room of a run at `tier`, opened at Unix `minute`: none for a dungeon no rule lays, an Elite Dungeon at Elite
    /// or Abyss that is not this week's, or a sea island of no band.
    #[must_use]
    pub fn dungeon_run(of: &RunOf, tier: Difficulty, minute: u64) -> Option<Self> {
        let (day, week) = (day_of(minute), week_of(minute));
        let revives = (tier == Difficulty::Abyss).then_some(REVIVES);
        let end_reeve = (REEVE, Rank::Miniboss);
        let mut room = match of {
            RunOf::Patrol { patrol, number } => {
                let island = island_of(patrol).filter(|island| island.patrols.contains(&patrol.as_str()))?;
                if *number >= dungeon::PER_PATROL {
                    return None;
                }
                // The day's pay and its modifier are fixed together as the run opens, as the week's are.
                let today = dungeon_of_the_day(day, island.continent) == Some((patrol.as_str(), *number));
                let modifiers =
                    if tier != Difficulty::Normal && today { vec![modifier_of_the_day(day)] } else { vec![] };
                let pays = if today { Pays::Day { day } } else { Pays::Nothing };
                let run = Run { pays, modifiers, revives, ..Run::default() };
                let (seed, style) = dungeon::of_patrol(patrol, *number);
                let name = format!("{patrol}--dungeon-{number}");
                let levels = island_levels(island.continent);
                let mut room = Self::laid_dungeon(&name, &Dungeon::forge(seed, style), levels, end_reeve, Some(run))?;
                room.place = Some(Place::PatrolDungeon);
                room.island = Some(island.continent);
                room
            }
            RunOf::Elite { place } | RunOf::Playlist { place, .. } => {
                let (elite, island) = (elite_dungeon(place)?, island_of(place)?);
                let (seed, style) = elite_laid(place)?;
                let laid = Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS);
                let played = match of {
                    RunOf::Playlist { foes_at, .. } => {
                        Some(super::playlist_run::playlist_run(tier, *foes_at, (day, week), revives)?)
                    }
                    _ => None,
                };
                let (levels, run, gated) = match (played, Weekly::of(tier)) {
                    (Some(played), _) => played,
                    (None, None) => {
                        let run = Run { revives, ..Run::default() };
                        (island_levels(island.continent), run, Place::EliteDungeon)
                    }
                    (None, Some(weekly)) => {
                        if of_the_week(week, weekly).id != elite.id {
                            return None;
                        }
                        let foes_at = weekly.foes_at();
                        let modifiers = week_modifiers(week, weekly);
                        let run = Run {
                            pays: Pays::Week { weekly, week },
                            modifiers,
                            revives,
                            foes_at: Some(foes_at),
                            ..Run::default()
                        };
                        (Some((foes_at, foes_at)), run, Place::Week(weekly))
                    }
                };
                let name = format!("{place}--elite-dungeon");
                let mut room = Self::laid_dungeon(&name, &laid, levels, (elite.boss, Rank::Boss), Some(run))?;
                room.place = Some(gated);
                room.island = Some(island.continent);
                room
            }
            RunOf::Sea { seed, style, continent } => {
                let (levels, style) = (island_levels(continent)?, dungeon::style_of(style)?);
                let name = format!("sea-dungeon-{continent}-{}-{seed:08x}", style.key);
                let run = Run { revives, ..Run::default() };
                let mut room =
                    Self::laid_dungeon(&name, &Dungeon::forge(*seed, style), Some(levels), end_reeve, Some(run))?;
                room.set_island(continent);
                room
            }
        };
        room.source = match of {
            RunOf::Patrol { .. } => gear::Source::Dungeon,
            RunOf::Elite { .. } | RunOf::Playlist { .. } => gear::Source::elite_at(tier),
            RunOf::Sea { .. } => gear::Source::Sea,
        };
        room.set_difficulty(tier);
        room.set_minute(minute);
        // A run keeps to one company: the ground its fallen bands won stays won while the company is in it.
        room.respawning.holds_ground = true;
        Some(room)
    }

    /// Pays a player the room keeps as the cache opens: the day's clear in the day the run was opened for, or at Normal
    /// in the shared room of today's dungeon of the day, and the week's in the week the run was opened for. Its Vestige
    /// is kept with the record that pays it, in the carried ten, else the vault, else the mail, so it is never lost
    /// once paid. Nothing once taken.
    pub(crate) fn pay_clear(&mut self, player: PlayerId, level: u8) {
        let Some(pays) = self.run.as_ref().map(|run| run.pays.clone()) else { return };
        if matches!(pays, Pays::Playlist { .. }) {
            return self.pay_playlist(player, level);
        }
        let (day, now, tier) = (self.day(), week_of(self.minute), self.difficulty);
        let dice = self.dice(player);
        // A player playing unkept keeps nothing: their record would be marked on a character the accounts never see.
        let Some(found) = self.players.get_mut(&player).filter(|found| found.owner.is_some()) else { return };
        let character = &mut found.character;
        let vestige = match pays {
            Pays::Nothing | Pays::Playlist { .. } => None,
            Pays::Today { patrol, number } => {
                let today = island_of(&patrol).and_then(|island| dungeon_of_the_day(day, island.continent));
                (tier == Difficulty::Normal && today == Some((patrol.as_str(), number)))
                    .then(|| character.clear_of_the_day(day, tier, level, &dice))
                    .flatten()
            }
            Pays::Day { day: opened } => {
                (opened == day).then(|| character.clear_of_the_day(day, tier, level, &dice)).flatten()
            }
            Pays::Week { weekly, week } => {
                (week == now).then(|| character.clear_of_the_week(week, weekly, &dice)).flatten()
            }
        };
        let Some(vestige) = vestige else { return };
        found.gear_changed = true;
        character.keep_paid(vestige);
    }
}

#[cfg(test)]
#[path = "run_room_tests.rs"]
mod run_room_tests;

#[cfg(test)]
#[path = "run_source_tests.rs"]
mod run_source_tests;
