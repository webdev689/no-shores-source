//! The sea's side of what its fights leave (`harbour`): a ship's hurts kept with her and with the player's character,
//! the player who washes up at the nearest port city, what floats where a captain's ship sank and who gathers it, and
//! the repairs by the ports, and the keeping of each player's character: what changed in it, and in a sea that keeps
//! characters, no course sailed before the keeper has answered for the player.

use super::{Berth, Sea, Ship};
use crate::PlayerId;
use crate::battle::{Outcome, Sank};
use crate::harbour::{HELD, JOINED, MOORED, Repair, RepairRefused, SUNK_KEPT, WASHED_UP};
use crate::players::GEAR_EVERY_TICKS;
use movement::TICK_SECONDS;
use naval::fight::Event;
use naval::wire::told_numbers;
use std::collections::BTreeMap;
use world::check::{FRAME_HEIGHT_M, FRAME_WIDTH_M};

impl Sea {
    /// Sets the sea's tier, as a host sets it once the sea has opened: an Elite or Abyss sea sends its ships at the
    /// levels the tier raises foes to on land, and their pieces hold a Vestige as often as a harder voyage pays one.
    pub fn set_difficulty(&mut self, difficulty: gear::Difficulty) {
        self.pirates.difficulty = difficulty;
        self.harbour.flotsam.difficulty = difficulty;
    }

    /// What its fights' tick made of each player and each captain's ship that sank: a player's ship where the fight
    /// has her, her hurts kept once it lets her go, a player whose ship went down washed up, and what floats laid for
    /// each player who fought a ship that sank.
    pub(super) fn after_fights(&mut self, outcomes: Vec<Outcome>, sank: &[Sank]) {
        for outcome in outcomes {
            match outcome {
                Outcome::Fighting { player, ship } => self.moor(player, ship, None),
                Outcome::Released { player, ship, kept } => self.moor(player, ship, Some(kept)),
                Outcome::Sunk { player, at } => {
                    self.leave_decks(player);
                    self.wash_up(player, at, true);
                }
            }
        }
        for ship in sank {
            // A boarded ship sunk under her boarders sends them back to their own ships.
            self.end_deck(ship.pirate.id);
            self.lay_flotsam(ship, (1, 0));
        }
    }

    /// Lays what floats from a ship that sank, `times` over with each chest `chest_up` ranks higher besides, each
    /// piece told to the player it floats for.
    pub(crate) fn lay_flotsam(&mut self, sank: &Sank, (times, chest_up): (usize, u8)) {
        let tick = self.clock as f64;
        let before = self.harbour.flotsam.pieces.len();
        let laid = self.harbour.flotsam.lay(sank, self.clock, (times, chest_up));
        let owners: Vec<PlayerId> = self.harbour.flotsam.pieces[before..].iter().map(|piece| piece.player).collect();
        for (event, player) in laid.iter().zip(owners) {
            if let Some(numbers) = told_numbers(event, tick) {
                self.harbour.told.push((player, numbers));
            }
        }
    }

    /// A player's ship where a fight has her, at rest, and the hurts she keeps if it let her go.
    fn moor(&mut self, player: PlayerId, ship: sailing::ship::Ship, kept: Option<[f64; 3]>) {
        let Some(berth) = self.berths.get_mut(&player) else { return };
        if let Some(kept) = kept {
            keep(berth, &mut self.harbour.characters, player, kept);
            self.harbour.changed.insert(player);
        }
        // A fight's waters run past the world's edge; the sea's ways do not.
        let [x, y] = in_frame([ship.x, ship.y]);
        if let Some(sailing) = berth.sailing.as_mut() {
            sailing.ship = Ship { x, y, heading: ship.heading, pace: 0, rate: 0 };
            sailing.course.clear();
        }
    }

    /// A player washes up at the port city nearest `at`: their ship moored at its roadstead at rest, a sunk one with
    /// `SUNK_KEPT`, and they are told where and why. With no port city known, their ship lies where it went down.
    pub(crate) fn wash_up(&mut self, player: PlayerId, at: [f64; 2], sunk: bool) {
        let port = self.harbour.harbours.nearest(at);
        let Some(berth) = self.berths.get_mut(&player) else { return };
        if sunk {
            keep(berth, &mut self.harbour.characters, player, SUNK_KEPT);
        }
        let moored = in_frame(port.map_or(at, |port| self.harbour.harbours.ports[port].1));
        self.harbour.changed.insert(player);
        if let Some(sailing) = berth.sailing.as_mut() {
            sailing.ship = Ship { x: moored[0], y: moored[1], heading: sailing.ship.heading, pace: 0, rate: 0 };
            sailing.course.clear();
        }
        self.aboard.remove(&player);
        let port = port.map_or(-1.0, |port| port as f64);
        self.harbour.told.push((player, vec![WASHED_UP, self.clock as f64, port, f64::from(u8::from(sunk))]));
    }

