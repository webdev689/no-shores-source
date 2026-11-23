//! Losing and leaving: what a player who leaves a fight is kept as, what floats for whom across a rejoin, who takes a
//! ship's lot and its hold, and a captain's ship that goes down after its last player left its fight.
use super::tests::{floating_for, met, vessel_mut};
use super::*;
use crate::battle::Sank;
use crate::harbour::JOINED;
use crate::hostiles::Hostile;
use crate::sea::decks::HOLD_TICKS;
use naval::damage::Hurt;
use naval::fight::{CAPTAIN, PLAYER, Sailor};
use naval::ranks::{Commission, GREY_TITHE, Rank};

fn kept(sea: &Sea, player: PlayerId) -> gear::Character {
    gear::Character::from_json(&sea.kept_character(player).unwrap()).unwrap()
}

/// The captain of the player's fight struck where it lies, making no way, and the player's ship at rest.
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

/// The captains' ships lost by fights with no player left in them over `count` ticks, each as its fight lost it.
fn lost_over(sea: &mut Sea, count: usize) -> Vec<Sank> {
    let mut lost = Vec::new();
    for _ in 0..count {
        sea.tick();
        lost.extend(sea.fights.lost.iter().cloned());
    }
    lost
}

#[test]
fn a_ship_joining_a_fight_is_told_with_its_hull() {
    let (mut sea, player) = met(700.0, Rank::Minor);
    let commission = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    sea.hostiles.sailing.push(Hostile::standing(2, 9, commission, [50_000.0, 50_400.0], 0.0, false));
    let _ = sea.take_told();
    sea.tick();
    let joined = sea.take_told().into_iter().find(|(to, numbers)| *to == player && numbers[0] == JOINED);
    let numbers = joined.expect("told who joined").1;
    assert_eq!(numbers[2..], [0.0, f64::from(GREY_TITHE), 3.0, 1.0], "a hostile Elite, in its Schooner");
}

#[test]
fn a_player_who_leaves_a_fight_below_a_third_of_their_hull_is_kept_as_sunk() {
    let (mut sea, player) = met(700.0, Rank::Major);
    let damage = &mut vessel_mut(&mut sea, player, PLAYER).damage;
    damage.hull = damage.max_hull * 0.34;
    assert_eq!(kept(&sea, player).ship[0], 3_400, "a third and more: kept as the fight has it");
    let damage = &mut vessel_mut(&mut sea, player, PLAYER).damage;
    damage.hull = damage.max_hull * 0.32;
    assert_eq!(kept(&sea, player).ship, [1_000, 2_500, 5_000], "under a third: kept as a sunk ship comes back");
    let damage = &mut vessel_mut(&mut sea, player, PLAYER).damage;
    damage.sail = damage.max_sail * 0.1;
    assert_eq!(kept(&sea, player).ship[1], 1_000, "never more canvas than it had");
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
    assert_eq!(floating_for(&sea, stranger).count(), 0, "another account's pieces are not theirs");
    let back = sea.join();
    assert!(sea.own(back, "account-1"));
    assert_eq!(floating_for(&sea, back).count(), 3, "what floats waits for their account");
}

#[test]
fn everyone_who_fought_it_keeps_their_own_lot_and_its_boarders_take_its_hold_on_top() {
    let (mut sea, one) = met(20.0, Rank::Minor);
    let two = sea.join();
    sea.course_anywhere(two, &[[50_010.0, 50_000.0]], 10).unwrap();
    sea.tick();
    assert!(sea.fights.fighting(two), "joined");
    strike(&mut sea, one);
    sea.board(one).unwrap();
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    let laid = laid_over(&mut sea, HOLD_TICKS as usize + 60 * 60);
    assert_eq!(laid.get(&one), Some(&9), "its boarder: their lot of three and its hold of six");
    assert_eq!(laid.get(&two), Some(&3), "who fought it and did not board: their own lot");
}

#[test]
fn a_captain_whose_last_player_left_its_fight_still_goes_down() {
    // Its last player goes down before it does.
    let (mut sea, player) = met(60.0, Rank::Minor);
    vessel_mut(&mut sea, player, CAPTAIN).damage.scuttle();
    vessel_mut(&mut sea, player, PLAYER).damage.scuttle();
    vessel_mut(&mut sea, player, PLAYER).damage.sink_t = naval::damage::SINK_SECONDS - 0.5;
    let lost = lost_over(&mut sea, 60 * 60);
    assert_eq!(lost.len(), 1, "its last player sunk first: {lost:?}");
    assert_eq!(
        (lost[0].hostile.commission.rank, lost[0].hostile.level, &lost[0].players),
        (Rank::Minor, 9, &vec![player])
    );

    // Every player leaves it struck: it is scuttled with no one aboard.
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    sea.leave(player);
    assert_eq!(sea.fights.lost.len(), 1, "left struck");
    assert_eq!(sea.fights.lost[0].players, vec![player]);
}

#[test]
fn a_fight_s_view_says_whether_its_player_may_board_as_a_boarding_would_be_taken() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    let may = |sea: &Sea| sea.fight_views().iter().find(|seen| seen.player == player).map(|seen| seen.may_board);
    assert_eq!(may(&sea), Some(false), "it has not struck");
    strike(&mut sea, player);
    assert_eq!(may(&sea), Some(true));
    sea.board(player).unwrap();
    assert_eq!(may(&sea), Some(false), "already on its deck");
}
