//! The parked ships' doors (`room::sea::parked`): the sea's answer to a place's room naming its players ashore, and
//! the ships that answer gives an island's room to send in its snapshots.

use crate::{Opened, hand_over, with_open};
use room::PlayerId;
use room::sea::ShipLook;
use room::sea::parked::Ashore;
use serde::{Deserialize, Serialize};

/// A place's room's word to the sea: the accounts of the players it holds, and its island, a continent's id or a sea
/// island's number and seed (a decimal, as JSON's numbers cannot hold 64 bits); neither for a run started at sea.
#[derive(Deserialize)]
struct Named {
    accounts: Vec<String>,
    #[serde(default)]
    continent: Option<String>,
    #[serde(default)]
    island: Option<u32>,
    #[serde(default)]
    seed: Option<String>,
}

/// A parked ship as the sea tells a place's room of it, and as the room is given it: its account, the number it is
/// sent under, where it lies and its heading, and its looks (`ShipLook`).
#[derive(Debug, Deserialize, Serialize)]
struct ParkedWord {
    account: String,
    number: PlayerId,
    x: f64,
    y: f64,
    heading: f64,
    hull: u8,
    dress: [u16; 4],
    name: [u8; 2],
    emblem: u16,
}

/// The open sea's answer to a place's room's word naming its players ashore (`Sea::ashore`), as JSON: each parked ship
/// seen lying at its island. Empty with no sea open, or for a word that does not read.
#[must_use]
pub fn sea_ashore(text: &[u8]) -> String {
    let Ok(named) = serde_json::from_slice::<Named>(text) else { return String::new() };
    let place = match (&named.continent, named.island, named.seed.as_deref().map(str::parse::<u64>)) {
        (Some(continent), ..) => Ashore::Continent(continent),
        (None, Some(id), Some(Ok(seed))) => Ashore::Island { id, seed },
        (None, None, None) => Ashore::Anywhere,
        _ => return String::new(),
    };
    let accounts: Vec<&str> = named.accounts.iter().map(String::as_str).collect();
    let answer = with_open(|opened| match opened {
        Opened::Sea(sea) => Some(sea.ashore(place, &accounts)),
        _ => None,
    });
    let Some(answer) = answer.flatten() else { return String::new() };
    let words: Vec<ParkedWord> = answer
        .into_iter()
        .map(|(account, parked)| {
            let ShipLook { hull, dress, name, emblem } = parked.look;
            let (number, x, y, heading) = (parked.number, parked.ship.x, parked.ship.y, parked.ship.heading);
            ParkedWord { account, number, x, y, heading, hull, dress, name, emblem }
        })
        .collect();
    serde_json::to_string(&words).unwrap_or_default()
}

/// Gives the open room on land the ships parked at its island, as its seas told them (`sea_ashore`'s answers, each
/// ship's number as its host gives it): its snapshots send each player all of them but their own. False, changing
/// nothing, with no room on land open or for text that is not such ships.
#[must_use]
pub fn land_parked(text: &[u8]) -> bool {
    let Ok(words) = serde_json::from_slice::<Vec<ParkedWord>>(text) else { return false };
    let ships = words
        .into_iter()
        .map(|word| {
            let ship = room::sea::Ship { x: word.x, y: word.y, heading: word.heading, pace: 0, rate: 0 };
            let look = ShipLook { hull: word.hull, dress: word.dress, name: word.name, emblem: word.emblem };
            (word.account, word.number, ship, look)
        })
        .collect();
    with_open(|opened| match opened {
        Opened::Land { sent, .. } => {
            sent.park(ships);
            true
        }
        _ => false,
    })
    .unwrap_or(false)
}

/// The open sea's answer to the word written at `address` (`sea_ashore`), packed as `hand_over` packs.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_sea_ashore(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    hand_over(sea_ashore(unsafe { std::slice::from_raw_parts(address, length) }).into_bytes())
}

/// Gives the open room on land the parked ships written at `address` (`land_parked`); 1 if given, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_parked(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(land_parked(unsafe { std::slice::from_raw_parts(address, length) }))
}

#[cfg(test)]
#[path = "parked_door_tests.rs"]
mod parked_door_tests;
