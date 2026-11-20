//! Losing and leaving: what a player who leaves a fight is kept as, what floats for whom across a rejoin, who takes a
//! ship's lot and her hold, and the one word the sea gives for each ship that goes down.
use super::tests::{met, vessel_mut};
use super::*;
use crate::battle::ShipDown;
use crate::harbour::JOINED;
use crate::pirates::Pirate;
use crate::sea::decks::HOLD_TICKS;
use naval::damage::Hurt;
use naval::fight::{CAPTAIN, PLAYER, Sailor};
use naval::ranks::{Commission, PIRATES, Rank};

fn kept(sea: &Sea, player: PlayerId) -> gear::Character {
    gear::Character::from_json(&sea.kept_character(player).unwrap()).unwrap()
}

/// The captain of the player's fight struck where she lies, making no way, and the player's ship at rest.
fn strike(sea: &mut Sea, player: PlayerId) {
    let clock = sea.fights.of_mut(player).unwrap().0.fight.clock;
    let vessel = vessel_mut(sea, player, CAPTAIN);
    let hull = vessel.damage.max_hull * 0.97;
    vessel.damage.apply(Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
    (vessel.ship.ahead, vessel.ship.abeam) = (0.0, 0.0);
    if let Sailor::Captain(command) = &mut vessel.sailor {
        command.struck_at = Some(clock);
    }
    let ship = sea.fights.of_mut(player).unwrap().1.ship;
    let own = vessel_mut(sea, player, ship);
    (own.ship.ahead, own.ship.abeam) = (0.0, 0.0);
}

/// Every piece of what floats laid for each player over `count` ticks, by the told word for it.
fn laid_over(sea: &mut Sea, count: usize) -> BTreeMap<PlayerId, usize> {
    let mut laid = BTreeMap::new();
    for _ in 0..count {
        sea.tick();
        for (player, numbers) in sea.take_told() {
            if numbers[0] == 17.0 {
                *laid.entry(player).or_insert(0) += 1;
            }
        }
    }
    laid
}

/// Every ship-down word over `count` ticks.
fn downs_over(sea: &mut Sea, count: usize) -> Vec<ShipDown> {
    let mut downs = Vec::new();
    for _ in 0..count {
        sea.tick();
        downs.extend(sea.take_ship_downs());
    }
    downs
}

#[test]
fn a_ship_joining_a_fight_is_told_with_her_hull() {
    let (mut sea, player) = met(700.0, Rank::Minor);
    let commission = Commission { faction: PIRATES, rank: Rank::Elite };
    sea.pirates.sailing.push(Pirate::standing(2, 9, commission, [50_000.0, 50_400.0], 0.0, false));
    let _ = sea.take_told();
    sea.tick();
    let joined = sea.take_told().into_iter().find(|(to, numbers)| *to == player && numbers[0] == JOINED);
    let numbers = joined.expect("told who joined").1;
    assert_eq!(numbers[2..], [0.0, f64::from(PIRATES), 3.0, 1.0], "a pirate Elite, in her Schooner");
}

#[test]
fn a_player_who_leaves_a_fight_below_a_third_of_her_hull_is_kept_as_sunk() {
    let (mut sea, player) = met(700.0, Rank::Major);
    let damage = &mut vessel_mut(&mut sea, player, PLAYER).damage;
    damage.hull = damage.max_hull * 0.34;
    assert_eq!(kept(&sea, player).ship[0], 3_400, "a third and more: kept as the fight has her");
    let damage = &mut vessel_mut(&mut sea, player, PLAYER).damage;
    damage.hull = damage.max_hull * 0.32;
    assert_eq!(kept(&sea, player).ship, [1_000, 2_500, 5_000], "under a third: kept as a sunk ship comes back");
}

#[test]
fn what_floats_for_a_player_waits_for_their_account_though_they_drop_and_rejoin() {
    let (mut sea, player) = met(60.0, Rank::Minor);
    assert!(sea.own(player, "account-1"));
    vessel_mut(&mut sea, player, CAPTAIN).damage.scuttle();
    let laid = laid_over(&mut sea, 22 * 60);
    assert_eq!(laid.get(&player), Some(&3));
    sea.leave(player);
    let stranger = sea.join();
    assert!(sea.own(stranger, "account-2"));
    assert_eq!(sea.flotsam_for(stranger).count(), 0, "another account's pieces are not theirs");
    let back = sea.join();
    assert!(sea.own(back, "account-1"));
    assert_eq!(sea.flotsam_for(back).count(), 3, "what floats waits for their account");
}

#[test]
fn everyone_who_fought_her_keeps_their_own_lot_and_her_boarders_take_her_hold_on_top() {
    let (mut sea, one) = met(20.0, Rank::Minor);
    let two = sea.join();
    sea.course(two, &[[50_010.0, 50_000.0]], 10).unwrap();
    sea.tick();
    assert!(sea.fights.fighting(two), "joined");
    strike(&mut sea, one);
    sea.board(one).unwrap();
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    let laid = laid_over(&mut sea, HOLD_TICKS as usize + 60 * 60);
    assert_eq!(laid.get(&one), Some(&9), "her boarder: their lot of three and her hold of six");
    assert_eq!(laid.get(&two), Some(&3), "who fought her and did not board: their own lot");
}

#[test]
fn each_way_a_ship_goes_down_gives_one_word_of_it_naming_her_water_rank_level_and_accounts() {
    // Sunk by the fight: scuttled where she lies.
    let (mut sea, player) = met(60.0, Rank::Minor);
    assert!(sea.own(player, "account-1"));
    vessel_mut(&mut sea, player, CAPTAIN).damage.scuttle();
    let downs = downs_over(&mut sea, 60 * 60);
    assert_eq!(downs.len(), 1, "sunk: {downs:?}");
    assert_eq!((downs[0].rank, downs[0].level), (Rank::Minor, 9));
    assert_eq!(downs[0].players, vec!["account-1".to_owned()]);

    // Taken: boarded, won, and scuttled once her boarders step off.
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    assert_eq!(downs_over(&mut sea, HOLD_TICKS as usize + 60 * 60).len(), 1, "won and scuttled");

    // Her boarders all beaten, she is scuttled.
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    let boarder = sea.decks.boarded[0].aboard[&player];
    sea.decks.boarded[0].room.players.get_mut(&boarder).unwrap().fighter.action = combat::Action::Dead { elapsed: 0 };
    assert_eq!(downs_over(&mut sea, 60 * 60).len(), 1, "her boarders beaten");

    // She goes down under her boarders.
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    vessel_mut(&mut sea, player, CAPTAIN).damage.scuttle();
    assert_eq!(downs_over(&mut sea, 60 * 60).len(), 1, "sunk under her boarders");
}

#[test]
fn a_fight_s_view_says_whether_its_player_may_board_as_a_boarding_would_be_taken() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    let may = |sea: &Sea| sea.fight_views().iter().find(|seen| seen.player == player).map(|seen| seen.may_board);
    assert_eq!(may(&sea), Some(false), "she has not struck");
    strike(&mut sea, player);
    assert_eq!(may(&sea), Some(true));
    sea.board(player).unwrap();
    assert_eq!(may(&sea), Some(false), "already on her deck");
}
