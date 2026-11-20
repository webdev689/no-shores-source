use super::super::{CourseRefused, Sea};
use super::{ASHORE_TICKS, FADE_TICKS, FIND_M, NEAR_M, SIGHT_M, apart};
use crate::PlayerId;
use crate::harbour::{Harbours, SUNK_KEPT, WASHED_UP};

/// A square continent 100 km a side, its north-west corner 100 km from the frame's. Of `id` and `climate`: the
/// fourth, a desert, sets the sea round it the pirates'; the first, Overlook's, makes it home waters.
fn sea_round(id: &str, climate: &str) -> Sea {
    let text = format!(
        r#"{{ "continents": [{{ "id": "{id}", "climate": "{climate}", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }}], "isles": [] }}"#
    );
    Sea::new(&world::layout::parse(&text).expect("a layout"), crate::deck::test_deck(), 7, &[])
}

fn ticks(sea: &mut Sea, count: u64) {
    for _ in 0..count {
        sea.tick();
    }
}

/// The way in to an anchorage as the page sails it: round the island 1.5 km out, to its offing 1.5 km out on its
/// landing's bearing, then in.
fn round_to(at: [f64; 2], anchorage: [f64; 2], from: [f64; 2]) -> Vec<[f64; 2]> {
    let unit = |[x, y]: [f64; 2]| {
        let length = (x * x + y * y).sqrt();
        [x / length, y / length]
    };
    let out = |[x, y]: [f64; 2]| [at[0] + x * 1_500.0, at[1] + y * 1_500.0];
    let landing = unit([anchorage[0] - at[0], anchorage[1] - at[1]]);
    let ship = unit([from[0] - at[0], from[1] - at[1]]);
    let between = [landing[0] + ship[0], landing[1] + ship[1]];
    let side = if between[0].abs() + between[1].abs() < 1e-6 { [-landing[1], landing[0]] } else { unit(between) };
    vec![out(side), out(landing), anchorage]
}

/// A player at rest 50 km off the continent's north-west, in open sea.
fn at_rest(sea: &mut Sea) -> PlayerId {
    let player = sea.join();
    sea.course(player, &[[50_000.0, 50_000.0]], 10).expect("open sea");
    player
}

#[test]
fn islands_are_rolled_near_a_ship_in_hostile_waters_clear_of_her() {
    let mut sea = sea_round("continent-4", "desert");
    at_rest(&mut sea);
    ticks(&mut sea, 60 * 60 * 3);
    let islands = &sea.islands().standing;
    assert!(!islands.is_empty(), "no island in three minutes");
    for island in islands {
        let off = apart(island.at, [50_000.0, 50_000.0]);
        assert!((1_200.0..=7_000.0).contains(&off), "an island {off} m off the ship");
        assert_eq!(island.climate, "desert");
        assert_eq!(island.guards, Some(::foes::factions::PIRATES));
        assert!(island.anchorage != island.at);
    }
    let near = islands.iter().filter(|island| apart(island.at, [50_000.0, 50_000.0]) <= NEAR_M).count();
    assert!(near <= 2, "{near} near the ship: more than it wants");
}

#[test]
fn no_island_is_rolled_in_home_waters() {
    let mut sea = sea_round("continent-1", "temperate-coast");
    at_rest(&mut sea);
    ticks(&mut sea, 60 * 60 * 5);
    assert!(sea.islands().standing.is_empty());
}

#[test]
fn every_machine_rolls_the_same_islands_from_the_seas_seed() {
    let places = |sea: &Sea| sea.islands().standing.iter().map(|island| (island.seed, island.at)).collect::<Vec<_>>();
    let (mut one, mut other) = (sea_round("continent-4", "desert"), sea_round("continent-4", "desert"));
    at_rest(&mut one);
    at_rest(&mut other);
    ticks(&mut one, 60 * 60 * 2);
    ticks(&mut other, 60 * 60 * 2);
    assert_eq!(places(&one), places(&other));
}