    /// The player asks for their ship's repair: at sea, out of a fight, lying at rest within reach of a port city's
    /// roadstead, and not whole.
    pub fn repair(&mut self, player: PlayerId) -> Result<(), RepairRefused> {
        let berth = self.berths.get(&player).ok_or(RepairRefused::NotAtSea)?;
        let ship = berth.sailing.as_ref().map(|sailing| sailing.ship).ok_or(RepairRefused::NotAtSea)?;
        if self.fights.fighting(player) || ship.pace != 0 || !self.harbour.harbours.in_reach([ship.x, ship.y]) {
            return Err(RepairRefused::NotThere);
        }
        if Repair::takes(berth.kept) <= 0.0 {
            return Err(RepairRefused::Whole);
        }
        self.harbour.repairs.under_way.entry(player).or_insert(Repair { from: berth.kept, seconds: 0.0 });
        Ok(())
    }

    /// The hurts a player's ship keeps, with her and in their character.
    pub(super) fn keep_hurts(&mut self, player: PlayerId, kept: [f64; 3]) {
        if let Some(berth) = self.berths.get_mut(&player) {
            keep(berth, &mut self.harbour.characters, player, kept);
            self.harbour.changed.insert(player);
        }
    }

    /// A player's repair stops where it stood, as they sail or leave.
    pub(super) fn stop_repair(&mut self, player: PlayerId) {
        let Some(kept) = self.harbour.repairs.stop(player) else { return };
        self.keep_hurts(player, kept);
    }

    /// The harbour's tick, the sea's ships sailed: every repair runs on, and what floats drifts and is gathered.
    pub(super) fn tick_harbour(&mut self) {
        for (player, kept) in self.harbour.repairs.tick(TICK_SECONDS) {
            if let Some(berth) = self.berths.get_mut(&player) {
                keep(berth, &mut self.harbour.characters, player, kept);
            }
            // Flagged once it is done, not each tick it runs: the snapshot tells how it stands meanwhile.
            if !self.harbour.repairs.under_way.contains_key(&player) {
                self.harbour.changed.insert(player);
            }
        }
        // A boarder's ship gathers nothing while they stand on her enemy's deck, whose room holds their character.
        let on_deck = |player: &PlayerId| self.decks.boarded.iter().any(|deck| deck.aboard.contains_key(player));
        let ships: Vec<(PlayerId, [f64; 2])> = self
            .ships()
            .filter(|(player, _)| !on_deck(player))
            .map(|(player, ship)| (player, [ship.x, ship.y]))
            .collect();
        let tick = self.clock as f64;
        for (event, player, held) in self.harbour.flotsam.tick(self.clock, &ships, &mut self.harbour.characters) {
            let Event::Gathered { id, .. } = event else { continue };
            self.harbour.changed.insert(player);
            self.harbour.told.extend(told_numbers(&event, tick).map(|numbers| (player, numbers)));
            let rarity = held.vestige.map_or(0.0, |vestige| f64::from(vestige.rarity as u8) + 1.0);
            let parts = [f64::from(u8::from(held.ammo_box)), f64::from(u8::from(held.ammo_crate))];
            self.harbour.told.push((player, vec![HELD, tick, f64::from(id), rarity, parts[0], parts[1]]));
        }
    }

    /// Every player in a fight told of who joined it.
    pub(super) fn tell_joined(&mut self, joined: &[(crate::battle::Joined, Vec<PlayerId>)]) {
        let tick = self.clock as f64;
        for (who, told) in joined {
            let numbers = match *who {
                crate::battle::Joined::Player(player) => vec![JOINED, tick, f64::from(player), 0.0, 0.0],
                crate::battle::Joined::Hostile(commission) => {
                    vec![JOINED, tick, 0.0, f64::from(commission.faction), f64::from(commission.rank.number())]
                }
            };
            self.harbour.told.extend(told.iter().map(|player| (*player, numbers.clone())));
        }
    }

    /// What each player has been told since this was last taken, beside their fight's view: every tick's, so ticks run
    /// between snapshots lose none.
    pub fn take_told(&mut self) -> Vec<(PlayerId, Vec<f64>)> {
        std::mem::take(&mut self.harbour.told)
    }

