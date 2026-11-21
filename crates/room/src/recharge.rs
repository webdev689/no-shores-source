//! A player's blows fill their meter toward the next healing charge as the room settles them: each by the share of its
//! foe's most health it took, weighed by the foe's rank, and a kill by its rank's share. The rules spend the charges
//! (`combat::drink`); here they come back. They are never saved: a player stands in every room, and again after
//! death, with all three.

use crate::Room;
use ::foes::Rank;
use combat::fighter::FighterId;

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

/// What dealing a foe's whole health gives, as a share of what its kill gives: a Minor's blows and kill come to half a
/// charge, and a Boss's blows to half a charge over its fight besides its adds'. As a share of the foe's own health it
/// is the same at every level and difficulty.
pub const DEALT_SHARE: f64 = 0.5;

impl Room {
    /// A player's blow on a foe fills their meter: by `dealt` (to its health and its shield), as a share of the foe's
    /// most health, weighed by its rank; and by its rank's share if it killed.
    pub(crate) fn recharge(&mut self, striker: FighterId, defender: FighterId, dealt: f64, killed: bool) {
        let Some(foe) = self.foes.get(&defender) else { return };
        let share = kill_share(foe.brain.rank);
        let took = (dealt / foe.fighter.health_max.max(1.0)).max(0.0);
        let gain = share * (DEALT_SHARE * took + if killed { 1.0 } else { 0.0 });
        if let Some(found) = self.players.get_mut(&striker) {
            found.fighter = combat::drink::recharged(&found.fighter, gain);
        }
    }
}
