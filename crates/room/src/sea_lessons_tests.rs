//! The Harbourmaster's sailing lesson at sea: the helm's acts ticked as the sea sails the ship, the held map on the
//! page's word, and the hulk moored off Overlook, put into a fight of the captain's own as they come near, never
//! boarded, a ball in it the act, and gone from the fight as they sail off.

use super::{HULK_NEAR_M, hulk_in, hulk_of};
use crate::PlayerId;
use crate::harbour::Harbours;
use crate::sea::{COURSE_EVERY_TICKS, Sea};
use gear::Character;
use gear::objectives::Feat;
use gear::quests::quests;
use naval::damage::{State, Zone};
use naval::fight::{Aim, CAPTAIN, Event as FightEvent, Orders, Part};
use naval::guns::{SWIVEL, Shot};
use naval::ranks::Rank;
use naval::shots::{ShipId, ShotEvent};

/// Overlook's roadstead out on the open sea, a continent far to its south-east.
const ROADSTEAD: [f64; 2] = [50_000.0, 50_000.0];

fn sea() -> Sea {
    let text = r#"{ "continents": [{ "id": "continent-4", "outline": [[100000, 100000], [200000, 100000], [200000, 200000], [100000, 200000]] }], "isles": [] }"#;
    let mut sea = Sea::new(&world::layout::parse(text).unwrap(), crate::deck::test_deck(), 7, &[]);
    sea.harbour.harbours = Harbours { ports: vec![("overlook".into(), ROADSTEAD)], ways: None, locked: Vec::new() };
    sea.keep_characters();
    sea
}

fn ticks(sea: &mut Sea, count: u64) {
    for _ in 0..count {
        sea.tick();
    }
}

/// A captain on the opening's sailing task, the Sloop theirs.
fn captain() -> Character {
    let mut character = Character::starting();
    assert!(character.give_first_ship());
    let opening = quests().quests.iter().position(|quest| quest.faction == 0).expect("the opening");
    let task = quests().quests[opening].tasks.iter().position(|task| task.id == "learn-the-helm").expect("the lesson");
    character.quests.set_task(opening, task);
    character
}

/// A captain aboard at Overlook's roadstead, at rest.
fn aboard() -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    sea.course(player, &[ROADSTEAD], 10).expect("held for the keeper");
    assert!(sea.restore_character(player, &captain().to_json()));
    (sea, player)
}

/// The lesson's steps met, by their words.
fn met(sea: &Sea, player: PlayerId) -> Vec<&'static str> {
    let character = &sea.harbour.characters[&player];
    let Some((quest, task)) = character.quest_now() else { return Vec::new() };
    let goals = &quests().quests[quest].tasks[task].goals;
    goals
        .iter()
        .zip(character.quest_counts())
        .filter(|(_, count)| *count > 0)
        .map(|(goal, _)| goal.text.as_str())
        .collect()
}

/// A ball of `shooter`'s striking the hulk in the captain's fight, as the fight tells it: the ball, then its strike.
fn struck_by(sea: &mut Sea, player: PlayerId, shooter: ShipId) {
    let (fought, _) = sea.fights.of_mut(player).expect("the hulk's fight");
    let (gun, zone, point) = (SWIVEL, Zone::Hull, [0.0; 3]);
    let ball = ShotEvent::Hit {
        shooter,
        target: CAPTAIN,
        zone,
        point,
        flight: 1.0,
        gun,
        shot: Shot::Round,
        sail: None,
        rigged: false,
    };
    fought.pending.extend([FightEvent::Shot(ball), FightEvent::Hit { ship: CAPTAIN, at: point, part: Part::Hull }]);
}

/// The captain's own ship's number in their fight.
fn own_ship(sea: &mut Sea, player: PlayerId) -> ShipId {
    sea.fights.of_mut(player).expect("fighting").1.ship
}

/// Sets a course once the wait since the last is over.
fn sail(sea: &mut Sea, player: PlayerId, points: &[[f64; 2]], pace: u16) {
    ticks(sea, COURSE_EVERY_TICKS);
    sea.course(player, points, pace).expect("a course taken");
}

