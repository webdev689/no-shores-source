//! A patrol zone's landing, where a player arrives: no foe starts a fight with a player standing in it until they strike
//! from it, and a fight brought into it goes on with the foes that brought it, no other joining, so it is somewhere to
//! arrive, not to hide. An officer ashore standing there is left be as its player is, and starts no fight from it. A
//! player the foes leave be is struck by no blow aimed at another. The guards stand beyond it (`garrison.rs`,
//! SPAWN_CLEAR).

use crate::Room;
use combat::Happening;
use combat::fighter::{Fighter, FighterId};
use combat::sight::apart;
use std::collections::BTreeSet;

/// A patrol zone's landing reaches this far from a spawn, metres: past its boardwalk, lanterns, stores and signpost,
/// within about 12 m, and short of every guard, SPAWN_CLEAR off.
const LANDING_M: f64 = 15.0;

impl Room {
    /// Whether the foes leave a fighter be: a player just stood again, until their grace ends or they strike, and one
    /// landed (`landed`) whom no foe fights yet. Only a foe standing that thinks fights: an event's inert growth or
    /// tithe-taker, or a fallen foe lying with its target kept, does not.
    pub(crate) fn left_be(&self, id: FighterId) -> bool {
        let graced = self.players.get(&id).is_some_and(|found| found.graced > self.clock);
        graced || (self.is_landed(id) && !self.foes.keys().any(|foe| self.fighting(*foe) == Some(id)))
    }

    /// Whom a foe fights: none for one fallen or inert.
    fn fighting(&self, foe: FighterId) -> Option<FighterId> {
        let found = self
            .foes
            .get(&foe)
            .filter(|found| !found.fighter.dead() && !self.inert.contains(&foe) && !self.arriving(foe))?;
        found.brain.fights()
    }

    /// Whether a fighter stands landed in a patrol zone: a player in its landing who has not struck from it, or an
    /// officer ashore standing there.
    fn is_landed(&self, id: FighterId) -> bool {
        match self.players.get(&id) {
            Some(found) => !self.landing_struck.contains(&id) && self.in_landing(&found.fighter.body),
            None => {
                self.companion(id).is_some() && self.foes.get(&id).is_some_and(|foe| self.in_landing(&foe.fighter.body))
            }
        }
    }

    /// Everyone landed, for each foe's own view of them (`seen_by`); none outside a patrol zone.
    pub(crate) fn in_landings(&self) -> BTreeSet<FighterId> {
        let ids = self.players.keys().chain(self.foes.keys());
        ids.copied().filter(|id| self.place == Some(gear::gate::Place::Patrol) && self.is_landed(*id)).collect()
    }

    /// The fighters among `noticed` that `foe` notices: a foe of the factions sees one landed only if it already
    /// fights them, so no other joins a fight brought in; an officer landed sees only the foes that brought a fight in.
    pub(crate) fn seen_by(
        &self,
        foe: FighterId,
        noticed: &[(FighterId, Fighter)],
        landed: &BTreeSet<FighterId>,
    ) -> Vec<(FighterId, Fighter)> {
        let fights = self.fighting(foe);
        let officer = self.companion(foe).is_some();
        let seen = |id: &FighterId| {
            if !officer {
                return !landed.contains(id) || fights == Some(*id);
            }
            let factions = self.foes.contains_key(id) && self.companion(*id).is_none();
            !landed.contains(&foe)
                || !factions
                || fights == Some(*id)
                || self.fighting(*id).is_some_and(|on| landed.contains(&on))
        };
        noticed.iter().filter(|(id, _)| seen(id)).copied().collect()
    }

    /// Whether a blow of `striker`'s, a foe's, passes the player `defender` by: one the foes leave be, or landed and
    /// not fought by it, is struck by no blow aimed at another.
    pub(crate) fn spares(&self, striker: FighterId, defender: FighterId) -> bool {
        let graced = self.players.get(&defender).is_some_and(|found| found.graced > self.clock);
        let landed = self.players.contains_key(&defender) && self.is_landed(defender);
        graced || (landed && self.fighting(striker) != Some(defender))
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
