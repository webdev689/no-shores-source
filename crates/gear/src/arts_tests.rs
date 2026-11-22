//! The Arts on a character: the file read whole, Storm worn from the start and by every save made before the Arts,
//! wearing an Art and setting its Core with fragments owned, and every ask the room must refuse.

use crate::arts::{ArtAsk, ArtRefusal, CORE_SLOTS, arts};
use crate::character::Character;

#[test]
fn the_arts_file_reads_whole() {
    let file = arts();
    assert_eq!(file.problems(), Vec::<String>::new());
    let keys: Vec<&str> = file.arts.iter().map(|art| art.key.as_str()).collect();
    assert_eq!(keys, ["storm", "divine", "shadow"]);
    assert_eq!(file.art(1).map(|art| art.element), Some(2), "Storm is Volt");
    assert_eq!(file.art(3).and_then(|art| art.spell(2)).map(|spell| spell.key.as_str()), Some("vanish"));
    assert_eq!(file.art(1).and_then(|art| art.fragment("pursuit")).map(|found| found.orbs), Some(2));
    assert!((file.cast.release_s - 0.3).abs() < 1e-9);
}

#[test]
fn a_save_from_before_the_arts_wears_storm_with_every_core_empty() {
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).expect("a character");
    kept.as_object_mut().expect("an object").remove("arts");
    let back = Character::from_json(&kept.to_string()).expect("an old save reads");
    assert_eq!(back.art().key, "storm");
    for art in 1..=3 {
        assert_eq!(back.core_of(art), [None; CORE_SLOTS]);
    }
    let broken = kept.to_string().replacen('{', "{\"arts\":{\"worn\":9,\"cores\":[[7,1,1]]},", 1);
    let back = Character::from_json(&broken).expect("a broken save reads");
    assert_eq!((back.arts.worn, back.core_of(1)), (1, [None, Some(1), None]), "made whole");
}

/// A character who has earned every Art and owns every fragment of each.
fn owning_all() -> Character {
    let mut character = Character::starting();
    character.arts.owned = Some(vec![0b11_1111; arts().arts.len()]);
    character.arts.earned = Some(vec![crate::arts::ALL_EARNED; arts().arts.len()]);
    character
}

#[test]
fn wearing_an_art_and_setting_its_core_keep_through_a_save() {
    let mut character = owning_all();
    assert_eq!(character.ask_art(ArtAsk::Wear { art: 3 }), Ok(()));
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 3, slot: 0, fragment: 0 }), Ok(()));
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 1, slot: 2, fragment: 5 }), Ok(()));
    assert_eq!(character.fragment("hunger").map(|found| found.heal_share), Some(1.0), "the worn Art's own");
    assert!(character.fragment("gale").is_none(), "another Art's Core counts only while it is worn");
    assert_eq!(character.fragment_of(1, "gale").map(|found| found.radius), Some(18.0), "its own Art's Core, not worn");
    assert!(character.fragment_of(1, "overload").is_none(), "not set in Storm's Core");
    assert!(character.fragment_of(3, "gale").is_none(), "a fragment of another Art");
    let back = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!((back.art().key.as_str(), back.core_of(3)[0], back.core_of(1)[2]), ("shadow", Some(0), Some(5)));
}

#[test]
fn an_unknown_art_a_slot_or_fragment_out_of_range_or_one_set_twice_is_refused() {
    let mut character = owning_all();
    let before = character.clone();
    assert_eq!(character.ask_art(ArtAsk::Wear { art: 0 }), Err(ArtRefusal::NoSuchArt));
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 4, slot: 0, fragment: 0 }), Err(ArtRefusal::NoSuchArt));
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 1, slot: 3, fragment: 0 }), Err(ArtRefusal::NoSuchSlot));
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 1, slot: 0, fragment: 6 }), Err(ArtRefusal::NoSuchFragment));
    assert_eq!(character, before, "a refusal changes nothing");
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 1, slot: 0, fragment: 4 }), Ok(()));
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 1, slot: 1, fragment: 4 }), Err(ArtRefusal::FragmentSet));
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 1, slot: 0, fragment: 4 }), Ok(()), "its own slot again");
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 2, slot: 1, fragment: 4 }), Ok(()), "another Art's Core");
    assert_eq!(ArtRefusal::FragmentSet as u8, 113);
}

#[test]
fn a_fragment_not_owned_is_never_set() {
    let mut character = Character::starting();
    let before = character.clone();
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 1, slot: 0, fragment: 0 }), Err(ArtRefusal::NotOwned));
    assert_eq!(character, before, "a refusal changes nothing");
    assert_eq!(ArtRefusal::NotOwned as u8, 114);
    // A kept Core that holds a fragment no longer owned loses it as it is read.
    character.arts.cores[0][2] = Some(3);
    let back = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!(back.core_of(1), [None; CORE_SLOTS]);
}
