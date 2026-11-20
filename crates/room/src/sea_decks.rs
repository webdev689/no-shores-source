//! The decks players board: each captain who struck and was boarded holds a deck room (`deck_fight`), stepped by the
//! sea, where her boarders fight her crew on foot. Clearing her deck opens her hold: what floats, twice over, every
//! chest a rank higher still, for each boarder. She is scuttled once the last of them has left her deck; boarders all
//! beaten there wash up at the nearest port city, their ships moored there with their hurts, and she is scuttled
//! with no one aboard.

use super::Sea;
use crate::battle::Sank;
use crate::deck::Deck;
use crate::pirates::Pirate;
use crate::players::Input;
use crate::{PlayerId, Refused, Room};
use std::collections::BTreeMap;

/// A boarded captain's deck: her ship as she sailed at sea, where she lies, her deck room, each boarder's number in it,
/// whether her crew has fallen, and her fight's wind.
#[derive(Debug)]
pub struct Boarded {
    pub pirate: Pirate,
    pub at: [f64; 2],
    pub wind: [f64; 2],
    pub room: Room,
    pub aboard: BTreeMap<PlayerId, PlayerId>,
    /// The sea's tick her crew fell on, once it has.
    pub won_at: Option<u64>,
}

/// How long her boarders have to take her hold once her crew has fallen, in the sea's ticks of 1/60 s: a minute.
pub const HOLD_TICKS: u64 = 3_600;

/// Every deck boarded, and each hull's deck (the Sloop's, the Schooner's, the Brig's and the Frigate's) to board.
#[derive(Debug, Default)]
pub struct Decks {
    pub hulls: Vec<Deck>,
    pub boarded: Vec<Boarded>,
}

/// Why a player's leaving a deck was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LeaveRefused {
    NotAboard,
    /// Her crew still fights.
    Fighting,
}

impl Sea {
    /// The decks of each hull a boarded captain may sail, by her hull's number.
    pub fn set_hull_decks(&mut self, decks: Vec<Deck>) {
        self.decks.hulls = decks;
    }

    /// The player boards a captain who struck alongside their ship (`Fights::board`): onto her deck room, their
    /// character with them, and everyone in the fight is told.
    pub fn board(&mut self, player: PlayerId) -> Result<(), crate::battle::BoardRefused> {
        if self.on_deck(player) {
            return Err(crate::battle::BoardRefused::NotFighting);
        }
        let (ship, pirate) = self.fights.board(player)?;
        let (at, wind) = self.fights.position_of(pirate.id).unwrap_or(([pirate.x, pirate.y], [0.0; 2]));
        let index = match self.decks.boarded.iter().position(|deck| deck.pirate.id == pirate.id) {
            Some(index) => index,
            None => {
                let hull = usize::from(pirate.commission.hull().number());
                let deck = self.decks.hulls.get(hull).unwrap_or(&self.deck);
                let (faction, rank) = (pirate.commission.faction, foe_rank(pirate.commission.rank));
                let room = Room::deck(deck, faction, rank, pirate.level.max(1));
                self.decks.boarded.push(Boarded { pirate, at, wind, room, aboard: BTreeMap::new(), won_at: None });
                self.decks.boarded.len() - 1
            }
        };
        let boarded = &mut self.decks.boarded[index];
        // A deck room just made always has room; only one already full refuses, and it keeps its boarders.
        let Some(boarder) = boarded.room.join() else { return Err(crate::battle::BoardRefused::NoneAlongside) };
        if let Some(text) = self.harbour.characters.get(&player).map(gear::Character::to_json) {
            boarded.room.restore_character(boarder, &text);
        }
        boarded.aboard.insert(player, boarder);
        let told = naval::wire::told_numbers(&naval::fight::Event::Boarding { ship }, self.clock as f64);
        self.harbour.told.push((player, told.unwrap_or_default()));
        Ok(())
    }

    /// Whether a player stands on a deck they boarded.
    #[must_use]
    pub fn on_deck(&self, player: PlayerId) -> bool {
        self.decks.boarded.iter().any(|deck| deck.aboard.contains_key(&player))
    }

    /// A boarder's input on her deck, taken by her deck room as a land room takes it.
    pub fn deck_input(&mut self, player: PlayerId, input: Input) -> Result<(), Refused> {
        let deck = self.decks.boarded.iter_mut().find(|deck| deck.aboard.contains_key(&player));
        let deck = deck.ok_or(Refused::NoSuchPlayer)?;
        let boarder = deck.aboard[&player];
        deck.room.input(boarder, input)
    }

    /// A boarder goes back to their own ship once her crew has fallen; she is scuttled when the last has gone.
    pub fn leave_deck(&mut self, player: PlayerId) -> Result<(), LeaveRefused> {
        let index = self.decks.boarded.iter().position(|deck| deck.aboard.contains_key(&player));
        let index = index.ok_or(LeaveRefused::NotAboard)?;
        if self.decks.boarded[index].won_at.is_none() {
            return Err(LeaveRefused::Fighting);
        }
        self.step_off(index, player);
        Ok(())
    }

