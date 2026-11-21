//! What happens in a fight's tick, for the browser to show (each names the ship it happened to), and how a captain
//! left it.

use crate::arms::Side;
use crate::damage::State;
use crate::guns::Shot;
use crate::shots::{ShipId, ShotEvent};

/// Why a player's guns did not fire.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Refusal {
    NoGuns,
    Silent,
    Braced,
    Reloading { side: Side, left: f64 },
}

/// What happened in a tick, for the browser to show; each names the ship it happened to.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Event {
    Shot(ShotEvent),
    RunOut {
        ship: ShipId,
        side: Side,
    },
    State {
        ship: ShipId,
        state: State,
    },
    Refused {
        ship: ShipId,
        refusal: Refusal,
    },
    /// A player's sails would not set: its rigging is shot away, or it is a wreck.
    NoSail {
        ship: ShipId,
        wrecked: bool,
    },
    Load {
        ship: ShipId,
        shot: Shot,
    },
    /// A captain left the fight.
    Gone {
        ship: ShipId,
        end: End,
    },
    /// A player's stem rammed a ship (`ship`, rammed `by`): where it struck, and the hull it took from it.
    Ram {
        ship: ShipId,
        by: ShipId,
        point: [f64; 3],
        dealt: f64,
    },
    /// A ball fell in the water there.
    Splash {
        at: [f64; 2],
    },
    /// A ball struck it: where, in its own frame, and on which part.
    Hit {
        ship: ShipId,
        at: [f64; 3],
        part: Part,
    },
    /// A sail of the ship's (its sail index, as its manifest lists them) tore away.
    SailLost {
        ship: ShipId,
        sail: usize,
    },
    /// A mast of the ship's (0 fore to aft) fell, with every sail on it.
    MastFell {
        ship: ShipId,
        mast: usize,
    },
    /// Its colours came down.
    Struck {
        ship: ShipId,
    },
    /// It began to go down.
    Sinking {
        ship: ShipId,
    },
    /// A piece of what floats was laid there (the sea room's, by its number).
    Flotsam {
        id: u32,
        at: [f64; 2],
        kind: Piece,
    },
    /// A player (by their number) gathered a piece of what floats.
    Gathered {
        id: u32,
        by: u32,
    },
    /// Players went aboard it.
    Boarding {
        ship: ShipId,
    },
}

/// The part of a ship a ball struck: its hull, a sail still set, or its rig where its sail is gone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Part {
    Hull,
    Sail,
    Rig,
}

impl Part {
    /// Its part as every wire numbers it: 0 its hull, 1 a sail, 2 its rig.
    #[must_use]
    pub fn number(self) -> u8 {
        self as u8
    }
}

/// A piece of what floats: a crate or a barrel of what it carried, or a chest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Piece {
    Crate,
    Barrel,
    Chest,
}

impl Piece {
    /// The piece as every wire numbers it: 0 a crate, 1 a barrel, 2 a chest.
    #[must_use]
    pub fn number(self) -> u8 {
        self as u8
    }
}

/// How a captain left the fight.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum End {
    Sunk,
    Gone,
}
