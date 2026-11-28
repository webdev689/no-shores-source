//! The parked ships' doors (`room::sea::parked`): a room on land's word on each of its players, the sea's answer to a
//! place's room naming its players ashore with it, and the ships and taken traffic ids that answer gives an island's
//! room to send in its snapshots.

use crate::{Opened, hand_over, with_open};
use room::PlayerId;
use room::sea::ShipLook;
use room::sea::parked::Ashore;
use serde::{Deserialize, Serialize};

/// A place's room's word to the sea: the players it holds (`NamedWord`), its island, a continent's id or a sea
/// island's number and seed (a decimal, as JSON's numbers cannot hold 64 bits), neither for a run started at sea, and
/// the host's time, seconds since the Unix epoch (`Sea::tell_seconds`). Or another tier's sea's word, naming no one,
/// of the accounts whose players have just come back to it (`afloat`): their ships parked here are let go.
#[derive(Deserialize)]
struct Named {
    named: Vec<NamedWord>,
    seconds: u64,
    #[serde(default)]
    afloat: Vec<String>,
    #[serde(default)]
    continent: Option<String>,
    #[serde(default)]
    island: Option<u32>,
    #[serde(default)]
    seed: Option<String>,
}

/// A player a place's room names to the sea: their account, the ship their character sails now as others see it
/// (`ShipLook::of`), their level, and their username and guild tag as the accounts told the room (each empty until
/// it is told, and the tag for no guild), which their ship lying parked takes on (`Sea::refit`).
#[derive(Deserialize, Serialize)]
struct NamedWord {
    account: String,
    hull: u8,
    dress: [u16; 4],
    name: [u8; 2],
    emblem: u16,
    level: u8,
    #[serde(default)]
    username: String,
    #[serde(default)]
    tag: String,
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

/// The sea's answer to a place's room, and what an island's room is given of its seas' answers: each parked ship seen
/// lying at the island, and each traffic id the sea has taken off its route (`Sea::taken`), which a page ashore draws
/// on its route no more.
#[derive(Debug, Deserialize, Serialize)]
struct Answer {
    ships: Vec<ParkedWord>,
    taken: Vec<u64>,
}

/// The open sea's answer to a place's room's word naming its players ashore (`Sea::ashore`), as JSON (`Answer`).
/// Empty with no sea open, or for a word that does not read.
#[must_use]
pub fn sea_ashore(text: &[u8]) -> String {
    let Ok(named) = serde_json::from_slice::<Named>(text) else { return String::new() };
    let place = match (&named.continent, named.island, named.seed.as_deref().map(str::parse::<u64>)) {
        (Some(continent), ..) => Ashore::Continent(continent),
        (None, Some(id), Some(Ok(seed))) => Ashore::Island { id, seed },
        (None, None, None) => Ashore::Anywhere,
        _ => return String::new(),
    };
    let accounts: Vec<&str> = named.named.iter().map(|each| each.account.as_str()).collect();
    let answer = with_open(|opened| match opened {
        Opened::Sea(sea) => {
            sea.tell_seconds(named.seconds);
            named.afloat.iter().for_each(|account| sea.unpark(account));
            for each in &named.named {
                let look = ShipLook { hull: each.hull, dress: each.dress, name: each.name, emblem: each.emblem };
                sea.refit(&each.account, look, each.level, (&each.username, &each.tag));
            }
            Some((sea.ashore(place, &accounts), sea.taken()))
        }
        _ => None,
    });
    let Some((parked, taken)) = answer.flatten() else { return String::new() };
    let ships: Vec<ParkedWord> = parked
        .into_iter()
        .map(|(account, parked)| {
            let ShipLook { hull, dress, name, emblem } = parked.look;
            let (number, x, y, heading) = (parked.number, parked.ship.x, parked.ship.y, parked.ship.heading);
            ParkedWord { account, number, x, y, heading, hull, dress, name, emblem }
        })
        .collect();
    serde_json::to_string(&Answer { ships, taken }).unwrap_or_default()
}

/// The open room on land's word on one of its players for the seas it names them to (`sea_ashore`'s `named`), as
/// JSON: their account, their ship and level as their character has them now, and the username and guild tag on their
/// plate. Empty for a player of no account here, or with no room on land open.
#[must_use]
pub fn land_named(player: PlayerId) -> String {
    let word = with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            let found = room.player(player)?;
            let ShipLook { hull, dress, name, emblem } = ShipLook::of(Some(&found.character));
            let level = found.character.level();
            let (_, plate) = room.plates().find(|(each, _)| *each == player)?;
            let (username, tag) = (plate.name, plate.tag);
            Some(NamedWord { account: found.owner.clone()?, hull, dress, name, emblem, level, username, tag })
        }
        _ => None,
    });
    word.flatten().and_then(|word| serde_json::to_string(&word).ok()).unwrap_or_default()
}

/// Gives the open room on land the ships parked at its island and the traffic ids taken off their routes, as its seas
/// told them (`sea_ashore`'s answers, each ship's number as its host gives it): its snapshots send every player all of
/// them, so a page reloaded ashore draws its own ship, and no page draws a taken ship on its route. False, changing
/// nothing, with no room on land open or for text that is not such an answer.
#[must_use]
pub fn land_parked(text: &[u8]) -> bool {
    let Ok(Answer { ships, taken }) = serde_json::from_slice::<Answer>(text) else { return false };
    let ships = ships
        .into_iter()
        .map(|word| {
            let ship = room::sea::Ship { x: word.x, y: word.y, heading: word.heading, pace: 0, rate: 0 };
            let look = ShipLook { hull: word.hull, dress: word.dress, name: word.name, emblem: word.emblem };
            (word.account, word.number, ship, look)
        })
        .collect();
    with_open(|opened| match opened {
        Opened::Land { sent, .. } => {
            sent.park(ships, taken);
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

/// The open room on land's word on a player for the seas (`land_named`), packed as `hand_over` packs.
#[unsafe(no_mangle)]
pub extern "C" fn room_named(player: PlayerId) -> u64 {
    hand_over(land_named(player).into_bytes())
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
