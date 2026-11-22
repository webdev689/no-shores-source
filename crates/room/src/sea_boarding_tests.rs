use super::tests::{floating_for, met, ticks, vessel_mut};
use super::*;
use crate::battle::BoardRefused;
use crate::players::{Input, SpawnAsk};
use crate::sea::decks::{HOLD_TICKS, foe_rank};
use naval::damage::Hurt;
use naval::fight::{CAPTAIN, PLAYER, Sailor};
use naval::ranks::{Commission, GREY_TITHE, PIRATES, Rank};

/// The captain of the player's fight struck where it lies, making no way.
fn strike(sea: &mut Sea, player: PlayerId) {
    let clock = sea.fights.of_mut(player).unwrap().0.fight.clock;
    let vessel = vessel_mut(sea, player, CAPTAIN);
    // Under the share any rank strikes at.
    let hull = vessel.damage.max_hull * 0.97;
    vessel.damage.apply(Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, clock, 0.0);
    (vessel.ship.ahead, vessel.ship.abeam) = (0.0, 0.0);
    if let Sailor::Captain(command) = &mut vessel.sailor {
        command.struck_at = Some(clock);
    }
}

fn beaten(sea: &mut Sea, player: PlayerId) {
    let boarder = sea.decks.boarded[0].aboard[&player];
    sea.decks.boarded[0].room.players.get_mut(&boarder).unwrap().fighter.action = combat::Action::Dead { elapsed: 0 };
}

#[test]
fn each_captains_rank_is_the_same_rank_among_the_foes_so_its_deck_holds_the_crew_of_its_rank() {
    for rank in [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss, Rank::Boss] {
        assert_eq!(format!("{:?}", foe_rank(rank)), format!("{rank:?}"));
    }
    for rank in [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss] {
        let (mut sea, player) = met(20.0, rank);
        strike(&mut sea, player);
        sea.board(player).unwrap();
        let mut ranks: Vec<_> = sea.decks()[0].room.foes.values().map(|foe| foe.brain.rank).collect();
        let mut crew: Vec<_> =
            ::foes::crews::deck_crew(PIRATES, foe_rank(rank)).into_iter().map(|(_, hand)| hand).collect();
        ranks.sort();
        crew.sort();
        assert_eq!(ranks, crew, "{rank:?}");
    }
}

#[test]
fn a_boarding_is_refused_when_its_deck_would_hold_no_crew_and_nothing_is_told() {
    assert!(::foes::crews::deck_crew(PIRATES, ::foes::Rank::Boss).is_empty(), "the pirates have no deck Boss");
    let (mut sea, player) = met(20.0, Rank::Boss);
    strike(&mut sea, player);
    assert_eq!(sea.board(player), Err(BoardRefused::NoneAlongside));
    assert!(sea.decks().is_empty() && !sea.on_deck(player));
    assert!(sea.fights.of_mut(player).unwrap().0.pending.is_empty(), "no boarding told");
    // The Grey Tithe's Boss has its deck crew: it is boarded.
    let (mut sea, player) = met(20.0, Rank::Boss);
    sea.fights.of_mut(player).unwrap().0.hostiles.get_mut(&CAPTAIN).unwrap().commission.faction = GREY_TITHE;
    strike(&mut sea, player);
    assert_eq!(sea.board(player), Ok(()));
}

#[test]
fn a_boarding_is_refused_from_too_far_too_fast_twice_and_out_of_a_fight_and_their_own_ship_takes_nothing_meanwhile() {
    let (mut sea, player) = met(60.0, Rank::Minor);
    strike(&mut sea, player);
    assert_eq!(sea.board(player), Err(BoardRefused::NoneAlongside), "60 m off");
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    vessel_mut(&mut sea, player, PLAYER).ship.ahead = 3.0;
    assert_eq!(sea.board(player), Err(BoardRefused::NoneAlongside), "3 m/s");
    vessel_mut(&mut sea, player, PLAYER).ship.ahead = 0.0;
    assert_eq!(sea.board(player), Ok(()));
    assert!(sea.board(player).is_err(), "twice");
    assert!(sea.orders(player, crate::battle::QUIET).is_err(), "orders on its deck");
    assert!(sea.repair(player).is_err());
    assert!(sea.leave_helm(player).is_err());
    let other = sea.join();
    assert!(sea.leave_deck(other).is_err());
    assert_eq!(sea.board(other), Err(BoardRefused::NotFighting), "not at sea");
}

