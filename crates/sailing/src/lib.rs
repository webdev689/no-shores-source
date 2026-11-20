//! How a ship sails, the same on the server and in a browser: the helm's ladder from oars to sails, its way and turn
//! eased by Come Sail Away's handling under DFO's responsive helm, its sails' pull against the wind, its pose on the
//! swell and where it takes the ground. Ships step by whole ticks of `TICK_SECONDS`.

pub mod floats;
pub mod helm;
pub mod hull;
pub mod pose;
pub mod ship;
pub mod waters;

pub use hull::{BRIG, FRIGATE, Hull, HullKind, SCHOONER, SLOOP, Sail, SailKind, SailSize};

/// One tick, seconds: the room's, as a body's.
pub const TICK_SECONDS: f64 = 1.0 / 60.0;
