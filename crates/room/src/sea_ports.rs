//! The sea's side of what its fights leave (`harbour`): a ship's hurts kept with her and with the player's character,
//! the player who washes up at the nearest port city, what floats where a captain's ship sank and who gathers it, and
//! the repairs by the ports.

use super::{Berth, Sea, Ship};
use crate::PlayerId;
use crate::battle::{Outcome, Sank};
use crate::harbour::{HELD, Repair, RepairRefused, SUNK_KEPT, WASHED_UP};
use movement::TICK_SECONDS;
use naval::fight::Event;
use naval::wire::told_numbers;
use std::collections::BTreeMap;

impl Sea {
    /// What its fights' tick made of each player and each captain's ship that sank: a player's ship where the fight
    /// has her, her hurts kept once it lets her go, a player whose ship went down washed up, and what floats laid for
    /// each player who fought a ship that sank.
    pub(super) fn after_fights(&mut self, outcomes: Vec<Outcome>, sank: &[Sank]) {
        for outcome in outcomes {
            match outcome {
                Outcome::Fighting { player, ship } => self.moor(player, ship, None),
                Outcome::Released { player, ship, kept } => self.moor(player, ship, Some(kept)),
                Outcome::Sunk { player, at } => self.wash_up(player, at, true),
            }
        }
        for ship in sank {
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
        }
        if let Some(sailing) = berth.sailing.as_mut() {
            sailing.ship = Ship { x: ship.x, y: ship.y, heading: ship.heading, pace: 0, rate: 0 };
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
        let moored = port.map_or(at, |port| self.harbour.harbours.ports[port].1);
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

    /// The player boards a captain who struck alongside their ship (`Fights::board`), and everyone in the fight is told.
    pub fn board(&mut self, player: PlayerId) -> Result<(), crate::battle::BoardRefused> {
        let (ship, _) = self.fights.board(player)?;
        let tick = self.clock as f64;
        let told = told_numbers(&Event::Boarding { ship }, tick).unwrap_or_default();
        self.harbour.told.push((player, told));
        Ok(())
    }

    /// A player's repair stops where it stood, as they sail or leave.
    pub(super) fn stop_repair(&mut self, player: PlayerId) {
        let Some(kept) = self.harbour.repairs.stop(player) else { return };
        if let Some(berth) = self.berths.get_mut(&player) {
            keep(berth, &mut self.harbour.characters, player, kept);
        }
    }

    /// The harbour's tick, the sea's ships sailed: every repair runs on, and what floats drifts and is gathered.
    pub(super) fn tick_harbour(&mut self, wind: [f64; 2]) {
        self.harbour.told.clear();
        for (player, kept) in self.harbour.repairs.tick(TICK_SECONDS) {
            if let Some(berth) = self.berths.get_mut(&player) {
                keep(berth, &mut self.harbour.characters, player, kept);
            }
        }
        let ships: Vec<(PlayerId, [f64; 2])> = self.ships().map(|(player, ship)| (player, [ship.x, ship.y])).collect();
        let tick = self.clock as f64;
        for (event, player, held) in self.harbour.flotsam.tick(self.clock, wind, &ships, &mut self.harbour.characters) {
            let Event::Gathered { id, .. } = event else { continue };
            self.harbour.told.extend(told_numbers(&event, tick).map(|numbers| (player, numbers)));
            let rarity = held.vestige.map_or(0.0, |vestige| f64::from(vestige.rarity as u8) + 1.0);
            let parts = [f64::from(u8::from(held.ammo_box)), f64::from(u8::from(held.ammo_crate))];
            self.harbour.told.push((player, vec![HELD, tick, f64::from(id), rarity, parts[0], parts[1]]));
        }
    }

    /// What each player is told this tick, beside their fight's view.
    #[must_use]
    pub fn told(&self) -> &[(PlayerId, Vec<f64>)] {
        &self.harbour.told
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

    /// A player's character as it is kept between sessions, their ship's hurts in it; none until the accounts gave
    /// it.
    #[must_use]
    pub fn kept_character(&self, player: PlayerId) -> Option<String> {
        self.harbour.characters.get(&player).map(gear::Character::to_json)
    }

    /// Gives a player the character kept for them, and their ship the hurts kept in it; false if they are not at sea
    /// or the text is not a character.
    pub fn restore_character(&mut self, player: PlayerId, text: &str) -> bool {
        let (Some(character), Some(berth)) = (gear::Character::from_json(text), self.berths.get_mut(&player)) else {
            return false;
        };
        berth.kept = character.ship.map(|share| f64::from(share) / f64::from(gear::character::SHIP_WHOLE));
        self.harbour.characters.insert(player, character);
        true
    }
}

/// Her hurts kept with her and with her player's character.
fn keep(berth: &mut Berth, characters: &mut BTreeMap<PlayerId, gear::Character>, player: PlayerId, kept: [f64; 3]) {
    berth.kept = kept;
    if let Some(character) = characters.get_mut(&player) {
        let whole = f64::from(gear::character::SHIP_WHOLE);
        character.ship = kept.map(|share| (share.clamp(0.0, 1.0) * whole).round() as u16);
    }
}