#[test]
fn a_boarders_deck_inputs_stand_no_foe_replay_nothing_reach_no_other_player_and_raise_no_one_beaten() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    let foes = sea.decks()[0].room.foes.len();
    let clock = sea.decks()[0].room.clock();
    let ask = Input {
        sequence: 1,
        seen: clock,
        spawn: Some(SpawnAsk::Foe { foe_type: 1, rank: 1, shield: 0 }),
        ..Default::default()
    };
    assert!(sea.deck_input(player, ask.clone()).is_ok());
    sea.tick();
    assert_eq!(sea.decks()[0].room.foes.len(), foes, "no foe stood by a boarder's ask");
    assert!(sea.deck_input(player, ask).is_err(), "the same input twice");
    let other = sea.join();
    assert!(sea.deck_input(other, Input::default()).is_err(), "on no deck");
    beaten(&mut sea, player);
    let clock = sea.decks()[0].room.clock();
    let _ = sea.deck_input(player, Input { sequence: 2, seen: clock, respawn: true, ..Default::default() });
    sea.tick();
    assert!(!sea.on_deck(player), "beaten, washed up: a respawn ask does not stand them up again");
}

#[test]
fn two_boarders_one_beaten_both_take_its_hold_when_its_crew_falls_and_both_step_off_after_it() {
    let (mut sea, one) = met(20.0, Rank::Minor);
    let two = sea.join();
    sea.course_anywhere(two, &[[50_010.0, 50_000.0]], 10).unwrap();
    sea.tick();
    assert!(sea.fights.fighting(two), "joined");
    strike(&mut sea, one);
    for player in [one, two] {
        let ship = sea.fights.of_mut(player).unwrap().1.ship;
        vessel_mut(&mut sea, player, ship).ship.ahead = 0.0;
    }
    sea.board(one).unwrap();
    sea.board(two).unwrap();
    assert_eq!(sea.decks().len(), 1);
    beaten(&mut sea, one);
    sea.tick();
    assert!(sea.on_deck(one) && sea.on_deck(two), "one down, one standing");
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    sea.tick();
    assert_eq!((floating_for(&sea, one).count(), floating_for(&sea, two).count()), (6, 6), "its hold for each");
    ticks(&mut sea, HOLD_TICKS as usize + 1);
    assert!(!sea.on_deck(one) && !sea.on_deck(two));
}

#[test]
fn a_ship_going_down_under_its_boarders_sends_them_home_with_what_floats_once_and_no_hold() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    vessel_mut(&mut sea, player, CAPTAIN).damage.scuttle();
    vessel_mut(&mut sea, player, CAPTAIN).damage.sink_t = naval::damage::SINK_SECONDS - 0.5;
    ticks(&mut sea, 60 * 60);
    assert!(!sea.on_deck(player));
    assert_eq!(floating_for(&sea, player).count(), 3, "what floats once, no hold");
}

