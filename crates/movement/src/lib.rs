//! How a body moves, the same on the server and in a browser: walking, running and crouching on the ground and up
//! steps, jumping and falling, catching a lip to hang, mantle or vault, shimmying along it, and climbing a wall too
//! high to grab. The server steps every body by one tick of `TICK_SECONDS`; a browser predicts its own player with the
//! same steps. See the Movement note in the bible.

pub mod blocks;
pub mod body;
pub mod floats;
pub mod step;

pub use blocks::{Block, WallAhead, ground_at, wall_ahead};
pub use body::{Body, Controls, Mode, Over, TICK_SECONDS, TUNING, Tuning, eye_height, standing};
pub use step::step_body;
