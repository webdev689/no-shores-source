//! Infusion: a stronger module fed into a kept one of the same kind, the kept one rising to the fed one's level and
//! keeping its own nodes, traits and experience; the fed one is gone. It is paid in Aurem and the kept module's first
//! material for each level it climbs.

use super::materials::{ShipMaterial, ShipPrice, made_of};
use crate::asks::{Done, Refusal};
use crate::character::{At, Character};

/// What each level an infusion climbs costs: Aurem, and the kept module's first material.
pub const AUREM_A_LEVEL: u32 = 150;
pub const MATERIAL_A_LEVEL: u16 = 2;

impl Character {
    /// Feeds module `fed`, carried, into `kept`, held: the same kind, the fed one higher.
    pub(crate) fn infuse(&mut self, kept: u32, fed: u32) -> Result<Option<Done>, Refusal> {
        let (keeping, _) = self.items.get(&kept).ok_or(Refusal::NoSuchItem)?;
        let (feeding, fed_at) = self.items.get(&fed).ok_or(Refusal::NoSuchItem)?;
        if !matches!(self.at(kept), Some(At::Carried | At::Worn(_))) || *fed_at != At::Carried || kept == fed {
            return Err(Refusal::WrongPlace);
        }
        if !keeping.kind.module() || feeding.kind != keeping.kind {
            return Err(Refusal::DoesNotFit);
        }
        let climbs = feeding.level.saturating_sub(keeping.level);
        let worn = matches!(self.at(kept), Some(At::Worn(_)));
        // A module fitted rises no higher than it could fit it.
        if climbs == 0 || worn && feeding.level > self.ship_level() {
            return Err(Refusal::TooLow);
        }
        let aurem = AUREM_A_LEVEL * u32::from(climbs);
        let [first, _] = made_of(keeping.kind);
        let none = (ShipMaterial::Heartwood, 0);
        let price = ShipPrice([(first, MATERIAL_A_LEVEL * u16::from(climbs)), none, none]);
        if self.materials.aurem < aurem || !self.materials.ship.affords(&price) {
            return Err(Refusal::Short);
        }
        let level = feeding.level;
        self.materials.aurem -= aurem;
        self.materials.ship.pay(&price);
        self.items.remove(&fed);
        if let Some((module, _)) = self.items.get_mut(&kept) {
            module.level = level;
        }
        Ok(None)
    }
}
