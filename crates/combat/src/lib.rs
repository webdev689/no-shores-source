//! How fighters fight, the same on the server and in every browser: swings struck in DFO's six directions, a guard
//! held and a parry pressed just as a blow lands, a dodge's hop that blows pass through, stamina, poise and the
//! stagger, the riposte and the counter, a soft lock that steers a fighter's blows at the foe it fights, the shapes of
//! foes' telegraphed blows, and shots in flight. A fighter steps by whole ticks of the movement rules, so a server and a
//! browser predicting its own player step it alike. Who a blow reaches and what it does is the host's to ask, here.
//! See the Combat note in the bible.

pub mod arms;
pub mod fighter;
pub mod floats;
pub mod judge;
pub mod lock;
pub mod shapes;
pub mod shots;
pub mod sight;
pub mod step;
pub mod strike;
pub mod trim;
pub mod tuning;
pub mod turn;

pub use arms::{Arms, OffHand, Ranged, Stroke, WeaponClass, arms_of};
pub use fighter::{Action, CombatInput, Fighter, FighterId, Intent, Side, Weight, fighter};
pub use judge::{Blow, BlowKind, Verdict, judge};
pub use shapes::{Shape, Telegraph, TelegraphOrder};
pub use shots::Shot;
pub use step::{Happening, Surroundings, step_fighter};
pub use trim::Trim;
pub use turn::player_tick;

/// Whole ticks in `seconds`, to the nearest.
#[must_use]
pub fn ticks(seconds: f64) -> u32 {
    let rounded = seconds * 60.0 + 0.5;
    if rounded <= 0.0 { 0 } else { rounded as u32 }
}
