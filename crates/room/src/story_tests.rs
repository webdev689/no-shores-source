use crate::Room;
use crate::power::{arms_allowed, loadout_arms};
use crate::story::WOKE_HEALTH;
use ::foes::Rank;
use gear::{Ask, At, Item, Kind, Rarity, Slot};
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
    assert!(room.story_take(early, Kind::SwordAndShield));
    assert!(!room.story_take(early, Kind::SwordAndShield), "taken once");
    let character = &mut room.players.get_mut(&early).expect("joined").character;
    let (&id, (_, at)) =
        character.items.iter().find(|(_, (item, _))| item.kind == Kind::SwordAndShield).expect("in the pack");
    assert_eq!(*at, At::Carried, "carried, not worn");
    assert!(!arms_allowed(character).contains(&shield));
    // Worn by the gear's own ask, as the page's Equip asks it.
    let dice = gear::dice::Dice { seed: 0, tick: 0, player: early };
    assert!(character.ask(Ask::Wear { item: id, slot: Slot::Melee }, gear::Here::default(), &dice).is_ok());
    assert!(arms_allowed(character).contains(&shield), "the sword and shield drawn");
    let held = character.items.values().filter(|(item, at)| !item.kind.module() && *at != At::Vault);
    assert!(held.clone().all(|(item, _)| item.story), "every piece but the ship's the story's own");
}

#[test]
fn on_the_wreck_a_player_wears_the_story_s_steel_from_the_first_but_no_helm_once_however_often_it_is_told() {
    let mut room = wreck();
    let early = room.join().expect("a room with space");
    room.story_wreck();
    room.story_wreck();
    let late = room.join().expect("a room with space");
    for player in [early, late] {
        let character = &room.players[&player].character;
        for slot in [Slot::Torso, Slot::Arms, Slot::Legs] {
            let (item, _) = character.items.values().find(|(_, at)| *at == At::Worn(slot)).expect("worn");
            assert!(item.story && item.rarity == Rarity::Normal && item.level == 1, "the story's own in {slot:?}");
        }
        assert!(character.worn(Slot::Head).is_none(), "no helm: the face shows");
        let armour = character.items.values().filter(|(item, _)| item.kind.armour()).count();
        assert_eq!(armour, 3, "player {player} given it once");
    }
}

#[test]
fn on_the_wreck_the_story_s_bow_is_taken_once_into_the_pack_and_worn_in_the_ranged_slot() {
    let mut room = wreck();
    let player = room.join().expect("a room with space");
    assert!(!room.story_take(player, Kind::Bow), "outside the story, nothing is given");
    room.story_wreck();
    assert!(!room.story_take(player, Kind::Mace), "only the story's arms and bow are given");
    assert!(room.story_take(player, Kind::Bow));
    assert!(!room.story_take(player, Kind::Bow), "taken once");
    let character = &mut room.players.get_mut(&player).expect("joined").character;
    let (&id, (bow, at)) = character.items.iter().find(|(_, (item, _))| item.kind == Kind::Bow).expect("in the pack");
    assert!(bow.story && bow.rarity == Rarity::Normal && bow.level == 1 && *at == At::Carried);
    let dice = gear::dice::Dice { seed: 0, tick: 0, player };
    assert!(character.ask(Ask::Wear { item: id, slot: Slot::Ranged }, gear::Here::default(), &dice).is_ok());
    assert!(character.worn(Slot::Ranged).is_some());
}

#[test]
fn on_the_wreck_the_storm_is_given_worn_earned_and_charged_and_its_abilities_cast() {
    let mut room = wreck();
    let player = room.join().expect("a room with space");
    assert!(!room.story_storm(player), "outside the story, no Art is given");
    room.story_wreck();
    assert!(!room.arts_on());
    assert!(!room.story_storm(player + 99), "no such player");
    assert!(room.story_storm(player));
    assert!(room.arts_on(), "the Art works again");
    let found = &room.players[&player];
    assert_eq!(found.character.worn_art().map(|art| art.id), Some(gear::arts::STORM));
    assert_eq!(found.character.earned(gear::arts::STORM), gear::arts::ALL_EARNED, "its Anima and both Tenets");
    assert_eq!((found.casting.anima, found.casting.tenets), (1.0, [1.0, 1.0]), "charged full");
    for ability in 0..3 {
        let cast = crate::arts::Cast { spell: ability + 1, aim: Some([0.0, -3.0, 2.3]) };
        assert!(found.character.ability_earned(cast.art(), cast.ability()), "ability {ability} castable");
    }
    room.ask_cast(player, Some(crate::arts::Cast { spell: 2, aim: Some([0.0, -3.0, 2.3]) }));
    assert!(room.players[&player].casting.releasing.is_some(), "a cast is taken");
}

#[test]
fn the_wreck_s_boarders_are_the_grey_tithe_s_and_the_brig_s_crew_still_the_players() {
    let mut room = wreck();
    room.story_wreck();
    let deckhand = room.stand_foe_at(7, 1, (-2.0, 0.0), 0.0, 1).expect("a Tithe deckhand");
    let pistoleer = room.stand_foe_at(9, 1, (2.0, 0.0), 0.0, 1).expect("a Tithe pistoleer");
    let crew = room.stand_foe_at(19, 1, (0.0, 3.0), 0.0, 1).expect("a hand of the Brig's");
    let side = |id| room.foes[&id].fighter.side;
    assert_eq!([side(deckhand), side(pistoleer)], [combat::fighter::Side::Faction(1); 2]);
    assert!(side(crew).is_players());
}

