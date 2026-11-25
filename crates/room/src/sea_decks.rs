//! The decks players board: each captain who struck and was boarded holds a deck room (`deck_fight`), stepped by the
//! sea, where its boarders fight its crew on foot. Clearing its deck opens its hold: what floats, twice over, every
//! chest a rank higher still, for each boarder. It is scuttled once the last of them has left its deck; boarders all
//! beaten there wash up at the nearest port city, their ships moored there with their hurts, and it is scuttled
//! with no one aboard.

use super::Sea;
use crate::battle::Sank;
use crate::deck::Deck;
use crate::hostiles::Hostile;
use crate::players::Input;
use crate::{PlayerId, Refused, Room};
use std::collections::BTreeMap;

/// A boarded captain's deck: its ship as it sailed at sea, where it lies, its deck room, each boarder's number in it,
/// whether its crew has fallen, and its fight's wind.
#[derive(Debug)]
pub struct Boarded {
    pub hostile: Hostile,
    pub at: [f64; 2],
    pub wind: [f64; 2],
    pub room: Room,
    pub aboard: BTreeMap<PlayerId, PlayerId>,
    /// The sea's tick its crew fell on, once it has.
    pub won_at: Option<u64>,
}

/// How long its boarders have to take its hold once its crew has fallen, in the sea's ticks of 1/60 s: a minute.
pub const HOLD_TICKS: u64 = 3_600;

/// Every deck boarded, and each hull's deck (the Sloop's, the Schooner's, the Brig's and the Frigate's) to board.
#[derive(Debug, Default)]
pub struct Decks {
    pub hulls: Vec<Deck>,
    pub boarded: Vec<Boarded>,
    /// The host's own loot and world seeds (`Sea::reseed`), each deck's mixed from them by its ship; none in a sea no
    /// host reseeded.
    pub seeds: Option<(u64, u64)>,
}

/// Why a player's leaving a deck was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LeaveRefused {
    NotAboard,
    /// Its crew still fights.
    Fighting,
}

impl Sea {
    /// The deck of the hull a player sails, which they walk off the helm: the sea's own where it holds no deck of it.
    pub(crate) fn deck_of(&self, player: PlayerId) -> &Deck {
        let hull = super::ports::hull_sailed(&self.harbour.characters, player);
        self.decks.hulls.get(usize::from(hull.number())).unwrap_or(&self.deck)
    }

    /// The decks of each hull a boarded captain or a player may sail, by its hull's number.
    pub fn set_hull_decks(&mut self, decks: Vec<Deck>) {
        self.decks.hulls = decks;
    }

