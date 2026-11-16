//! How a ship sails, the same on the server and in a browser: the helm's ladder from oars to sails, her way and turn
//! eased by Come Sail Away's handling under DFO's responsive helm, her sails' pull against the wind, her pose on the
//! swell and where she takes the ground. Ships step by whole ticks of `TICK_SECONDS`. See the Sailing note in the
//! bible.

pub mod floats;
pub mod helm;
pub mod hull;
pub mod pose;
pub mod ship;
pub mod waters;

pub use hull::{Hull, SLOOP, Sail, SailKind, SailSize};

/// One tick, seconds: the room's, as a body's.
pub const TICK_SECONDS: f64 = 1.0 / 60.0;
