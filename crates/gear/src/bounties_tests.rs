use crate::activity::Today;
use crate::dice::Dice;
use crate::objectives::Feat;
use crate::{Ask, Character, Done, Here, Refusal};
use std::collections::BTreeMap;

const DICE: Dice = Dice { seed: 3, tick: 1, player: 1 };
const TITHE_FOE: Feat<'static> = Feat::Felled { faction: 1, rank: 1, island: Some("continent-1") };

fn at_board(day: u64) -> Here {
    Here { social: true, day, week: 2_968 }
}

#[test]
fn a_bounty_is_taken_at_the_board_after_the_prologue_and_turned_in_once_done_for_xp_and_aurem() {
    let mut character = Character::starting();
    let take = |place| Ask::TakeBounty { place, day: 20_778 };
    let turn_in = |place| Ask::TurnInBounty { place, day: 20_778 };
    assert_eq!(character.ask(take(0), at_board(20_778), &DICE), Err(Refusal::BoardShut));
    character.story.prologue = true;
    assert_eq!(character.ask(take(0), Here { social: false, ..at_board(20_778) }, &DICE), Err(Refusal::NotHere));
    assert_eq!(character.ask(take(6), at_board(20_778), &DICE), Err(Refusal::NoSuchBounty));
    assert_eq!(character.ask(take(0), at_board(20_778), &DICE), Ok(Done::Done));
    assert_eq!(character.ask(take(0), at_board(20_778), &DICE), Err(Refusal::BountyHeld));
    assert_eq!(character.ask(turn_in(0), at_board(20_778), &DICE), Err(Refusal::BountyNotDone));
    assert_eq!(character.ask(turn_in(1), at_board(20_778), &DICE), Err(Refusal::BountyNotDone), "not held");
    for _ in 0..30 {
        character.saw(&TITHE_FOE, 20_778);
    }
    let (xp, aurem) = (character.xp, character.materials.aurem);
    assert_eq!(character.ask(turn_in(0), at_board(20_778), &DICE), Ok(Done::Done));
    assert_eq!((character.xp, character.materials.aurem), (xp + 600, aurem + 36));
    assert_eq!(character.ask(turn_in(0), at_board(20_778), &DICE), Err(Refusal::BountyPaid));
    assert_eq!(character.ask(take(0), at_board(20_778), &DICE), Err(Refusal::BountyHeld), "once a day");
    character.activity.today.turned_in.insert(3);
    assert_eq!(character.ask(turn_in(3), at_board(20_778), &DICE), Err(Refusal::BountyPaid), "turned in, held or not");
    assert_eq!([Refusal::BoardShut, Refusal::BountyPaid].map(|refusal| refusal as u8), [80, 84]);
}

#[test]
fn the_board_turns_at_the_daily_reset_and_a_page_or_room_behind_takes_and_pays_nothing() {
    let mut character = Character::starting();
    character.story.prologue = true;
    let yesterdays = Ask::TakeBounty { place: 0, day: 20_777 };
    let shown_yesterday = character.ask(yesterdays, at_board(20_778), &DICE);
    assert_eq!(shown_yesterday, Err(Refusal::NoSuchBounty), "a page still showing yesterday's board");
    character.ask(Ask::TakeBounty { place: 2, day: 20_778 }, at_board(20_778), &DICE).expect("taken");
    for _ in 0..3 {
        character.saw(&Feat::Sunk { water: None, rank: 1 }, 20_778);
    }
    let behind = |ask| character.clone().ask(ask, at_board(20_777), &DICE);
    assert_eq!(behind(Ask::TurnInBounty { place: 2, day: 20_777 }), Err(Refusal::NoSuchBounty), "a room behind");
    assert_eq!(behind(Ask::TakeBounty { place: 4, day: 20_777 }), Err(Refusal::NoSuchBounty));
    assert_eq!(character.activity.today.bounties, BTreeMap::from([(2, 3)]));
    let next = Ask::TurnInBounty { place: 2, day: 20_779 };
    assert_eq!(character.ask(next, at_board(20_779), &DICE), Err(Refusal::BountyNotDone));
    assert_eq!(character.activity.today, Today { day: 20_779, ..Today::default() }, "ended at the reset");
}
