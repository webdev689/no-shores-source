//! How a body moves, the same on the server and in a browser: walking, running and crouching on the ground and up
//! steps, jumping and falling, catching a lip to hang, mantle or vault, shimmying along it, and climbing a wall too
//! high to grab. Bodies step by whole ticks of `TICK_SECONDS`, so a server and a browser predicting its own player
//! step them alike. See the Movement note in the bible.

pub mod blocks;
pub mod body;
pub mod floats;
pub mod step;

pub use blocks::Block;
pub use body::{Body, Controls, Mode, Over, TICK_SECONDS, TUNING, standing};
pub use step::step_body;
