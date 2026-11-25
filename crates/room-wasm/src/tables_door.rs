//! The rules' fixed tables the page reads from the room's module, whatever room is open: how long a tick is, the
//! Sloop's build, the port cities and every enemy type.

use crate::{deck_door, hand_over, roster_door};

/// How long one of the room's ticks is, in seconds: its host ticks it that often.
#[unsafe(no_mangle)]
pub extern "C" fn room_tick_seconds() -> f64 {
    movement::TICK_SECONDS
}

/// The Sloop's build as the naval rules hold it, as JSON (`deck_door::sloop_build_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_sloop() -> u64 {
    hand_over(deck_door::sloop_build_json().into_bytes())
}

/// The port cities' ids as JSON (`world::ports::MAIN_PORTS`): every other city is a ruin.
#[unsafe(no_mangle)]
pub extern "C" fn room_main_ports() -> u64 {
    hand_over(serde_json::to_vec(&world::ports::MAIN_PORTS).unwrap_or_default())
}

/// Every enemy type the rules know, as JSON (`roster_door::roster_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_roster() -> u64 {
    hand_over(roster_door::roster_json().into_bytes())
}