    /// The shares of hull, canvas and men a player's ship keeps, and the seconds her repair has left (0 with none).
    #[must_use]
    pub fn kept(&self, player: PlayerId) -> Option<([f64; 3], f64)> {
        let kept = self.berths.get(&player)?.kept;
        let repair = self.harbour.repairs.under_way.get(&player);
        Some(repair.map_or((kept, 0.0), |repair| (repair.now(), repair.left())))
    }

    /// Every piece floating at sea, each for its player.
    #[must_use]
    pub fn flotsam(&self) -> &[crate::flotsam::Floating] {
        &self.harbour.flotsam.pieces
    }

    /// Each piece floating for a player.
    pub fn flotsam_for(&self, player: PlayerId) -> impl Iterator<Item = &crate::flotsam::Floating> {
        self.harbour.flotsam.for_player(player)
    }

    /// A player's character as it is kept between sessions, their ship's hurts in it: a new one, with her hurts, until
    /// the accounts gave theirs; none for no player at sea.
    #[must_use]
    pub fn kept_character(&self, player: PlayerId) -> Option<String> {
        let berth = self.berths.get(&player)?;
        // On a deck, its room holds their character as it fights.
        let held = self.deck_character(player).or_else(|| self.harbour.characters.get(&player).cloned());
        let mut character = held.unwrap_or_else(gear::Character::starting);
        // In a fight, she is kept as the fight has her, and lies at the port city she would wash up at, as one who
        // lost does: a player who leaves mid-fight comes back there.
        let (kept, at) = match self.fights.hurts_of(player) {
            Some((kept, at)) => (
                kept,
                in_frame(self.harbour.harbours.nearest(at).map_or(at, |port| self.harbour.harbours.ports[port].1)),
            ),
            None => {
                (berth.kept, berth.sailing.as_ref().map_or([f64::NAN; 2], |sailing| [sailing.ship.x, sailing.ship.y]))
            }
        };
        let whole = f64::from(gear::character::SHIP_WHOLE);
        character.ship = kept.map(|share| (share.clamp(0.0, 1.0) * whole).round() as u16);
        let kept_at = at.iter().all(|metres| metres.is_finite()).then(|| at.map(|metres| metres.round() as i64));
        character.ship_at = kept_at.or(character.ship_at);
        Some(character.to_json())
    }

    /// From now on the sea keeps characters: each player's courses wait for the keeper's word on theirs, the character
    /// given back (`restore_character`) or none kept (`none_kept`), so a ship the room kept comes back where it kept
    /// her, however late the page signs in.
    pub fn keep_characters(&mut self) {
        self.harbour.awaiting.get_or_insert_with(BTreeMap::new);
    }

    /// A player just joined waits for the keeper's word, in a sea that keeps characters.
    pub(super) fn await_keeper(&mut self, player: PlayerId) {
        if let Some(awaiting) = self.harbour.awaiting.as_mut() {
            awaiting.insert(player, None);
        }
    }

    /// Holds a course asked before the keeper answered for the player, the last one asked; whether it was held.
    pub(super) fn hold_course(&mut self, player: PlayerId, points: &[[f64; 2]], pace: u16) -> bool {
        let Some(held) = self.harbour.awaiting.as_mut().and_then(|awaiting| awaiting.get_mut(&player)) else {
            return false;
        };
        *held = Some((points.to_vec(), pace));
        true
    }

    /// The keeper has no character to give the player (none kept, or the page plays unkept): the course held for them
    /// is judged and sailed as any course is, a refused one leaving her not yet at sea.
    pub fn none_kept(&mut self, player: PlayerId) {
        let held = self.harbour.awaiting.as_mut().and_then(|awaiting| awaiting.remove(&player)).flatten();
        if let Some((points, pace)) = held {
            let _ = self.course(player, &points, pace);
        }
    }

    /// A player's character, when it changed since their gear was last sent them and is due again (at most every
    /// `GEAR_EVERY_TICKS`, as a land room sends gear); none on a deck, whose room sends theirs.
    pub fn take_character_change(&mut self, player: PlayerId) -> Option<&gear::Character> {
        let clock = self.clock;
        let waiting = self.harbour.gear_sent.get(&player).is_some_and(|sent| clock < sent + GEAR_EVERY_TICKS);
        let held = self.harbour.characters.contains_key(&player);
        if waiting || !held || self.on_deck(player) || !self.harbour.changed.remove(&player) {
            return None;
        }
        self.harbour.gear_sent.insert(player, clock);
        self.harbour.characters.get(&player)
    }

