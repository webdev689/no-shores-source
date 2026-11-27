//! A ship left lying parked as its player leaves the sea at rest by an island: kept by its account, seen only while a
//! place's room names that account ashore at the island it lies at, let go once no room names it, and its player's
//! again as they come back to the sea.

use super::tests::{sea, ticks};
use super::*;
use crate::sea::parked::{Ashore, KEPT_S, NAMED_S, PARKED_MOST};

/// 2 km west of the tests' square continent's west coast, and 40 km west of it.
const OFF_COAST: [f64; 2] = [98_000.0, 150_000.0];
const FAR_OUT: [f64; 2] = [60_000.0, 150_000.0];
/// A time the host tells, seconds since the Unix epoch.
const START: u64 = 1_800_000_000;
const ISLAND: Ashore<'static> = Ashore::Continent("continent-4");

/// A player of `account` whose ship came to rest at `at`, then left the sea.
fn left_at(sea: &mut Sea, account: &str, at: [f64; 2]) -> PlayerId {
    let player = sea.join();
    assert!(sea.own(player, account));
    sea.course_anywhere(player, &[at], 10).unwrap();
    sea.tick();
    sea.leave(player);
    player
}

fn shown(sea: &Sea) -> Vec<PlayerId> {
    sea.parked().map(|parked| parked.number).collect()
}

fn answered(answer: &[(String, crate::sea::parked::Parked)]) -> Vec<&str> {
    answer.iter().map(|(account, _)| account.as_str()).collect()
}

#[test]
fn a_ship_left_at_rest_lies_parked_seen_only_while_a_room_names_its_account_on_the_island_it_lies_at() {
    let mut sea = sea();
    let left = left_at(&mut sea, "ann", OFF_COAST);
    assert_eq!(sea.ships().count(), 0, "out of play: no hostile ship or fight heeds it");
    assert!(shown(&sea).is_empty(), "seen by no one before a room names its account");
    let answer = sea.ashore(ISLAND, &["ann"]);
    assert_eq!(answered(&answer), ["ann"], "the island's room is answered with the ships lying at it");
    let (_, parked) = &answer[0];
    assert_eq!((parked.number, parked.ship.x, parked.ship.y, parked.ship.pace), (left, OFF_COAST[0], OFF_COAST[1], 0));
    assert_eq!(shown(&sea), [left], "seen at sea, under its player's number");
    let others = sea.ashore(ISLAND, &["bea"]);
    assert_eq!(answered(&others), ["ann"], "every room at that island is told of it, whoever it names");
}

#[test]
fn a_ship_no_room_names_is_kept_unseen_and_let_go_after_a_day_of_the_hosts_time() {
    let mut sea = sea();
    sea.tell_seconds(START);
    left_at(&mut sea, "ann", OFF_COAST);
    sea.tell_seconds(START + NAMED_S + 1);
    left_at(&mut sea, "bea", OFF_COAST);
    assert!(shown(&sea).is_empty());
    assert_eq!(sea.parked.by_account.len(), 2, "named by no room in time, kept unseen");
    sea.tell_seconds(START + NAMED_S + KEPT_S + 1);
    left_at(&mut sea, "cal", OFF_COAST);
    let kept: Vec<&String> = sea.parked.by_account.keys().collect();
    assert_eq!(kept, ["bea", "cal"], "named by no room for a day, let go");
}

#[test]
fn a_naming_lapses_after_45_seconds_of_the_hosts_time_told_though_the_sea_never_ticks() {
    let mut sea = sea();
    sea.tell_seconds(START);
    let left = left_at(&mut sea, "ann", OFF_COAST);
    assert_eq!(answered(&sea.ashore(ISLAND, &["ann"])), ["ann"]);
    sea.tell_seconds(START + NAMED_S);
    assert_eq!(answered(&sea.ashore(ISLAND, &[])), ["ann"], "named 45 s ago");
    assert_eq!(shown(&sea), [left]);
    sea.tell_seconds(START + NAMED_S + 1);
    assert!(sea.ashore(ISLAND, &[]).is_empty(), "lapsed, the sea never ticking");
    assert!(shown(&sea).is_empty());
    sea.tell_seconds(START);
    assert_eq!(answered(&sea.ashore(ISLAND, &["ann"])), ["ann"], "a time told late turns no clock back");
    sea.minute = (START + 2 * NAMED_S) / 60 + 1;
    assert!(shown(&sea).is_empty(), "nor before the minute the host set as the sea started ticking");
}

