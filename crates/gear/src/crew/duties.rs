//! What a player asks of their officers: signing one on at their faction's counter, putting one at their post,
//! sending one ashore or bringing them back aboard, paying one off, and buying and choosing their nodes. Only one
//! officer holds each post and two go ashore; their nodes cost Aurem, and a Veteran's last upgrades Heartwood.

use super::officer::{Duty, Officer};
use super::recruit;
use super::{ASHORE_MOST, OFFICERS_MOST};
use crate::asks::{Done, Here, Refusal};
use crate::character::Character;
use crate::grid::cost;
use crate::item::NONE_CHOSEN;
use crate::ship::materials::ShipMaterial;

impl Character {
    /// Signs on one of the officers offered today at the counter of the faction the player is pledged to.
    pub(crate) fn recruit(&mut self, offer: u8, here: Here) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        if here.pledge == 0 {
            return Err(Refusal::NoPledge);
        }
        let offers = recruit::offers(here.pledge, here.day, self.level(), here.rank);
        let officer = offers.into_iter().nth(usize::from(offer)).ok_or(Refusal::NoSuchOfficer)?;
        let wage = recruit::wage(officer.grade);
        if self.materials.aurem < wage {
            return Err(Refusal::Short);
        }
        if self.crew.officers.values().any(|kept| kept.given == officer.given && kept.family == officer.family) {
            return Err(Refusal::Kept);
        }
        if self.crew.officers.len() >= OFFICERS_MOST {
            return Err(Refusal::CrewFull);
        }
        self.materials.aurem -= wage;
        self.sign_on(officer);
        Ok(None)
    }

    /// Takes on an officer who joins the player (a won deck's), numbered as they join; refused when the crew is full.
    pub fn sign_on(&mut self, officer: Officer) -> Option<u32> {
        if self.crew.officers.len() >= OFFICERS_MOST {
            return None;
        }
        let id = self.take_id();
        self.crew.officers.insert(id, Officer { id, duty: Duty::Aboard, ..officer });
        Some(id)
    }

    /// Puts an officer at their post (the one there goes aboard), ashore, or aboard.
    pub(crate) fn station(&mut self, id: u32, duty: Duty) -> Result<Option<Done>, Refusal> {
        let officer = self.crew.officers.get(&id).ok_or(Refusal::NoSuchOfficer)?;
        let post = officer.post;
        if duty == Duty::Ashore && officer.duty != Duty::Ashore && self.crew.ashore().count() >= ASHORE_MOST {
            return Err(Refusal::AshoreFull);
        }
        if duty == Duty::Posted {
            for other in self.crew.officers.values_mut() {
                if other.id != id && other.duty == Duty::Posted && other.post == post {
                    other.duty = Duty::Aboard;
                }
            }
        }
        if let Some(officer) = self.crew.officers.get_mut(&id) {
            officer.duty = duty;
        }
        Ok(None)
    }

    /// Pays an officer off: they leave the crew, and nothing is given back.
    pub(crate) fn dismiss(&mut self, id: u32) -> Result<Option<Done>, Refusal> {
        self.crew.officers.remove(&id).ok_or(Refusal::NoSuchOfficer)?;
        Ok(None)
    }

    /// Buys an officer's node, choosing it if its column had none.
    pub(crate) fn train(&mut self, id: u32, column: usize, node: u8) -> Result<Option<Done>, Refusal> {
        let officer = self.crew.officers.get(&id).ok_or(Refusal::NoSuchOfficer)?;
        let bit = officer.node_bit(column, node).ok_or(Refusal::NoSuchNode)?;
        if !officer.unlocked(column) {
            return Err(Refusal::Locked);
        }
        if officer.bought & bit != 0 {
            return Err(Refusal::AlreadyBought);
        }
        let price = cost(officer.grade, officer.columns(), column);
        if self.materials.aurem < price.aurem || self.materials.ship.of(ShipMaterial::Heartwood) < price.essence {
            return Err(Refusal::Short);
        }
        self.materials.aurem -= price.aurem;
        self.materials.ship.heartwood -= price.essence;
        if let Some(officer) = self.crew.officers.get_mut(&id) {
            officer.bought |= bit;
            if let Some(chosen) = officer.chosen.get_mut(column).filter(|chosen| **chosen == NONE_CHOSEN) {
                *chosen = node;
            }
        }
        Ok(None)
    }

    /// Chooses an officer's node among those bought in a perk column.
    pub(crate) fn choose_officer(&mut self, id: u32, column: usize, node: u8) -> Result<Option<Done>, Refusal> {
        let officer = self.crew.officers.get_mut(&id).ok_or(Refusal::NoSuchOfficer)?;
        if !officer.columns().get(column).is_some_and(|kind| kind.traits()) || officer.node_bit(column, node).is_none()
        {
            return Err(Refusal::NoSuchNode);
        }
        if !officer.has(column, node) {
            return Err(Refusal::NotBought);
        }
        officer.chosen[column] = node;
        Ok(None)
    }
}