    /// The player boards a captain who struck alongside their ship (`Fights::board`): onto its deck room, their
    /// character with them, and everyone in the fight is told.
    pub fn board(&mut self, player: PlayerId) -> Result<(), crate::battle::BoardRefused> {
        if self.on_deck(player) {
            return Err(crate::battle::BoardRefused::NotFighting);
        }
        let (ship, hostile) = self.fights.board(player)?;
        let side = self.side_of(player, ship);
        let (at, wind) = self.fights.position_of(hostile.id).unwrap_or(([hostile.x, hostile.y], [0.0; 2]));
        let hull = usize::from(hostile.commission.hull().number());
        let spot = crate::deck_fight::rail_spot(self.decks.hulls.get(hull).unwrap_or(&self.deck), side);
        let index = match self.decks.boarded.iter().position(|deck| deck.hostile.id == hostile.id) {
            Some(index) => index,
            None => {
                let deck = self.decks.hulls.get(hull).unwrap_or(&self.deck);
                let (faction, rank) = (hostile.commission.faction, foe_rank(hostile.commission.rank));
                let mut room = Room::deck(deck, faction, rank, hostile.level.max(1));
                // Its crew stand at the level the sea's tier raised its ship to; their kills pay by that tier too.
                room.difficulty = self.hostiles.difficulty;
                room.set_minute(self.minute);
                if let Some((loot, world)) = self.decks.seeds {
                    let mix = |seed: u64| seed ^ u64::from(hostile.id).wrapping_mul(0x9E37_79B9_7F4A_7C15);
                    room.reseed(mix(loot), mix(world));
                }
                self.decks.boarded.push(Boarded { hostile, at, wind, room, aboard: BTreeMap::new(), won_at: None });
                self.decks.boarded.len() - 1
            }
        };
        let boarded = &mut self.decks.boarded[index];
        // A deck room just made always has room; only one already full refuses, and it keeps its boarders.
        let Some(boarder) = boarded.room.board_at(spot) else { return Err(crate::battle::BoardRefused::NoneAlongside) };
        if let Some(character) = self.harbour.characters.get(&player) {
            boarded.room.restore_character(boarder, &character.to_json());
            // Its hands left of its complement, and those its First Mate and perks lead aboard beside the player.
            // The fight's count first: the character's is written only when a fight ends.
            let kept = f64::from(character.ship[2]) / f64::from(gear::character::SHIP_WHOLE);
            let left = self.fights.hurts_of(player).map_or(kept, |(hurts, _)| hurts[2]);
            let class = naval::class::class_of(super::ports::hull_sailed(&self.harbour.characters, player));
            let hands = (left * class.build().crew).round() as u16;
            let count = crate::boarding_hands::boarding(hands, class.boarders, character.ship_trim().boarders);
            boarded.room.board_hands(boarder, count, character.ship_level());
        }
        boarded.aboard.insert(player, boarder);
        self.fights.stand_down(player);
        // The boarders already aboard are drawn in their dress by the one just come, who had no welcome to carry it.
        boarded.room.announce_dresses();
        let told = naval::wire::told_numbers(&naval::fight::Event::Boarding { ship }, self.clock as f64);
        self.harbour.told.push((player, told.unwrap_or_default()));
        Ok(())
    }

    /// The side of the captain's ship (`ship` in the player's fight) their own ship lies on: 1 its starboard, -1 its
    /// port.
    fn side_of(&mut self, player: PlayerId, ship: naval::shots::ShipId) -> f64 {
        let Some((fought, crew)) = self.fights.of_mut(player) else { return 1.0 };
        let (Some(own), Some(other)) = (fought.fight.vessel(crew.ship), fought.fight.vessel(ship)) else { return 1.0 };
        let (own, other) = (own.ship, other.ship);
        let across = (own.x - other.x) * libm::cos(other.heading) + (own.y - other.y) * libm::sin(other.heading);
        if across < 0.0 { -1.0 } else { 1.0 }
    }

    /// Whether a player stands on a deck they boarded.
    #[must_use]
    pub fn on_deck(&self, player: PlayerId) -> bool {
        self.decks.boarded.iter().any(|deck| deck.aboard.contains_key(&player))
    }

    /// Each fighting player's fight as their browser shows it (the naval crate's numbers), its lay over the fight's
    /// waters now, and its first captain's commission; then the last view of each fight that ended unseen.
    pub fn fight_views(&self) -> Vec<crate::battle::FightSeen> {
        let time = self.clock as f64 * movement::TICK_SECONDS;
        // One on a deck boards no other.
        let seen = self.fights.views(&self.coasts, time);
        seen.map(|seen| crate::battle::FightSeen { may_board: seen.may_board && !self.on_deck(seen.player), ..seen })
            .collect()
    }

    /// The fights' views were taken into a snapshot: an ended fight's last view is sent once.
    pub fn fights_sent(&mut self) {
        self.fights.sent();
    }

    /// A boarder's input on the captain's deck, taken by its deck room as a land room takes it.
    pub fn deck_input(&mut self, player: PlayerId, input: Input) -> Result<(), Refused> {
        let deck = self.decks.boarded.iter_mut().find(|deck| deck.aboard.contains_key(&player));
        let deck = deck.ok_or(Refused::NoSuchPlayer)?;
        let boarder = deck.aboard[&player];
        deck.room.input(boarder, input)
    }

    /// A boarder goes back to their own ship once the captain's crew has fallen; the captain is scuttled when the last
    /// has gone.
    pub fn leave_deck(&mut self, player: PlayerId) -> Result<(), LeaveRefused> {
        let index = self.decks.boarded.iter().position(|deck| deck.aboard.contains_key(&player));
        let index = index.ok_or(LeaveRefused::NotAboard)?;
        if self.decks.boarded[index].won_at.is_none() {
            return Err(LeaveRefused::Fighting);
        }
        self.step_off(index, player);
        Ok(())
    }

