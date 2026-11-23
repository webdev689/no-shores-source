//! The Sloop's deck and build, for the sea room and for a browser, and a captain's deck opened as a room alone. Its
//! deck is read from the ships manifest the game is built with (content/ships/ships.json, which tools/ships/deck.py
//! writes), so the room and every browser stand a walker on the same heights; its build is what the naval rules say
//! it is, for a browser to show.

use movement::Heights;
use naval::arms::{LARGE_BOAT, SLOOP_ARMS};
use naval::guns::Shot;
use room::deck::Deck;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// The ships manifest, as the game is built with it.
const MANIFEST: &str = include_str!("../../../content/ships/ships.json");

#[derive(Deserialize)]
struct Manifest {
    ships: BTreeMap<String, Entry>,
}

#[derive(Deserialize)]
struct Entry {
    deck: DeckEntry,
}

/// A deck as the manifest holds it: its grid's west and north edges and cell in metres, its columns and rows, each
/// row's heights in centimetres over its waterline (none where no body stands), and the spot behind its wheel.
#[derive(Deserialize)]
struct DeckEntry {
    cell_m: f64,
    west_m: f64,
    north_m: f64,
    columns: usize,
    rows: usize,
    heights_cm: Vec<Vec<Option<i32>>>,
    helm: [f64; 2],
}

/// A ship's deck from the manifest's text, or why it does not read.
pub fn deck_of(text: &str, name: &str) -> Result<Deck, String> {
    let manifest: Manifest = serde_json::from_str(text).map_err(|error| error.to_string())?;
    let entry = manifest.ships.get(name).ok_or_else(|| format!("the manifest names no ship {name}"))?;
    let deck = &entry.deck;
    if deck.heights_cm.len() != deck.rows || deck.heights_cm.iter().any(|row| row.len() != deck.columns) {
        return Err(format!("{name}'s deck is not {} rows of {} cells", deck.rows, deck.columns));
    }
    let heights = deck.heights_cm.iter().flatten().map(|height| height.map(|cm| f64::from(cm) / 100.0)).collect();
    let heights = Heights::new(deck.west_m, deck.north_m, deck.cell_m, deck.columns, deck.rows, heights)
        .ok_or_else(|| format!("{name}'s deck grid does not hold its heights"))?;
    let east_south = [deck.west_m + deck.cell_m * deck.columns as f64, deck.north_m + deck.cell_m * deck.rows as f64];
    Ok(Deck { heights, helm: deck.helm, bounds: [[deck.west_m, deck.north_m], east_south] })
}

/// The Sloop's deck, the first of the hulls' decks.
pub fn sloop_deck() -> &'static Deck {
    &hull_decks()[0]
}

/// Every hull's deck as the built-in manifest has it, by its hull's number: the Sloop's, the Schooner's, the Brig's and
/// the Frigate's.
pub fn hull_decks() -> &'static [Deck] {
    static DECKS: OnceLock<Vec<Deck>> = OnceLock::new();
    DECKS.get_or_init(|| {
        ["sloop", "schooner", "brig", "frigate"]
            .iter()
            .map(|name| deck_of(MANIFEST, name).unwrap_or_else(|why| panic!("the built-in manifest: {why}")))
            .collect()
    })
}

/// The Sloop's build as JSON: its name, its hull and canvas whole, its crew, its guns on each side, and the loads it
/// guns take, in the order a gunner steps through them.
#[must_use]
pub fn sloop_build_json() -> String {
    let loads: Vec<String> = Shot::CYCLE.iter().map(|shot| format!("\"{}\"", shot.name())).collect();
    format!(
        r#"{{"name":"{}","hull":{},"sail":{},"crew":{},"guns":{{"port":{},"starboard":{}}},"loads":[{}]}}"#,
        LARGE_BOAT.name,
        LARGE_BOAT.hull,
        LARGE_BOAT.sail,
        LARGE_BOAT.crew,
        SLOOP_ARMS.port.len(),
        SLOOP_ARMS.starboard.len(),
        loads.join(","),
    )
}

/// Opens a captain's deck as a room alone, as the sea holds one boarded: its hull's deck by its number, its faction's
/// deck crew for its rank (1 Minor to 5 Boss) at its level. The page's tests and pictures of the fight on its deck
/// stand on it; the sea opens its own. Answers whether the hull and the rank are ones.
#[must_use]
pub fn open_deck(hull: u8, faction: u8, rank: u8, level: u8) -> bool {
    let (Some(deck), Some(rank)) = (hull_decks().get(usize::from(hull)), foes::Rank::from_number(rank)) else {
        return false;
    };
    crate::keep(crate::Opened::Land {
        room: Box::new(room::Room::deck(deck, faction, rank, level.max(1))),
        node: None,
        refusal: None,
        sent: Box::default(),
    });
    true
}

/// Opens a captain's deck as a room alone (`open_deck`); 1 if it opened, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_open_deck(hull: u32, faction: u32, rank: u32, level: u32) -> u32 {
    let byte = |number: u32| u8::try_from(number).unwrap_or(u8::MAX);
    u32::from(open_deck(byte(hull), byte(faction), byte(rank), byte(level)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use movement::Terrain;

    #[test]
    fn the_built_in_sloops_deck_reads_and_its_helm_stands_on_it() {
        let deck = sloop_deck();
        let [x, y] = deck.helm;
        assert!(deck.heights.stands_at(x, y), "behind its wheel is deck");
        let height = deck.heights.height_at(x, y);
        assert!(height > 1.5 && height < 3.6, "its planks stand over its waterline: {height}");
        assert!(!deck.heights.stands_at(5.0, 0.0), "off its side is no deck");
    }

    #[test]
    fn a_deck_whose_rows_do_not_hold_its_cells_does_not_read() {
        let text = r#"{"ships":{"sloop":{"deck":{"cell_m":0.1,"west_m":0,"north_m":0,"columns":2,"rows":1,"heights_cm":[[80]],"helm":[0,0]}}}}"#;
        assert!(deck_of(text, "sloop").is_err());
        assert!(deck_of(text, "brig").is_err(), "a ship the manifest does not name");
    }

    #[test]
    fn the_sloops_build_is_the_naval_rules_own() {
        let build: serde_json::Value = serde_json::from_str(&sloop_build_json()).unwrap();
        assert_eq!(build["name"], "Sloop");
        assert_eq!(build["hull"], LARGE_BOAT.hull);
        assert_eq!((build["guns"]["port"].as_u64(), build["guns"]["starboard"].as_u64()), (Some(3), Some(3)));
        assert_eq!(build["loads"][0], "round");
    }
}
