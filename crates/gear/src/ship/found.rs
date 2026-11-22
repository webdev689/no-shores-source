//! What the ship's salvage holds, wherever it is found: what floats where a ship went down, wreckage scavenged on an
//! island, and a sea Breach's hold. Each gives ship materials and now and then a module, rolled as a Vestige's item is
//! (`vestige::make`), its colour never past what its level could drop. Taken, the module is carried with its slot's,
//! or sent to the mail while that slot carries nine.

use super::materials::{ShipMaterial, ShipStock};
use crate::character::{At, CARRIED_MOST, Character};
use crate::dice::{Dice, Purpose};
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::Slot;
use crate::mail::{self, Posted};
use crate::rarity::Rarity;
use crate::vestige;

/// Where salvage was found.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    /// One piece of what floats where a ship of this rank (1 Minor to 5 Boss) went down; `chest`, the one piece an
    /// Elite or higher leaves that is rolled as a ship one rank higher.
    Flotsam { rank: u8, chest: bool },
    /// Wreckage scavenged on foot on an island: a cove's, or an isle's, which its guards keep richer.
    Wreckage { isle: bool },
    /// A sea Breach's hold, which always holds a module of the better colours.
    Breach,
}

/// A module's colour, in 100, Normal to Atheric: from ordinary salvage, and from a chest or a Breach.
const PLAIN: [u32; 5] = [55, 33, 10, 2, 0];
const RICH: [u32; 5] = [0, 20, 55, 22, 3];

/// What a source holds: how many common materials (each this many, from the first to the last), its chance of one
/// Heartwood, and its chance of a module.
struct Holds {
    commons: u16,
    each: [u16; 2],
    heartwood: f64,
    module: f64,
}

fn holds(source: Source) -> Holds {
    match source {
        Source::Flotsam { chest: true, rank } => {
            Holds { commons: 3, each: [2, 4], heartwood: 0.25 + 0.05 * f64::from(rank), module: 0.5 }
        }
        Source::Flotsam { rank, .. } => {
            let rank = f64::from(rank.clamp(1, 5));
            Holds { commons: 1, each: [1, 3], heartwood: 0.02 * rank, module: 0.03 + 0.01 * rank }
        }
        Source::Wreckage { isle: false } => Holds { commons: 2, each: [2, 5], heartwood: 0.08, module: 0.1 },
        Source::Wreckage { isle: true } => Holds { commons: 3, each: [3, 6], heartwood: 0.15, module: 0.2 },
        Source::Breach => Holds { commons: 3, each: [4, 8], heartwood: 1.0, module: 1.0 },
    }
}

/// What a source of salvage held: ship materials, and a module not yet numbered.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Salvage {
    pub materials: ShipStock,
    pub module: Option<Item>,
}

/// The salvage a source holds for one player, at the level of the waters it was found in.
#[must_use]
pub fn salvage(source: Source, level: u8, dice: &Dice) -> Salvage {
    let holds = holds(source);
    let mut materials = ShipStock::default();
    let commons = [ShipMaterial::Timber, ShipMaterial::Canvas, ShipMaterial::Iron];
    for nth in 0..holds.commons {
        let material = commons[dice.pick(Purpose::ShipMaterial, u32::from(nth), commons.len())];
        let span = usize::from(holds.each[1] - holds.each[0] + 1);
        let count = holds.each[0] + dice.pick(Purpose::ShipMaterial, 4 + u32::from(nth), span) as u16;
        materials.add(material, count);
    }
    if dice.roll(Purpose::ShipMaterial, 8) < holds.heartwood {
        materials.add(ShipMaterial::Heartwood, if source == Source::Breach { 2 } else { 1 });
    }
    let module = (dice.roll(Purpose::ShipModule, 0) < holds.module).then(|| module(source, level, dice)).flatten();
    Salvage { materials, module }
}

/// A module of the source's colours at this level, for any of the four slots.
fn module(source: Source, level: u8, dice: &Dice) -> Option<Item> {
    let rich = matches!(source, Source::Breach | Source::Flotsam { chest: true, .. });
    let weights = vestige::gated(if rich { RICH } else { PLAIN }, level);
    let rarity = Rarity::ALL[dice.weighted(Purpose::ShipModule, 1, &weights)];
    let slot = Slot::SHIP[dice.pick(Purpose::ShipModule, 2, Slot::SHIP.len())];
    vestige::make(0, rarity, slot, level.clamp(1, NAMED_LEVEL), dice)
}

/// What a player took of salvage: the materials there was room for, and the module's number if it was carried.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Taken {
    pub materials: ShipStock,
    pub module: Option<u32>,
}

impl Character {
    /// Takes salvage: each material up to its most, and the module carried with its slot's, numbered as it is taken;
    /// with that slot carrying nine already, the module goes to the mail.
    pub fn take_salvage(&mut self, salvage: Salvage) -> Taken {
        let mut taken = Taken::default();
        for material in ShipMaterial::ALL {
            let got = self.materials.ship.add(material, salvage.materials.of(material));
            taken.materials.add(material, got);
        }
        match salvage.module {
            Some(module) if self.carried_in(module.bucket) < CARRIED_MOST => {
                let id = self.take_id();
                self.items.insert(id, (Item { id, ..module }, At::Carried));
                taken.module = Some(id);
            }
            Some(module) => self.post(mail::Source::Salvage, Posted::Item(module)),
            None => {}
        }
        taken
    }
}