#[test]
fn a_hand_who_falls_on_a_deck_is_lost_from_its_sea_fights_count_which_the_fight_keeps_when_it_ends() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
    strike(&mut sea, player);
    let ship = sea.fights.of_mut(player).unwrap().1.ship;
    vessel_mut(&mut sea, player, ship).ship.ahead = 0.0;
    sea.board(player).unwrap();
    let room = &mut sea.decks.boarded[0].room;
    let hand = *room.ashore.hands.keys().next().expect("its hands boarded with it");
    room.foes.get_mut(&hand).unwrap().fighter.action = combat::Action::Dead { elapsed: 0 };
    let hands = room.ashore.hands.clone();
    for (id, foe) in &mut room.foes {
        if !hands.contains_key(id) {
            foe.fighter.action = combat::Action::Dead { elapsed: 0 };
        }
    }
    let crew_before = sea.fights.hurts_of(player).expect("in its fight").0[2];
    sea.tick();
    ticks(&mut sea, HOLD_TICKS as usize + 1);
    assert!(!sea.on_deck(player), "stepped off");
    // The fight lets its player go with its own count of their men (`kept_of`), so the loss must be in it.
    let (kept, _) = sea.fights.hurts_of(player).expect("still in its fight");
    let man = 1.0 / naval::arms::LARGE_BOAT.crew;
    assert!(kept[2] <= crew_before - man + 1e-9, "the hand it lost on the deck: {crew_before} to {}", kept[2]);
}

#[test]
fn its_hands_board_by_the_men_its_fight_has_left_not_those_it_sailed_in_with() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
    strike(&mut sea, player);
    let ship = sea.fights.of_mut(player).unwrap().1.ship;
    let vessel = vessel_mut(&mut sea, player, ship);
    vessel.ship.ahead = 0.0;
    // Shot down to one man of its ten.
    vessel.damage.crew = vessel.damage.max_crew / naval::arms::LARGE_BOAT.crew;
    sea.board(player).unwrap();
    assert_eq!(sea.decks.boarded[0].room.ashore.hands.len(), 1, "never more than it has left");
}

#[test]
fn an_officer_who_joins_at_sea_while_its_player_fights_a_deck_never_shares_an_id_with_what_they_picked_up_there() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
    strike(&mut sea, player);
    let ship = sea.fights.of_mut(player).unwrap().1.ship;
    vessel_mut(&mut sea, player, ship).ship.ahead = 0.0;
    sea.board(player).unwrap();
    let boarder = sea.decks.boarded[0].aboard[&player];
    // On the deck they pick up a piece, under the deck copy's next id.
    let deck = &mut sea.decks.boarded[0].room.players.get_mut(&boarder).unwrap().character;
    let picked = deck.take_id();
    let piece = gear::Item::new(picked, gear::Kind::Sword, gear::Rarity::Magic, 1, gear::Slot::Melee);
    deck.items.insert(picked, (piece, gear::At::Carried));
    // At sea an officer joins from a won deck, under the sea copy's next id: the same one.
    let officer = gear::crew::Officer::new(0, gear::crew::Post::Bosun, gear::Rarity::Magic, 1);
    let joined = sea.harbour.characters.get_mut(&player).unwrap().sign_on(officer).expect("signed on");
    assert_eq!(joined, picked, "the two copies hand out the same id");
    let room = &mut sea.decks.boarded[0].room;
    let hands = room.ashore.hands.clone();
    for (id, foe) in &mut room.foes {
        if !hands.contains_key(id) {
            foe.fighter.action = combat::Action::Dead { elapsed: 0 };
        }
    }
    sea.tick();
    ticks(&mut sea, HOLD_TICKS as usize + 1);
    assert!(!sea.on_deck(player), "stepped off");
    let kept = &sea.harbour.characters[&player];
    assert!(kept.items.contains_key(&picked), "the piece is kept");
    assert_eq!(kept.crew.officers.len(), 1, "and the officer");
    assert!(kept.crew.officers.keys().all(|id| !kept.items.contains_key(id)), "under ids of their own");
}

#[test]
fn a_boarded_deck_room_takes_the_seas_tier() {
    for difficulty in gear::Difficulty::ALL {
        let (mut sea, player) = met(20.0, Rank::Major);
        sea.set_difficulty(difficulty);
        strike(&mut sea, player);
        sea.board(player).unwrap();
        assert_eq!(sea.decks()[0].room.difficulty, difficulty);
    }
}