#[test]
fn a_ship_is_seen_while_its_naming_is_renewed_and_no_longer_once_it_stops() {
    let mut sea = sea();
    let left = left_at(&mut sea, "ann", OFF_COAST);
    let named = usize::try_from(NAMED_S * 60).unwrap();
    sea.ashore(ISLAND, &["ann"]);
    ticks(&mut sea, named);
    sea.ashore(ISLAND, &["ann"]);
    ticks(&mut sea, named);
    assert_eq!(shown(&sea), [left], "renewed in time, 45 s of the sea's ticks ago");
    ticks(&mut sea, 60);
    assert!(shown(&sea).is_empty(), "logged off or gone elsewhere, its naming lapsed");
    let bea = left_at(&mut sea, "bea", OFF_COAST);
    assert_eq!(answered(&sea.ashore(ISLAND, &["bea"])), ["bea"], "a lapsed one never answered");
    let again = sea.ashore(ISLAND, &["ann", "bea"]);
    assert_eq!(answered(&again), ["ann", "bea"], "back on the island, docked and seen again");
    assert_eq!(shown(&sea), [left, bea]);
}

#[test]
fn a_run_started_at_sea_keeps_a_ship_seen_wherever_it_lies_and_is_told_of_none() {
    let mut sea = sea();
    let left = left_at(&mut sea, "ann", OFF_COAST);
    assert!(sea.ashore(Ashore::Anywhere, &["ann"]).is_empty(), "a run lies at no island");
    assert_eq!(shown(&sea), [left]);
}

#[test]
fn a_ship_under_way_or_fighting_as_its_player_leaves_is_not_parked() {
    let mut sea = sea();
    let player = sea.join();
    assert!(sea.own(player, "ann"));
    sea.course_anywhere(player, &[OFF_COAST, [OFF_COAST[0], OFF_COAST[1] + 5_000.0]], 10).unwrap();
    sea.tick();
    sea.leave(player);
    // At rest off the coast, met by a bold hostile ship.
    let mut fought = super::tests::sea();
    let fighting = fought.join();
    assert!(fought.own(fighting, "bea"));
    fought.course_anywhere(fighting, &[OFF_COAST], 10).unwrap();
    let commission = naval::ranks::Commission { faction: naval::ranks::GREY_TITHE, rank: naval::ranks::Rank::Minor };
    let at = [OFF_COAST[0], OFF_COAST[1] - 700.0];
    let bold = crate::hostiles::Hostile::standing(1, 7, commission, at, 0.0, true);
    fought.hostiles.sailing.push(crate::hostiles::Hostile { level: 9, ..bold });
    fought.tick();
    assert!(fought.fights.fighting(fighting));
    fought.leave(fighting);
    for sea in [&mut sea, &mut fought] {
        sea.ashore(Ashore::Anywhere, &["ann", "bea"]);
        assert!(sea.parked.by_account.is_empty() && shown(sea).is_empty());
    }
}

#[test]
fn a_player_back_at_sea_has_their_ship_again_and_it_lies_parked_no_more() {
    let mut sea = sea();
    left_at(&mut sea, "ann", OFF_COAST);
    assert_eq!(answered(&sea.ashore(ISLAND, &["ann"])), ["ann"]);
    let back = sea.join();
    assert!(sea.own(back, "ann"));
    assert!(shown(&sea).is_empty());
    assert!(sea.ashore(ISLAND, &["ann"]).is_empty());
}

#[test]
fn a_sea_islands_room_holds_it_and_is_answered_with_the_ships_lying_off_it() {
    let text = r#"{ "continents": [{ "id": "continent-4", "climate": "desert", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    let player = sea.join();
    assert!(sea.own(player, "ann"));
    sea.course(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    // Every ship the sea's rolls send let go at once, so none takes the player on while an island rolls.
    for _ in 0..60 * 60 * 3 {
        sea.hostiles.sailing.clear();
        sea.tick();
    }
    let island = sea.islands().standing().next().expect("an island rolled near the ship");
    let (id, seed) = (island.id, island.seed);
    sea.leave(player);
    let answer = sea.ashore(Ashore::Island { id, seed }, &["ann"]);
    assert_eq!(answer.iter().map(|(_, parked)| parked.number).collect::<Vec<_>>(), [player]);
    assert!(sea.ashore(Ashore::Island { id, seed: seed ^ 1 }, &["ann"]).is_empty(), "an island by its seed alone");
    ticks(&mut sea, usize::try_from(crate::sea::islands::FADE_TICKS).unwrap() + 1);
    assert!(sea.islands().by_id(id).is_some(), "held by its room's naming while players stand ashore");
}

/// Two square continents 100 km a side, their north edges 100 km from the frame's, 22 km of sea between them.
fn two_continents() -> Sea {
    let text = r#"{ "continents": [{ "id": "continent-4", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }, { "id": "continent-5", "outline": [[222000, 100000], [322000, 100000], [322000, 200000], [222000, 200000]] }], "isles": [] }"#;
    Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[])
}

