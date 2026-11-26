//! How the fallen stand again in a Breach's run and its Waking. Outside a running encounter (on the Descent, the Broken
//! Stair, or between encounters) a fallen player stands again of themselves after a while, at either tier, at the
//! furthest stage reached. Inside one, at Normal they stand again after longer, at its stage; at Hard never of
//! themselves. At either tier the game's revive stands them sooner where they lie (`revive.rs`); at Hard each revive
//! spends one of the attempt's shared revives, and with none left the fallen stay down.

use super::{Breach, Phase};
use crate::{PlayerId, Room};
use combat::fighter::Action;
use movement::Body;
use reach::Standing;

/// How long a player down outside a running encounter lies before standing again, ticks: six seconds.
pub const STANDS_OUTSIDE: u32 = 6 * 60;
/// How long a player down in a running encounter at Normal lies before standing again, ticks: ten seconds.
pub const STANDS_INSIDE: u32 = 10 * 60;

impl Room {
    /// Whether the Breach's rules stand a fallen player again: anyone in its run, and the company holding its gate
    /// while their Waking runs, in its hollow.
    pub(crate) fn breach_holds(&self, id: PlayerId) -> bool {
        let body = self.players.get(&id).map(|found| [found.fighter.body.x, found.fighter.body.y]);
        let waking = |gate: &super::gate::Gate| gate.fighting(id) && body.is_some_and(|at| gate.in_hollow(at));
        self.breach.is_some() || self.breach_gate.as_deref().is_some_and(waking)
    }

    /// How long a fallen player lies under the Breach's rules before standing again of themselves, ticks; none for
    /// never (Hard, while an encounter or the Waking runs, wherever they fell).
    pub(crate) fn stands_after(&self, id: PlayerId) -> Option<u32> {
        if let Some(gate) = self.breach_gate.as_ref().filter(|gate| gate.fighting(id)) {
            let tier = gate.run_of(id).and_then(|run| gate.companies.get(run)).and_then(|company| company.tier);
            return tier.unwrap_or(gear::breach::Tier::Normal).stands_again().then_some(STANDS_INSIDE);
        }
        let breach = self.breach.as_ref()?;
        let running = (super::MENDING..=super::STEWARD).any(|each| matches!(breach.phases[each], Phase::Running(_)));
        match (running, breach.tier.stands_again()) {
            (false, _) => Some(STANDS_OUTSIDE),
            (true, true) => Some(STANDS_INSIDE),
            (true, false) => None,
        }
    }

    /// The fallen the Breach's rules stand again of themselves now: down in a fight (not fallen into the dark), and
    /// lain as long as they lie (`stands_after`).
    pub(crate) fn breach_stands_now(&self) -> Vec<(PlayerId, Body)> {
        let lain = |id: PlayerId, action: Action| match (action, self.stands_after(id)) {
            (Action::Dead { elapsed }, Some(after)) => elapsed >= after,
            _ => false,
        };
        self.players
            .iter()
            .filter(|(id, found)| self.breach_holds(**id) && !matches!(found.standing, Standing::Dead { .. }))
            .filter(|(id, found)| lain(**id, found.fighter.action))
            .map(|(id, found)| (*id, found.fighter.body))
            .collect()
    }

    /// Whether a player the section killed (a fall) may ask to stand again: under the Breach's rules once they have
    /// lain as long as a fight's dead lie there (`stands_after`), so never at Hard inside a running encounter.
    pub(crate) fn may_respawn(&self, id: PlayerId) -> bool {
        // A tester who fell into the dark has no one to wait on.
        if self.test || !self.breach_holds(id) {
            return true;
        }
        let lain = self.players.get(&id).map_or(0, |found| match found.standing {
            Standing::Dead { ticks, .. } => ticks,
            _ => 0,
        });
        self.stands_after(id).is_some_and(|after| lain >= after)
    }

    /// The revives left to the attempt a fallen player lies in: its run's, or its gate's company's in their Waking;
    /// none where they are not counted (`Tier::revives`).
    pub(crate) fn breach_revives(&self, fallen: PlayerId) -> Option<u8> {
        if let Some(breach) = self.breach.as_ref() {
            return breach.revives;
        }
        self.breach_gate.as_ref().filter(|gate| gate.fighting(fallen)).and_then(|gate| gate.revives)
    }

    /// Whether a player may revive a fallen one under the Breach's rules: the gate's company's fallen only by their
    /// company while their Waking runs, and no one once the attempt's revives are spent.
    pub(crate) fn breach_lets_revive(&self, reviver: PlayerId, fallen: PlayerId) -> bool {
        let company = self.breach_gate.as_ref().is_none_or(|gate| !gate.fighting(fallen) || gate.fighting(reviver));
        company && self.breach_revives(fallen) != Some(0)
    }

    /// A revive done spends one of the Breach's attempt's revives, where they are counted.
    pub(crate) fn spend_breach_revive(&mut self, fallen: PlayerId) {
        let waking = self.breach_gate.as_ref().is_some_and(|gate| gate.fighting(fallen));
        let gate = self.breach_gate.as_mut().filter(|_| waking).and_then(|gate| gate.revives.as_mut());
        if let Some(left) = self.breach.as_mut().and_then(|breach| breach.revives.as_mut()).or(gate) {
            *left = left.saturating_sub(1);
        }
    }

    /// Where the Breach's rules stand a fallen player by their respawn: in its run, at its furthest stage reached; at
    /// its gate while their company holds it, at the gate's arrival; none anywhere else.
    pub(crate) fn breach_stands_at(&self, id: PlayerId) -> Option<Body> {
        let breach = self.breach.as_ref().map(|breach| self.stage_at(breach).0);
        let gate = self.breach_gate.as_ref().filter(|gate| gate.holds(id)).and_then(|gate| gate.socket("arrival"));
        breach.or(gate).map(|at| self.standing_at(at))
    }

    /// A body standing at `at`: on the ground under it, or at its own height where that is higher.
    fn standing_at(&self, at: [f64; 3]) -> Body {
        let body = self.stand((at[0], at[1]));
        Body { z: at[2].max(body.z), ..body }
    }

    /// A player stood whole at `at`, as a respawn stands them (`stand_up`).
    pub(crate) fn stand_whole(&mut self, id: PlayerId, at: [f64; 3]) {
        let body = self.standing_at(at);
        self.stand_up(id, body, None);
    }

    /// Every fallen player stood whole at the furthest stage reached, as an encounter is won.
    pub(crate) fn stand_the_fallen(&mut self, breach: &mut Breach) {
        let (at, _) = self.stage_at(breach);
        let fallen: Vec<PlayerId> =
            self.players.iter().filter(|(_, found)| !found.living()).map(|(id, _)| *id).collect();
        for id in fallen {
            self.stand_whole(id, at);
        }
    }
}
