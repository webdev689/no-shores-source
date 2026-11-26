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
    /// One piece of what floats where a ship of this rank (1 Minor to 5 Boss) went down; `chest`, the piece an Elite
    /// or higher leaves in each lot, whose rank is already raised (one up as it sinks, two from its hold).
    Flotsam { rank: u8, chest: bool },
    /// Wreckage scavenged on foot on an island: a cove's, or an isle's, which its guards keep richer.
    Wreckage { isle: bool },
    /// A sea Breach's hold, which always holds a module, coloured as a Boss's drop.
    Breach,
}

/// The rank whose drops a source's module is coloured as (1 Minor to 5 Boss): a piece its ship's, a chest the rank it
/// is rolled at; a cove's wreckage a Minor's, an isle's, which an Elite guards, an Elite's; a Breach's hold a Boss's.
fn rank_of(source: Source) -> u8 {
    match source {
        Source::Flotsam { rank, .. } => rank,
        Source::Wreckage { isle: false } => 1,
        Source::Wreckage { isle: true } => 3,
        Source::Breach => 5,
    }
}

/// What a source holds: how many common materials (each this many, from the first to the last), its chance of one
/// Heartwood, and its chance of a module.
pub(crate) struct Holds {
    pub(crate) commons: u16,
    pub(crate) each: [u16; 2],
    pub(crate) heartwood: f64,
    pub(crate) module: f64,
}

pub(crate) fn holds(source: Source) -> Holds {
    match source {
        // A ship's lot holds modules often enough that an hour at sea finds about as much gear by colour as an hour
        // in a patrol zone (`band`): a sure one in its chest, a Minor's piece about one time in two.
        Source::Flotsam { chest: true, rank } => {
            Holds { commons: 3, each: [2, 4], heartwood: 0.25 + 0.05 * f64::from(rank), module: 1.0 }
        }
        Source::Flotsam { rank, .. } => {
            let rank = f64::from(rank.clamp(1, 5));
            Holds { commons: 1, each: [1, 3], heartwood: 0.02 * rank, module: 0.36 + 0.12 * rank }
        }
        // A cove's two or three wrecks together hold less than a Minor ship's whole lot, as the owner chose: found
        // unguarded, once.
        Source::Wreckage { isle: false } => Holds { commons: 1, each: [1, 2], heartwood: 0.015, module: 0.03 },
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

/// The salvage a source holds for one player, at the level of the waters it was found in; `raised`, the voyage's tier's
/// reward, raises its chances of Heartwood and a module as it raises a kill's.
#[must_use]
pub fn salvage(source: Source, level: u8, raised: f64, dice: &Dice) -> Salvage {
    let found = holds(source);
    let holds = Holds { heartwood: found.heartwood * raised, module: found.module * raised, ..found };
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

/// A module of the source's colours at this level, for any of the four slots: a Vestige's from a foe of its rank.
fn module(source: Source, level: u8, dice: &Dice) -> Option<Item> {
    let weights = vestige::gated(vestige::colours(rank_of(source)), level);
    let rarity = Rarity::ALL[dice.weighted(Purpose::ShipModule, 1, &weights)];
    let slot = Slot::SHIP[dice.pick(Purpose::ShipModule, 2, Slot::SHIP.len())];
    vestige::make(0, rarity, slot, level.clamp(1, NAMED_LEVEL), crate::Source::World, dice)
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
