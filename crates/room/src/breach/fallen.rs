//! How the fallen stand again in a Breach's run. Outside a running encounter (on the Descent, the Broken Stair, or
//! between encounters) a fallen player stands again of themselves after a while, at either tier, at the furthest stage
//! reached. Inside one, at Normal they stand again after longer, at its stage; at Hard never of themselves. At either
//! tier a living player of the company raises a fallen one where they lie by holding Use beside their body; at Hard
//! each raising spends one of the attempt's shared revives, and with none left the fallen stay down
//! ([[The First Breach Follows the Vault of Glass, at Normal and Hard]]).

use super::{Breach, Phase};
use crate::players::GRACE;
use crate::{EventKind, PlayerId, Room};
use combat::fighter::player;
use reach::Standing;

/// How long a player down outside a running encounter lies before standing again, ticks: six seconds.
pub const STANDS_OUTSIDE: u32 = 6 * 60;
/// How long a player down in a running encounter at Normal lies before standing again, ticks: ten seconds.
pub const STANDS_INSIDE: u32 = 10 * 60;
/// How long a raising takes, ticks (three seconds), and how near the body the raiser stands, metres.
pub const RAISE_TICKS: u64 = 3 * 60;
pub const RAISE_REACH_M: f64 = 2.5;
/// Why a raising is refused, as its answer: no revive left, or no fallen body in reach.
pub const NO_REVIVES: u8 = 110;
pub const NONE_TO_RAISE: u8 = 111;

impl Room {
    /// Whether a player killed in a fight has lain as long as they lie (`stands_after`), so they stand again now.
    pub(crate) fn lain_long_enough(&self, id: PlayerId) -> bool {
        let (Some(found), Some(after)) = (self.players.get(&id), self.stands_after(id)) else { return false };
        matches!(found.fighter.action, combat::fighter::Action::Dead { elapsed } if elapsed >= after)
    }

    /// How long a fallen player lies before standing again of themselves in a Breach's run, ticks; none for never
    /// (Hard, while an encounter runs, wherever they fell); in any other room, the combat rules' own.
    pub(crate) fn stands_after(&self, id: PlayerId) -> Option<u32> {
        let body = self.players.get(&id).map(|found| [found.fighter.body.x, found.fighter.body.y]);
        if let Some(gate) =
            self.breach_gate.as_ref().filter(|gate| gate.fighting(id) && body.is_some_and(|at| gate.in_hollow(at)))
        {
            let tier = gate.run_of(id).and_then(|run| gate.companies.get(run)).and_then(|company| company.tier);
            return tier.unwrap_or(gear::breach::Tier::Normal).stands_again().then_some(STANDS_INSIDE);
        }
        let Some(breach) = self.breach.as_ref() else { return Some(combat::tuning::RESPAWN) };
        self.players.get(&id)?;
        let running = (super::MENDING..=super::STEWARD).any(|each| matches!(breach.phases[each], Phase::Running(_)));
        match (running, breach.tier.stands_again()) {
            (false, _) => Some(STANDS_OUTSIDE),
            (true, true) => Some(STANDS_INSIDE),
            (true, false) => None,
        }
    }

    /// Whether a player the section killed (a fall) may ask to stand again: never at Hard inside a running encounter.
    pub(crate) fn may_respawn(&self, id: PlayerId) -> bool {
        self.stands_after(id).is_some()
    }

    /// A player stood whole at `at`, graced, and told they stand again.
    pub(crate) fn stand_whole(&mut self, id: PlayerId, at: [f64; 3]) {
        let body = self.stand((at[0], at[1]));
        let body = movement::Body { z: at[2].max(body.z), ..body };
        let graced = self.clock + GRACE;
        let Some(found) = self.players.get_mut(&id) else { return };
        let arms = found.fighter.arms;
        found.fighter = found.armed(player(body, arms));
        (found.standing, found.stood, found.graced) = (Standing::Inside, body.z, graced);
        self.tell(EventKind::Respawned, None, id, id, 0.0);
    }

    /// Every fallen player stood whole at the furthest stage reached, as an encounter is won.
    pub(crate) fn stand_the_fallen(&mut self, breach: &mut Breach) {
        let (at, _) = self.checkpoint(breach);
        let fallen: Vec<PlayerId> =
            self.players.iter().filter(|(_, found)| !found.living()).map(|(id, _)| *id).collect();
        breach.raising.retain(|_, (whom, _)| !fallen.contains(whom));
        for id in fallen {
            self.stand_whole(id, at);
        }
    }