#[test]
fn a_ship_finds_an_island_she_sails_near_and_is_told_of_those_in_sight() {
    let mut sea = sea_round("continent-4", "desert");
    let player = at_rest(&mut sea);
    while sea.islands().standing.is_empty() {
        sea.tick();
    }
    let (id, anchorage, at) = {
        let island = &sea.islands().standing[0];
        (island.id, island.anchorage, island.at)
    };
    assert!(apart(at, [50_000.0, 50_000.0]) <= SIGHT_M);
    assert_eq!(sea.islands().sighted([50_000.0, 50_000.0]).count(), sea.islands().standing.len());
    assert!(!sea.islands().found(player, id), "found from afar");
    ticks(&mut sea, 30);
    sea.course(player, &round_to(at, anchorage, [50_000.0, 50_000.0]), 100).expect("the way in is open sea");
    for _ in 0..60 * 60 {
        sea.tick();
        if sea.ships().all(|(_, ship)| ship.pace == 0) {
            break;
        }
    }
    let ship = sea.ships().next().expect("at sea").1;
    assert!(apart([ship.x, ship.y], anchorage) < 1.0, "the ship lies at its anchorage");
    assert!(apart(anchorage, at) <= FIND_M);
    assert!(sea.islands().found(player, id));
    assert_eq!(sea.islands().found_by(player).count(), 1);
}

#[test]
fn a_course_through_an_island_is_refused_and_its_middle_is_land() {
    let mut sea = sea_round("continent-4", "desert");
    let player = at_rest(&mut sea);
    while sea.islands().standing.is_empty() {
        sea.tick();
    }
    let at = sea.islands().standing[0].at;
    let beyond = [at[0] + (at[0] - 50_000.0), at[1] + (at[1] - 50_000.0)];
    ticks(&mut sea, 30);
    assert_eq!(sea.course(player, &[beyond], 10), Err(CourseRefused::CrossesLand));
    ticks(&mut sea, 30);
    assert_eq!(sea.course(player, &[at], 10), Err(CourseRefused::CrossesLand));
}

#[test]
fn an_island_fades_once_nothing_holds_it_and_players_ashore_hold_it() {
    let mut sea = sea_round("continent-4", "desert");
    let player = at_rest(&mut sea);
    while sea.islands().standing.len() < 2 {
        sea.tick();
    }
    let (kept, left) = (sea.islands().standing[0].id, sea.islands().standing[1].id);
    // The ship sails far off, out of every island's hold and too fast for new ones to keep it company long.
    ticks(&mut sea, 30);
    sea.course(player, &[[50_000.0, 350_000.0]], 100).expect("open sea to the south");
    for held in 0..FADE_TICKS + 2 * 60 * 60 {
        if held.is_multiple_of(ASHORE_TICKS) {
            assert!(sea.hold_ashore(kept), "the island players stand on fell");
        }
        sea.tick();
    }
    assert!(sea.islands().by_id(kept).is_some(), "players ashore hold it");
    assert!(sea.islands().by_id(left).is_none(), "nothing held it");
    assert!(!sea.hold_ashore(left), "a faded island is held no more");
}

#[test]
fn a_player_washes_up_at_a_found_island_nearer_than_any_port_unrepaired() {
    let mut sea = sea_round("continent-4", "desert");
    sea.harbour.harbours = Harbours { ports: vec![("far".into(), [5_000.0, 5_000.0])], ways: None };
    let player = at_rest(&mut sea);
    while sea.islands().standing.is_empty() {
        sea.tick();
    }
    let (id, anchorage) = (sea.islands().standing[0].id, sea.islands().standing[0].anchorage);
    sea.wash_up(player, [50_000.0, 50_000.0], true);
    let port = sea.ships().next().expect("at sea").1;
    assert_eq!((port.x, port.y), (5_000.0, 5_000.0), "not found yet: the port");
    sea.islands.found.entry(player).or_default().insert(id);
    sea.harbour.told.clear();
    sea.wash_up(player, [50_000.0, 50_000.0], true);
    let ship = sea.ships().next().expect("at sea").1;
    assert!(apart([ship.x, ship.y], anchorage) < 1e-9, "at the island's anchorage");
    let told = sea.harbour.told.iter().find(|(to, numbers)| *to == player && numbers[0] == WASHED_UP);
    assert_eq!(told.map(|(_, numbers)| (numbers[2], numbers[4])), Some((-1.0, f64::from(id))));
    assert_eq!(sea.kept(player).map(|(kept, _)| kept), Some(SUNK_KEPT), "an island does not repair");
}
