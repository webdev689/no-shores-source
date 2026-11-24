//! Destiny's revive. A player fallen in a fight lies where they fell until an ally revives them, holding Use beside
//! them for REVIVE_TICKS, or until they respawn by their own ask once they have lain RESPAWN ticks: revived, they stand
//! where they lay; respawned, where `stand_again` puts them (`respawns.rs`), whole either way, the foes leaving them be
//! for GRACE. A darkness zone (an Elite Dungeon's Court while its Boss stands, an Abyss run with no revive left) takes
//! no ask to respawn: only an ally stands the fallen up there, and a company all down in the Court falls back to its
//! checkpoint as the Court starts over. In an Abyss run every stand, revived or respawned, takes one of the company's
//! revives (`abyss.rs`). A room with no section (the Test Ground, the prologue's wreck), whose page never asks, stands
//! its fallen again as soon as they may.

use crate::players::GRACE;
use crate::{EventKind, PlayerId, Room};
use combat::fighter::{Action, FighterId, player};
use combat::tuning::{FOE_GONE, RESPAWN};
use movement::Body;
use reach::Standing;
use std::collections::BTreeMap;

/// How long an ally holds Use beside a fallen player to revive them: 2 s, as long as a node's gather is held.
pub const REVIVE_TICKS: u32 = 120;
/// How near a fallen player's body an ally stands to revive them, metres across, and at most this far above or below.
pub const REVIVE_REACH_M: f64 = 2.5;
pub const REVIVE_RISE_M: f64 = 2.0;

/// What a room keeps of its players standing again: each fallen player an ally is reviving, with the ally and the
/// ticks they have held; in a patrol zone or a world boss's node the points near where a player fell that they may
/// stand again at (`respawns.rs`); and an activity's checkpoints (`checkpoints.rs`).
#[derive(Debug, Default)]
pub(crate) struct Respawning {
    pub revivals: BTreeMap<PlayerId, (PlayerId, u32)>,
    pub near: Vec<[f64; 2]>,
    pub checkpoints: Vec<crate::checkpoints::Checkpoint>,
}

/// A fallen player being revived, as a snapshot carries it: who, by whom, and how much of the hold is done, per mille.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reviving {
    pub fallen: PlayerId,
    pub reviver: PlayerId,
    pub progress: u16,
}

impl Room {
    /// Each tick, after the fight is judged: an Abyss run whose players are all down starts over (`abyss.rs`), and a
    /// company all down in a darkness zone falls back to its checkpoint; else each revive under way is held on, each
    /// fallen player who asked (and may) respawns, and a foe dead long enough is gone.
    pub(crate) fn raise_the_dead(&mut self) {
        if self.wiped() {
            self.start_over();
            return;
        }
        if self.fallen_in_darkness() {
            self.fall_back();
            return;
        }
        self.keep_revivals();
        let (unasked, dark) = (self.section.is_none(), self.darkness());
        let fallen: Vec<(PlayerId, Body)> = self
            .players
            .iter()
            .filter(|(_, found)| matches!(found.fighter.action, Action::Dead { elapsed } if elapsed >= RESPAWN))
            // One the section killed too stands again only by its own respawn, which ends that death as well.
            .filter(|(_, found)| !matches!(found.standing, Standing::Dead { .. }))
            .filter(|(_, found)| (unasked || found.respawn_asked) && !dark)
            .map(|(id, found)| (*id, found.fighter.body))
            .collect();
        for found in self.players.values_mut() {
            found.respawn_asked = false;
        }
        for (id, lain) in fallen {
            if !self.revive() {
                continue;
            }
            let body = self.stand_again(lain.x, lain.y);
            self.stand_up(id, body, None);
        }
        let gone: Vec<FighterId> = self
            .foes
            .iter()
            .filter(|(_, foe)| matches!(foe.fighter.action, Action::Dead { elapsed } if elapsed >= FOE_GONE))
            .map(|(id, _)| *id)
            .collect();
        for id in gone {
            self.foes.remove(&id);
            self.quests.spoilless.remove(&id);
            self.board.forget(id);
            self.quiet.remove(&id);
            self.names.remove(&id);
        }
    }

    /// Whether the room is a darkness zone now, where no one respawns by their own ask: an Elite Dungeon's Court while
    /// its Boss stands, or an Abyss run with no revive left.
    #[must_use]
    pub fn darkness(&self) -> bool {
        self.boss().is_some() || self.revives() == Some(0)
    }

    /// Whether every player the room judges (those it keeps, where it keeps anyone) is down in the Court's darkness.
    fn fallen_in_darkness(&self) -> bool {
        let keeps = self.players.values().any(|found| found.owner.is_some());
        let mut judged = self.players.values().filter(|found| !keeps || found.owner.is_some());
        self.boss().is_some() && !self.players.is_empty() && judged.all(|found| found.fighter.dead())
    }

