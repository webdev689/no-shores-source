//! The gates: a patrol and its dungeons after the prologue, and the seas by level; a social space never shut.

use crate::activities::Weekly;
use crate::character::Character;
use crate::gate::{Place, Shut, shut, shut_at};
use crate::world::Difficulty;

fn at_level(level: u8, prologue: bool) -> Character {
    let mut character = Character::starting();
    character.earn_xp(u32::try_from(crate::power::xp_for_level(level)).expect("small"), None);
    character.story.prologue = prologue;
    character
}

#[test]
fn patrols_and_their_dungeons_open_after_the_prologue() {
    let new = at_level(1, false);
    assert_eq!(shut(&new, Place::Patrol, Difficulty::Normal), Some(Shut::Prologue));
    assert_eq!(shut(&new, Place::PatrolDungeon, Difficulty::Normal), Some(Shut::Prologue));
    assert_eq!(shut(&new, Place::Patrol, Difficulty::Abyss), Some(Shut::Prologue), "the prologue first");
    assert_eq!(shut(&at_level(1, true), Place::Patrol, Difficulty::Normal), None);
    assert_eq!(shut(&new, Place::Node, Difficulty::Normal), None, "another node: the seas alone");
}

#[test]
fn elite_seas_open_at_level_ten_and_abyss_seas_at_twenty() {
    for place in [Place::Patrol, Place::PatrolDungeon, Place::Node] {
        assert_eq!(shut(&at_level(9, true), place, Difficulty::Elite), Some(Shut::Seas(Difficulty::Elite)));
        assert_eq!(shut(&at_level(10, true), place, Difficulty::Elite), None);
        assert_eq!(shut(&at_level(19, true), place, Difficulty::Abyss), Some(Shut::Seas(Difficulty::Abyss)));
        assert_eq!(shut(&at_level(20, true), place, Difficulty::Abyss), None);
    }
    assert_eq!(Difficulty::ALL.map(Difficulty::opens_at), [1, 10, 20]);
}

#[test]
fn a_social_space_is_open_to_everyone_at_any_seas() {
    for tier in Difficulty::ALL {
        assert_eq!(shut(&at_level(1, false), Place::Social, tier), None);
    }
}

#[test]
fn each_shut_says_why_in_a_short_plain_line() {
    assert_eq!(Shut::Prologue.reason(), "This place opens after the prologue.");
    assert_eq!(Shut::Seas(Difficulty::Elite).reason(), "Elite seas open at level 10.");
    assert_eq!(Shut::Seas(Difficulty::Abyss).reason(), "Abyss seas open at level 20.");
}

#[test]
fn an_elite_dungeon_opens_after_the_prologue_and_the_weeks_two_at_24_and_28() {
    assert_eq!(shut_at(30, false, Place::EliteDungeon, Difficulty::Normal), Some(Shut::Prologue));
    assert_eq!(shut_at(1, true, Place::EliteDungeon, Difficulty::Normal), None);
    for (weekly, opens) in [(Weekly::Elite, 24), (Weekly::Abyss, 28)] {
        let place = Place::Week(weekly);
        assert_eq!(
            shut_at(30, false, place, weekly.tier()),
            Some(Shut::Prologue),
            "the prologue stands in for the campaign"
        );
        assert_eq!(shut_at(opens - 1, true, place, weekly.tier()), Some(Shut::Level(opens)));
        assert_eq!(shut_at(opens, true, place, weekly.tier()), None);
    }
    assert_eq!(Shut::Level(24).reason(), "This dungeon opens at level 24.");
    assert_eq!(
        shut(&at_level(9, true), Place::Patrol, Difficulty::Elite),
        shut_at(9, true, Place::Patrol, Difficulty::Elite)
    );
}
