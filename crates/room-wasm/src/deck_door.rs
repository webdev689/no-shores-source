//! The Sloop's deck and build, for the sea room and for a browser. Her deck is read from the ships manifest the game is
//! built with (content/ships/ships.json, which tools/ships/deck.py writes), so the room and every browser stand a
//! walker on the same heights; her build is what the naval rules say she is, for a browser to show.

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
/// row's heights in centimetres over her waterline (none where no body stands), and the spot behind her wheel.
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
    Ok(Deck { heights, helm: deck.helm })
}

/// The Sloop's deck, read once from the manifest built in.
pub fn sloop_deck() -> &'static Deck {
    static DECK: OnceLock<Deck> = OnceLock::new();
    DECK.get_or_init(|| deck_of(MANIFEST, "sloop").unwrap_or_else(|why| panic!("the built-in manifest: {why}")))
}

/// The Sloop's build as JSON: her name, her hull and canvas whole, her crew, her guns on each side, and the loads her
/// guns take, in the order a gunner steps through them.
#[must_use]
pub fn sloop_build_json() -> String {
    let starboard = SLOOP_ARMS.mouths.iter().filter(|mouth| mouth[1] > 0.0).count();
    let loads: Vec<String> = Shot::CYCLE.iter().map(|shot| format!("\"{}\"", shot.name())).collect();
    format!(
        r#"{{"name":"{}","hull":{},"sail":{},"crew":{},"guns":{{"port":{},"starboard":{}}},"loads":[{}]}}"#,
        LARGE_BOAT.name,
        LARGE_BOAT.hull,
        LARGE_BOAT.sail,
        LARGE_BOAT.crew,
        SLOOP_ARMS.mouths.len() - starboard,
        starboard,
        loads.join(","),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use movement::Terrain;

    #[test]
    fn the_built_in_sloops_deck_reads_and_her_helm_stands_on_it() {
        let deck = sloop_deck();
        let [x, y] = deck.helm;
        assert!(deck.heights.stands_at(x, y), "behind her wheel is deck");
        let height = deck.heights.height_at(x, y);
        assert!(height > 1.5 && height < 3.6, "her planks stand over her waterline: {height}");
        assert!(!deck.heights.stands_at(5.0, 0.0), "off her side is no deck");
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
