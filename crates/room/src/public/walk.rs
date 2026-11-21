//! Foes an event moves itself: its crystal growth, which stands where it rose; its tithe-taker on his round; and its
//! foes withdrawing as it ends. The room's brains leave such a foe be (`Room::inert`): it neither thinks nor strikes,
//! and is moved along the navmesh at its own pace, as a figure walking.

use super::Running;
use crate::Room;
use combat::fighter::FighterId;
use combat::sight::{apart, bearing};
use movement::TICK_SECONDS;
use movement::blocks::ground_at;

/// A walker this near its goal, across, stands there.
pub(crate) const ARRIVED: f64 = 0.6;
/// How fast withdrawing foes go, metres a second, and how long they have before they are gone wherever they stand.
const WITHDRAW_PACE: f64 = 4.0;
const WITHDRAW_TICKS: u64 = 8 * 60;

impl Room {
    /// Moves a foe the room leaves be a step toward `to` along the navmesh, at `pace` metres a second, facing the
    /// way it goes: whether it stands there now. A foe no longer standing stands nowhere to move.
    pub(crate) fn walk_inert(&mut self, id: FighterId, to: [f64; 3], pace: f64) -> bool {
        let Some(foe) = self.foes.get(&id) else { return true };
        let body = foe.fighter.body;
        let from = [body.x, body.y, body.z];
        if apart([from[0], from[1]], [to[0], to[1]]) <= ARRIVED {
            if let Some(foe) = self.foes.get_mut(&id) {
                (foe.fighter.body.vx, foe.fighter.body.vy, foe.fighter.body.moving) = (0.0, 0.0, false);
            }
            return true;
        }
        let way = self.inert_ways.entry(id).or_default();
        let next = self.nav.find_path_kept(way, from, to).and_then(|path| path.get(1).copied()).unwrap_or(to);
        let leg = apart([from[0], from[1]], [next[0], next[1]]).max(1e-9);
        let share = (pace * TICK_SECONDS / leg).min(1.0);
        let (x, y) = (from[0] + (next[0] - from[0]) * share, from[1] + (next[1] - from[1]) * share);
        let z = ground_at(&self.blocks, &self.floor, x, y, body.z);
        let facing = bearing([from[0], from[1]], [next[0], next[1]]);
        let Some(foe) = self.foes.get_mut(&id) else { return true };
        let moved = &mut foe.fighter.body;
        (moved.vx, moved.vy) = ((x - from[0]) / TICK_SECONDS, (y - from[1]) / TICK_SECONDS);
        (moved.x, moved.y, moved.z, moved.facing, moved.moving) = (x, y, z, facing, true);
        foe.fighter.aim = facing;
        false
    }

    /// Every living foe of the event withdraws to `to`, the room leaving them be: the Lattice into the closing crack,
    /// the Tithe out the way they came.
    pub(crate) fn withdraw(&mut self, running: &mut Running, to: [f64; 3]) {
        let until = self.clock + WITHDRAW_TICKS;
        for id in running.foes.clone() {
            if let Some(foe) = self.foes.get_mut(&id).filter(|foe| !foe.fighter.dead()) {
                // Whatever it was doing ends: it walks away.
                foe.fighter.action = combat::fighter::Action::Idle;
                self.inert.insert(id);
                running.withdrawing.push((id, to, until));
            }
        }
    }

    /// Each withdrawing foe walks on, and is gone once it gets there or its time is up; one killed on the way stays
    /// killed.
    pub(crate) fn walk_away(&mut self, running: &mut Running) {
        let clock = self.clock;
        for (id, to, until) in std::mem::take(&mut running.withdrawing) {
            if self.foes.get(&id).is_none_or(|foe| foe.fighter.dead()) {
                self.inert.remove(&id);
                continue;
            }
            if self.walk_inert(id, to, WITHDRAW_PACE) || clock >= until {
                self.gone(id);
            } else {
                running.withdrawing.push((id, to, until));
            }
        }
    }

    /// A foe gone from the room at once, as a garrison's dead are once they have lain their time.
    pub(crate) fn gone(&mut self, id: FighterId) {
        self.foes.remove(&id);
        self.board.forget(id);
        self.inert.remove(&id);
        self.names.remove(&id);
    }

    /// The foes the room moves itself are never stepped, so their statuses, poise and staggers run down here, as a
    /// stepped foe's do; and the ways of those it no longer moves are let go.
    pub(crate) fn wear_inert(&mut self) {
        let inert = &self.inert;
        self.inert_ways.retain(|id, _| inert.contains(id));
        for id in &self.inert {
            if let Some(foe) = self.foes.get_mut(id).filter(|foe| !foe.fighter.dead()) {
                combat::step::wear(&mut foe.fighter);
            }
        }
    }
}
