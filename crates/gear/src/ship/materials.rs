//! The ship's own materials, apart from the gear's: Timber, Canvas and Iron, gathered from what floats and from the
//! islands' wreckage, and Heartwood, the rare one, as Essence is the gear's. A module's nodes and its infusion are
//! paid in them: each module asks for its own two common materials and, at its best, Heartwood.

use crate::character::STOCK_MOST;
use crate::grid::Cost;
use crate::kinds::Kind;
use serde::{Deserialize, Serialize};

/// One of the ship's materials. The numbers are the wire's.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ShipMaterial {
    Timber = 0,
    Canvas = 1,
    Iron = 2,
    /// The rare one: the heart of an old ship's keel, as a Legendary's Essence is.
    Heartwood = 3,
}

impl ShipMaterial {
    pub const ALL: [Self; 4] = [Self::Timber, Self::Canvas, Self::Iron, Self::Heartwood];

    /// The material a number names, or none.
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        Self::ALL.into_iter().find(|material| *material as u8 == number)
    }
}

/// The ship's materials a player holds, each up to `STOCK_MOST`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct ShipStock {
    pub timber: u16,
    pub canvas: u16,
    pub iron: u16,
    pub heartwood: u16,
}

impl ShipStock {
    /// How much of a material is held.
    #[must_use]
    pub fn of(&self, material: ShipMaterial) -> u16 {
        match material {
            ShipMaterial::Timber => self.timber,
            ShipMaterial::Canvas => self.canvas,
            ShipMaterial::Iron => self.iron,
            ShipMaterial::Heartwood => self.heartwood,
        }
    }

    fn held_mut(&mut self, material: ShipMaterial) -> &mut u16 {
        match material {
            ShipMaterial::Timber => &mut self.timber,
            ShipMaterial::Canvas => &mut self.canvas,
            ShipMaterial::Iron => &mut self.iron,
            ShipMaterial::Heartwood => &mut self.heartwood,
        }
    }

    /// Adds some of a material, up to its most; how much was taken.
    pub fn add(&mut self, material: ShipMaterial, count: u16) -> u16 {
        let held = self.held_mut(material);
        let taken = count.min(STOCK_MOST.saturating_sub(*held));
        *held += taken;
        taken
    }

    /// Whether a price in ship materials can be paid.
    #[must_use]
    pub fn affords(&self, price: &ShipPrice) -> bool {
        price.0.iter().all(|(material, count)| self.of(*material) >= *count)
    }

    /// Pays a price, if it can be paid whole; nothing is taken otherwise.
    pub fn pay(&mut self, price: &ShipPrice) -> bool {
        if !self.affords(price) {
            return false;
        }
        for (material, count) in price.0 {
            *self.held_mut(material) -= count;
        }
        true
    }

    /// Each stock within its most, as a kept character is read.
    #[must_use]
    pub fn kept(self) -> Self {
        Self {
            timber: self.timber.min(STOCK_MOST),
            canvas: self.canvas.min(STOCK_MOST),
            iron: self.iron.min(STOCK_MOST),
            heartwood: self.heartwood.min(STOCK_MOST),
        }
    }
}

/// A price in ship materials: the module's first material, its second, and Heartwood.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ShipPrice(pub [(ShipMaterial, u16); 3]);

/// The two common materials a module is made of, the one it asks for most first: guns of iron cast on timber
/// carriages, a hull of timber fastened with iron, sails of canvas on timber yards, rigging of canvas-worked line
/// through iron blocks.
#[must_use]
pub fn made_of(kind: Kind) -> [ShipMaterial; 2] {
    match kind {
        Kind::Guns => [ShipMaterial::Iron, ShipMaterial::Timber],
        Kind::Sails => [ShipMaterial::Canvas, ShipMaterial::Timber],
        Kind::Rigging => [ShipMaterial::Canvas, ShipMaterial::Iron],
        _ => [ShipMaterial::Timber, ShipMaterial::Iron],
    }
}

/// A node's price in ship materials, from the gear's cost of it: its fragments are the module's first material, its
/// resource the second, its Essence Heartwood.
#[must_use]
pub fn price_of(kind: Kind, cost: Cost) -> ShipPrice {
    let [first, second] = made_of(kind);
    ShipPrice([(first, cost.fragments), (second, cost.resource), (ShipMaterial::Heartwood, cost.essence)])
}
