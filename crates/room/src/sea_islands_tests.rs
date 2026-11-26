use super::super::{CourseRefused, Sea};
use super::{ASHORE_TICKS, FADE_TICKS, FIND_M, NEAR_M, SIGHT_M, apart, climate_and_resource, dungeon_room};
use crate::PlayerId;
use crate::harbour::{Harbours, SUNK_KEPT, WASHED_UP};

/// A square continent 100 km a side, its north-west corner 100 km from the frame's. Of `id` and `climate`: the
/// fourth, a desert, sets the sea round it the Grey Tithe's; the first, Overlook's, makes it home waters within 10 km
/// of its coast and the Grey Tithe's past them.
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

/// A way in to an anchorage the room must take: round the island 1.5 km out, to a point 1.5 km out on its landing's
/// bearing, then in on that bearing. The page's own way in is nearer (isleLaw.ts `approach`), its land the same.
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
fn islands_are_rolled_near_a_ship_in_hostile_waters_clear_of_it() {
    let mut sea = sea_round("continent-4", "desert");
    at_rest(&mut sea);
    ticks(&mut sea, 60 * 60 * 3);
    let islands = &sea.islands().standing;
    assert!(!islands.is_empty(), "no island in three minutes");
    for island in islands {
        let off = apart(island.at, [50_000.0, 50_000.0]);
        assert!((3_000.0..=7_000.0).contains(&off), "an island {off} m off the ship");
        assert_eq!(island.climate, "desert");
        assert_eq!(island.guards, Some(::foes::factions::GREY_TITHE));
        assert!(island.anchorage != island.at);
    }
    let near = islands.iter().filter(|island| apart(island.at, [50_000.0, 50_000.0]) <= NEAR_M).count();
    assert!(near <= 3, "{near} near the ship: more than it wants");
}

#[test]
fn islands_keep_clear_of_the_friendly_ships_lanes() {
    // A lane along y = 50 km, ships 4 km north of it: islands rolled round them fall on both sides of it.
    let mut sea = sea_round("continent-4", "desert");
    sea.chart.sailed = vec![[[0.0, 50_000.0], [600_000.0, 50_000.0]]];
    for step in 0..10_u32 {
        let player = sea.join();
        sea.course(player, &[[230_000.0 + f64::from(step) * 20_000.0, 54_000.0]], 10).expect("open sea");
    }
    ticks(&mut sea, 60 * 60 * 3);
    let islands = &sea.islands().standing;
    assert!(islands.len() >= 10, "{} islands", islands.len());
    for island in islands {
        let off = (island.at[1] - 50_000.0).abs();
        assert!(off >= isle::reach_of(island.seed) + 300.0, "island {} {off} m off the lane", island.id);
    }
}

#[test]
fn the_sea_rolls_islands_at_the_owners_rates() {
    assert_eq!((super::WANTED_NEAR, super::ROLL_CHANCE, super::MOST), (3, 0.45, 144));
    assert_eq!(super::ROLL_EVERY_TICKS, 10 * 60, "every ten seconds");
}

#[test]
fn an_island_is_rolled_only_wholly_past_home_waters_its_anchorage_too() {
    // The east coast is the line x = 200 km, home waters reaching to 210 km; each island reaches 250 m.
    let lantern = sea_round("continent-1", "temperate-coast");
    assert!(!super::clear_of_home(&lantern.chart, [210_100.0, 150_000.0], 250.0), "its west side in home waters");
    assert!(super::clear_of_home(&lantern.chart, [210_400.0, 150_000.0], 250.0), "past them, its anchorage too");
    let tithe = sea_round("continent-4", "desert");
    assert!(super::clear_of_home(&tithe.chart, [203_000.0, 150_000.0], 250.0), "no home waters there");
}

