//! A playlist's run: one of the 18 Elite Dungeons at the playlist's tier, every foe at its band's level, with the
//! day's modifiers and at Abyss its revives (`gear::playlist`). Its clear pays the playlist's daily reward in the day
//! the run was opened for, and counts toward its weekly reward in that week, once a run for each account.

use super::{Pays, Run};
use crate::{PlayerId, Room};
use gear::Difficulty;
use gear::clock::week_of;
use gear::gate::Place;
use gear::playlist::Playlist;

/// What a run is laid with: its foes' levels, the run and its gate.
pub(super) type RunLaid = (Option<(u8, u8)>, Run, Place);

/// A playlist's run at `tier` with its foes at `foes_at`, opened on `day` in `week`: the foes' levels, the run and its
/// gate; none at Normal, or for a level no band of the playlist's stands its foes at.
pub(super) fn playlist_run(
    tier: Difficulty,
    foes_at: u8,
    (day, week): (u64, u64),
    revives: Option<u8>,
) -> Option<RunLaid> {
    let playlist = Playlist::ALL.into_iter().find(|playlist| playlist.tier() == tier)?;
    playlist.band_at(foes_at)?;
    let modifiers = playlist.modifiers(day);
    let run = Run {
        pays: Pays::Playlist { playlist, day, week },
        modifiers,
        revives,
        foes_at: Some(foes_at),
        ..Run::default()
    };
    Some((Some((foes_at, foes_at)), run, Place::Playlist(playlist, foes_at)))
}

impl Room {
    /// Pays a kept player a playlist run's clear as its cache opens, once a run for their account: the daily reward in
    /// the day the run was opened for, and a clear toward the weekly in its week. Each Vestige is kept as the day's is.
    pub(crate) fn pay_playlist(&mut self, player: PlayerId, level: u8) {
        let Some(Pays::Playlist { playlist, day: opened, week: opened_week }) =
            self.run.as_ref().map(|run| run.pays.clone())
        else {
            return;
        };
        let (day, week) = (self.day(), week_of(self.minute));
        let dice = self.dice(player);
        let Some(found) = self.players.get_mut(&player) else { return };
        // A player playing unkept keeps nothing, and an account counts once a run however often its cache opens.
        let Some(owner) = found.owner.clone() else { return };
        if !self.run.as_mut().is_some_and(|run| run.playlist_counted.insert(owner)) {
            return;
        }
        let character = &mut found.character;
        let mut paid = Vec::new();
        if opened == day {
            paid.extend(character.playlist_of_the_day(day, playlist, level, &dice).flatten());
        }
        if opened_week == week {
            paid.extend(character.playlist_of_the_week(week, playlist, level, &dice));
        }
        found.gear_changed = true;
        for vestige in paid {
            character.keep_paid(vestige);
        }
    }
}

#[cfg(test)]
#[path = "playlist_run_tests.rs"]
mod playlist_run_tests;
