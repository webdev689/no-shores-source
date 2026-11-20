//! Gear and power, the same on the server and in every browser, after Destiny 1 at launch: items of five rarities,
//! their nodes unlocked by XP and bought with Aurem, fragments, island resources and Essence; Prestige carried by
//! armour raising a player past level 20; a weapon's Attack and armour's Defense against a foe's level; Vestiges, the
//! sealed drops, opened in a social space; weapons' elements and foes' shields; emblems; everything a player holds;
//! the game's one clock, its day and week; and what is on, drawn by the day and the week.

pub mod activities;
pub mod activity;
pub mod ammo;
pub mod arts;
pub mod asks;
pub mod catalogue;
pub mod character;
pub mod clock;
pub mod dice;
pub mod element;
pub mod emblems;
pub mod gate;
pub mod grid;
pub mod item;
pub mod kinds;
mod old_hands;
pub mod power;
pub mod rarity;
pub mod rewards;
pub mod shown;
pub mod story;
pub mod vendor;
pub mod vestige;
pub mod world;

pub use asks::{Ask, Done, Here, Refusal};
pub use character::{At, Character, Materials, Vestige};
pub use element::Element;
pub use item::Item;
pub use kinds::{Kind, Slot};
pub use rarity::Rarity;
pub use world::Difficulty;

#[cfg(test)]
mod activities_tests;
#[cfg(test)]
mod activity_tests;
#[cfg(test)]
mod ammo_tests;
#[cfg(test)]
mod arts_tests;
#[cfg(test)]
mod asks_tests;
#[cfg(test)]
mod clock_tests;
#[cfg(test)]
mod emblems_tests;
#[cfg(test)]
mod gate_tests;
#[cfg(test)]
mod item_tests;
#[cfg(test)]
mod keep_tests;
#[cfg(test)]
mod old_hands_tests;
#[cfg(test)]
mod power_tests;
#[cfg(test)]
mod vestige_tests;
