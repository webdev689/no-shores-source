//! The crew as a room serves it: whom a player's officers are signed on through, and where. Officers are signed on
//! at the counter of the faction a player is pledged to; the pledge and their rank with it are read here, in one
//! place, so the faction rules decide them.

use crate::{PlayerId, Room};
use gear::{Ask, Character};

/// The faction a player is pledged to (0 none) and their rank with it.
#[must_use]
pub fn pledge_of(character: &Character) -> (u8, u32) {
    let pledge = character.allegiance.pledge;
    (pledge, character.rank(pledge))
}

/// Whether an ask is of the ship's: its modules, its materials or its crew. The sea keeps those while their player
/// fights on a boarded deck, so a deck refuses them.
#[must_use]
pub fn of_the_ship(ask: &Ask, character: &Character) -> bool {
    let module = |item: &u32| character.item(*item).is_some_and(|held| held.kind.module());
    match ask {
        Ask::Wear { slot, .. } | Ask::TakeOff { slot } => slot.ship(),
        Ask::Buy { item, .. } | Ask::Choose { item, .. } | Ask::Dismantle { item } => module(item),
        Ask::Infuse { .. }
        | Ask::Recruit { .. }
        | Ask::Station { .. }
        | Ask::Dismiss { .. }
        | Ask::Train { .. }
        | Ask::ChooseOfficer { .. } => true,
        Ask::Vend { vendor, .. } => vendor.for_ship(),
        _ => false,
    }
}

impl Room {
    /// The pledged faction, rank with it and the day, where a player stands at the counter that signs its officers
    /// on; none elsewhere, or with no pledge.
    #[must_use]
    pub fn recruiting_at(&self, player: PlayerId) -> Option<(u8, u32, u64)> {
        let faction = self.player(player).map_or(0, |found| found.character.allegiance.pledge);
        let here = self.here(player, &Ask::Recruit { faction, offer: 0 });
        (here.social && here.pledge != 0).then_some((here.pledge, here.rank, here.day))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asks::{Counter, CounterKind, counter_for};

    #[test]
    fn officers_are_signed_on_at_the_counter_of_the_faction_named() {
        assert_eq!(counter_for(&Ask::Recruit { faction: 2, offer: 0 }), Some(CounterKind::Faction(2)));
    }

    #[test]
    fn a_pledged_characters_faction_counter_offers_officers() {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        let player = room.join().expect("a room with space");
        let fighter = *room.fighter(player).expect("in");
        let at = [fighter.body.x, fighter.body.y];
        room.counters = Some(vec![Counter { kind: CounterKind::Faction(2), at }]);
        assert_eq!(room.recruiting_at(player), None, "no pledge, no officers");
        let character = &mut room.players.get_mut(&player).expect("in").character;
        character.allegiance.pledge = 2;
        character.allegiance.reputation = vec![0, 35_000, 0];
        let rank = character.rank(2);
        let (pledge, ranked, day) = room.recruiting_at(player).expect("at the Lamplighters' counter, pledged");
        assert_eq!((pledge, ranked), (2, rank));
        assert!(!gear::crew::recruit::offers(pledge, day, 1, ranked).is_empty(), "the officers of the day");
        room.counters = Some(vec![Counter { kind: CounterKind::Faction(3), at }]);
        assert_eq!(room.recruiting_at(player), None, "another faction's counter signs none on for them");
    }
}
