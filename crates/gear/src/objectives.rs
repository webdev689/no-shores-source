//! What the bounties count: an objective is a count of something a room sees happen, and each feat a room sees counts
//! toward the bounties a character holds today.

use crate::bounties::{board, faction_at, faction_board, faction_places};
use crate::character::Character;
use crate::world::Difficulty;

/// The faction and ranks the board names, as `foes` and `naval` number them.
pub const GREY_TITHE: u8 = 1;
pub const ELITE_RANK: u8 = 3;
pub const MINIBOSS_RANK: u8 = 4;

/// What an objective counts: one each time the room sees its feat. Each none is any; a rank counts it and every rank
/// above. Read from the board's table, never kept with a character.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Objective {
    Fell { faction: Option<u8>, rank: Option<u8>, island: Option<String> },
    Gather { resource: Option<u8> },
    Sink { water: Option<String>, rank: Option<u8> },
    Clear { island: Option<String>, tier: Option<Difficulty> },
}

/// What a room saw happen: a foe felled, by each player who shares its kill, by its faction, rank and island (a
/// continent's id; none where the room knows none); a resource node gathered, by its resource's place in the
/// catalogue; a ship sunk or taken, by her water and rank; a dungeon cleared, by its island and tier.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Feat<'a> {
    Felled { faction: u8, rank: u8, island: Option<&'a str> },
    Gathered { resource: u8 },
    Sunk { water: Option<&'a str>, rank: u8 },
    Cleared { island: Option<&'a str>, tier: Difficulty },
}

/// Whether a place the objective names, if it names one, is the feat's: a feat whose place is unknown matches none.
fn same_place(named: Option<&String>, seen: Option<&str>) -> bool {
    named.is_none_or(|named| seen == Some(named.as_str()))
}

impl Objective {
    /// Whether a feat counts toward it: one of its own kind, of its faction or resource, of its rank or tier or
    /// higher, and in its island or water.
    #[must_use]
    pub fn counts(&self, feat: &Feat<'_>) -> bool {
        match (self, *feat) {
            (Objective::Fell { faction, rank, island }, Feat::Felled { faction: felled, rank: of, island: on }) => {
                faction.is_none_or(|faction| faction == felled)
                    && rank.is_none_or(|rank| of >= rank)
                    && same_place(island.as_ref(), on)
            }
            (Objective::Gather { resource }, Feat::Gathered { resource: gathered }) => {
                resource.is_none_or(|resource| resource == gathered)
            }
            (Objective::Sink { water, rank }, Feat::Sunk { water: sunk_in, rank: of }) => {
                rank.is_none_or(|rank| of >= rank) && same_place(water.as_ref(), sunk_in)
            }
            (Objective::Clear { island, tier }, Feat::Cleared { island: on, tier: at }) => {
                tier.is_none_or(|tier| at >= tier) && same_place(island.as_ref(), on)
            }
            _ => false,
        }
    }
}

impl Character {
    /// Counts a feat toward each bounty held today, up to its target: whether a count moved. A room whose day is not
    /// the record's counts no bounty: before it the board was another, after it they ended. A faction's counts only
    /// while the player serves it (`serves`): pledged to it, its cape worn.
    pub fn saw(&mut self, feat: &Feat<'_>, day: u64) -> bool {
        if day != self.activity.today.day {
            return false;
        }
        let town = board(day);
        let pledge = self.allegiance.pledge;
        let served = if self.serves(pledge) { faction_board(day, pledge) } else { None };
        let first = faction_places(pledge).start;
        let mut moved = false;
        for (place, count) in &mut self.activity.today.bounties {
            let bounty = match faction_at(*place) {
                Some(0) => town.get(usize::from(*place)),
                Some(faction) if faction == pledge => {
                    served.as_ref().and_then(|own| own.get(usize::from(*place - first)))
                }
                _ => None,
            };
            let Some(bounty) = bounty else { continue };
            if *count < bounty.target && bounty.objective.counts(feat) {
                *count += 1;
                moved = true;
            }
        }
        moved
    }
}

/// Counts a hostile ship sunk or taken toward each character that fought her, by her water (a continent's id, none
/// off every water) and rank: whether any count moved. Each is a held character the room passes once, so an account
/// listed twice among her fighters counts once.
pub fn count_ship_down<'a>(
    characters: impl IntoIterator<Item = &'a mut Character>,
    water: Option<&str>,
    rank: u8,
    day: u64,
) -> bool {
    let sunk = Feat::Sunk { water, rank };
    characters.into_iter().fold(false, |moved, character| character.saw(&sunk, day) | moved)
}