/// A character pledged to `faction`, its road at `task`, kept by the sea for `player`.
fn on_road(sea: &mut Sea, player: PlayerId, faction: u8, task: u8) {
    let mut character = gear::Character::starting();
    character.allegiance.pledge = faction;
    character.quests.set_task(usize::from(faction), usize::from(task));
    sea.harbour.characters.insert(player, gear::Character::from_json(&character.to_json()).unwrap());
}

fn road(sea: &Sea, player: PlayerId) -> Option<(usize, usize)> {
    sea.harbour.characters[&player].quest_now()
}

#[test]
fn a_ship_that_went_down_tells_each_who_fought_it_its_side_and_whether_it_struck_or_was_sunk() {
    let mut sea = super::tests::sea();
    let players: Vec<PlayerId> = (0..3).map(|_| sea.join()).collect();
    // A Tithe ship beaten any way, one boarded, and a pirate: the Stormcallers', the Veiled's and the Lamplighters'.
    for (player, faction) in players.iter().zip([1, 3, 2]) {
        on_road(&mut sea, *player, faction, 5);
    }
    let commission = Commission { faction: GREY_TITHE, rank: Rank::Minor };
    let tithe = crate::pirates::Pirate::standing(1, 7, commission, [0.0, 0.0], 0.0, false);
    let sank = |pirate, struck| Sank { pirate, at: [0.0, 0.0], players: players.clone(), wind: [0.0; 2], struck };
    sea.after_fights(Vec::new(), &[sank(tithe, true)]);
    let roads: Vec<_> = players.iter().map(|player| road(&sea, *player)).collect();
    assert_eq!(roads, [Some((1, 6)), Some((3, 5)), Some((2, 5))], "struck: not boarded, nor a pirate");
    assert!(sea.harbour.changed.contains(&players[0]), "its gear goes out");
    let pirate = crate::pirates::Pirate { commission: Commission { faction: PIRATES, ..commission }, ..tithe };
    sea.after_fights(Vec::new(), &[sank(pirate, false)]);
    assert_eq!((road(&sea, players[1]), road(&sea, players[2])), (Some((3, 5)), Some((2, 6))), "a pirate sunk");
}

#[test]
fn a_tithe_ships_deck_taken_tells_its_boarder_it_was_boarded() {
    let mut sea = super::tests::sea();
    let player = sea.join();
    on_road(&mut sea, player, 3, 5);
    sea.course_anywhere(player, &[[50_000.0, 50_000.0]], 10).unwrap();
    let commission = Commission { faction: GREY_TITHE, rank: Rank::Minor };
    let standing = crate::pirates::Pirate::standing(1, 7, commission, [50_000.0, 49_980.0], 0.0, true);
    sea.pirates.sailing.push(crate::pirates::Pirate { level: 9, ..standing });
    sea.tick();
    strike(&mut sea, player);
    let ship = sea.fights.of_mut(player).unwrap().1.ship;
    vessel_mut(&mut sea, player, ship).ship.ahead = 0.0;
    sea.board(player).unwrap();
    let room = &mut sea.decks.boarded[0].room;
    let hands = room.ashore.hands.clone();
    for (id, foe) in &mut room.foes {
        if !hands.contains_key(id) {
            foe.fighter.action = combat::Action::Dead { elapsed: 0 };
        }
    }
    sea.tick();
    ticks(&mut sea, HOLD_TICKS as usize + 1);
    assert!(!sea.on_deck(player), "stepped off");
    assert_eq!(road(&sea, player), Some((3, 6)), "the tally ship boarded and taken");
}

