//! A guild's outpost's asks through the room: refused off one's guild's outpost, what they give taken and held as an
//! errand for the host, and the accounts' answers given back.

use crate::asks::{Asked, STOCK_FULL, answer_code};
use crate::guild_book::GuildSeen;
use crate::outpost::{Material, OutpostAsk, PENDING, What, guild_key};
use crate::{PlayerId, Room};
use gear::asks::Refusal;
use gear::guild::{Boons, Standing};
use gear::ship::materials::ShipMaterial;

const GUILD: &str = "5A1T0000-1111-2222-3333-444455556666";

/// An outpost's room with one member of its guild in it, kept by the account `salt`, holding 500 Aurem and 30 Timber.
fn outpost() -> (Room, PlayerId) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.island = Some("continent-1");
    room.open_outpost(&guild_key(GUILD), [30.0, 0.0]);
    let player = room.join().expect("a room with space");
    let seen = GuildSeen { id: GUILD.to_owned(), standing: Standing::default(), boons: Boons::default() };
    room.guild_player(player, Some(seen));
    let found = room.players.get_mut(&player).expect("in");
    found.owner = Some("salt".to_owned());
    found.character.materials.aurem = 500;
    found.character.materials.ship.timber = 30;
    (room, player)
}

fn ask(room: &mut Room, player: PlayerId, ask: OutpostAsk) -> u8 {
    let answered = room.players[&player].answered;
    room.answer(player, Asked::Outpost(ask));
    let found = &room.players[&player];
    if found.answered == answered { PENDING } else { found.answer }
}

#[test]
fn a_guild_s_key_is_its_whole_id_without_its_hyphens_in_lowercase_as_its_outposts_rooms_are_named() {
    assert_eq!(guild_key(GUILD), "5a1t0000111122223333444455556666");
    assert_eq!(guild_key("AB-cd-ef01-2345"), "abcdef012345");
}

#[test]
fn an_ask_is_refused_off_one_s_guild_s_outpost() {
    let refused = answer_code(Err(Refusal::NotAtOutpost));
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    assert_eq!(ask(&mut room, player, OutpostAsk::Horn), refused, "no outpost");
    let (mut room, player) = outpost();
    let other = GuildSeen { id: "beef0000-0".to_owned(), standing: Standing::default(), boons: Boons::default() };
    room.guild_player(player, Some(other));
    assert_eq!(ask(&mut room, player, OutpostAsk::Deposit { count: 5 }), refused, "another guild's");
    room.guild_player(player, None);
    assert_eq!(ask(&mut room, player, OutpostAsk::Deposit { count: 5 }), refused, "in no guild");
    assert_eq!(room.players[&player].character.materials.aurem, 500, "nothing taken");
}

#[test]
fn a_deposit_takes_what_is_held_up_to_the_count_and_gives_back_what_the_treasury_refused() {
    let (mut room, player) = outpost();
    assert_eq!(ask(&mut room, player, OutpostAsk::Deposit { count: 800 }), PENDING);
    assert_eq!(room.players[&player].character.materials.aurem, 0, "all 500 held is taken");
    let errands = room.outpost_errands();
    assert_eq!(errands.len(), 1);
    assert_eq!((errands[0].account.as_str(), errands[0].what), ("salt", What::Deposit(500)));
    assert!(room.outpost_errands().is_empty(), "taken once");
    assert!(room.outpost_answered(errands[0].id, Some(0)));
    assert_eq!(room.players[&player].character.materials.aurem, 500, "given back");
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::TreasuryFull)));
    assert!(!room.outpost_answered(errands[0].id, Some(0)), "answered once");
    ask(&mut room, player, OutpostAsk::Deposit { count: 200 });
    let id = room.outpost_errands()[0].id;
    assert_ne!(id, errands[0].id, "each errand its own number");
    room.outpost_answered(id, Some(200));
    assert_eq!((room.players[&player].character.materials.aurem, room.players[&player].answer), (300, 0));
}

#[test]
fn a_delivery_gives_back_what_was_not_used_and_a_thrown_errand_gives_back_all() {
    let (mut room, player) = outpost();
    let timber = Material::Ship(ShipMaterial::Timber);
    assert_eq!(ask(&mut room, player, OutpostAsk::Deliver { structure: 3, slot: 0, count: 20 }), PENDING);
    let errand = room.outpost_errands().remove(0);
    assert_eq!(errand.what, What::Deliver { structure: 3, stuff: timber, amount: 20 });
    assert_eq!(room.players[&player].character.materials.ship.timber, 10);
    room.outpost_answered(errand.id, Some(12));
    assert_eq!((room.players[&player].character.materials.ship.timber, room.players[&player].answer), (18, 0));
    ask(&mut room, player, OutpostAsk::Deliver { structure: 3, slot: 0, count: 5 });
    let errand = room.outpost_errands().remove(0);
    room.outpost_answered(errand.id, None);
    assert_eq!(room.players[&player].character.materials.ship.timber, 18, "given back whole");
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::OutpostTrouble)));
    ask(&mut room, player, OutpostAsk::Deliver { structure: 3, slot: 1, count: 5 });
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::Short)), "no Canvas held");
    ask(&mut room, player, OutpostAsk::Deliver { structure: 3, slot: 9, count: 5 });
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::NothingNeeds)), "no such material");
}

