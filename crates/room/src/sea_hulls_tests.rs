//! Each player's own ship at sea, as their character keeps it (`gear::ship::fleet`): a fight takes it in its own hull
//! with its class's hull, canvas and men; a voyage sails at its class's way; its player walks its own deck; and
//! others see its hull, its dress, its name and the emblem its player wears.

use super::tests::{sailor, sea, ticks};
use super::*;
use crate::hostiles::Hostile;
use gear::ship::fleet::{KeptShip, dress_number};
use naval::fight::PLAYER;
use naval::ranks::{Commission, GREY_TITHE, Rank};
use sailing::HullKind;

/// A player handed the Sloop who keeps `hull` too, and sails it.
fn sailing(hull: HullKind) -> gear::Character {
    let mut character = sailor();
    if hull != HullKind::Sloop {
        character.fleet.ships.push(KeptShip::new(hull.number()));
        character.fleet.sailed = hull.number();
    }
    character
}

/// A sea with a player whose character sails `hull`, put to sea at (50 km, 50 km).
fn at_sea(hull: HullKind) -> (Sea, PlayerId) {
    let mut sea = sea();
    let player = sea.join();
    assert!(sea.restore_character(player, &sailing(hull).to_json()));
    sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).expect("put to sea");
    (sea, player)
}

#[test]
fn a_fight_takes_each_players_ship_in_its_own_hull_with_its_classs_hull_canvas_and_men() {
    for hull in HullKind::ALL {
        let (mut sea, player) = at_sea(hull);
        let commission = Commission { faction: GREY_TITHE, rank: Rank::Major };
        let bold = Hostile { level: 9, ..Hostile::standing(1, 7, commission, [50_000.0, 49_900.0], 0.0, true) };
        sea.hostiles.sailing.push(bold);
        sea.tick();
        let (fought, _) = sea.fights.of_mut(player).expect("in a fight");
        let own = fought.crews[&player].ship;
        let vessel = &fought.fight.ships[&own];
        let build = naval::class::class_of(hull).build();
        assert_eq!(vessel.hull, hull);
        assert_eq!(
            [vessel.damage.max_hull, vessel.damage.max_sail, vessel.damage.max_crew],
            [build.hull, build.sail, build.crew]
        );
        assert_eq!(own, PLAYER);
    }
}

#[test]
fn a_voyage_sails_at_its_hulls_class_way() {
    let gone = |hull: HullKind| {
        let (mut sea, player) = at_sea(hull);
        sea.tick();
        ticks(&mut sea, super::super::COURSE_EVERY_TICKS as usize);
        let from = sea.ships().find(|(each, _)| *each == player).expect("at sea").1.x.round();
        sea.course(player, &[[90_000.0, 50_000.0]], 10).expect("a course");
        sea.tick();
        sea.ships().find(|(each, _)| *each == player).expect("at sea").1.x - from
    };
    let sloop = gone(HullKind::Sloop);
    assert!((sloop - 10.0 * crate::sea::SHIP_SPEED_M_S * movement::TICK_SECONDS).abs() < 1e-6, "{sloop}");
    for hull in [HullKind::Schooner, HullKind::Frigate] {
        let way = gone(hull) / sloop;
        assert!((way - naval::class::class_of(hull).way).abs() < 1e-9, "{hull:?}: {way}");
    }
}

#[test]
fn off_the_helm_a_player_walks_the_deck_of_the_hull_they_sail() {
    let mut brig = crate::deck::test_deck();
    brig.helm = [0.0, -2.0];
    let decks =
        |sea: &mut Sea| sea.set_hull_decks(vec![crate::deck::test_deck(), crate::deck::test_deck(), brig.clone()]);
    for (hull, helm) in [(HullKind::Sloop, crate::deck::test_deck().helm), (HullKind::Brig, brig.helm)] {
        let (mut sea, player) = at_sea(hull);
        decks(&mut sea);
        sea.tick();
        sea.leave_helm(player).expect("off the helm");
        let (_, aboard) = sea.aboard().find(|(each, _)| *each == player).expect("aboard");
        assert_eq!([aboard.body.x, aboard.body.y], helm, "{hull:?}");
        sea.tick();
        assert_eq!(sea.take_helm(player), Ok(()), "{hull:?}: back at its own wheel");
    }
}

#[test]
fn others_see_a_ship_in_its_hull_its_dress_its_name_and_its_players_emblem() {
    let mut character = sailing(HullKind::Brig);
    let brig = character.fleet.ships.iter_mut().find(|ship| ship.hull == HullKind::Brig.number()).expect("kept");
    brig.dress.canvas = "red_ochre".to_owned();
    brig.name = [String::new(), "Gull".to_owned()];
    character.emblems.push("veiled".to_owned());
    character.emblem = "veiled".to_owned();
    let mut sea = sea();
    let player = sea.join();
    assert!(sea.restore_character(player, &character.to_json()));
    sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).expect("put to sea");
    let look = sea.look(player).expect("at sea");
    assert_eq!(look.hull, HullKind::Brig.number());
    assert_eq!(look.dress[2], dress_number("red_ochre").expect("a dress"));
    assert_eq!(look.name[0], gear::ship::fleet::NO_WORD);
    assert_eq!(look.emblem, gear::emblems::number_of("veiled").expect("an emblem"));
    let unkept = sea.join();
    sea.course_anywhere(unkept, &[[50_100.0, 50_000.0]], 10).expect("put to sea");
    assert_eq!(sea.look(unkept).map(|look| look.hull), Some(0), "one the sea holds no character of sails the Sloop");
    assert_eq!(sea.look(99), None);
}