#[test]
fn the_helms_acts_are_ticked_as_the_sea_sails_the_ship() {
    let (mut sea, player) = aboard();
    sea.tick();
    assert_eq!(met(&sea, player), ["Go aboard your Sloop"], "aboard at sea, at rest");
    // Away west, then a turn north: under way, then steered.
    sail(&mut sea, player, &[[40_000.0, 50_000.0]], 10);
    ticks(&mut sea, 5);
    assert!(met(&sea, player).contains(&"Set sail"));
    assert!(!met(&sea, player).contains(&"Steer") && !met(&sea, player).contains(&"Trim your sails"));
    let at = sea.ships().find(|(each, _)| *each == player).expect("at sea").1;
    sail(&mut sea, player, &[[at.x - 100.0, at.y - 2_000.0]], 10);
    ticks(&mut sea, 30);
    assert!(met(&sea, player).contains(&"Steer"), "{:?}", met(&sea, player));
    assert!(!met(&sea, player).contains(&"Trim your sails"), "the same pace");
    // The page eases to the world's own pace while the view is close on the ship, and back: no trim of the dial's.
    for pace in [crate::sea::WORLD_PACE, 10] {
        let at = sea.ships().find(|(each, _)| *each == player).expect("at sea").1;
        sail(&mut sea, player, &[[at.x, at.y - 5_000.0]], pace);
        ticks(&mut sea, 2);
        assert!(!met(&sea, player).contains(&"Trim your sails"), "eased to {pace}");
    }
    let at = sea.ships().find(|(each, _)| *each == player).expect("at sea").1;
    sail(&mut sea, player, &[[at.x, at.y - 5_000.0]], 20);
    ticks(&mut sea, 2);
    assert!(met(&sea, player).contains(&"Trim your sails"), "the pace dial moved under way");
    assert!(!met(&sea, player).contains(&"Open the held map"), "the page has said nothing of the map");
    sea.charted(player);
    assert!(met(&sea, player).contains(&"Open the held map"));
}

#[test]
fn the_hulk_lies_off_overlook_and_comes_into_a_fight_of_the_captains_own_as_they_near_it() {
    let (mut sea, player) = aboard();
    let mooring = sea.mooring().expect("open water off Overlook");
    assert_eq!(mooring, [50_000.0, 48_800.0], "north of the roadstead, the first bearing clear");
    assert_eq!(sea.lesson_mark(player), Some([mooring[0], mooring[1], 60.0]), "marked while the gunnery is asked");
    sea.tick();
    assert_eq!(sea.fights().count(), 0, "still too far off at the roadstead: {} m", 1_200);
    sail(&mut sea, player, &[[mooring[0], mooring[1] + HULK_NEAR_M - 200.0]], 10);
    ticks(&mut sea, 1_200);
    let (fighting, fought) = sea.fights().next().expect("the hulk's fight");
    assert_eq!((fighting, hulk_in(fought)), (player, Some(player)));
    let views = sea.fight_views();
    assert!(
        !views.is_empty() && views.iter().all(|seen| seen.lesson),
        "the page is told the fight is the lesson's hulk"
    );
    let hulk = fought.fight.vessel(CAPTAIN).expect("the hulk");
    assert_eq!(hulk.damage.state, State::Struck, "its colours struck");
    let off = libm::hypot(hulk.ship.x - mooring[0], hulk.ship.y - mooring[1]);
    assert!(off < 20.0, "hove to where it is moored, drifting a little: {off} m");
    // Alongside it and at rest, as a boarder would lie by a struck captain.
    let (fought, crew) = sea.fights.of_mut(player).expect("the hulk's fight");
    let at = fought.fight.vessel(CAPTAIN).expect("the hulk").ship;
    let own = fought.fight.ships.get_mut(&crew.ship).expect("their ship");
    (own.ship.x, own.ship.y, own.ship.ahead, own.ship.abeam, own.ship.rung) = (at.x + 12.0, at.y, 0.0, 0.0, 0);
    assert!(sea.board(player).is_err(), "no one boards it");
    ticks(&mut sea, 60 * 100);
    assert_eq!(sea.fights().count(), 1, "never scuttled while its captain stays");
}

#[test]
fn a_ball_in_the_hulk_is_the_act_and_it_leaves_as_the_captain_sails_off() {
    let (mut sea, player) = aboard();
    let mooring = sea.mooring().expect("open water off Overlook");
    sail(&mut sea, player, &[[mooring[0], mooring[1] + 600.0]], 10);
    ticks(&mut sea, 1_200);
    assert!(!met(&sea, player).contains(&"Put a ball in the hulk"));
    let own = own_ship(&mut sea, player);
    struck_by(&mut sea, player, own);
    sea.tick();
    assert!(met(&sea, player).contains(&"Put a ball in the hulk"), "{:?}", met(&sea, player));
    assert_eq!(sea.lesson_mark(player), None, "nothing more to mark");
    let (fought, crew) = sea.fights.of_mut(player).expect("still fighting");
    let own = fought.fight.ships.get_mut(&crew.ship).expect("their ship");
    // Overlook's roadstead lies past `HULK_NEAR_M` of the hulk: there the fight is over and the way in is open.
    own.ship.y = mooring[1] + HULK_NEAR_M + 10.0;
    ticks(&mut sea, 3);
    assert_eq!(sea.fights().count(), 0, "the hulk left the fight, which ended");
    assert!(sea.hostiles().iter().all(|hostile| hostile.id != hulk_of(player)), "and is not at sea");
}