#[test]
fn the_island_s_own_resource_is_its_continent_s() {
    let (mut room, player) = outpost();
    room.players.get_mut(&player).expect("in").character.materials.resources = vec![7];
    ask(&mut room, player, OutpostAsk::Deliver { structure: 1, slot: 4, count: 9 });
    let errand = room.outpost_errands().remove(0);
    assert_eq!(errand.what, What::Deliver { structure: 1, stuff: Material::Island(0), amount: 7 });
    assert_eq!(Material::Island(0).name(), "island");
}

#[test]
fn a_take_asks_only_for_room_held_and_gives_what_the_stores_gave() {
    let (mut room, player) = outpost();
    room.players.get_mut(&player).expect("in").character.materials.ship.iron = 195;
    assert_eq!(ask(&mut room, player, OutpostAsk::Take { slot: 2, count: 20 }), PENDING);
    let errand = room.outpost_errands().remove(0);
    assert_eq!(errand.what, What::Take { stuff: Material::Ship(ShipMaterial::Iron), amount: 5 });
    room.outpost_answered(errand.id, Some(4));
    assert_eq!((room.players[&player].character.materials.ship.iron, room.players[&player].answer), (199, 0));
    ask(&mut room, player, OutpostAsk::Take { slot: 1, count: 3 });
    let errand = room.outpost_errands().remove(0);
    room.outpost_answered(errand.id, Some(0));
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::StoresEmpty)));
    room.players.get_mut(&player).expect("in").character.materials.ship.iron = gear::character::STOCK_MOST;
    assert_eq!(ask(&mut room, player, OutpostAsk::Take { slot: 2, count: 3 }), STOCK_FULL);
}

#[test]
fn the_plot_is_read_again_at_most_once_a_second_and_each_plot_stood_is_counted() {
    let (mut room, player) = outpost();
    assert_eq!(room.outpost_plot(), 0);
    assert_eq!(ask(&mut room, player, OutpostAsk::Changed), 0, "answered at once");
    room.tick();
    assert_eq!(ask(&mut room, player, OutpostAsk::Changed), 0);
    let errands = room.outpost_errands();
    assert_eq!(errands.iter().map(|errand| errand.what).collect::<Vec<_>>(), vec![What::Changed]);
    assert!(!room.outpost_answered(errands[0].id, None), "nothing waits on it");
    room.outpost_stood();
    room.outpost_stood();
    assert_eq!(room.outpost_plot(), 2);
}

#[test]
fn the_horn_is_refused_when_the_accounts_say_it_may_not_sound() {
    let (mut room, player) = outpost();
    ask(&mut room, player, OutpostAsk::Horn);
    let errand = room.outpost_errands().remove(0);
    assert_eq!(errand.what, What::Horn);
    room.outpost_answered(errand.id, Some(0));
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::HornSounded)));
    assert!(!room.horn_foe_up());
}

#[test]
fn one_out_of_the_guild_dungeon_stands_before_the_delve_gate_facing_away_and_only_while_it_stands() {
    let (mut room, _) = outpost();
    assert_eq!(room.join_at(0), None, "no gate stood yet");
    room.outpost_gate(Some(([10.0, 20.0], core::f64::consts::PI)));
    let player = room.join_at(0).expect("before the gate");
    let body = room.players[&player].fighter.body;
    assert!((body.x - 10.0).abs() < 1e-9 && (body.y - (20.0 + crate::entrances::BEFORE_DOOR_M)).abs() < 1e-9);
    assert!((body.facing - core::f64::consts::PI).abs() < 1e-9, "facing out, south");
    assert_eq!(room.join_at(1), None, "the gate is its one way in");
    room.outpost_gate(None);
    assert_eq!(room.join_at(0), None, "taken down");
    assert_eq!(Room::new(Vec::new(), (0.0, 0.0)).join_at(0), None, "a room that is no outpost has none");
}

