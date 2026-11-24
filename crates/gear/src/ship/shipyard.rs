//! What a player asks of the Harbourmaster for their ships, each only at the Harbourmaster's counter in a social space:
//! buying a hull, which is sailed from then on; sailing another ship kept; buying a dress, kept for every ship; laying
//! a dress kept on a part of a ship kept; and naming a ship, free the first time and at the shipyard's price after.

use super::fleet::{KeptShip, NO_WORD, dresses, shipyard};
use super::materials::ShipMaterial;
use crate::asks::{Done, Here, Refusal};
use crate::character::Character;
use crate::emblems::Source;

/// One ask of the Harbourmaster's: a hull by its number (0 the Sloop to 3 the Frigate), a dress by its number in the
/// catalogue, a name's words by their places in the shipyard's lists (`NO_WORD` for no first word), and whether the
/// name is a renaming at the shipyard's price or the first, free one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShipAsk {
    Buy { hull: u8 },
    Sail { hull: u8 },
    BuyDress { dress: u16 },
    Dress { hull: u8, dress: u16 },
    Name { hull: u8, first: u8, second: u8, renaming: bool },
}

impl Character {
    /// Carries out an ask of the Harbourmaster's, or says why not, having changed nothing.
    pub(crate) fn ship_ask(&mut self, ask: ShipAsk, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        match ask {
            ShipAsk::Buy { hull } => self.buy_ship(hull),
            ShipAsk::Sail { hull } => self.sail_ship(hull),
            ShipAsk::BuyDress { dress } => self.buy_dress(dress),
            ShipAsk::Dress { hull, dress } => self.dress_ship(hull, dress),
            ShipAsk::Name { hull, first, second, renaming } => self.name_ship(hull, [first, second], renaming),
        }
    }

    /// Buys a hull the shipyard sells, from its ship level, for its Aurem and its materials, and sails it: the ship
    /// sailed before is kept at the harbour. The first ship is given, never sold: by the welcome's task, or here to one
    /// who keeps none and whose road no longer leads to that task (`ship_task_left`), so a player keeps a ship before
    /// they buy one.
    fn buy_ship(&mut self, hull: u8) -> Result<Option<Done>, Refusal> {
        let found = shipyard().hulls.get(usize::from(hull)).ok_or(Refusal::NoSuchShip)?;
        if found.given {
            if self.has_ship() || !self.ship_task_left() {
                return Err(Refusal::NotSold);
            }
            self.give_first_ship();
            return Ok(None);
        }
        if self.fleet.kept(hull).is_some() {
            return Err(Refusal::Kept);
        }
        if !self.has_ship() {
            return Err(Refusal::NoShip);
        }
        if self.ship_level() < found.level {
            return Err(Refusal::TooLow);
        }
        let stock = self.materials.ship;
        let price = [
            (ShipMaterial::Timber, found.timber),
            (ShipMaterial::Canvas, found.canvas),
            (ShipMaterial::Iron, found.iron),
            (ShipMaterial::Heartwood, found.heartwood),
        ];
        if self.materials.aurem < found.aurem || price.iter().any(|(material, count)| stock.of(*material) < *count) {
            return Err(Refusal::Short);
        }
        self.materials.aurem -= found.aurem;
        for (material, count) in price {
            self.materials.ship.take(material, count);
        }
        self.fleet.ships.push(KeptShip::new(hull));
        self.fleet.ships.sort_by_key(|ship| ship.hull);
        self.fleet.sailed = hull;
        Ok(None)
    }

    /// Sails another ship kept from now on.
    fn sail_ship(&mut self, hull: u8) -> Result<Option<Done>, Refusal> {
        if self.fleet.kept(hull).is_none() {
            return Err(if usize::from(hull) < shipyard().hulls.len() { Refusal::NoShip } else { Refusal::NoSuchShip });
        }
        if self.fleet.sailed == hull {
            return Err(Refusal::Sailed);
        }
        self.fleet.sailed = hull;
        Ok(None)
    }

    /// Buys a dress the Harbourmaster sells, from its ship level, for its Aurem, once: kept for every ship.
    fn buy_dress(&mut self, number: u16) -> Result<Option<Done>, Refusal> {
        let found = dresses().get(usize::from(number)).ok_or(Refusal::NoSuchDress)?;
        let Source::Sold { aurem, level } = found.source else { return Err(Refusal::NotSold) };
        if self.keeps_dress(&found.id) {
            return Err(Refusal::Kept);
        }
        if self.ship_level() < level {
            return Err(Refusal::TooLow);
        }
        if self.materials.aurem < aurem {
            return Err(Refusal::Short);
        }
        self.materials.aurem -= aurem;
        self.fleet.dress.push(found.id.clone());
        self.fleet.dress.sort_unstable();
        Ok(None)
    }

    /// Lays a dress kept on its part of a ship kept, in place of the one there.
    fn dress_ship(&mut self, hull: u8, number: u16) -> Result<Option<Done>, Refusal> {
        let found = dresses().get(usize::from(number)).ok_or(Refusal::NoSuchDress)?;
        if !self.keeps_dress(&found.id) {
            return Err(Refusal::NotKept);
        }
        let ship = self.fleet.kept_mut(hull).ok_or(Refusal::NoShip)?;
        ship.dress.on_mut(found.part).clone_from(&found.id);
        Ok(None)
    }

    /// Names a ship kept from the shipyard's two lists, its first word none or one of the first list's: free the first
    /// time, at the shipyard's price for each name after, asked as a renaming. A name it bears already is refused, and
    /// a free name asked for a ship named already, so an ask sent twice never pays for nothing.
    fn name_ship(&mut self, hull: u8, [first, second]: [u8; 2], renaming: bool) -> Result<Option<Done>, Refusal> {
        let yard = shipyard();
        let first = match first {
            NO_WORD => String::new(),
            at => yard.first.get(usize::from(at)).ok_or(Refusal::NoSuchName)?.clone(),
        };
        let second = yard.second.get(usize::from(second)).ok_or(Refusal::NoSuchName)?.clone();
        let aurem = self.materials.aurem;
        let ship = self.fleet.kept_mut(hull).ok_or(Refusal::NoShip)?;
        if ship.named && ship.name[0] == first && ship.name[1] == second {
            return Err(Refusal::Called);
        }
        if ship.named && !renaming {
            return Err(Refusal::Named);
        }
        let price = if ship.named { yard.renaming } else { 0 };
        if aurem < price {
            return Err(Refusal::Short);
        }
        ship.name = [first, second];
        ship.named = true;
        self.materials.aurem -= price;
        Ok(None)
    }
}

#[cfg(test)]
#[path = "shipyard_tests.rs"]
mod tests;