    /// A player begins to raise the fallen player `whom`: refused unless both are in the run, the raiser living and
    /// within reach of the body, the body down in a fight (not fallen into the dark) and, at Hard, a revive is left.
    pub(crate) fn begin_raising(&mut self, id: PlayerId, whom: PlayerId) -> Result<(), u8> {
        let Some(breach) = self.breach.as_ref() else { return Err(NONE_TO_RAISE) };
        let (Some(raiser), Some(fallen)) = (self.players.get(&id), self.players.get(&whom)) else {
            return Err(NONE_TO_RAISE);
        };
        let in_reach = combat::sight::apart(
            [raiser.fighter.body.x, raiser.fighter.body.y],
            [fallen.fighter.body.x, fallen.fighter.body.y],
        ) <= RAISE_REACH_M;
        let down = fallen.fighter.dead() && !matches!(fallen.standing, Standing::Dead { .. });
        if id == whom || !raiser.living() || !down || !in_reach {
            return Err(NONE_TO_RAISE);
        }
        if breach.revives == Some(0) {
            return Err(NO_REVIVES);
        }
        let clock = self.clock;
        if let Some(breach) = self.breach.as_mut() {
            breach.raising.insert(id, (whom, clock));
        }
        Ok(())
    }

    /// Each raising goes on while its raiser lives and stands within reach of the body still down, and once held
    /// RAISE_TICKS stands the fallen whole where they lie, spending a revive where they are counted.
    pub(crate) fn keep_raising(&mut self, breach: &mut Breach) {
        let raising: Vec<(PlayerId, (PlayerId, u64))> = breach.raising.iter().map(|(id, held)| (*id, *held)).collect();
        for (id, (whom, from)) in raising {
            let (Some(raiser), Some(fallen)) = (self.players.get(&id), self.players.get(&whom)) else {
                breach.raising.remove(&id);
                continue;
            };
            let (at, body) = (raiser.fighter.body, fallen.fighter.body);
            let still = raiser.living()
                && fallen.fighter.dead()
                && combat::sight::apart([at.x, at.y], [body.x, body.y]) <= RAISE_REACH_M + 0.3;
            if !still || breach.revives == Some(0) {
                breach.raising.remove(&id);
                continue;
            }
            if self.clock < from + RAISE_TICKS {
                continue;
            }
            breach.raising.remove(&id);
            breach.raising.retain(|_, (other, _)| *other != whom);
            if let Some(left) = breach.revives.as_mut() {
                *left -= 1;
            }
            self.stand_whole(whom, [body.x, body.y, body.z]);
            self.tell(EventKind::Revived, None, id, whom, f64::from(breach.revives.unwrap_or(u8::MAX)));
        }
    }

    /// A player's ask to raise `whom`: in a Breach's run, or in the Waking among the company holding the gate.
    pub(crate) fn ask_raise(&mut self, id: PlayerId, whom: PlayerId) -> u8 {
        if self.breach.is_some() {
            return self.begin_raising(id, whom).map_or_else(|refused| refused, |()| 0);
        }
        let clock = self.clock;
        let Some(gate) = self.breach_gate.as_ref() else { return NONE_TO_RAISE };
        let (Some(raiser), Some(fallen)) = (self.players.get(&id), self.players.get(&whom)) else {
            return NONE_TO_RAISE;
        };
        let near = combat::sight::apart(
            [raiser.fighter.body.x, raiser.fighter.body.y],
            [fallen.fighter.body.x, fallen.fighter.body.y],
        ) <= RAISE_REACH_M;
        let company = gate.fighting(id) && gate.fighting(whom);
        if !company || !near || !raiser.living() || !fallen.fighter.dead() {
            return NONE_TO_RAISE;
        }
        if gate.revives == Some(0) {
            return NO_REVIVES;
        }
        if let Some(gate) = self.breach_gate.as_mut() {
            gate.raising.insert(id, (whom, clock));
        }
        0
    }

    /// A player lets go of the raising they held.
    pub(crate) fn stop_raising(&mut self, id: PlayerId) -> u8 {
        if let Some(breach) = self.breach.as_mut() {
            breach.raising.remove(&id);
        }
        if let Some(gate) = self.breach_gate.as_mut() {
            gate.raising.remove(&id);
        }
        0
    }
}