    /// A boarder off the captain's deck, their character back with them; the last one off scuttles it.
    pub(super) fn step_off(&mut self, index: usize, player: PlayerId) {
        let Some(deck) = self.decks.boarded.get_mut(index) else { return };
        let Some(boarder) = deck.aboard.remove(&player) else { return };
        deck.room.mail_lying(boarder);
        let kept = deck.room.kept_character(boarder).and_then(|text| gear::Character::from_json(&text));
        // A hand who fell this very tick is counted before their player leaves.
        deck.room.keep_hands();
        let fallen = deck.room.fallen_hands(boarder);
        deck.room.leave(boarder);
        self.fights.stand_up(player);
        let crew = naval::class::class_of(super::ports::hull_sailed(&self.harbour.characters, player)).build().crew;
        self.fights.lose_men(player, f64::from(fallen) / crew);
        if let (Some(character), Some(held)) = (kept, self.harbour.characters.get(&player)) {
            let mut character = with_sea_kept(character, held);
            // Its hands who fell on the deck are men it has lost, kept until a port city repairs it.
            let man = gear::character::SHIP_WHOLE / crew as u16;
            character.ship[2] = character.ship[2].saturating_sub(man.saturating_mul(u16::from(fallen)));
            self.harbour.characters.insert(player, character);
            // Off the deck their gear is the sea's again, sent them once more.
            self.harbour.changed.insert(player);
        }
        if deck.aboard.is_empty() {
            let hostile = self.decks.boarded.remove(index).hostile;
            self.fights.scuttle_by(hostile.id);
        }
    }

