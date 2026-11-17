//! Naval combat, the same on the server and in a browser: DFO's broadside gunnery (guns laid square to the hull for a
//! range, fired rippled, scattered by a seeded draw), its balls flying under gravity alone, the harm a ball does to a
//! ship's hull, canvas and men, fire and sinking, and a captain who fights by DFO's laws, all stepped in whole ticks
//! of `sailing::TICK_SECONDS`. See the Naval Combat note in the bible.

pub mod arms;
pub mod ballistics;
pub mod captain;
pub mod damage;
pub mod fight;
pub mod gunnery;
pub mod guns;
pub mod laying;
pub mod ram;
pub mod random;
pub mod shots;
