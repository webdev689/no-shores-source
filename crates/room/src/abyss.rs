//! Abyss's rules, in every Abyss run: the company shares REVIVES, each fallen player's stand taking one, and the fallen
//! stay down once none is left, though they leave and come back. When every player in it is down at once, the run is
//! wiped and starts over: its foes stand again, its cache shuts, its revives are whole and its players stand at the way
//! in. A run whose cache stands open is won, and a room no one is in is never wiped.

use super::REVIVES;
use crate::players::GRACE;
use crate::{EventKind, Player, PlayerId, Room};
use combat::Action;
use combat::fighter::player;
use combat::tuning::RESPAWN;
use reach::Standing;

impl Room {
    /// The revives an Abyss run's company has left; none in any other room.
    #[must_use]
    pub fn revives(&self) -> Option<u8> {
        self.run.as_ref().and_then(|run| run.revives)
    }

    /// Whether a fallen player may stand again, taking one of the run's revives if it counts them.
    pub(crate) fn revive(&mut self) -> bool {
        match self.run.as_mut().and_then(|run| run.revives.as_mut()) {
            None => true,
            Some(0) => false,
            Some(left) => {
                *left -= 1;
                true
            }
        }
    }

    /// A kept player leaving a run that counts revives: the share of their health they left with kept by account, 0
    /// for one down, so coming back stands no one up whole, as `arts::keep_casting` keeps their Arts.
    pub(crate) fn keep_body(&mut self, gone: &Player) {
        let Some(owner) = gone.owner.clone() else { return };
        let Some(run) = self.run.as_mut().filter(|run| run.revives.is_some()) else { return };
        let fighter = gone.fighter;
        let share = if fighter.dead() { 0.0 } else { fighter.health / fighter.health_max.max(f64::EPSILON) };
        run.left.insert(owner, share);
    }

    /// An account's body given back as it comes into the run again: down where it left down, so the next raising
    /// spends a revive or leaves it down, else at the share of its health it left with.
    pub(crate) fn give_body_back(&mut self, player: PlayerId, owner: &str) {
        let Some(share) = self.run.as_mut().and_then(|run| run.left.remove(owner)) else { return };
        let Some(found) = self.players.get_mut(&player) else { return };
        let fighter = &mut found.fighter;
        if share > 0.0 {
            fighter.health = fighter.health_max * share.min(1.0);
        } else {
            (fighter.health, fighter.action) = (0.0, Action::Dead { elapsed: RESPAWN });
        }
    }

    /// Whether an Abyss run has just been wiped: someone is in it, every one of them is down, and its cache is shut.
    pub(crate) fn wiped(&self) -> bool {
        self.revives().is_some()
            && !self.players.is_empty()
            && self.players.values().all(|found| found.fighter.dead())
            && !self.cache.is_some_and(|cache| cache.open)
    }

    /// Starts an Abyss run over: every player is told Wiped; every foe, its way and the board's memory of it are
    /// gone; shots, blows waiting, spells and drops are dropped; every post stands again; the cache shuts and the
    /// revives are back at REVIVES; and every player stands whole at the way in.
    pub(crate) fn start_over(&mut self) {
        let players: Vec<PlayerId> = self.players.keys().copied().collect();
        for &id in &players {
            self.tell(EventKind::Wiped, None, id, id, 0.0);
        }
        self.send_foes_away();
        self.ways.clear();
        self.shots.clear();
        self.pending.clear();
        self.spells.list.clear();
        self.drops.clear();
        for post in 0..self.garrison.len() {
            self.stand_post(post);
        }
        if let Some(cache) = self.cache.as_mut() {
            cache.open = false;
        }
        if let Some(run) = self.run.as_mut() {
            run.revives = Some(REVIVES);
            run.left.clear();
        }
        let way_in = self.stand(self.spawn_points.first().copied().unwrap_or((0.0, 0.0)));
        let graced = self.clock + GRACE;
        for id in players {
            let Some(found) = self.players.get_mut(&id) else { continue };
            found.fighter = found.armed(player(way_in, found.fighter.arms));
            (found.standing, found.graced) = (Standing::Inside, graced);
        }
    }
}

#[cfg(test)]
#[path = "abyss_tests.rs"]
mod abyss_tests;
