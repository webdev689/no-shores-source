//! Every hull's deck and every player's hull's build, for the sea room and for a browser, and a captain's deck opened
//! as a room alone. A deck is read from the ships manifest the game is built with (content/ships/ships.json, which
//! tools/ships/deck.py writes), so the room and every browser stand a walker on the same heights; a build is what the
//! naval rules say a player's ship of that hull is (`naval::class`), for a browser to show.

use movement::Heights;
use naval::arms::arms_of;
use naval::class::CLASSES;
use naval::gunnery::RELOAD_SINGLEHANDED;
use naval::guns::{SWIVEL, Shot};
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

/// Each hull's build as a player sails it, as JSON, in the hulls' order: its name, its hull and canvas whole, its
/// crew, its guns on each side and the loads they take (in the order a gunner steps through them); and its class
/// (`naval::class::Class`): how long it lasts and its rig lasts against the Sloop, its broadside's weight, the seconds a
/// whole crew takes to reload a side, its way and its swing against the Sloop's, and the hands who board with its
/// player.
#[must_use]
pub fn hull_builds_json() -> String {
    let loads: Vec<String> = Shot::CYCLE.iter().map(|shot| format!("\"{}\"", shot.name())).collect();
    let builds: Vec<String> = CLASSES
        .iter()
        .map(|class| {
            let (build, arms) = (class.build(), arms_of(class.hull));
            let reload_s = SWIVEL.reload_s * RELOAD_SINGLEHANDED * class.reload;
            format!(
                concat!(
                    r#"{{"name":"{}","hull":{},"sail":{},"crew":{},"guns":{{"port":{},"starboard":{}}},"loads":[{}],"#,
                    r#""lasts":{},"rig_lasts":{},"broadside":{},"reload_s":{},"way":{},"turn":{},"boarders":{}}}"#
                ),
                build.name,
                build.hull,
                build.sail,
                build.crew,
                arms.port.len(),
                arms.starboard.len(),
                loads.join(","),
                class.lasts,
                class.rig_lasts,
                class.broadside,
                reload_s,
                class.way,
                class.turn,
                class.boarders,
            )
        })
        .collect();
    format!("[{}]", builds.join(","))
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
    fn each_hulls_build_is_the_naval_rules_own() {
        let builds: serde_json::Value = serde_json::from_str(&hull_builds_json()).unwrap();
        let sloop = &builds[0];
        assert_eq!(sloop["name"], "Sloop");
        assert_eq!(sloop["hull"], naval::arms::LARGE_BOAT.hull);
        assert_eq!((sloop["guns"]["port"].as_u64(), sloop["guns"]["starboard"].as_u64()), (Some(3), Some(3)));
        assert_eq!(sloop["loads"][0], "round");
        assert!((sloop["reload_s"].as_f64().unwrap() - 5.6).abs() < 1e-9, "a whole crew's side, 5.6 s");
        for (at, class) in CLASSES.iter().enumerate() {
            let (build, json) = (class.build(), &builds[at]);
            assert_eq!(json["name"], build.name);
            assert_eq!(
                [json["hull"].as_f64(), json["sail"].as_f64(), json["crew"].as_f64()],
                [Some(build.hull), Some(build.sail), Some(build.crew)]
            );
            assert_eq!(json["guns"]["port"].as_u64(), Some(arms_of(class.hull).port.len() as u64));
            assert_eq!([json["way"].as_f64(), json["turn"].as_f64()], [Some(class.way), Some(class.turn)]);
            assert_eq!(json["boarders"].as_u64(), Some(u64::from(class.boarders)));
        }
    }
}