#[test]
fn a_boarders_vestige_lying_on_the_deck_goes_to_their_mail_as_they_leave_the_sea_or_step_off() {
    for leaving_the_sea in [true, false] {
        let (mut sea, player) = met(20.0, Rank::Minor);
        sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
        strike(&mut sea, player);
        let ship = sea.fights.of_mut(player).unwrap().1.ship;
        vessel_mut(&mut sea, player, ship).ship.ahead = 0.0;
        sea.board(player).unwrap();
        let boarder = sea.decks.boarded[0].aboard[&player];
        let vestige = gear::Vestige::new(0, gear::Rarity::Rare, gear::Slot::Head, 9);
        sea.decks.boarded[0].room.lay_drop(boarder, crate::Dropped::Vestige(vestige), [900.0, 900.0, 0.0]);
        let mail = if leaving_the_sea {
            sea.mail_lying(player);
            let kept = sea.kept_character(player).expect("their character");
            gear::Character::from_json(&kept).expect("a character").mail
        } else {
            let room = &mut sea.decks.boarded[0].room;
            let hands = room.ashore.hands.clone();
            for (id, foe) in &mut room.foes {
                if !hands.contains_key(id) {
                    foe.fighter.action = combat::Action::Dead { elapsed: 0 };
                }
            }
            sea.tick();
            ticks(&mut sea, HOLD_TICKS as usize + 1);
            assert!(!sea.on_deck(player), "stepped off");
            sea.harbour.characters[&player].mail.clone()
        };
        let posted: Vec<_> = mail.iter().filter_map(|letter| letter.vestige.as_ref().map(|kept| kept.rarity)).collect();
        assert_eq!(posted, [gear::Rarity::Rare], "leaving the sea: {leaving_the_sea}");
    }
}

#[test]
fn a_ship_sunk_toward_a_bounty_while_its_player_fights_a_deck_is_still_counted_when_they_step_off() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
    strike(&mut sea, player);
    let ship = sea.fights.of_mut(player).unwrap().1.ship;
    vessel_mut(&mut sea, player, ship).ship.ahead = 0.0;
    sea.board(player).unwrap();
    // Another of the fight's ships goes down meanwhile: the sea counts it on the character it keeps.
    let held = sea.harbour.characters.get_mut(&player).unwrap();
    held.activity.today.bounties.insert(4, 1);
    let room = &mut sea.decks.boarded[0].room;
    let hands = room.ashore.hands.clone();
    for (id, foe) in &mut room.foes {
        if !hands.contains_key(id) {
            foe.fighter.action = combat::Action::Dead { elapsed: 0 };
        }
    }
    sea.tick();
    ticks(&mut sea, HOLD_TICKS as usize + 1);
    assert!(!sea.on_deck(player), "stepped off");
    assert_eq!(sea.harbour.characters[&player].activity.today.bounties.get(&4), Some(&1), "the count kept");
}

#[test]
fn a_boarders_gear_is_written_on_the_seas_day_and_turns_with_it() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
    // A Friday's 09:00 UTC, the sea's minute.
    let minute = 20_778 * 1_440 + 540;
    sea.minute = minute;
    strike(&mut sea, player);
    sea.board(player).unwrap();
    let day = |sea: &mut Sea| sea.deck_gear_change(player).map(|(room, _)| room.day());
    assert_eq!(day(&mut sea), Some(gear::clock::day_of(minute)), "the sea's day, not the epoch's");
    sea.minute = minute + 1_440;
    ticks(&mut sea, crate::players::GEAR_EVERY_TICKS as usize);
    assert_eq!(day(&mut sea), Some(gear::clock::day_of(minute) + 1), "sent again as the sea's day turns");
}

#[test]
fn a_boarder_who_steps_off_is_sent_their_gear_from_the_sea_again() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    sea.tick();
    // Whatever the sea held to send them before is sent: only stepping off is left to send.
    sea.harbour.changed.clear();
    sea.leave_deck(player).unwrap();
    assert!(sea.take_character_change(player).is_some(), "the sea's word again, with what the deck won");
}

