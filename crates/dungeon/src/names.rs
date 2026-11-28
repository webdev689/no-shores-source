//! A dungeon's own name, drawn from its seed and its style: "The Weeping Ossuary", "Gallowmere Crypt", "The Catacombs
//! of Ysolde", "Corvin's Sepulchre". Every machine draws the same name for the same dungeon, on a lane of its own.

use crate::lane::Lane;
use crate::styles::Style;

/// What each style calls a dungeon of its own.
const NOUNS: [(&str, &[&str]); 8] = [
    ("crypt", &["Crypt", "Ossuary", "Catacombs", "Sepulchre", "Tombs", "Charnel House", "Mausoleum", "Bone Vaults"]),
    ("halls", &["Halls", "Keep", "Undercroft", "Bastion", "Hold", "Vaults", "Stronghold", "Barracks"]),
    ("cells", &["Cells", "Gaol", "Oubliette", "Pens", "Dungeon", "Prison", "Bridewell", "Pit"]),
    ("sanctum", &["Sanctum", "Temple", "Chantry", "Shrine", "Cloisters", "Reliquary", "Chapel", "Abbey"]),
    ("caverns", &["Caverns", "Grotto", "Hollows", "Deeps", "Warrens", "Caves", "Sinkholes", "Throat"]),
    ("mines", &["Mines", "Delvings", "Workings", "Shafts", "Pits", "Diggings", "Seams", "Lode"]),
    ("chalk", &["Chalk Pits", "Diggings", "Workings"]),
    ("barrow", &["Barrow", "Howe", "Mound"]),
];
const WORDS: [&str; 30] = [
    "Weeping",
    "Drowned",
    "Hollow",
    "Ashen",
    "Silent",
    "Forsaken",
    "Sunken",
    "Pale",
    "Black",
    "Rotting",
    "Starving",
    "Whispering",
    "Blind",
    "Broken",
    "Gnawing",
    "Flooded",
    "Choking",
    "Bleeding",
    "Shivering",
    "Nameless",
    "Forgotten",
    "Cold",
    "Grey",
    "Bitter",
    "Sleepless",
    "Mourning",
    "Hungry",
    "Flayed",
    "Crooked",
    "Shrouded",
];
/// A made place's name is a head and a tail: "Gallow" and "mere".
const HEADS: [&str; 23] = [
    "Gallow", "Black", "Grim", "Marrow", "Ash", "Crow", "Thorn", "Dusk", "Grave", "Cold", "Wither", "Mire", "Rook",
    "Hollow", "Salt", "Brine", "Murk", "Gloam", "Wrack", "Hag", "Dread", "Bone", "Rot",
];
const TAILS: [&str; 18] = [
    "mere", "fen", "holt", "deep", "moor", "wick", "ford", "barrow", "gate", "mouth", "reach", "stead", "dale",
    "cairn", "howe", "scar", "gill", "tor",
];
const PEOPLE: [&str; 20] = [
    "Ysolde", "Corvin", "Maud", "Aldous", "Brannoc", "Tessaly", "Oswin", "Hesper", "Morwen", "Garrick", "Isembard",
    "Elspeth", "Wulfric", "Ottilie", "Cuthbert", "Agnes", "Sabine", "Ambrose", "Leofric", "Rowena",
];

/// A dungeon's name, by its seed and style: one form in three "The <word> <noun>", one in three a made place's
/// "<place> <noun>", and the rest named for a person, "The <noun> of <person>" or "<person>'s <noun>".
#[must_use]
pub fn named(seed: u32, style: &Style) -> String {
    let mut lane = Lane::named(&format!("name:{seed}:{}", style.key));
    let own = [style.noun];
    let nouns = NOUNS.iter().find(|(key, _)| *key == style.key).map_or(&own[..], |(_, nouns)| nouns);
    let mut pick = |list: &[&'static str]| list[lane.below(list.len())];
    let noun = pick(nouns);
    match pick(&["word", "word", "place", "place", "of", "own"]) {
        "word" => format!("The {} {noun}", pick(&WORDS)),
        "place" => format!("{}{} {noun}", pick(&HEADS), pick(&TAILS)),
        "of" => format!("The {noun} of {}", pick(&PEOPLE)),
        _ => format!("{}'s {noun}", pick(&PEOPLE)),
    }
}