    /// Each deck's tick: its room steps; a crew all fallen opens its hold for its boarders, once, each boarder's quest
    /// log told its deck was taken; boarders all down wash up at the nearest port city and leave their fight.
    pub(super) fn tick_decks(&mut self) {
        let mut index = 0;
        while index < self.decks.boarded.len() {
            let deck = &mut self.decks.boarded[index];
            // One no boarder came aboard (its room was full) is scuttled as an empty one is.
            if deck.aboard.is_empty() {
                let hostile = self.decks.boarded.remove(index).hostile;
                self.fights.scuttle_by(hostile.id);
                continue;
            }
            // Its day is the sea's, so a boarder's gear carries the day's bounties and is sent again as it turns.
            deck.room.set_minute(self.minute);
            deck.room.tick();
            if deck.won_at.is_none() && deck.room.cleared() {
                deck.won_at = Some(self.clock);
                // Its hold is its boarders', on top of the lot each who fought it takes when it goes down.
                let players: Vec<PlayerId> = deck.aboard.keys().copied().collect();
                let sank = Sank { hostile: deck.hostile, at: deck.at, players, wind: deck.wind, struck: true };
                if let Some(side) = crate::quests::side_of(deck.hostile.commission.faction) {
                    for boarder in deck.aboard.values() {
                        deck.room.tell_quest(*boarder, &gear::quests::Event::Sea { side, how: "board" });
                    }
                }
                self.lay_flotsam(&sank, (2, 1));
                let when = (self.clock, self.hostiles.difficulty);
                let joined = crate::ship_power::officers_join(&sank, when, &mut self.harbour.characters);
                self.harbour.changed.extend(joined);
            }
            let deck = &self.decks.boarded[index];
            // Its hold taken or not, its boarders go back aboard their own ships `HOLD_TICKS` after its crew fell.
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

    /// The character a boarder fights with on the captain's deck, their ship's hurts in it.
    pub(super) fn deck_character(&self, player: PlayerId) -> Option<gear::Character> {
        let deck = self.decks.boarded.iter().find(|deck| deck.aboard.contains_key(&player))?;
        gear::Character::from_json(&deck.room.kept_character(deck.aboard[&player])?)
    }

    /// The hands of a player's who fell on the deck they stand on: men their ship has lost once they step off.
    pub(super) fn fallen_on_deck(&self, player: PlayerId) -> u8 {
        let deck = self.decks.boarded.iter().find(|deck| deck.aboard.contains_key(&player));
        deck.map_or(0, |deck| deck.room.fallen_hands(deck.aboard[&player]))
    }

    /// A deck whose ship went down under its boarders: each goes back to their own ship.
    pub(super) fn end_deck(&mut self, hostile: u32) {
        let Some(index) = self.decks.boarded.iter().position(|deck| deck.hostile.id == hostile) else { return };
        let boarders: Vec<PlayerId> = self.decks.boarded[index].aboard.keys().copied().collect();
        for player in boarders {
            self.step_off(index, player);
        }
    }

    /// What still lies for a boarder on the captain's deck goes to their mail, as they leave the sea: before their
    /// character's last save is read from the deck (`kept_character`).
    pub fn mail_lying(&mut self, player: PlayerId) {
        if let Some(deck) = self.decks.boarded.iter_mut().find(|deck| deck.aboard.contains_key(&player)) {
            let boarder = deck.aboard[&player];
            deck.room.mail_lying(boarder);
        }
    }

    /// A player leaving the sea leaves any deck they stood on.
    pub(super) fn leave_decks(&mut self, player: PlayerId) {
        if let Some(index) = self.decks.boarded.iter().position(|deck| deck.aboard.contains_key(&player)) {
            self.step_off(index, player);
        }
    }

    /// The ticks a won deck holds its boarders yet, by the sea's clock; none while its crew still fights.
    #[must_use]
    pub fn hold_left(&self, deck: &Boarded) -> Option<u64> {
        deck.won_at.map(|at| (at + HOLD_TICKS).saturating_sub(self.clock))
    }

    /// A boarder's gear as their deck room keeps it, when it changed since it was last sent (`Room::take_gear_change`):
    /// the room that holds their character while they fight on the captain's deck.
    pub fn deck_gear_change(&mut self, player: PlayerId) -> Option<(&Room, PlayerId)> {
        let deck = self.decks.boarded.iter_mut().find(|deck| deck.aboard.contains_key(&player))?;
        let boarder = deck.aboard[&player];
        deck.room.take_gear_change(boarder).then_some((&deck.room, boarder))
    }

    /// Puts a captain to sea where it stands, as a test of the room's door meets one.
    pub fn put_to_sea(&mut self, hostile: Hostile) {
        self.hostiles.sailing.push(hostile);
    }

    /// The fight a player fights, as a test of the room's door sets a captain's colours down in it.
    pub fn fight_mut(&mut self, player: PlayerId) -> Option<&mut crate::battle::SeaFight> {
        self.fights.of_mut(player).map(|(fought, _)| fought)
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
pub(crate) fn foe_rank(rank: naval::ranks::Rank) -> ::foes::Rank {
    use naval::ranks::Rank as Naval;
    match rank {
        Naval::Minor => ::foes::Rank::Minor,
        Naval::Major => ::foes::Rank::Major,
        Naval::Elite => ::foes::Rank::Elite,
        Naval::Miniboss => ::foes::Rank::Miniboss,
        Naval::Boss => ::foes::Rank::Boss,
    }
}

/// A boarder's character as their deck's room holds it, with what only the sea changes while they fight on foot: their
/// ship, where it lies, its experience, materials, crew and modules, and the ships sunk in a fight they sailed in,
/// counted toward their bounties (a deck counts none). An officer who joined at sea while they fought took the sea's
/// next id, which an item picked up on the deck may hold too: they sign on again, under an id of this character's.
pub(crate) fn with_sea_kept(mut character: gear::Character, held: &gear::Character) -> gear::Character {
    (character.ship, character.ship_at) = (held.ship, held.ship_at);
    (character.ship_xp, character.materials.ship) = (held.ship_xp, held.materials.ship);
    character.activity.clone_from(&held.activity);
    let joined: Vec<_> =
        held.crew.officers.values().filter(|each| !character.crew.officers.contains_key(&each.id)).cloned().collect();
    character.crew.clone_from(&held.crew);
    for officer in joined {
        character.crew.officers.remove(&officer.id);
        character.sign_on(officer);
    }
    for (id, entry) in held.items.iter().filter(|(_, (item, _))| item.kind.module()) {
        character.items.insert(*id, entry.clone());
    }
    character
}
