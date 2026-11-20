//! The fallen: a player dead long enough stands again at the spawn nearest where they fell, whole, and a foe dead
//! long enough is gone.

use crate::players::GRACE;
use crate::{EventKind, PlayerId, Room};
use combat::Fighter;
use combat::fighter::{Action, FighterId, player};
use combat::tuning::{FOE_GONE, RESPAWN};

impl Room {
    /// A player dead long enough stands again at the spawn nearest where they fell, whole; a foe dead long enough is
    /// gone.
    pub(crate) fn raise_the_dead(&mut self) {
        let mut raised = Vec::new();
        let fallen: Vec<(PlayerId, Fighter)> = self
            .players
            .iter()
            .filter(|(_, found)| matches!(found.fighter.action, Action::Dead { elapsed } if elapsed >= RESPAWN))
            .map(|(id, found)| (*id, found.fighter))
            .collect();
        for (id, fighter) in fallen {
            let body = self.stand_again(fighter.body.x, fighter.body.y);
            let graced = self.clock + GRACE;
            if let Some(found) = self.players.get_mut(&id) {
                found.fighter = found.armed(player(body, fighter.arms));
                found.graced = graced;
                raised.push(id);
            }
        }
        for id in raised {
            self.tell(EventKind::Respawned, None, id, id, 0.0);
        }
        let gone: Vec<FighterId> = self
            .foes
            .iter()
            .filter(|(_, foe)| matches!(foe.fighter.action, Action::Dead { elapsed } if elapsed >= FOE_GONE))
            .map(|(id, _)| *id)
            .collect();
        for id in gone {
            self.foes.remove(&id);
            self.board.forget(id);
        }
    }
}