    /// A boarder off her deck, their character back with them; the last one off scuttles her.
    pub(super) fn step_off(&mut self, index: usize, player: PlayerId) {
        let Some(deck) = self.decks.boarded.get_mut(index) else { return };
        let Some(boarder) = deck.aboard.remove(&player) else { return };
        let kept = deck.room.kept_character(boarder).and_then(|text| gear::Character::from_json(&text));
        deck.room.leave(boarder);
        if let (Some(mut character), Some(held)) = (kept, self.harbour.characters.get(&player)) {
            (character.ship, character.ship_at) = (held.ship, held.ship_at);
            self.harbour.characters.insert(player, character);
        }
        if deck.aboard.is_empty() {
            let pirate = self.decks.boarded.remove(index).pirate;
            self.fights.scuttle_by(pirate.id);
        }
    }

    /// Each deck's tick: its room steps; a crew all fallen opens her hold for her boarders, once; boarders all down
    /// wash up at the nearest port city and leave their fight.
    pub(super) fn tick_decks(&mut self) {
        let mut index = 0;
        while index < self.decks.boarded.len() {
            let deck = &mut self.decks.boarded[index];
            // One no boarder came aboard (her room was full) is scuttled as an empty one is.
            if deck.aboard.is_empty() {
                let pirate = self.decks.boarded.remove(index).pirate;
                self.fights.scuttle_by(pirate.id);
                continue;
            }
            deck.room.tick();
            if deck.won_at.is_none() && deck.room.cleared() {
                deck.won_at = Some(self.clock);
                // Her hold is opened: she lays no more when she goes down.
                self.fights.forget_hold(deck.pirate.id);
                let players: Vec<PlayerId> = deck.aboard.keys().copied().collect();
                let sank = Sank { pirate: deck.pirate, at: deck.at, players, wind: deck.wind };
                self.lay_flotsam(&sank, (2, 1));
            }
            let deck = &self.decks.boarded[index];
            // Her hold taken or not, her boarders go back aboard their own ships `HOLD_TICKS` after her crew fell.
            if deck.won_at.is_some_and(|at| self.clock >= at + HOLD_TICKS) {
                for player in deck.aboard.keys().copied().collect::<Vec<_>>() {
                    self.step_off(index, player);
                }
                continue;
            }
            if deck.won_at.is_none() && !deck.aboard.is_empty() && deck.room.all_down() {
                let (at, beaten): (_, Vec<PlayerId>) = (deck.at, deck.aboard.keys().copied().collect());
                for player in beaten {
                    self.step_off(index, player);
                    if let Some(kept) = self.fights.release(player) {
                        self.keep_hurts(player, kept);
                    }
                    self.wash_up(player, at, false);
                }
                continue;
            }
            index += 1;
        }
    }

    /// The character a boarder fights with on her deck, their ship's hurts in it.
    pub(super) fn deck_character(&self, player: PlayerId) -> Option<gear::Character> {
        let deck = self.decks.boarded.iter().find(|deck| deck.aboard.contains_key(&player))?;
        gear::Character::from_json(&deck.room.kept_character(deck.aboard[&player])?)
    }

    /// A deck whose ship went down under her boarders: each goes back to their own ship.
    pub(super) fn end_deck(&mut self, pirate: u32) {
        let Some(index) = self.decks.boarded.iter().position(|deck| deck.pirate.id == pirate) else { return };
        let boarders: Vec<PlayerId> = self.decks.boarded[index].aboard.keys().copied().collect();
        for player in boarders {
            self.step_off(index, player);
        }
    }

    /// A player leaving the sea leaves any deck they stood on.
    pub(super) fn leave_decks(&mut self, player: PlayerId) {
        if let Some(index) = self.decks.boarded.iter().position(|deck| deck.aboard.contains_key(&player)) {
            self.step_off(index, player);
        }
    }

    /// Each deck boarded, for its boarders' views.
    #[must_use]
    pub fn decks(&self) -> &[Boarded] {
        &self.decks.boarded
    }

    /// Each deck boarded, to take its room's happenings for its snapshot.
    pub fn decks_mut(&mut self) -> &mut [Boarded] {
        &mut self.decks.boarded
    }
}

/// The foes crate's rank of a captain's.
fn foe_rank(rank: naval::ranks::Rank) -> ::foes::Rank {
    use naval::ranks::Rank as Naval;
    match rank {
        Naval::Minor => ::foes::Rank::Minor,
        Naval::Major => ::foes::Rank::Major,
        Naval::Elite => ::foes::Rank::Elite,
        Naval::Miniboss => ::foes::Rank::Miniboss,
        Naval::Boss => ::foes::Rank::Boss,
    }
}
