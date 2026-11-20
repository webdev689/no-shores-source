//! An Art's levels: kills filling the worn Art's bar, rising at its faction's counter for a price with a fragment
//! chosen, fragments bought from the first rank, the spells' shares by level, and old saves owning what they set.

use crate::arts::{ArtAsk, LEVEL_MOST, arts, bar};
use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::dice::Dice;
use crate::factions::factions;
use crate::rewards::Foe;
use crate::world::Difficulty;

const AT_COUNTER: Here = Here { social: true, day: 0, week: 0 };
const DICE: Dice = Dice { seed: 3, tick: 2, player: 1 };

fn stocked() -> Character {
    let mut character = Character::starting();
    character.materials.aurem = 25_000;
    for stock in [
        &mut character.materials.weapon_fragments,
        &mut character.materials.armor_fragments,
        &mut character.materials.weapon_essence,
        &mut character.materials.armor_essence,
    ] {
        *stock = 50;
    }
    character
}

#[test]
fn kills_fill_the_worn_arts_bar_and_stop_when_it_is_full() {
    let mut character = Character::starting();
    assert_eq!((character.art_level(1), character.art_xp(1)), (1, 0));
    let reward = character.reward_kill(Foe::Brute, 5, None, Difficulty::Calm, &DICE);
    assert_eq!(character.art_xp(1), reward.xp, "Storm is worn");
    assert_eq!(character.art_xp(2), 0, "only the worn Art grows");
    for _ in 0..200 {
        character.reward_kill(Foe::Captain, 20, None, Difficulty::Storm, &DICE);
    }
    assert_eq!(character.art_xp(1), bar(1), "a full bar takes no more");
    assert!(character.art_ready(1));
}