    /// Gives a player the character kept for them, and their ship the hurts kept in it; false if they are not at sea
    /// or the text is not a character. Her ship lies where the room last kept her, wherever the page first put her to
    /// sea: a fight she met from the page's spawn is over for her. With nowhere kept, the course held for her sails.
    pub fn restore_character(&mut self, player: PlayerId, text: &str) -> bool {
        let (Some(character), true) = (gear::Character::from_json(text), self.berths.contains_key(&player)) else {
            return false;
        };
        let held = self.harbour.awaiting.as_mut().and_then(|awaiting| awaiting.remove(&player)).flatten();
        let at = character.ship_at.map(|[x, y]| [x as f64, y as f64]).and_then(|at| crate::sea::whole(&at).map(|_| at));
        if at.is_some() && self.fights.fighting(player) {
            self.leave_decks(player);
            self.fights.leave(player);
        }
        if let (Some([x, y]), Some(berth)) = (at, self.berths.get_mut(&player)) {
            let heading = berth.sailing.as_ref().map_or(0.0, |sailing| sailing.ship.heading);
            berth.sailing =
                Some(super::Sailing { ship: Ship { x, y, heading, pace: 0, rate: 0 }, course: Default::default() });
            self.harbour.told.push((player, vec![MOORED, self.clock as f64, x, y, heading]));
        } else if let Some((points, pace)) = held {
            let _ = self.course(player, &points, pace);
        }
        if let Some(berth) = self.berths.get_mut(&player) {
            berth.kept = character.ship.map(|share| f64::from(share) / f64::from(gear::character::SHIP_WHOLE));
        }
        // A deck boarded before the accounts answered fights on with the real character.
        if let Some(deck) = self.decks.boarded.iter_mut().find(|deck| deck.aboard.contains_key(&player)) {
            deck.room.restore_character(deck.aboard[&player], text);
        }
        self.harbour.characters.insert(player, character);
        self.harbour.changed.insert(player);
        true
    }
}

/// A point held within the world's frame.
pub(crate) fn in_frame([x, y]: [f64; 2]) -> [f64; 2] {
    #[allow(clippy::cast_precision_loss)]
    let (width, height) = (FRAME_WIDTH_M as f64, FRAME_HEIGHT_M as f64);
    [x.clamp(0.0, width), y.clamp(0.0, height)]
}

/// Each wary ship at sea within `ENGAGE_RANGE` of a player not fighting whose Sloop she would take as her kept hull
/// leaves her (`naval::captain::wary_takes`, DFO's `takesPrize`) meets them as a bold one does: she leaves the sea, and
/// the meeting joins `met`.
pub(super) fn wary_meet(
    pirates: &mut crate::pirates::Pirates,
    berths: &BTreeMap<PlayerId, Berth>,
    ships: &[crate::pirates::Voyager],
    met: &mut Vec<(PlayerId, crate::pirates::Pirate)>,
) {
    let mut at = 0;
    while at < pirates.sailing.len() {
        let pirate = pirates.sailing[at];
        let takes = |ship: &&crate::pirates::Voyager| {
            let hull = berths.get(&ship.player).map_or(1.0, |berth| berth.kept[0]);
            let near = libm::hypot(ship.at[0] - pirate.x, ship.at[1] - pirate.y) <= naval::captain::ENGAGE_RANGE;
            !ship.fighting
                && near
                && !met.iter().any(|(player, _)| *player == ship.player)
                && naval::captain::wary_takes(pirate.commission, pirate.strength(), hull)
        };
        match ships.iter().find(takes).filter(|_| !pirate.bold) {
            Some(ship) => met.push((ship.player, pirates.sailing.remove(at))),
            None => at += 1,
        }
    }
}

/// Her hurts kept with her and with her player's character.
pub(super) fn keep(
    berth: &mut Berth,
    characters: &mut BTreeMap<PlayerId, gear::Character>,
    player: PlayerId,
    kept: [f64; 3],
) {
    berth.kept = kept;
    if let Some(character) = characters.get_mut(&player) {
        let whole = f64::from(gear::character::SHIP_WHOLE);
        character.ship = kept.map(|share| (share.clamp(0.0, 1.0) * whole).round() as u16);
    }
}

#[cfg(test)]
#[path = "sea_ports_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "sea_keeping_tests.rs"]
mod keeping_tests;

#[cfg(test)]
#[path = "sea_course_tests.rs"]
mod course_tests;

#[cfg(test)]
#[path = "sea_boarding_tests.rs"]
mod boarding_tests;
