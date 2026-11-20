use super::*;
use crate::clash::tests::{at_sea, still};
use naval::fight::CAPTAIN;
use naval::ranks::{GREY_TITHE, PIRATES, Rank};

const MAJOR: Commission = Commission { faction: PIRATES, rank: Rank::Major };

fn sloop(x: f64, y: f64) -> Ship {
    ship_at(x, y, 0.0, 0)
}

/// A fight begun between player 1 at the origin and a bold Major 600 m north.
fn begun() -> Fights {
    let mut fights = Fights::default();
    fights.begin_met((1, sloop(0.0, 0.0), [1.0; 3]), &at_sea(9, MAJOR, 0.0, true), (still(), &[]), 0.0);
    fights.list[0].fight.ships.get_mut(&CAPTAIN).unwrap().ship.y = -600.0;
    fights
}

#[test]
fn a_player_not_fighting_who_comes_within_sight_of_a_fight_joins_it_with_a_number_of_their_own() {
    let mut fights = begun();
    assert!(!fights.join((2, sloop(0.0, 900.0), [1.0; 3]), &[], 0.0), "800 m and more from every ship of it");
    assert!(fights.join((2, sloop(0.0, 700.0), [1.0; 3]), &[], 0.0));
    let crews: Vec<(PlayerId, ShipId)> =
        fights.list[0].crews.iter().map(|(player, crew)| (*player, crew.ship)).collect();
    assert_eq!(crews, vec![(1, PLAYER), (2, PLAYERS_FROM)]);
    assert!(fights.fighting(2));
    assert_eq!(fights.each().count(), 2);
}

#[test]
fn each_player_sees_the_fight_from_their_own_ship() {
    let mut fights = begun();
    fights.join((2, sloop(0.0, 700.0), [1.0; 3]), &[], 0.0);
    let views: Vec<(PlayerId, Vec<f64>)> = fights.views(&[], 0.0).map(|seen| (seen.player, seen.numbers)).collect();
    // A view's player's ship comes after its clock and its end: her x and y first.
    let (first, second) = (&views[0].1, &views[1].1);
    assert_eq!((views[0].0, first[2], first[3]), (1, 0.0, 0.0));
    assert_eq!((views[1].0, second[2], second[3]), (2, 0.0, 700.0));
}

#[test]
fn a_hostile_ship_within_sight_of_a_fight_joins_it_on_her_own_side() {
    let mut fights = begun();
    let tithe = at_sea(12, Commission { faction: GREY_TITHE, rank: Rank::Minor }, 500.0, false);
    assert!(fights.join_hostile(&tithe, &[], 0.0));
    let fought = &fights.list[0];
    let joined = fought.fight.vessel(CAPTAIN + 1).and_then(Vessel::command).expect("a captain under the next number");
    assert_eq!(joined.mind.commission.faction, GREY_TITHE);
    assert_eq!(fought.hostiles.get(&(CAPTAIN + 1)).map(|pirate| pirate.id), Some(12));
    let far = Pirate { x: 5_000.0, ..tithe };
    assert!(!fights.join_hostile(&far, &[], 0.0));
}

#[test]
fn a_player_whose_ship_goes_down_leaves_the_fight_and_the_fight_with_no_player_left_ends() {
    let mut fights = begun();
    fights.list[0].fight.ships.get_mut(&PLAYER).unwrap().damage.hull = 1.0;
    // Her next blow takes her under; then she goes down over the sinking's seconds.
    let vessel = fights.list[0].fight.ships.get_mut(&PLAYER).unwrap();
    vessel.damage.apply(naval::damage::Hurt { hull: 1.0, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    assert_eq!(vessel.damage.state, State::Sinking);
    let mut sunk = None;
    for _ in 0..(naval::damage::SINK_SECONDS * 60.0) as u32 + 2 {
        let (outcomes, _) = fights.step(&[], 0.0);
        sunk = sunk.or(outcomes.into_iter().find(|outcome| matches!(outcome, Outcome::Sunk { .. })));
    }
    assert!(matches!(sunk, Some(Outcome::Sunk { player: 1, .. })), "{sunk:?}");
    assert!(fights.list.is_empty());
}

#[test]
fn a_fight_whose_captains_have_all_left_lets_its_players_go_with_the_hurts_they_keep() {
    let mut fights = begun();
    fights.list[0].fight.ships.get_mut(&PLAYER).unwrap().damage.hull = 60.0;
    if let Some(naval::fight::Sailor::Captain(command)) =
        fights.list[0].fight.ships.get_mut(&CAPTAIN).map(|vessel| &mut vessel.sailor)
    {
        command.gone = Some(End::Gone);
    }
    let (outcomes, _) = fights.step(&[], 0.0);
    let max = naval::damage::Damage::new(&naval::arms::LARGE_BOAT, true).max_hull;
    match outcomes.as_slice() {
        [Outcome::Released { player: 1, kept: [hull, 1.0, 1.0], .. }] => assert!((hull - 60.0 / max).abs() < 1e-9),
        other => panic!("{other:?}"),
    }
    assert!(fights.list.is_empty());
}

#[test]
fn a_sloop_put_into_a_fight_starts_it_with_the_hurts_she_keeps() {
    let mut fights = Fights::default();
    fights.begin_met((1, sloop(0.0, 0.0), [0.1, 0.25, 0.5]), &at_sea(9, MAJOR, 0.0, true), (still(), &[]), 0.0);
    let damage = &fights.list[0].fight.vessel(PLAYER).unwrap().damage;
    assert_eq!(damage.hull, (damage.max_hull * 0.1).round());
    assert_eq!(damage.sail, (damage.max_sail * 0.25).round());
    assert_eq!(damage.crew, (damage.max_crew * 0.5).round());
}

#[test]
fn a_ships_level_raises_her_hull_men_and_guns_as_a_foes_level_raises_it_on_land_wherever_she_fights() {
    let minor = Commission { faction: PIRATES, rank: Rank::Minor };
    let at_level = |level: u8| Pirate { level, ..at_sea(9, minor, 0.0, true) };
    let met = |level: u8| {
        let mut fights = Fights::default();
        fights.begin_met((1, sloop(0.0, 0.0), [1.0; 3]), &at_level(level), (still(), &[]), 0.0);
        let captain = fights.list[0].fight.vessel(CAPTAIN).unwrap();
        let strength = captain.command().unwrap().mind.strength;
        (captain.damage.max_hull, captain.damage.max_crew, strength)
    };
    let (four, twenty_seven) = (met(4), met(27));
    assert_eq!(four.2, gear::power::foe_health_times(4), "the land's own law");
    assert_eq!(twenty_seven.2, gear::power::foe_health_times(27));
    assert!(twenty_seven.0 > 4.0 * four.0 && twenty_seven.1 > 4.0 * four.1, "{twenty_seven:?} over {four:?}");
    let mut fights = begun();
    assert!(fights.join_hostile(&Pirate { level: 27, ..at_sea(12, minor, 500.0, false) }, &[], 0.0));
    let joined = fights.list[0].fight.vessel(CAPTAIN + 1).unwrap();
    assert_eq!(joined.damage.max_hull, twenty_seven.0, "one who joins a fight is raised as one who began it");
}
