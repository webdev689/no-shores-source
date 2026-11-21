use crate::Room;
use crate::power::{arms_allowed, loadout_arms};
use crate::story::WOKE_HEALTH;
use ::foes::Rank;
use gear::{Ask, At, Kind, Slot};
use movement::Block;

/// A deck 2.3 m over the sea, from x -6 to 6.
fn wreck() -> Room {
    Room::over_sea(vec![Block { min_x: -6.0, min_y: -4.0, max_x: 6.0, max_y: 4.0, top: 2.3, bottom: 0.0 }], (0.0, 0.0))
}

#[test]
fn on_the_wreck_a_player_wakes_hurt_and_bare_handed_then_takes_the_story_s_arms_once_and_wears_them() {
    let mut room = wreck();
    let early = room.join().expect("a room with space");
    room.story_wreck();
    let late = room.join().expect("a room with space");
    let shield = loadout_arms(Kind::SwordAndShield);
    for player in [early, late] {
        let found = &room.players[&player];
        assert!(found.character.worn(Slot::Melee).is_none(), "player {player} wakes with no weapon");
        let fighter = &found.fighter;
        assert!((fighter.health - fighter.health_max * WOKE_HEALTH).abs() < 1e-9, "and hurt by the ram");
    }
    assert!(!room.arts_on(), "and no Art");
    assert!(room.story_take_arms(early));
    assert!(!room.story_take_arms(early), "taken once");
    let character = &mut room.players.get_mut(&early).expect("joined").character;
    let (&id, (_, at)) =
        character.items.iter().find(|(_, (item, _))| item.kind == Kind::SwordAndShield).expect("in the pack");
    assert_eq!(*at, At::Carried, "carried, not worn");
    assert!(!arms_allowed(character).contains(&shield));
    // Worn by the gear's own ask, as the page's Equip asks it.
    let dice = gear::dice::Dice { seed: 0, tick: 0, player: early };
    assert!(character.ask(Ask::Wear { item: id, slot: Slot::Melee }, gear::Here::default(), &dice).is_ok());
    assert!(arms_allowed(character).contains(&shield), "the sword and shield drawn");
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

#[test]
fn on_the_wreck_a_boarder_sent_at_a_player_comes_for_them_though_it_never_saw_them() {
    let mut room = wreck();
    let player = room.join().expect("a room with space");
    assert!(!room.story_hunt(1, player), "outside the story, none is sent");
    room.story_wreck();
    // Behind the player, facing away from them: it neither sees nor hears them.
    let boarder = room.stand_foe_at(8, 1, (5.0, 0.0), std::f64::consts::FRAC_PI_2, 1).expect("a Tithe hookman");
    for _ in 0..60 {
        room.tick();
    }
    assert_eq!(room.foes[&boarder].brain.target(), None, "unaware of the player");
    assert!(room.story_hunt(boarder, player));
    assert!(!room.story_hunt(boarder, player + 99), "no such player");
    assert_eq!(room.foes[&boarder].brain.target(), Some(player), "sent at them");
}