#[test]
fn a_hulk_gone_down_lays_nothing_and_counts_for_no_road() {
    let (mut sea, player) = aboard();
    let mooring = sea.mooring().expect("open water off Overlook");
    sail(&mut sea, player, &[[mooring[0], mooring[1] + 600.0]], 10);
    ticks(&mut sea, 1_200);
    let own = own_ship(&mut sea, player);
    struck_by(&mut sea, player, own);
    sea.tick();
    // A sea bounty of the day that the hulk's sinking would count toward, held at nothing.
    let water = sea.chart.water_id(mooring).map(str::to_owned);
    let sunk = Feat::Sunk { water: water.as_deref(), rank: Rank::Minor.number() };
    let (minute, place) = (0..60)
        .map(|day| 29_919_420 + day * 24 * 60)
        .find_map(|minute| {
            let board = gear::bounties::board(gear::clock::day_of(minute));
            let place = board.iter().position(|bounty| bounty.objective.counts(&sunk))?;
            Some((minute, u8::try_from(place).ok()?))
        })
        .expect("a day whose board holds a sea bounty the hulk would count toward");
    sea.minute = minute;
    let day = gear::clock::day_of(minute);
    let character = sea.harbour.characters.get_mut(&player).expect("kept");
    character.activity.today = gear::activity::Today { day, bounties: [(place, 0)].into(), ..Default::default() };
    // Lying near it, so it goes down in their fight rather than leaving it as they lie off.
    let (fought, crew) = sea.fights.of_mut(player).expect("the hulk's fight");
    let at = fought.fight.vessel(CAPTAIN).expect("the hulk").ship;
    let own = fought.fight.ships.get_mut(&crew.ship).expect("their ship");
    (own.ship.x, own.ship.y, own.ship.ahead, own.ship.abeam, own.ship.rung) = (at.x - 100.0, at.y, 0.0, 0.0, 0);
    sea.fights.scuttle_by(hulk_of(player));
    let before = sea.harbour.characters[&player].to_json();
    ticks(&mut sea, 60 * 60);
    assert_eq!(sea.fights().count(), 0, "gone down, and the fight with it");
    assert!(sea.flotsam().is_empty(), "nothing floats");
    let after = &sea.harbour.characters[&player];
    assert_eq!(after.xp, Character::from_json(&before).expect("read").xp, "no sinking's pay");
    assert_eq!(after.activity.today.bounties.get(&place), Some(&0), "no bounty counts it");
}

#[test]
fn a_ball_of_another_ships_in_the_hulk_is_not_the_captains() {
    let (mut sea, player) = aboard();
    let mooring = sea.mooring().expect("open water off Overlook");
    sail(&mut sea, player, &[[mooring[0], mooring[1] + 600.0]], 10);
    ticks(&mut sea, 1_200);
    // A ship number no one in the fight holds: neither theirs nor the hulk's.
    struck_by(&mut sea, player, 99);
    sea.tick();
    assert!(!met(&sea, player).contains(&"Put a ball in the hulk"), "another ship's ball");
}

#[test]
fn the_captains_own_broadside_into_the_hulk_is_the_act() {
    let (mut sea, player) = aboard();
    let mooring = sea.mooring().expect("open water off Overlook");
    sail(&mut sea, player, &[[mooring[0], mooring[1] + 600.0]], 10);
    ticks(&mut sea, 1_200);
    // Lying 50 m west of the hulk, heading north: it is abeam to starboard.
    let (fought, crew) = sea.fights.of_mut(player).expect("the hulk's fight");
    let at = fought.fight.vessel(CAPTAIN).expect("the hulk").ship;
    let orders = crew.orders;
    let own = fought.fight.ships.get_mut(&crew.ship).expect("their ship");
    (own.ship.x, own.ship.y, own.ship.heading) = (at.x - 50.0, at.y, 0.0);
    (own.ship.ahead, own.ship.abeam, own.ship.turn, own.ship.rung) = (0.0, 0.0, 0.0, 0);
    let aim = Some(Aim { bearing_deg: 90.0, range_m: 50.0, ray: None });
    sea.orders(player, Orders { aim, fire: true, ..orders }).expect("fighting");
    ticks(&mut sea, 120);
    assert!(met(&sea, player).contains(&"Put a ball in the hulk"), "{:?}", met(&sea, player));
}

#[test]
fn on_the_real_map_the_hulk_is_moored_in_open_water_off_overlook() {
    let (layout, ports) = crate::measure_tests::world();
    let overlook: Vec<_> = ports.into_iter().filter(|port| port.id == "overlook").collect();
    assert_eq!(overlook.len(), 1, "Overlook is continent-1's port");
    let sea = Sea::new(&layout, crate::deck::test_deck(), 7, &overlook);
    let roadstead = sea.harbour.harbours.starting().expect("Overlook's roadstead");
    let mooring = sea.mooring().expect("clear water off Overlook, so the helm can be learnt");
    let out = libm::hypot(mooring[0] - roadstead[0], mooring[1] - roadstead[1]);
    assert!((out - 1_000.0).abs() < 1.0 || (out - 1_200.0).abs() < 1.0, "{out} m out");
    assert!(out > HULK_NEAR_M, "not called to it before they have sailed");
    let point = crate::sea::whole(&mooring).expect("in the world");
    assert!(!crate::coast::on_land(&sea.coasts, point), "on the water");
    let from = crate::sea::whole(&roadstead).expect("in the world");
    assert!(!crate::coast::leg_meets_land(&sea.coasts, from, point), "reached from the roadstead over no land");
}