    /// A company fallen together in the Court: each player is told, shots, blows waiting and spells are dropped, the
    /// Court starts over (`court_start_over`), and every player stands whole at the checkpoint.
    fn fall_back(&mut self) {
        let players: Vec<PlayerId> = self.players.keys().copied().collect();
        for &id in &players {
            self.tell(EventKind::FellBack, None, id, id, 0.0);
        }
        self.shots.clear();
        self.pending.clear();
        self.spells.list.clear();
        self.respawning.revivals.clear();
        self.court_start_over();
        for id in players {
            let Some(lain) = self.players.get(&id).map(|found| found.fighter.body) else { continue };
            let body = self.stand_again(lain.x, lain.y);
            self.stand_up(id, body, None);
        }
    }

    /// Each ally holding Use to revive holds on over the fallen player they were reviving while they stay in reach,
    /// else takes up the nearest within reach no one else revives; one let go of starts again from nothing. A hold
    /// done stands the fallen player where they lay. In an Abyss run with no revive left no hold is taken up.
    fn keep_revivals(&mut self) {
        let at = |body: Body| [body.x, body.y, body.z];
        let revivers: Vec<(PlayerId, [f64; 3])> = self
            .players
            .iter()
            .filter(|(_, found)| found.reviving && found.living() && !found.mounted)
            .map(|(id, found)| (*id, at(found.fighter.body)))
            .collect();
        let fallen: Vec<(PlayerId, [f64; 3])> = self
            .players
            .iter()
            .filter(|(_, found)| found.fighter.dead() && !matches!(found.standing, Standing::Dead { .. }))
            .map(|(id, found)| (*id, at(found.fighter.body)))
            .collect();
        let held = std::mem::take(&mut self.respawning.revivals);
        if self.revives() == Some(0) {
            return;
        }
        let mut revivals: BTreeMap<PlayerId, (PlayerId, u32)> = BTreeMap::new();
        for (reviver, from) in revivers {
            let reached = |lying: [f64; 3]| {
                libm::hypot(lying[0] - from[0], lying[1] - from[1]) <= REVIVE_REACH_M
                    && (lying[2] - from[2]).abs() <= REVIVE_RISE_M
            };
            let kept = held.iter().find(|(_, (by, _))| *by == reviver).map(|(lying, (_, ticks))| (*lying, *ticks));
            let kept = kept.filter(|(lying, _)| fallen.iter().any(|(id, place)| id == lying && reached(*place)));
            let taken = |id: &PlayerId| revivals.contains_key(id);
            let nearest = fallen
                .iter()
                .filter(|(id, place)| !taken(id) && reached(*place))
                .min_by(|one, two| {
                    let far = |place: [f64; 3]| libm::hypot(place[0] - from[0], place[1] - from[1]);
                    far(one.1).total_cmp(&far(two.1))
                })
                .map(|(id, _)| (*id, 0));
            if let Some((lying, ticks)) = kept.filter(|(lying, _)| !taken(lying)).or(nearest) {
                revivals.insert(lying, (reviver, ticks + 1));
            }
        }
        let done: Vec<(PlayerId, PlayerId)> =
            revivals.iter().filter(|(_, (_, ticks))| *ticks >= REVIVE_TICKS).map(|(id, (by, _))| (*id, *by)).collect();
        self.respawning.revivals = revivals;
        for (id, by) in done {
            if !self.revive() {
                continue;
            }
            let Some(lain) = self.players.get(&id).map(|found| found.fighter.body) else { continue };
            let body = Body { facing: lain.facing, ..self.stand((lain.x, lain.y)) };
            self.stand_up(id, body, Some(by));
        }
    }

    /// A fallen player stands as `body` stands, whole with every healing charge and inside the section, a fall
    /// measured from where their feet stand now, the foes leaving them be for GRACE; every player is told, as revived
    /// by `by` or respawned.
    pub(crate) fn stand_up(&mut self, id: PlayerId, body: Body, by: Option<PlayerId>) {
        let graced = self.clock + GRACE;
        let Some(found) = self.players.get_mut(&id) else { return };
        let arms = found.fighter.arms;
        found.fighter = found.armed(player(body, arms));
        (found.standing, found.stood, found.graced, found.respawn_asked) = (Standing::Inside, body.z, graced, false);
        self.respawning.revivals.remove(&id);
        match by {
            Some(by) => self.tell(EventKind::Revived, None, by, id, 0.0),
            None => self.tell(EventKind::Respawned, None, id, id, 0.0),
        }
    }

    /// Each fallen player an ally is reviving now, as a snapshot carries them.
    #[must_use]
    pub fn reviving_seen(&self) -> Vec<Reviving> {
        let share = |ticks: u32| u16::try_from(u64::from(ticks.min(REVIVE_TICKS)) * 1000 / u64::from(REVIVE_TICKS));
        let seen = self.respawning.revivals.iter();
        seen.map(|(fallen, (reviver, ticks))| Reviving {
            fallen: *fallen,
            reviver: *reviver,
            progress: share(*ticks).unwrap_or(1000),
        })
        .collect()
    }
}

#[cfg(test)]
#[path = "revive_tests.rs"]
mod revive_tests;
