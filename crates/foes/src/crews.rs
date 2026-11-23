//! A captain's deck crew, whom players who board it fight on foot: the Grey Tithe's deck types by its rank. A Minor's
//! is three Minors; a Major's four, one of them a Major; an Elite's five, one an Elite; a Miniboss's six, its mate (the
//! Tithe-Mate) the Miniboss; a Boss's its Boss and six. The plain hands are the three plain deck types in turn, the
//! Deckhand, the Hookman and the Pistoleer; the one of rank a Major's or an Elite's is the Bosun.

use crate::factions::GREY_TITHE;
use crate::ranks::Rank;

/// The Tithe's deck types: its three plain hands, its heavy, its mate and its Boss.
struct Deck {
    hands: [u8; 3],
    heavy: u8,
    mate: u8,
    boss: u8,
}

const TITHE_DECK: Deck = Deck { hands: [7, 8, 9], heavy: 10, mate: 11, boss: 12 };

/// The deck crew of a captain of `faction` at `rank`: each one's type (the roster's number) and rank, its own first
/// where it has one; none for a faction other than the Grey Tithe, whose decks alone are met.
#[must_use]
pub fn deck_crew(faction: u8, rank: Rank) -> Vec<(u8, Rank)> {
    if faction != GREY_TITHE {
        return Vec::new();
    }
    let deck = TITHE_DECK;
    let (lead, hands) = match rank {
        Rank::Minor => (None, 3),
        Rank::Major => (Some((deck.heavy, Rank::Major)), 3),
        Rank::Elite => (Some((deck.heavy, Rank::Elite)), 4),
        Rank::Miniboss => (Some((deck.mate, Rank::Miniboss)), 5),
        Rank::Boss => (Some((deck.boss, Rank::Boss)), 6),
    };
    let plain = (0..hands).map(|nth| (deck.hands[nth % deck.hands.len()], Rank::Minor));
    lead.into_iter().chain(plain).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::factions::{CREW, LATTICE};
    use crate::roster::foe_type;

    #[test]
    fn each_rank_brings_its_crew_and_every_hand_is_a_deck_type_of_its_faction_at_a_rank_it_comes_in() {
        {
            let faction = GREY_TITHE;
            let sizes: Vec<usize> = [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss]
                .map(|rank| deck_crew(faction, rank).len())
                .to_vec();
            assert_eq!(sizes, vec![3, 4, 5, 6]);
            for rank in [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss, Rank::Boss] {
                for (number, hand) in deck_crew(faction, rank) {
                    let found = foe_type(number).expect("a type of the roster");
                    assert_eq!((found.faction, found.domain), (faction, crate::roster::Domain::Deck));
                    assert!(found.ranks.contains(&hand), "{} as a {hand:?}", found.name);
                }
            }
        }
    }

    #[test]
    fn a_major_an_elite_and_a_miniboss_lead_with_one_of_their_rank_and_a_boss_only_the_tithes() {
        assert_eq!(deck_crew(GREY_TITHE, Rank::Elite)[0], (10, Rank::Elite));
        assert_eq!(deck_crew(GREY_TITHE, Rank::Miniboss)[0], (11, Rank::Miniboss));
        let thule = deck_crew(GREY_TITHE, Rank::Boss);
        assert_eq!((thule.len(), thule[0]), (7, (12, Rank::Boss)));
        for faction in [CREW, 2, LATTICE] {
            assert!(
                Rank::ALL.iter().all(|&rank| deck_crew(faction, rank).is_empty()),
                "only the Tithe's decks are met"
            );
        }
        assert!(deck_crew(GREY_TITHE, Rank::Minor).iter().all(|(_, rank)| *rank == Rank::Minor));
    }
}
