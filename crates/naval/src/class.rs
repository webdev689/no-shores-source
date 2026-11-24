//! A player's hull's own numbers: what each of the four the Harbourmaster keeps is built to take and throw, how its
//! way and swing compare with the Sloop's, and how many of its hands board with its player. A bigger hull is struck
//! more often (`ranks::exposure`), so its hull, canvas and hands are the Sloop's times that and times how much longer
//! it is built to last under the same fire. A captain's ship keeps its rank's numbers (`ranks.rs`), whatever its hull.

use crate::arms::{Build, LARGE_BOAT};
use crate::ranks::{exposure, hull_exposure};
use sailing::HullKind;
use std::sync::OnceLock;

/// A hull's numbers as a player sails it: how much longer than the Sloop its hull, and its canvas and hands, last under
/// the same fire; what a side's broadside weighs against the Sloop's (spread evenly over its guns) and how long its
/// guns take to reload against the Sloop's; its way, in a fight and on a course, and its swing in a fight against the
/// Sloop's at the same way; and the hands who board beside its player before their First Mate leads more.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Class {
    pub hull: HullKind,
    pub lasts: f64,
    pub rig_lasts: f64,
    pub broadside: f64,
    pub reload: f64,
    pub way: f64,
    pub turn: f64,
    pub boarders: u8,
}

/// The four classes, in `HullKind::ALL`'s order: the Sloop the plain ship every factor of the others is against; the
/// Schooner the fast ship, lighter built, quick to reload, swift and handy; the Brig the heavy ship, tougher and
/// heavier in its broadside, a little slower and stiffer at its helm; the Frigate the last ship, the toughest and the
/// heaviest broadside, the slowest and the stiffest.
pub const CLASSES: [Class; 4] = [
    Class {
        hull: HullKind::Sloop,
        lasts: 1.0,
        rig_lasts: 1.0,
        broadside: 1.0,
        reload: 1.0,
        way: 1.0,
        turn: 1.0,
        boarders: 2,
    },
    Class {
        hull: HullKind::Schooner,
        lasts: 0.9,
        rig_lasts: 0.9,
        broadside: 1.0,
        reload: 0.87,
        way: 1.15,
        turn: 1.1,
        boarders: 2,
    },
    Class {
        hull: HullKind::Brig,
        lasts: 1.25,
        rig_lasts: 1.2,
        broadside: 1.25,
        reload: 1.14,
        way: 0.95,
        turn: 0.85,
        boarders: 3,
    },
    Class {
        hull: HullKind::Frigate,
        lasts: 1.35,
        rig_lasts: 1.3,
        broadside: 1.5,
        reload: 1.25,
        way: 0.9,
        turn: 0.72,
        boarders: 4,
    },
];

/// A hull's class.
#[must_use]
pub fn class_of(hull: HullKind) -> &'static Class {
    CLASSES.iter().find(|class| class.hull == hull).unwrap_or(&CLASSES[0])
}

impl Class {
    /// How much harm its side's broadside does, a minute, against the Sloop's: its weight over its reload.
    #[must_use]
    pub fn fire(&self) -> f64 {
        self.broadside / self.reload
    }

    /// Its build as its player sails it: the Sloop's hull points times its hull's exposure and how long it lasts, its
    /// canvas and its hands times its exposure and how long its rig lasts, each to the whole point or man; the
    /// player's own aim and reach.
    #[must_use]
    pub fn build(&self) -> &'static Build {
        static BUILT: OnceLock<[Build; 4]> = OnceLock::new();
        let built = BUILT.get_or_init(|| {
            CLASSES.map(|class| {
                let (hulled, struck) = (hull_exposure(class.hull), exposure(class.hull));
                Build {
                    name: class_name(class.hull),
                    hull: libm::round(LARGE_BOAT.hull * hulled * class.lasts),
                    sail: libm::round(LARGE_BOAT.sail * struck * class.rig_lasts),
                    crew: libm::round(LARGE_BOAT.crew * struck * class.rig_lasts),
                    ..LARGE_BOAT
                }
            })
        });
        let at = CLASSES.iter().position(|class| class.hull == self.hull).unwrap_or(0);
        &built[at]
    }
}

/// A player's hull's name, as the Harbourmaster and its papers give it.
#[must_use]
pub fn class_name(hull: HullKind) -> &'static str {
    match hull {
        HullKind::Sloop => "Sloop",
        HullKind::Schooner => "Schooner",
        HullKind::Brig => "Brig",
        HullKind::Frigate => "Frigate",
    }
}

#[cfg(test)]
#[path = "class_tests.rs"]
mod tests;
