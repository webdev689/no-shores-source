//! What each foe's brain is told it saw each tick: the swings begun and the shots loosed at it by fighters of another
//! side, the blows that reached it and its own that landed, how its telegraphed blows ended, and the noises made.

use crate::Room;
use crate::foes::Foe;
use ::foes::noises::{Noise, landed, running, shot, swing};
use ::foes::{Seen, notice};
use combat::Fighter;
use combat::fighter::FighterId;

impl Room {
    /// Tells each foe's brain what it saw this tick: swings begun and shots loosed by fighters of another side, blows
    /// that reached it and its own that landed, how its telegraphed blows ended, and every noise made.
    pub(crate) fn tell_brains(&mut self) {
        let (swings, loosed) = (std::mem::take(&mut self.swings), std::mem::take(&mut self.loosed));
        let noises = self.noises(&swings, &loosed);
        let swings: Vec<(FighterId, combat::fighter::Attack, Option<Fighter>)> =
            swings.into_iter().map(|(by, attack)| (by, attack, self.fighter(by).copied())).collect();
        // Each shot's speed as it flies, the newest of its shooter's: a ball that reaches its mark at once flies none.
        let speed = |by: FighterId| {
            let shot = self.shots.iter().rev().map(|(shot, _)| shot).find(|shot| shot.owner == by);
            shot.map_or(0.0, |shot| libm::sqrt(shot.velocity.iter().map(|part| part * part).sum()))
        };
        let loosed: Vec<(FighterId, Option<Fighter>, f64)> =
            loosed.into_iter().map(|by| (by, self.fighter(by).copied(), speed(by))).collect();
        let verdicts = std::mem::take(&mut self.verdicts);
        let ended = std::mem::take(&mut self.ended_telegraphs);
        let tick = self.clock;
        // A foe still arriving hears nothing: it neither thinks nor steps until it lands (`arrivals.rs`).
        let arriving: Vec<FighterId> = self.arrivals.foes.keys().copied().filter(|id| self.arriving(*id)).collect();
        for (id, Foe { fighter, brain, .. }) in &mut self.foes {
            if arriving.contains(id) {
                continue;
            }
            // Only a blow from another side is a threat to answer: an ally's would only crowd it out, and so would a
            // swing begun at another, which is not a swing begun at it.
            let at = [fighter.body.x, fighter.body.y];
            let swung_at = |striker: &Option<Fighter>| {
                striker.is_some_and(|striker| striker.side != fighter.side && ::foes::swung_at(&striker, *id, at))
            };
            for (by, attack, _) in swings.iter().filter(|(_, _, striker)| swung_at(striker)) {
                notice(brain, *id, &Seen::Swung { by: *by, attack: *attack }, tick);
            }
            // And only a shot loosed at it: one loosed away from it would only crowd out one that is.
            let shot_at = |shooter: &Option<Fighter>| {
                shooter.is_some_and(|shooter| shooter.side != fighter.side && ::foes::shot_at(&shooter, at))
            };
            for (by, _, speed) in loosed.iter().filter(|(_, shooter, _)| shot_at(shooter)) {
                notice(brain, *id, &Seen::Loosed { by: *by, speed: *speed }, tick);
            }
            for (striker, defender, verdict) in &verdicts {
                if defender == id {
                    notice(brain, *id, &Seen::Struck { by: *striker, verdict: *verdict }, tick);
                } else if striker == id {
                    notice(brain, *id, &Seen::Landed { on: *defender, verdict: *verdict }, tick);
                }
            }
            for noise in &noises {
                notice(brain, *id, &Seen::Heard(*noise), tick);
            }
            for (_, missed, perfectly_dodged) in ended.iter().filter(|(foe, _, _)| foe == id) {
                let seen = Seen::TelegraphEnded { missed: *missed, perfectly_dodged: *perfectly_dodged };
                notice(brain, *id, &seen, tick);
            }
        }
    }

    /// The noises made this tick: swings begun, shots loosed, blows landed, and runners' feet, but for a player's
    /// still in their grace.
    fn noises(&self, swings: &[(FighterId, combat::fighter::Attack)], loosed: &[FighterId]) -> Vec<Noise> {
        let swung = swings.iter().filter_map(|(id, _)| self.fighter(*id).map(swing));
        let shots = loosed.iter().filter_map(|id| self.fighter(*id).and_then(|by| Some(shot(by, by.arms.ranged?))));
        let blows = self
            .verdicts
            .iter()
            .filter_map(|(striker, defender, _)| Some(landed(self.fighter(*striker)?, self.fighter(*defender)?)));
        let fighters = self.fighters().into_iter().filter(|(id, _)| !self.left_be(*id));
        let runners = fighters.filter_map(|(_, by)| running(&by, self.clock));
        swung.chain(shots).chain(blows).chain(runners).collect()
    }
}
