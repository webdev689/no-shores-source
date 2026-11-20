//! The world's clock, its sun and moon, and its weather. World time is read off the wall, so every room and browser
//! keeps the same hour; the weather is one field over the whole map, made from world time and place, so the wind a
//! ship sails by is the wind the server judges and every player sees the same storm.

pub mod air;
pub mod clock;
pub mod drift;
pub mod heavens;
pub mod lightning;
pub mod weather;

#[cfg(test)]
mod weather_tests;
