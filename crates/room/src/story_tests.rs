use crate::Room;
use crate::power::{arms_allowed, loadout_arms};
use ::foes::Rank;
use gear::Kind;
use movement::Block;

/// A deck 2.3 m over the sea, from x -6 to 6.
fn wreck() -> Room {
    Room::over_sea(vec![Block { min_x: -6.0, min_y: -4.0, max_x: 6.0, max_y: 4.0, top: 2.3, bottom: 0.0 }], (0.0, 0.0))
}

#[test]
fn the_wreck_arms_every_player_with_the_story_s_sword_and_shield_before_or_after_they_join() {
    let mut room = wreck();
    let early = room.join().expect("a room with space");
    let shield = loadout_arms(Kind::SwordAndShield);
    assert!(!arms_allowed(&room.players[&early].character).contains(&shield), "a new player's plain sword");
    room.story_wreck();
    let late = room.join().expect("a room with space");
    for player in [early, late] {
        assert!(arms_allowed(&room.players[&player].character).contains(&shield), "player {player}");
    }
    assert!(!room.arts_on(), "and no Art");
}

#[test]
fn the_wreck_s_boarders_are_one_side_the_brig_s_crew_still_the_players() {
    let mut room = wreck();
    room.story_wreck();
    let tithe = room.stand_foe_at(7, 1, (-2.0, 0.0), 0.0, 1).expect("a Tithe deckhand");
    let pirate = room.stand_foe_at(13, 1, (2.0, 0.0), 0.0, 1).expect("a pirate");
    let crew = room.stand_foe_at(19, 1, (0.0, 3.0), 0.0, 1).expect("a hand of the Brig's");
    let side = |id| room.foes[&id].fighter.side;
    assert_eq!(side(tithe), side(pirate));
    assert_eq!(room.foes[&pirate].brain.side(), side(tithe), "and thinks as one");
    assert!(side(crew).is_players() && !side(pirate).is_players());
}

#[test]
fn a_tithe_hand_and_a_pirate_side_by_side_on_the_wreck_never_come_to_blows() {
    let mut room = wreck();
    room.story_wreck();
    let tithe = room.stand_foe_at(7, 1, (-1.0, 0.0), 0.0, 1).expect("a Tithe deckhand");
    let pirate = room.stand_foe_at(13, 1, (1.0, 0.0), 0.0, 1).expect("a pirate");
    for _ in 0..600 {
        room.tick();
    }
    for id in [tithe, pirate] {
        let fighter = &room.foes[&id].fighter;
        assert_eq!(fighter.health, fighter.health_max, "foe {id} unharmed");
    }
    // Off the story, the two crews fight each other.
    let mut plain = wreck();
    let foes = [(7, -1.0), (13, 1.0)].map(|(kind, x)| plain.stand_foe_at(kind, 1, (x, 0.0), 0.0, 1).expect("a foe"));
    for _ in 0..600 {
        plain.tick();
    }
    assert!(foes.iter().any(|id| plain.foes.get(id).is_none_or(|foe| foe.fighter.health < foe.fighter.health_max)));
}

#[test]
fn an_elite_boarder_keeps_its_rank_but_is_brought_down_as_a_major_and_thule_is_not() {
    let (mut story, mut plain) = (wreck(), wreck());
    story.story_wreck();
    for (mate, rank) in [(11, Rank::Elite), (17, Rank::Elite)] {
        let held = story.stand_foe_at(mate, 1, (0.0, 0.0), 0.0, 1).expect("an elite");
        let elite = plain.stand_foe_at(mate, 1, (0.0, 0.0), 0.0, 1).expect("an elite");
        let major = &::foes::foe_type(mate).expect("a type").numbers(Rank::Major, 1);
        let (foe, full) = (&story.foes[&held], &plain.foes[&elite]);
        assert_eq!(foe.brain.rank, rank, "type {mate} still stands as an Elite");
        assert!(foe.brain.numbers().elite, "with an elite's look and blows");
        let times = full.fighter.health_max / full.brain.numbers().health;
        assert_eq!(foe.fighter.health_max, major.health * times, "type {mate} at a Major's health, at its level");
        assert_eq!(foe.fighter.poise_max, major.poise);
        let numbers = foe.brain.numbers();
        assert_eq!([numbers.parry, numbers.block, numbers.dodge], [major.parry, major.block, major.dodge]);
        assert!(foe.fighter.health_max < full.fighter.health_max / 2.0, "type {mate} well under an elite's");
    }
    let thule = story.stand_foe_at(12, 5, (0.0, 0.0), 0.0, 4).expect("Thule");
    let boss = plain.stand_foe_at(12, 5, (0.0, 0.0), 0.0, 4).expect("Thule");
    assert_eq!(story.foes[&thule].fighter.health_max, plain.foes[&boss].fighter.health_max, "Thule as he was");
}