#[test]
fn only_a_ship_at_rest_by_a_coast_is_parked_and_only_its_own_islands_rooms_see_it() {
    let mut sea = two_continents();
    left_at(&mut sea, "ann", FAR_OUT);
    assert!(sea.parked.by_account.is_empty(), "40 km out at sea, docked at no island");
    left_at(&mut sea, "bea", [202_000.0, 150_000.0]);
    assert!(sea.ashore(Ashore::Continent("continent-5"), &["bea"]).is_empty(), "20 km off the other's");
    assert!(shown(&sea).is_empty(), "named from an island it does not lie at, unseen");
    assert_eq!(answered(&sea.ashore(ISLAND, &["bea"])), ["bea"], "2 km off its coast");
}

#[test]
fn a_guests_ship_is_never_parked_and_past_the_most_the_one_parked_longest_ago_is_let_go() {
    let mut sea = sea();
    left_at(&mut sea, "unkept:a1b2", OFF_COAST);
    assert!(sea.parked.by_account.is_empty(), "a guest's ship is its session's, kept by no account");
    let players: Vec<PlayerId> = (0..=PARKED_MOST)
        .map(|at| {
            let player = sea.join();
            assert!(sea.own(player, &format!("account-{at:04}")));
            sea.course_anywhere(player, &[OFF_COAST], 10).unwrap();
            player
        })
        .collect();
    sea.tick();
    // The first parked sorts last, so it is let go for being parked longest ago, not for its name.
    for player in players.into_iter().rev() {
        sea.leave(player);
    }
    assert_eq!(sea.parked.by_account.len(), PARKED_MOST);
    let first = format!("account-{PARKED_MOST:04}");
    assert!(!sea.parked.by_account.contains_key(&first), "the one parked longest ago let go");
}

#[test]
fn a_hosts_time_near_the_most_neither_panics_nor_wraps_round_to_show_a_lapsed_naming_again() {
    let mut sea = sea();
    let near_most = u64::MAX - 100;
    sea.tell_seconds(near_most);
    let left = left_at(&mut sea, "ann", OFF_COAST);
    assert_eq!(answered(&sea.ashore(ISLAND, &["ann"])), ["ann"]);
    sea.tell_seconds(near_most + NAMED_S + 1);
    assert!(sea.ashore(ISLAND, &[]).is_empty(), "lapsed, though kept unseen");
    ticks(&mut sea, 120 * 60);
    assert!(!shown(&sea).contains(&left), "still lapsed as the sea ticks on past the most");
    left_at(&mut sea, "bea", OFF_COAST);
    assert_eq!(answered(&sea.ashore(ISLAND, &["bea"])), ["bea"], "and a ship parked then is named as any is");
}

#[test]
fn a_parked_ship_lies_at_the_one_coast_nearest_it_and_only_that_places_rooms_see_it() {
    // Two continents 4 km apart: a ship 1 km off the first lies within 5 km of both.
    let text = r#"{ "continents": [{ "id": "continent-4", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }, { "id": "continent-5", "outline": [[204000, 100000], [304000, 100000], [304000, 200000], [204000, 200000]] }], "isles": [] }"#;
    let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    let ann = left_at(&mut sea, "ann", [201_000.0, 150_000.0]);
    let bea = left_at(&mut sea, "bea", [203_500.0, 150_000.0]);
    let other = Ashore::Continent("continent-5");
    assert_eq!(answered(&sea.ashore(other, &["ann", "bea"])), ["bea"], "Ann's lies nearer the first's coast");
    assert_eq!(shown(&sea), [bea], "and is not named from the other's");
    assert_eq!(answered(&sea.ashore(ISLAND, &["ann", "bea"])), ["ann"], "nor Bea's from the first's");
    assert_eq!(shown(&sea), [ann, bea]);
}

#[test]
fn an_island_is_rolled_clear_of_a_parked_ship_as_of_one_sailing() {
    // The first island rolled near a ship lying still, and the tick it stood; with Ann's ship parked at `moored` first.
    let rolled = |moored: Option<[f64; 2]>, most: usize| {
        let text = r#"{ "continents": [{ "id": "continent-4", "climate": "desert", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
        let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
        left_at(&mut sea, "ann", OFF_COAST);
        if let Some([x, y]) = moored {
            let parked = &mut sea.parked.by_account.get_mut("ann").unwrap().ship;
            (parked.x, parked.y) = (x, y);
        }
        let player = sea.join();
        sea.course(player, &[[50_000.0, 50_000.0]], 10).unwrap();
        for tick in 0..most {
            sea.tick();
            if let Some(island) = sea.islands().standing().next() {
                return Some((island.at, tick + 1));
            }
        }
        None
    };
    let (first, at) = rolled(None, 60 * 60 * 3).expect("an island rolled near the ship");
    let clear = rolled(Some(first), at).map(|(island, _)| island);
    assert!(clear.is_none_or(|island| combat::sight::apart(island, first) >= 1_200.0), "not on the parked ship");
}
