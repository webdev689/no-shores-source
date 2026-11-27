//! The asks' numbers, by their names here, for the page's tests to hold its own `ASKS` to: so a page test reads them
//! from what this writes, never from the protocol's source.

use crate::{finds_wire, gear_wire, lore_wire, passage_wire};

#[test]
fn the_asks_numbers_are_written_for_the_page() {
    let asks = [
        ("INFUSE", gear_wire::INFUSE),
        ("RECRUIT", gear_wire::RECRUIT),
        ("STATION", gear_wire::STATION),
        ("DISMISS", gear_wire::DISMISS),
        ("TRAIN", gear_wire::TRAIN),
        ("CHOOSE_OFFICER", gear_wire::CHOOSE_OFFICER),
        ("GRANT_OFFICERS", gear_wire::GRANT_OFFICERS),
        ("SCAVENGE", gear_wire::SCAVENGE),
        ("STOP_GATHER", gear_wire::STOP_GATHER),
        ("FINISH_PROLOGUE", gear_wire::FINISH_PROLOGUE),
        ("TAKE_BOUNTY", gear_wire::TAKE_BOUNTY),
        ("TURN_IN_BOUNTY", gear_wire::TURN_IN_BOUNTY),
        ("TAKE_LETTER", gear_wire::TAKE_LETTER),
        ("TAKE_ALL_LETTERS", gear_wire::TAKE_ALL_LETTERS),
        ("FIND_LORE", lore_wire::FIND_LORE),
        ("OPEN_FIND", finds_wire::OPEN_FIND),
        ("SPEAK", gear_wire::SPEAK),
        ("CHOOSE_FRAGMENT", gear_wire::CHOOSE_FRAGMENT),
        ("ACQUIRE", gear_wire::ACQUIRE),
        ("PASSAGE_GO_ON", passage_wire::PASSAGE_GO_ON),
        ("PASSAGE_KINDLE", passage_wire::PASSAGE_KINDLE),
        ("PASSAGE_LIGHT", passage_wire::PASSAGE_LIGHT),
        ("PASSAGE_HOME", passage_wire::PASSAGE_HOME),
        ("PASSAGE_BEGIN", passage_wire::PASSAGE_BEGIN),
        ("PASSAGE_OPEN", passage_wire::PASSAGE_OPEN),
    ];
    let listed: Vec<String> = asks.iter().map(|(name, number)| format!("\"{name}\":{number}")).collect();
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    std::fs::write(format!("{folder}/asks.json"), format!("{{{}}}", listed.join(","))).expect("written");
}
