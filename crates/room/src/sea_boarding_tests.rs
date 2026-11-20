use super::tests::{met, ticks, vessel_mut};
use super::*;
use crate::battle::BoardRefused;
use crate::players::{Input, SpawnAsk};
use crate::sea::decks::{HOLD_TICKS, foe_rank};
use naval::damage::Hurt;
use naval::fight::{CAPTAIN, PLAYER, Sailor};
use naval::ranks::{GREY_TITHE, PIRATES, Rank};

/// The captain of the player's fight struck where she lies, making no way.
fn strike(sea: &mut Sea, player: PlayerId) {
    let clock = sea.fights.of_mut(player).unwrap().0.fight.clock;
    let vessel = vessel_mut(sea, player, CAPTAIN);
    // Under the share any rank strikes at.
    let hull = vessel.damage.max_hull * 0.97;
    vessel.damage.apply(Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
    (vessel.ship.ahead, vessel.ship.abeam) = (0.0, 0.0);
    if let Sailor::Captain(command) = &mut vessel.sailor {
        command.struck_at = Some(clock);
    }
}

fn beaten(sea: &mut Sea, player: PlayerId) {
    let boarder = sea.decks.boarded[0].aboard[&player];
    sea.decks.boarded[0].room.players.get_mut(&boarder).unwrap().fighter.action = combat::Action::Dead { elapsed: 0 };
}

#[test]
fn each_captains_rank_is_the_same_rank_among_the_foes_so_her_deck_holds_the_crew_of_her_rank() {
    for rank in [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss, Rank::Boss] {
        assert_eq!(format!("{:?}", foe_rank(rank)), format!("{rank:?}"));
    }
    for rank in [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss] {
        let (mut sea, player) = met(20.0, rank);
        strike(&mut sea, player);
        sea.board(player).unwrap();
        let mut ranks: Vec<_> = sea.decks()[0].room.foes.values().map(|foe| foe.brain.rank).collect();
        let mut crew: Vec<_> =
            ::foes::crews::deck_crew(PIRATES, foe_rank(rank)).into_iter().map(|(_, hand)| hand).collect();
        ranks.sort();
        crew.sort();
        assert_eq!(ranks, crew, "{rank:?}");
    }
}

#[test]
fn a_boarding_is_refused_when_her_deck_would_hold_no_crew_and_nothing_is_told() {
    assert!(::foes::crews::deck_crew(PIRATES, ::foes::Rank::Boss).is_empty(), "the pirates have no deck Boss");
    let (mut sea, player) = met(20.0, Rank::Boss);
    strike(&mut sea, player);
    assert_eq!(sea.board(player), Err(BoardRefused::NoneAlongside));
    assert!(sea.decks().is_empty() && !sea.on_deck(player));
    assert!(sea.fights.of_mut(player).unwrap().0.pending.is_empty(), "no boarding told");
    // The Grey Tithe's Boss has her deck crew: she is boarded.
    let (mut sea, player) = met(20.0, Rank::Boss);
    sea.fights.of_mut(player).unwrap().0.hostiles.get_mut(&CAPTAIN).unwrap().commission.faction = GREY_TITHE;
    strike(&mut sea, player);
    assert_eq!(sea.board(player), Ok(()));
}

#[test]
fn a_boarding_is_refused_from_too_far_too_fast_twice_and_out_of_a_fight_and_her_own_ship_takes_nothing_meanwhile() {
    let (mut sea, player) = met(60.0, Rank::Minor);
    strike(&mut sea, player);
    assert_eq!(sea.board(player), Err(BoardRefused::NoneAlongside), "60 m off");
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    vessel_mut(&mut sea, player, PLAYER).ship.ahead = 3.0;
    assert_eq!(sea.board(player), Err(BoardRefused::NoneAlongside), "3 m/s");
    vessel_mut(&mut sea, player, PLAYER).ship.ahead = 0.0;
    assert_eq!(sea.board(player), Ok(()));
    assert!(sea.board(player).is_err(), "twice");
    assert!(sea.orders(player, crate::battle::QUIET).is_err(), "orders on her deck");
    assert!(sea.repair(player).is_err());
    assert!(sea.leave_helm(player).is_err());
    let other = sea.join();
    assert!(sea.leave_deck(other).is_err());
    assert_eq!(sea.board(other), Err(BoardRefused::NotFighting), "not at sea");
}

#[test]
fn a_boarders_deck_inputs_stand_no_foe_replay_nothing_reach_no_other_player_and_raise_no_one_beaten() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    let foes = sea.decks()[0].room.foes.len();
    let clock = sea.decks()[0].room.clock();
    let ask = Input {
        sequence: 1,
        seen: clock,
        spawn: Some(SpawnAsk::Foe { foe_type: 1, rank: 1, shield: 0 }),
        ..Default::default()
    };
    assert!(sea.deck_input(player, ask.clone()).is_ok());
    sea.tick();
    assert_eq!(sea.decks()[0].room.foes.len(), foes, "no foe stood by a boarder's ask");
    assert!(sea.deck_input(player, ask).is_err(), "the same input twice");
    let other = sea.join();
    assert!(sea.deck_input(other, Input::default()).is_err(), "on no deck");
    beaten(&mut sea, player);
    let clock = sea.decks()[0].room.clock();
    let _ = sea.deck_input(player, Input { sequence: 2, seen: clock, respawn: true, ..Default::default() });
    sea.tick();
    assert!(!sea.on_deck(player), "beaten, washed up: a respawn ask does not stand her up again");
}

#[test]
fn two_boarders_one_beaten_both_take_her_hold_when_her_crew_falls_and_both_step_off_after_it() {
    let (mut sea, one) = met(20.0, Rank::Minor);
    let two = sea.join();
    sea.course(two, &[[50_010.0, 50_000.0]], 10).unwrap();
    sea.tick();
    assert!(sea.fights.fighting(two), "joined");
    strike(&mut sea, one);
    for player in [one, two] {
        let ship = sea.fights.of_mut(player).unwrap().1.ship;
        vessel_mut(&mut sea, player, ship).ship.ahead = 0.0;
    }
    sea.board(one).unwrap();
    sea.board(two).unwrap();
    assert_eq!(sea.decks().len(), 1);
    beaten(&mut sea, one);
    sea.tick();
    assert!(sea.on_deck(one) && sea.on_deck(two), "one down, one standing");
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    sea.tick();
    assert_eq!((sea.flotsam_for(one).count(), sea.flotsam_for(two).count()), (6, 6), "her hold for each");
    ticks(&mut sea, HOLD_TICKS as usize + 1);
    assert!(!sea.on_deck(one) && !sea.on_deck(two));
}

#[test]
fn her_ship_going_down_under_her_boarders_sends_them_home_with_what_floats_once_and_no_hold() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    vessel_mut(&mut sea, player, CAPTAIN).damage.scuttle();
    vessel_mut(&mut sea, player, CAPTAIN).damage.sink_t = naval::damage::SINK_SECONDS - 0.5;
    ticks(&mut sea, 60 * 60);
    assert!(!sea.on_deck(player));
    assert_eq!(sea.flotsam_for(player).count(), 3, "what floats once, no hold");
}
