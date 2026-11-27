//! Home waters' shelter at sea: no hostile ship holds, meets, hunts or stays at sea for a player inside them, and a
//! fight's captains break off once its players lie there.
use super::sea_tests::{ship, ticks};
use super::*;
use crate::hostiles::Hostile;
use naval::fight::{HOSTILE_NEAR_M, PLAYER};
use naval::ranks::{Commission, Rank};

/// Overlook's island west and the Grey Tithe's east, home waters giving way to the Tithe's 10 km off Overlook's coast: a
/// point 200 m inside their edge, and one 400 m outside it.
fn by_home_waters() -> (Sea, [f64; 2], [f64; 2]) {
    let text = r#"{ "continents": [
        { "id": "continent-1", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] },
        { "id": "continent-4", "outline": [[400000, 100000], [500000, 100000], [500000, 200000], [400000, 200000]] }
    ], "isles": [] }"#;
    let sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    let edge = (200_000..350_000)
        .step_by(100)
        .map(f64::from)
        .find(|&x| sea.chart.home([x, 150_000.0]) && !sea.chart.home([x + 100.0, 150_000.0]));
    let edge = edge.expect("the edge of home waters");
    let (inside, outside) = ([edge - 200.0, 150_000.0], [edge + 400.0, 150_000.0]);
    assert!(sea.chart.home(inside) && !sea.chart.home(outside));
    (sea, inside, outside)
}

#[test]
fn a_ship_in_home_waters_is_never_held_by_a_bold_hostile_outside_them() {
    let (mut sea, at, off) = by_home_waters();
    let player = sea.join();
    sea.course(player, &[at, [at[0], at[1] - 10_000.0]], 60).unwrap();
    sea.hostiles.sailing.push(Hostile::standing(1, 7, Commission::default(), off, 0.0, true));
    sea.tick();
    assert!(libm::hypot(off[0] - at[0], off[1] - at[1]) < HOSTILE_NEAR_M);
    assert_eq!(ship(&sea, player).rate, 60, "its pace is its own");
}

#[test]
fn nothing_meets_a_ship_in_home_waters_neither_a_wary_ship_that_would_take_it_nor_a_fight_by_their_edge() {
    let (mut sea, at, off) = by_home_waters();
    let player = sea.join();
    sea.course(player, &[at], 10).unwrap();
    sea.berths.get_mut(&player).unwrap().kept = [0.3, 1.0, 1.0];
    // A player past home waters, 3 km out in a whole Sloop the Minor would not take, keeps it at sea.
    let keeper = sea.join();
    sea.course(keeper, &[[off[0] + 3_000.0, off[1]]], 10).unwrap();
    let minor = Commission { faction: naval::ranks::GREY_TITHE, rank: Rank::Minor };
    sea.hostiles.sailing.push(Hostile::standing(1, 7, minor, off, 0.0, false));
    ticks(&mut sea, 2);
    assert!(sea.hostiles.sailing.iter().any(|hostile| hostile.id == 1), "kept at sea");
    assert!(!sea.fights.fighting(player), "a wary Minor that would take a holed Sloop");
    // Another player met just outside, their fight within sight of the one inside.
    let other = sea.join();
    sea.course(other, &[off], 10).unwrap();
    sea.hostiles.sailing.push(Hostile::standing(2, 7, Commission::default(), [off[0] + 500.0, off[1]], 0.0, true));
    ticks(&mut sea, 2);
    assert!(sea.fights.fighting(other) && !sea.fights.fighting(player), "the fight by their edge");
}

#[test]
fn a_clash_by_home_waters_stays_at_sea_for_no_player_inside_them() {
    use crate::clash::tests::{at_sea, friend_at, still};
    let (mut sea, inside, outside) = by_home_waters();
    let player = sea.join();
    sea.course(player, &[inside], 10).unwrap();
    let minor = naval::ranks::Commission { faction: naval::ranks::GREY_TITHE, rank: naval::ranks::Rank::Minor };
    let [x, y] = [outside[0] + 1_000.0, outside[1]];
    let tithe = crate::hostiles::Hostile { y, ..at_sea(3, minor, x, true) };
    let friend = crate::friendlies::Friendly { y, ..friend_at(9, sailing::HullKind::Sloop, x + 400.0) };
    sea.clashes.push(crate::clash::Clash::begin((tithe, friend), still(), &[], 0.0));
    sea.tick();
    assert!(sea.clashes().is_empty(), "none stays at sea for a player inside home waters");
}

#[test]
fn a_captain_breaks_off_a_fight_whose_player_sails_inside_home_waters() {
    let (mut sea, inside, outside) = by_home_waters();
    let player = sea.join();
    sea.course(player, &[outside], 10).unwrap();
    let bold = Hostile::standing(1, 7, Commission::default(), [outside[0] + 600.0, outside[1]], 0.0, true);
    sea.hostiles.sailing.push(bold);
    sea.tick();
    assert!(sea.fights.fighting(player), "met just past the line");
    let fought = &mut sea.fights.of_mut(player).unwrap().0.fight;
    let own = fought.ships.get_mut(&PLAYER).unwrap();
    [own.ship.x, own.ship.y] = inside;
    for _ in 0..10 {
        sea.tick();
    }
    assert!(!sea.fights.fighting(player), "its captain broke off once the player lay inside home waters");
}