#[test]
fn an_art_rises_at_its_faction_for_a_price_and_a_fragment_chosen() {
    let mut character = stocked();
    assert_eq!(character.ask(Ask::RiseArt { art: 1, fragment: 0 }, AT_COUNTER, &DICE), Err(Refusal::NotReady));
    character.arts.xp[0] = bar(1);
    let before = character.clone();
    let afield = Here { social: false, ..AT_COUNTER };
    assert_eq!(character.ask(Ask::RiseArt { art: 1, fragment: 0 }, afield, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(Ask::RiseArt { art: 1, fragment: 6 }, AT_COUNTER, &DICE), Err(Refusal::NoSuchNode));
    assert_eq!(character, before, "a refusal changes nothing");
    assert!(character.ask(Ask::RiseArt { art: 1, fragment: 2 }, AT_COUNTER, &DICE).is_ok());
    assert_eq!((character.art_level(1), character.art_xp(1)), (2, 0), "the bar starts again");
    assert_eq!(character.materials.aurem, 25_000 - arts().levels.rise[0].aurem);
    assert!(character.owns_fragment(1, 2) && !character.owns_fragment(1, 0));
    assert_eq!(character.ask_art(ArtAsk::SetCore { art: 1, slot: 0, fragment: 2 }), Ok(()), "now it may be set");
    character.arts.xp[0] = bar(2);
    assert_eq!(character.ask(Ask::RiseArt { art: 1, fragment: 2 }, AT_COUNTER, &DICE), Err(Refusal::Owned));
    for (level, fragment) in [(2, 0), (3, 1), (4, 3)] {
        character.arts.xp[0] = bar(level);
        assert!(character.ask(Ask::RiseArt { art: 1, fragment }, AT_COUNTER, &DICE).is_ok(), "to {}", level + 1);
    }
    assert_eq!(character.art_level(1), LEVEL_MOST);
    assert_eq!(character.ask(Ask::RiseArt { art: 1, fragment: 4 }, AT_COUNTER, &DICE), Err(Refusal::LevelMost));
    let spent: u32 = arts().levels.rise.iter().map(|rise| rise.aurem).sum();
    assert_eq!(character.materials.aurem, 25_000 - spent);
    assert_eq!(character.materials.weapon_essence, 50 - arts().levels.rise[3].essence);
}

#[test]
fn a_rise_short_of_its_price_is_refused() {
    let mut character = Character::starting();
    character.arts.xp[0] = bar(1);
    let before = character.clone();
    assert_eq!(character.ask(Ask::RiseArt { art: 1, fragment: 0 }, AT_COUNTER, &DICE), Err(Refusal::Short));
    assert_eq!(character, before);
}

#[test]
fn fragments_are_sold_from_the_factions_first_rank() {
    let mut character = stocked();
    assert_eq!(character.ask(Ask::BuyFragment { art: 2, fragment: 5 }, AT_COUNTER, &DICE), Err(Refusal::RankTooLow));
    character.allegiance.reputation[1] = factions().reputation_per_rank;
    assert!(character.ask(Ask::BuyFragment { art: 2, fragment: 5 }, AT_COUNTER, &DICE).is_ok());
    assert!(character.owns_fragment(2, 5));
    assert_eq!(character.materials.aurem, 25_000 - factions().fragment_aurem);
    assert_eq!(character.ask(Ask::BuyFragment { art: 2, fragment: 5 }, AT_COUNTER, &DICE), Err(Refusal::Owned));
}

#[test]
fn each_art_s_level_sets_its_spells_shares_and_level_five_is_as_written() {
    let mut character = Character::starting();
    assert_eq!(character.art_shares(1), (0.6, 0.6));
    character.arts.levels[0] = LEVEL_MOST;
    assert_eq!(character.art_shares(1), (1.0, 1.0));
    assert_eq!(character.art_shares(3), (0.6, 0.6), "each Art its own level");
}

#[test]
fn a_save_from_before_the_levels_owns_what_its_cores_held_at_level_one() {
    let mut kept: serde_json::Value = serde_json::from_str(&Character::starting().to_json()).expect("a character");
    kept["arts"] = serde_json::json!({ "worn": 2, "cores": [[0, null, 5], [3, 1, null], [null, null, null]] });
    let back = Character::from_json(&kept.to_string()).expect("an old save reads");
    assert_eq!((back.art_level(1), back.art_level(2), back.art_xp(2)), (1, 1, 0));
    assert!(
        back.owns_fragment(1, 0) && back.owns_fragment(1, 5) && back.owns_fragment(2, 3) && back.owns_fragment(2, 1)
    );
    assert!(!back.owns_fragment(3, 0) && !back.owns_fragment(1, 1));
    assert_eq!(back.core_of(2), [Some(3), Some(1), None], "what was set stays set");
    let broken = serde_json::json!({ "worn": 1, "levels": [9, 0], "xp": [999_999], "owned": [255] });
    kept["arts"] = broken;
    let back = Character::from_json(&kept.to_string()).expect("a broken save reads");
    assert_eq!((back.art_level(1), back.art_level(2), back.art_xp(1)), (LEVEL_MOST, 1, 0));
}

#[test]
fn an_art_whose_fragments_are_all_owned_still_rises_taking_none() {
    let mut character = stocked();
    character.allegiance.reputation[0] = factions().reputation_per_rank;
    character.materials.aurem = 25_000;
    character.arts.owned = Some(vec![0b11_1111, 0, 0]);
    character.arts.xp[0] = bar(1);
    assert!(character.ask(Ask::RiseArt { art: 1, fragment: 255 }, AT_COUNTER, &DICE).is_ok(), "all six bought first");
    assert_eq!(character.art_level(1), 2);
}

#[test]
fn an_old_save_with_a_full_core_still_reaches_the_highest_level() {
    let mut kept: serde_json::Value = serde_json::from_str(&stocked().to_json()).expect("a character");
    kept["arts"] = serde_json::json!({ "worn": 1, "cores": [[0, 1, 2], [null, null, null], [null, null, null]] });
    let mut character = Character::from_json(&kept.to_string()).expect("an old save reads");
    for (level, fragment) in [(1, 3), (2, 4), (3, 5), (4, 255)] {
        character.arts.xp[0] = bar(level);
        character.materials.aurem = 25_000;
        let rose = character.ask(Ask::RiseArt { art: 1, fragment }, AT_COUNTER, &DICE);
        assert!(rose.is_ok(), "from level {level}: {rose:?}");
    }
    assert_eq!(character.art_level(1), LEVEL_MOST);
}
