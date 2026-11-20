//! The crew as a room serves it: whom a player's officers are signed on through, and where. Officers are signed on
//! at the counter of the faction a player is pledged to; the pledge and their rank with it are read here, in one
//! place, so the faction rules decide them.

use crate::asks::CounterKind;
use crate::{PlayerId, Room};
use gear::{Ask, Character};

/// The faction a player is pledged to (0 none) and their rank with it.
#[must_use]
pub fn pledge_of(character: &Character) -> (u8, u32) {
    let _ = character;
    (0, 0)
}

/// The counter that signs officers on.
pub const MUSTER: CounterKind = CounterKind::Vendor(gear::vendor::Vendor::Shipwright);

impl Room {
    /// The pledged faction, rank with it and the day, where a player stands at the counter that signs its officers
    /// on; none elsewhere, or with no pledge.
    #[must_use]
    pub fn recruiting_at(&self, player: PlayerId) -> Option<(u8, u32, u64)> {
        let here = self.here(player, &Ask::Recruit { offer: 0 });
        (here.social && here.pledge != 0).then_some((here.pledge, here.rank, here.day))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asks::counter_for;

    #[test]
    fn officers_are_signed_on_at_the_muster() {
        assert_eq!(counter_for(&Ask::Recruit { offer: 0 }), Some(MUSTER));
    }
}