#[test]
fn a_player_has_one_ask_with_the_accounts_at_a_time_and_a_take_of_nothing_is_refused() {
    let (mut room, player) = outpost();
    let in_flight = answer_code(Err(Refusal::AskInFlight));
    assert_eq!(ask(&mut room, player, OutpostAsk::Take { slot: 0, count: 0 }), answer_code(Err(Refusal::Short)));
    assert_eq!(ask(&mut room, player, OutpostAsk::Deposit { count: 10 }), PENDING);
    assert_eq!(ask(&mut room, player, OutpostAsk::Take { slot: 0, count: 5 }), in_flight, "held, not yet taken");
    let errands = room.outpost_errands();
    assert_eq!(errands.len(), 1, "the refused asks hold no errand");
    assert_eq!(ask(&mut room, player, OutpostAsk::Horn), in_flight, "with the accounts");
    assert_eq!(ask(&mut room, player, OutpostAsk::Changed), 0, "a plot read again waits on no answer");
    room.outpost_answered(errands[0].id, Some(10));
    assert_eq!(ask(&mut room, player, OutpostAsk::Take { slot: 0, count: 5 }), PENDING, "answered, the next goes");
}

#[test]
fn the_horn_s_refusals_are_each_its_own() {
    let (mut room, player) = outpost();
    let answers = [(0, Refusal::HornSounded), (-1, Refusal::HornNotLeader), (-2, Refusal::NoHorn)];
    for (answer, refusal) in answers.into_iter().chain([(-3, Refusal::TooManyAsks)]) {
        ask(&mut room, player, OutpostAsk::Horn);
        let errand = room.outpost_errands().remove(0);
        room.outpost_answered(errand.id, Some(answer));
        assert_eq!(room.players[&player].answer, answer_code(Err(refusal)), "answered {answer}");
    }
    assert!(!room.horn_foe_up());
}

#[test]
fn an_answer_after_the_player_left_is_given_at_their_account_s_next_claim_here() {
    let (mut room, player) = outpost();
    ask(&mut room, player, OutpostAsk::Deposit { count: 200 });
    let deposit = room.outpost_errands().remove(0);
    room.leave(player);
    assert!(room.outpost_answered(deposit.id, Some(50)), "kept for them");
    let other = room.join().expect("a room with space");
    assert!(room.own(other, "pepper"));
    let back = room.join().expect("a room with space");
    let aurem = room.players[&back].character.materials.aurem;
    assert!(room.own(back, "salt"));
    assert_eq!(room.players[&back].character.materials.aurem, aurem + 150, "what the treasury did not take");
    assert!(room.own(back, "salt"));
    assert_eq!(room.players[&back].character.materials.aurem, aurem + 150, "given once");
    let seen = GuildSeen { id: GUILD.to_owned(), standing: Standing::default(), boons: Boons::default() };
    room.guild_player(back, Some(seen));
    ask(&mut room, back, OutpostAsk::Deposit { count: 100 });
    let deposit = room.outpost_errands().remove(0);
    room.leave(back);
    let again = room.join().expect("a room with space");
    assert!(room.own(again, "salt"));
    let aurem = room.players[&again].character.materials.aurem;
    assert!(room.outpost_answered(deposit.id, Some(0)));
    assert_eq!(room.players[&again].character.materials.aurem, aurem + 100, "back already, given at once");
}

#[test]
fn a_plot_asked_to_be_read_again_too_soon_is_read_once_the_second_has_passed() {
    let (mut room, player) = outpost();
    ask(&mut room, player, OutpostAsk::Changed);
    assert_eq!(room.outpost_errands().len(), 1);
    room.tick();
    ask(&mut room, player, OutpostAsk::Changed);
    ask(&mut room, player, OutpostAsk::Changed);
    assert!(room.outpost_errands().is_empty(), "too soon");
    for _ in 0..60 {
        room.tick();
    }
    let later: Vec<What> = room.outpost_errands().iter().map(|errand| errand.what).collect();
    assert_eq!(later, vec![What::Changed], "read once, late");
    assert!(room.outpost_errands().is_empty());
}

#[test]
fn the_same_account_joining_again_while_its_errand_settles_takes_it_over_and_is_answered() {
    let (mut room, player) = outpost();
    ask(&mut room, player, OutpostAsk::Deposit { count: 200 });
    let deposit = room.outpost_errands().remove(0);
    let again = room.join().expect("a room with space");
    assert!(!room.own(again, "salt"), "a second tab while the first plays");
    assert!(room.outpost_parting(player));
    assert!(room.own(again, "salt"), "the first is leaving");
    let aurem = room.players[&again].character.materials.aurem;
    assert!(room.outpost_answered(deposit.id, Some(50)));
    assert_eq!(room.players[&again].character.materials.aurem, aurem + 150, "given back to the one it is now");
    assert_eq!(room.players[&player].owner, None, "the leaving one keeps none of it");
    let mut plain = Room::new(Vec::new(), (0.0, 0.0));
    assert!(!plain.outpost_parting(0), "no outpost");
}
