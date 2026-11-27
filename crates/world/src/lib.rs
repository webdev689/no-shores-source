//! The world's structure: the layout of continents and static isles, the rules it keeps, and the exact geometry
//! both rest on. It touches no platform (no files, clock, network or graphics), so the server, the tools and a
//! predicting client all run it and agree to the bit.

pub mod check;
pub mod geometry;
pub mod islands;
pub mod layout;
pub mod ports;
pub mod traffic;
pub mod waters;
pub mod weather;