#[test]
fn a_boarder_kept_while_still_aboard_keeps_what_the_sea_gave_them_meanwhile() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
    strike(&mut sea, player);
    let ship = sea.fights.of_mut(player).unwrap().1.ship;
    vessel_mut(&mut sea, player, ship).ship.ahead = 0.0;
    sea.board(player).unwrap();
    // While they fight its deck, an officer joins at sea and their ship earns.
    let held = sea.harbour.characters.get_mut(&player).unwrap();
    held.sign_on(gear::crew::Officer::new(0, gear::crew::Post::Bosun, gear::Rarity::Magic, 1)).expect("signed on");
    held.earn_ship_xp(500);
    // Their tab closes before they step off: the account keeps what the sea gave too.
    let kept = gear::Character::from_json(&sea.kept_character(player).expect("kept")).expect("read");
    assert_eq!(kept.crew.officers.len(), 1, "the officer who joined");
    assert_eq!(kept.ship_xp, 500, "the ship's experience");
}

#[test]
fn a_boarders_own_ship_takes_no_helm_brace_or_sail_while_they_stand_on_the_struck_deck() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    let steer = naval::fight::Orders {
        helm: sailing::ship::Helm { steer: 0.5, climb: 0 },
        brace: true,
        ..crate::battle::QUIET
    };
    sea.orders(player, steer).unwrap();
    let own = vessel_mut(&mut sea, player, PLAYER);
    (own.ship.rung, own.ship.ahead) = (1, 1.5);
    sea.board(player).unwrap();
    let was = vessel_mut(&mut sea, player, PLAYER).ship;
    // Six seconds on the deck: the helm and the sail it had would have it turning past 3 m/s by then.
    ticks(&mut sea, 360);
    assert!(sea.on_deck(player), "still on the deck");
    let own = vessel_mut(&mut sea, player, PLAYER);
    let moved = libm::hypot(own.ship.x - was.x, own.ship.y - was.y);
    assert!(moved < 6.0 && libm::hypot(own.ship.ahead, own.ship.abeam) < 1.0, "it drifts to a stop, {moved} m");
    assert!((own.ship.heading - was.heading).abs() < 0.05, "it holds its heading");
    assert!(!own.guns.braced, "its brace let go");
}

#[test]
fn a_boarder_who_leaves_the_sea_from_the_deck_keeps_the_hands_who_fell_there_lost() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    sea.harbour.characters.entry(player).or_insert_with(gear::Character::starting);
    strike(&mut sea, player);
    sea.board(player).unwrap();
    let crew = |sea: &Sea| gear::Character::from_json(&sea.kept_character(player).unwrap()).unwrap().ship[2];
    let before = crew(&sea);
    let room = &mut sea.decks.boarded[0].room;
    let hand = *room.ashore.hands.keys().next().expect("its hands boarded with it");
    room.foes.get_mut(&hand).unwrap().fighter.action = combat::Action::Dead { elapsed: 0 };
    sea.tick();
    assert!(sea.on_deck(player), "still fighting on the deck");
    let man = gear::character::SHIP_WHOLE / naval::arms::LARGE_BOAT.crew as u16;
    assert!(crew(&sea) + man <= before + 1, "the hand who fell is lost: {before} to {}", crew(&sea));
}

#[test]
fn a_boarder_back_aboard_finds_their_sails_set_as_they_left_them() {
    let (mut sea, player) = met(20.0, Rank::Minor);
    strike(&mut sea, player);
    vessel_mut(&mut sea, player, PLAYER).ship.rung = 2;
    sea.board(player).unwrap();
    assert_eq!(vessel_mut(&mut sea, player, PLAYER).ship.rung, 0, "furled while they stand on its deck");
    for foe in sea.decks.boarded[0].room.foes.values_mut() {
        foe.fighter.action = combat::Action::Dead { elapsed: 0 };
    }
    sea.tick();
    sea.leave_deck(player).unwrap();
    assert_eq!(vessel_mut(&mut sea, player, PLAYER).ship.rung, 2, "set again as they come back aboard");
}