#[test]
fn a_foe_stood_on_the_wreck_fights_at_its_own_rank_s_strength_as_anywhere() {
    let (mut story, mut plain) = (wreck(), wreck());
    story.story_wreck();
    for (number, rank) in [(11, 1), (8, 2), (12, 5)] {
        let on_wreck = story.stand_foe_at(number, rank, (0.0, 0.0), 0.0, 1).expect("a foe");
        let anywhere = plain.stand_foe_at(number, rank, (0.0, 0.0), 0.0, 1).expect("a foe");
        let (foe, same) = (&story.foes[&on_wreck], &plain.foes[&anywhere]);
        assert_eq!(foe.brain.rank, same.brain.rank);
        assert_eq!(foe.fighter.health_max, same.fighter.health_max, "type {number} at its own health");
        assert_eq!(foe.fighter.poise_max, same.fighter.poise_max);
    }
}

#[test]
fn on_the_wreck_a_boarder_is_sent_at_a_player_though_it_never_saw_them_but_never_one_of_the_crew() {
    let mut room = wreck();
    let player = room.join().expect("a room with space");
    // Behind the player, facing away from them: it neither sees nor hears them.
    let away = std::f64::consts::FRAC_PI_2;
    let before = room.stand_foe_at(8, 1, (5.0, 0.0), away, 1).expect("a Tithe hookman");
    assert!(!room.story_hunt(before, player), "outside the story, none is sent");
    room.story_wreck();
    let boarder = room.stand_foe_at(8, 1, (5.0, 1.0), away, 1).expect("a Tithe hookman");
    for _ in 0..60 {
        room.tick();
    }
    assert_eq!(room.foes[&boarder].brain.target(), None, "unaware of the player");
    let crew = room.stand_foe_at(19, 1, (-5.0, 3.0), away, 1).expect("a hand of the Brig's");
    assert!(!room.story_hunt(boarder, player + 99), "no such player");
    assert!(!room.story_hunt(crew, player), "the Brig's crew are never sent at a player");
    assert!(room.story_hunt(boarder, player));
    assert_eq!(room.foes[&boarder].brain.target(), Some(player), "sent at them");
}

#[test]
fn the_wreck_takes_only_the_melee_a_player_carries_or_wears_once_and_its_arms_are_the_story_s_alone() {
    let mut room = wreck();
    let player = room.join().expect("a room with space");
    assert!(!room.story_take(player, Kind::SwordAndShield), "outside the story, nothing is given");
    let character = &mut room.players.get_mut(&player).expect("joined").character;
    let vaulted = character.take_id();
    character.items.insert(vaulted, (Item::new(vaulted, Kind::Mace, Rarity::Normal, 1, Slot::Melee), At::Vault));
    let carried = character.take_id();
    character.items.insert(carried, (Item::new(carried, Kind::Sword, Rarity::Normal, 1, Slot::Melee), At::Carried));
    room.story_wreck();
    let items = &room.players[&player].character.items;
    assert!(items.contains_key(&vaulted), "the vault's kept");
    assert!(!items.contains_key(&carried), "what was carried is gone with the ram");
    assert!(room.story_take(player, Kind::SwordAndShield));
    let character = &mut room.players.get_mut(&player).expect("joined").character;
    let (&id, _) = character.items.iter().find(|(_, (item, _))| item.kind == Kind::SwordAndShield).expect("given");
    let dice = gear::dice::Dice { seed: 0, tick: 0, player };
    assert!(character.ask(Ask::Wear { item: id, slot: Slot::Melee }, gear::Here::default(), &dice).is_ok());
    room.story_wreck();
    let character = &room.players[&player].character;
    assert!(character.worn(Slot::Melee).is_some(), "a second word of the story strips nothing");
}

#[test]
fn on_the_wreck_one_of_the_crew_posted_on_walks_there_but_never_a_boarder() {
    let mut room = Room::over_sea(
        vec![Block { min_x: -6.0, min_y: -4.0, max_x: 16.0, max_y: 4.0, top: 2.3, bottom: 0.0 }],
        (0.0, 0.0),
    );
    room.join().expect("a room with space");
    let crew_before = room.stand_foe_at(19, 1, (-4.0, 0.0), 0.0, 1).expect("a hand of the Brig's");
    assert!(!room.story_post(crew_before, (12.0, 0.0), 0.0), "outside the story, none is posted");
    room.story_wreck();
    let crew = room.stand_foe_at(19, 1, (-4.0, 1.0), 0.0, 1).expect("a hand of the Brig's");
    let boarder = room.stand_foe_at(8, 1, (14.0, -3.0), 0.0, 1).expect("a Tithe hookman");
    assert!(!room.story_post(boarder, (12.0, 0.0), 0.0), "a boarder keeps its own post");
    assert!(room.story_post(crew, (12.0, 0.0), 0.0));
    room.foes.remove(&boarder);
    for _ in 0..60 * 12 {
        room.tick();
    }
    let body = room.foes[&crew].fighter.body;
    assert!((body.x - 12.0).abs() < 1.5 && body.y.abs() < 1.5, "he walked there: {}, {}", body.x, body.y);
}

#[test]
fn every_boarder_the_wreck_s_waves_stand_is_a_minor_or_a_major() {
    let file: serde_json::Value =
        serde_json::from_str(include_str!("../../../content/prologue/wreck.json")).expect("the wreck's file");
    let mut boarders = 0;
    for zone in file["zones"].as_array().expect("its zones") {
        for foe in zone["wave"].as_array().into_iter().flatten() {
            let number = |key: &str| u8::try_from(foe[key].as_u64().expect("a number")).expect("a small number");
            let found = ::foes::foe_type(number("type")).expect("a type the roster knows");
            let rank = found.rank_or_first(Rank::from_number(number("rank")));
            assert!(rank <= Rank::Major, "a {} stands as a {}", found.name, rank.name());
            boarders += 1;
        }
    }
    assert!(boarders > 20, "the waves are read: {boarders}");
}