#[test]
fn no_island_is_rolled_in_home_waters_and_past_their_reach_they_are() {
    let mut sea = sea_round("continent-1", "temperate-coast");
    let player = sea.join();
    sea.course(player, &[[99_000.0, 150_000.0]], 10).expect("1 km off the coast: every roll 3 to 7 km off lies home");
    ticks(&mut sea, 60 * 60 * 5);
    assert!(sea.islands().standing.is_empty());
    at_rest(&mut sea);
    ticks(&mut sea, 60 * 60 * 5);
    assert!(sea.islands().standing.iter().all(|island| island.guards == Some(::foes::factions::GREY_TITHE)));
    assert!(!sea.islands().standing.is_empty(), "50 km off, the Lantern Sea's open sea");
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
fn a_ship_finds_an_island_it_sails_near_and_is_told_of_those_in_sight() {
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
    assert!(!sea.islands().found(player, id), "found from afar");
    assert_eq!(sea.islands().told(player, [50_000.0, 50_000.0]).count(), sea.islands().standing.len(), "all in sight");
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

/// Lays the player's ship at rest at a point, as a fight's end or a rejoin does.
fn lay_at(sea: &mut Sea, player: PlayerId, [x, y]: [f64; 2]) {
    let sailing = sea.berths.get_mut(&player).and_then(|berth| berth.sailing.as_mut()).expect("at sea");
    sailing.ship.x = x;
    sailing.ship.y = y;
    sailing.course.clear();
}

#[test]
fn a_ship_left_within_an_islands_land_sails_out_of_it() {
    let mut sea = sea_round("continent-4", "desert");
    let player = at_rest(&mut sea);
    while sea.islands().standing.is_empty() {
        sea.tick();
    }
    let (at, anchorage) = (sea.islands().standing[0].at, sea.islands().standing[0].anchorage);
    ticks(&mut sea, 30);
    // Halfway from its middle to its anchorage: on the beach, within its land.
    let inside = [(at[0] + anchorage[0]) * 0.5, (at[1] + anchorage[1]) * 0.5];
    lay_at(&mut sea, player, inside.map(f64::round));
    assert_eq!(sea.course(player, &[[50_000.0, 50_000.0]], 10), Ok(()), "held in the island's land for good");
}

#[test]
fn an_account_whose_ship_lies_at_an_anchorage_is_landed_there_until_it_sails_on() {
    let mut sea = sea_round("continent-4", "desert");
    let (anchored, far) = (at_rest(&mut sea), at_rest(&mut sea));
    assert!(sea.own(anchored, "anchored") && sea.own(far, "far-off"));
    while sea.islands().standing.is_empty() {
        sea.tick();
    }
    let (id, seed, anchorage) =
        (sea.islands().standing[0].id, sea.islands().standing[0].seed, sea.islands().standing[0].anchorage);
    lay_at(&mut sea, anchored, [anchorage[0].round(), anchorage[1].round() + 20.0]);
    sea.tick();
    let islands = sea.islands();
    let first = islands.landed(id, seed, "anchored").expect("landed");
    assert!(islands.landed(id, seed, "far-off").is_none(), "a ship off the anchorage");
    assert!(islands.landed(id, seed ^ 1, "anchored").is_none(), "another island of its number");
    // Gone ashore, it stays landed, the same landing; back at sea and under way, it is landed nowhere.
    sea.leave(anchored);
    ticks(&mut sea, 60);
    assert_eq!(sea.islands().landed(id, seed, "anchored"), Some(first), "ashore, its ship left at the anchorage");
    let back = at_rest(&mut sea);
    assert!(sea.own(back, "anchored"));
    lay_at(&mut sea, back, [anchorage[0].round() + 400.0, anchorage[1].round()]);
    sea.tick();
    assert!(sea.islands().landed(id, seed, "anchored").is_none(), "sailed off");
    // Back at its anchorage, it lands again: a landing of its own, a new visit.
    lay_at(&mut sea, back, [anchorage[0].round(), anchorage[1].round() + 20.0]);
    sea.tick();
    let again = sea.islands().landed(id, seed, "anchored").expect("landed again");
    assert_ne!(again, first, "a new landing");
}

#[test]
fn a_standing_islands_dungeon_is_found_by_its_rooms_name_alone_and_no_other() {
    // The page folds the same seeds to the same eight digits (client/src/game/isleLaw.test.ts).
    assert!(dungeon_room(255, "continent-2").ends_with("-000000ff"));
    assert!(dungeon_room(0x1234_5678_9abc_def0, "continent-7").ends_with("-88888888"));
    let mut sea = sea_round("continent-4", "desert");
    at_rest(&mut sea);
    while sea.islands().standing.is_empty() {
        sea.tick();
    }
    let (id, seed, style) =
        (sea.islands().standing[0].id, sea.islands().standing[0].seed, sea.islands().standing[0].kind.dungeon());
    let room = dungeon_room(seed, "continent-4");
    assert!(room.starts_with(&format!("sea-dungeon-continent-4-{style}-")), "{room}");
    assert_eq!(sea.island_behind(&room).map(|island| island.id), Some(id));
    let restyled = room.replace(style, if style == "crypt" { "mines" } else { "crypt" });
    for named in [dungeon_room(seed ^ (1 << 40), "continent-4"), dungeon_room(seed, "continent-5"), restyled] {
        assert!(sea.island_behind(&named).is_none(), "{named}: no island the sea holds");
    }
}

#[test]
fn only_the_islands_a_player_is_told_of_hold_their_course() {
    let mut sea = sea_round("continent-4", "desert");
    let player = at_rest(&mut sea);
    while sea.islands().standing.is_empty() {
        sea.tick();
    }
    let at = sea.islands().standing[0].at;
    let (east, south) = (at[0] - 50_000.0, at[1] - 50_000.0);
    let off = (east * east + south * south).sqrt();
    // From out of its sight, on the line through it: the page is not told of it, so it does not bend round it.
    let far = [at[0] - east / off * (SIGHT_M + 2_000.0), at[1] - south / off * (SIGHT_M + 2_000.0)];
    let beyond = [at[0] + east / off * 3_000.0, at[1] + south / off * 3_000.0];
    ticks(&mut sea, 30);
    assert!(!sea.islands().found(player, sea.islands().standing[0].id));
    lay_at(&mut sea, player, far.map(f64::round));
    assert_eq!(sea.course(player, &[beyond], 10), Ok(()), "refused for an island the page does not know");
}

#[test]
fn an_island_fades_once_nothing_holds_it_and_players_ashore_hold_it() {
    let mut sea = sea_round("continent-4", "desert");
    let player = at_rest(&mut sea);
    while sea.islands().standing.len() < 2 {
        sea.tick();
    }
    let (kept, left) = (sea.islands().standing[0].id, sea.islands().standing[1].id);
    let seed = |id| sea.islands().by_id(id).map(|island| island.seed).expect("it stands");
    let (kept_seed, left_seed) = (seed(kept), seed(left));
    // The ship sails far off, out of every island's hold and too fast for new ones to keep it company long.
    ticks(&mut sea, 30);
    sea.course(player, &[[50_000.0, 350_000.0]], 100).expect("open sea to the south");
    for held in 0..FADE_TICKS + 2 * 60 * 60 {
        if held.is_multiple_of(ASHORE_TICKS) {
            assert!(sea.hold_ashore(kept, kept_seed), "the island players stand on fell");
            assert!(!sea.hold_ashore(left, kept_seed), "an island is held by its own seed alone");
        }
        sea.tick();
    }
    assert!(sea.islands().by_id(kept).is_some(), "players ashore hold it");
    assert!(sea.islands().by_id(left).is_none(), "nothing held it");
    assert!(!sea.hold_ashore(left, left_seed), "a faded island is held no more");
}

#[test]
fn a_player_washes_up_at_a_found_island_nearer_than_any_port_unrepaired() {
    let mut sea = sea_round("continent-4", "desert");
    let player = at_rest(&mut sea);
    sea.harbour.harbours = Harbours { ports: vec![("far".into(), [5_000.0, 5_000.0])], ways: None };
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

#[test]
fn an_islands_climate_and_resource_are_those_of_the_continent_whose_water_it_lies_in() {
    let text = r#"{ "continents": [{ "id": "continent-4", "climate": "desert", "outline": [[0, 0], [10, 0], [10, 10]] },
        { "id": "unnamed", "outline": [[20, 0], [30, 0], [30, 10]] }], "isles": [] }"#;
    let layout = world::layout::parse(text).expect("a layout");
    let resources = &gear::catalogue::catalogue().resources;
    let sunstone = resources.iter().position(|found| found.id == "sunstone").and_then(|at| u8::try_from(at).ok());
    assert!(sunstone.is_some(), "the catalogue holds Sunstone");
    assert_eq!(climate_and_resource(&layout.continents[0]), ("desert".to_owned(), sunstone), "continent-4's Sunstone");
    assert_eq!(climate_and_resource(&layout.continents[1]), (String::new(), None), "none for land with none");
}
