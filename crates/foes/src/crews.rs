//! A captain's deck crew, whom players who board her fight on foot: her faction's deck types by her rank. A Minor's
//! is three Minors; a Major's four, one of them a Major; an Elite's five, one an Elite; a Miniboss's six, her mate (the
//! Grey Tithe's Tithe-Mate, the pirates' Captain) the Miniboss; a Boss's her Boss and six. The plain hands are the
//! faction's three plain deck types in turn, its skirmisher, its swordsman and its shot; the one of rank a Major's or
//! an Elite's is its heavy (the Bosun, the pirates' Brute).

use crate::factions::{GREY_TITHE, PIRATES};
use crate::ranks::Rank;

/// A faction's deck types: its three plain hands, its heavy, its mate and its Boss (none for the pirates).
struct Deck {
    hands: [u8; 3],
    heavy: u8,
    mate: u8,
    boss: Option<u8>,
}

fn deck_of(faction: u8) -> Option<Deck> {
    match faction {
        GREY_TITHE => Some(Deck { hands: [7, 8, 9], heavy: 10, mate: 11, boss: Some(12) }),
        PIRATES => Some(Deck { hands: [13, 14, 16], heavy: 15, mate: 17, boss: None }),
        _ => None,
    }
}

/// The deck crew of a captain of `faction` at `rank`: each one's type (the roster's number) and rank, her own first
/// where she has one; none for a faction with no deck types, or a Boss with no Boss of her faction.
#[must_use]
pub fn deck_crew(faction: u8, rank: Rank) -> Vec<(u8, Rank)> {
    let Some(deck) = deck_of(faction) else { return Vec::new() };
    let (lead, hands) = match rank {
        Rank::Minor => (None, 3),
        Rank::Major => (Some((deck.heavy, Rank::Major)), 3),
        Rank::Elite => (Some((deck.heavy, Rank::Elite)), 4),
        Rank::Miniboss => (Some((deck.mate, Rank::Miniboss)), 5),
        Rank::Boss => match deck.boss {
            Some(boss) => (Some((boss, Rank::Boss)), 6),
            None => return Vec::new(),
        },
    };
    let plain = (0..hands).map(|nth| (deck.hands[nth % deck.hands.len()], Rank::Minor));
    lead.into_iter().chain(plain).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::roster::foe_type;

    #[test]
    fn each_rank_brings_its_crew_and_every_hand_is_a_deck_type_of_her_faction_at_a_rank_it_comes_in() {
        for faction in [GREY_TITHE, PIRATES] {
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
        assert_eq!(deck_crew(PIRATES, Rank::Major)[0], (15, Rank::Major));
        assert_eq!(deck_crew(GREY_TITHE, Rank::Elite)[0], (10, Rank::Elite));
        assert_eq!(deck_crew(GREY_TITHE, Rank::Miniboss)[0], (11, Rank::Miniboss));
        assert_eq!(deck_crew(PIRATES, Rank::Miniboss)[0], (17, Rank::Miniboss));
        let thule = deck_crew(GREY_TITHE, Rank::Boss);
        assert_eq!((thule.len(), thule[0]), (7, (12, Rank::Boss)));
        assert!(deck_crew(PIRATES, Rank::Boss).is_empty());
        assert!(deck_crew(GREY_TITHE, Rank::Minor).iter().all(|(_, rank)| *rank == Rank::Minor));
    }
}
