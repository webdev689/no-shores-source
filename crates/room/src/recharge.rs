//! A player's blows fill their meter toward the next healing charge as the room settles them: each by the share it
//! took of its foe's most health and most shield together, weighed by the foe's rank; and a kill gives its rank's
//! share to every player whose blow, or whose companion's or boarding hand's, landed on it in its last ten seconds
//! while it fought, as its XP is shared. A blow on a foe walking home, its fight given up, gives nothing and counts
//! toward no kill: shot from where it will not follow, it would fill the meter with no fight. The rules spend the
//! charges (`combat::drink`); here they come back. A player stands in a room with all three, and again after death; one
//! who left comes back with the charges they left with for two minutes (`left`).

use crate::Room;
use ::foes::Rank;
use combat::fighter::FighterId;
use gear::rewards::SHARE_TICKS;

/// What a kill gives toward the next charge, by its foe's rank: a third of a charge for a Minor or a Major, two thirds
/// for an Elite or a Miniboss, a whole one for a Boss.
#[must_use]
pub fn kill_share(rank: Rank) -> f64 {
    match rank {
        Rank::Minor | Rank::Major => 1.0 / 3.0,
        Rank::Elite | Rank::Miniboss => 2.0 / 3.0,
        Rank::Boss => 1.0,
    }
}

/// What dealing a foe's whole health and shield gives, as a share of what its kill gives: a Minor's blows and kill come
/// to half a charge, and a Boss's blows to half a charge over its fight besides its adds'. As a share of the foe's own
/// health it is the same at every level and difficulty.
pub const DEALT_SHARE: f64 = 0.5;

impl Room {
    /// A blow that took `dealt` from a foe (its health and its shield) fills its player's meter (a companion's or a
    /// boarding hand's, their leader's) by that share of the foe's most health and most shield, weighed by its rank,
    /// and marks the foe struck by them.
    pub(crate) fn recharge(&mut self, striker: FighterId, defender: FighterId, dealt: f64) {
        let Some(foe) = self.foes.get(&defender) else { return };
        let took = dealt > 0.0;
        if !took || foe.brain.returning() {
            return;
        }
        let striker = if self.players.contains_key(&striker) {
            striker
        } else {
            let Some((leader, _)) = self.credited(striker, None) else { return };
            leader
        };
        let most = foe.fighter.health_max + foe.shield.map_or(0.0, |shield| shield.most);
        let gain = kill_share(foe.brain.rank) * DEALT_SHARE * dealt / most.max(1.0);
        let clock = self.clock;
        if let Some(found) = self.players.get_mut(&striker) {
            found.fighter = combat::drink::recharged(&found.fighter, gain);
            found.struck.retain(|_, tick| clock.saturating_sub(*tick) <= SHARE_TICKS);
            found.struck.insert(defender, clock);
        }
    }

    /// A foe's kill gives its rank's share to every player who struck it in its last ten seconds, once each.
    pub(crate) fn recharge_kill(&mut self, defender: FighterId) {
        let Some(share) = self.foes.get(&defender).map(|foe| kill_share(foe.brain.rank)) else { return };
        let clock = self.clock;
        for found in self.players.values_mut() {
            if found.struck.remove(&defender).is_some_and(|tick| clock.saturating_sub(tick) <= SHARE_TICKS) {
                found.fighter = combat::drink::recharged(&found.fighter, share);
            }
        }
    }
}
