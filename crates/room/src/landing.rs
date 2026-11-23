//! A patrol zone's landing, where a player arrives: no foe starts a fight with a player standing in it until they strike
//! from it, and a fight brought into it goes on, so it is somewhere to arrive, not to hide. The guards stand beyond it
//! (`garrison.rs`, SPAWN_CLEAR).

use crate::Room;
use combat::Happening;
use combat::fighter::FighterId;
use combat::sight::apart;

/// A patrol zone's landing reaches this far from a spawn, metres: past its boardwalk, lanterns, stores and signpost,
/// within about 12 m, and short of every guard, SPAWN_CLEAR off.
const LANDING_M: f64 = 15.0;

impl Room {
    /// Whether the foes leave a player be: one just stood again, until their grace ends or they strike, and one
    /// standing in a patrol zone's landing whom no foe fights yet, until they strike from it. Only a foe standing that
    /// thinks fights: an event's inert growth or tithe-taker, or a fallen foe lying with its target kept, does not.
    pub(crate) fn left_be(&self, id: FighterId) -> bool {
        self.players.get(&id).is_some_and(|found| {
            let landed = !self.landing_struck.contains(&id) && self.in_landing(&found.fighter.body);
            let fights = |(foe_id, foe): (&FighterId, &crate::foes::Foe)| {
                !foe.fighter.dead() && !self.inert.contains(foe_id) && foe.brain.fights() == Some(id)
            };
            found.graced > self.clock || (landed && !self.foes.iter().any(fights))
        })
    }

    /// A player's blow or shot ends the grace they stood again with, and the landing's leave until they have left it
    /// or stood again.
    pub(crate) fn struck(&mut self, id: FighterId, happening: Option<&Happening>) {
        if matches!(happening, Some(Happening::Swung(_) | Happening::Loosed(_)))
            && let Some(found) = self.players.get_mut(&id)
        {
            found.graced = 0;
            self.landing_struck.insert(id);
        }
    }

    /// A player out of the landing, or gone, has the landing's leave again once they come back to it, and one stood
    /// again, in their grace, has it at once: standing again at the landing they struck from does not leave it.
    pub(crate) fn leave_landings(&mut self) {
        let (players, clock) = (&self.players, self.clock);
        let landed = |id: &FighterId| {
            players.get(id).is_some_and(|found| found.graced <= clock && self.in_landing(&found.fighter.body))
        };
        let kept: std::collections::BTreeSet<FighterId> = self.landing_struck.iter().copied().filter(landed).collect();
        self.landing_struck = kept;
    }

    /// Whether a body stands in a patrol zone's landing: within LANDING_M of one of its spawns.
    fn in_landing(&self, body: &movement::Body) -> bool {
        self.place == Some(gear::gate::Place::Patrol)
            && self
                .section
                .as_ref()
                .is_some_and(|section| section.spawns.iter().any(|&spawn| apart([body.x, body.y], spawn) < LANDING_M))
    }
}
