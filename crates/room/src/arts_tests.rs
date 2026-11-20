//! The Arts in the room: a new room's Anima empty and Tenets ready, each charging over its recharge; a cast taken
//! only when ready, of the worn Art, with its caster able, and released 18 ticks after; kills and a crit out of
//! Vanish giving charge back; and the asks that wear an Art and set its Core, and the Test Ground's grant.

use crate::arts::Cast;
use crate::asks::{Asked, Grant};
use crate::foes::Foe;
use crate::{Fighter, FighterId, Input, PlayerId, Room};
use combat::Status;
use gear::arts::{ArtAsk, arts};
use std::collections::BTreeMap;

const SWORDSMAN: u8 = 14;
const QUICKEN: u8 = 2;
const MEND: u8 = 5;
const VANISH: u8 = 9;

/// A room with a player at the origin, looking north (toward -y): a room with no section, the Test Ground, so every
/// Art is at its highest level with every fragment owned and its spells are as `content/arts/arts.json` writes them.
pub(crate) fn room_with_player() -> (Room, PlayerId) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let mut fighter = *room.fighter(player).expect("in");
    fighter.aim = 0.0;
    fighter.body.facing = 0.0;
    room.set_fighter(player, fighter);
    (room, player)
}

/// A pirate swordsman of `health` standing at (x, y), facing north.
pub(crate) fn stand_foe(room: &mut Room, x: f64, y: f64, health: f64) -> FighterId {
    let id = room.next_id();
    let foe_type = ::foes::foe_type(SWORDSMAN).expect("the pirates' swordsman");
    let (fighter, brain) = ::foes::spawn(foe_type, ::foes::Rank::Major, x, y, 0.0);
    let fighter = Fighter { health, health_max: health, ..fighter };
    room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    id
}

/// The player wears `art` with `fragments` set in its Core, their Anima full and their Tenets ready.
pub(crate) fn wearing(room: &mut Room, player: PlayerId, art: u8, fragments: &[u8]) {
    room.answer(player, Asked::Art(ArtAsk::Wear { art }));
    for (slot, fragment) in (0u8..).zip(fragments) {
        room.answer(player, Asked::Art(ArtAsk::SetCore { art, slot, fragment: *fragment }));
    }
    room.ready_arts(player);
}

/// Asks for a cast between ticks and runs the room to its release, and `more` ticks after.
pub(crate) fn cast(room: &mut Room, player: PlayerId, spell: u8, aim: Option<[f64; 3]>, more: u32) {
    room.ask_cast(player, Some(Cast { spell, aim }));
    for _ in 0..19 + more {
        room.tick();
    }
}

fn casting(room: &Room, player: PlayerId) -> crate::Casting {
    room.player(player).expect("in the room").casting
}

fn health(room: &Room, id: FighterId) -> f64 {
    room.fighter(id).expect("in the room").health
}

#[test]
fn a_new_room_starts_the_anima_empty_and_the_tenets_ready_and_each_charges_over_its_recharge() {
    let (mut room, player) = room_with_player();
    assert_eq!((casting(&room, player).anima, casting(&room, player).tenets), (0.0, [1.0, 1.0]));
    for _ in 0..600 {
        room.tick();
    }
    let tempest = arts().art(1).expect("Storm").anima.recharge_s;
    assert!((casting(&room, player).anima - 10.0 / tempest).abs() < 1e-6, "ten seconds of its 500");
    cast(&mut room, player, QUICKEN, None, 0);
    assert_eq!(casting(&room, player).tenets[0], 0.0, "spent as it released");
    room.tick();
    let quicken = arts().art(1).expect("Storm").tenets[0].recharge_s;
    assert!((casting(&room, player).tenets[0] - 1.0 / quicken / 60.0).abs() < 1e-9, "a tick on");
    assert_eq!(casting(&room, player).tenets[1], 1.0, "the other Tenet is its own");
}

#[test]
fn a_cast_from_the_input_releases_eighteen_ticks_after_the_tick_that_took_it() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 2, &[]);
    let mut hurt = *room.fighter(player).expect("in");
    hurt.health = 30.0;
    room.set_fighter(player, hurt);
    let cast = Some(Cast { spell: MEND, aim: None });
    room.input(player, Input { sequence: 1, cast, seen: room.clock(), ..Input::default() }).expect("in order");
    for _ in 0..18 {
        room.tick();
    }
    assert_eq!(health(&room, player), 30.0, "not yet");
    room.tick();
    assert_eq!(health(&room, player), 70.0, "Mend heals 40");
}

#[test]
fn a_cast_is_refused_unless_charged_of_the_worn_art_and_its_caster_able() {
    let (mut room, player) = room_with_player();
    let tempest = Some(Cast { spell: 1, aim: None });
    room.ask_cast(player, tempest);
    assert_eq!(casting(&room, player).releasing, None, "the Anima is empty");
    room.ask_cast(player, Some(Cast { spell: MEND, aim: None }));
    assert_eq!(casting(&room, player).releasing, None, "Mend is Divine's, and Storm is worn");
    room.ask_cast(player, Some(Cast { spell: 0, aim: None }));
    assert_eq!(casting(&room, player).releasing, None, "no spell");
    room.give(player, Status::Charge, None, None);
    room.ask_cast(player, Some(Cast { spell: QUICKEN, aim: None }));
    assert_eq!(casting(&room, player).releasing, None, "Charged");
    let (mut room, player) = room_with_player();
    room.ask_cast(player, Some(Cast { spell: QUICKEN, aim: None }));
    room.ask_cast(player, Some(Cast { spell: 3, aim: None }));
    assert_eq!(casting(&room, player).releasing.map(|(cast, _)| cast.spell), Some(QUICKEN), "one at a time");
    room.tick();
    room.give(player, Status::Charge, None, None);
    for _ in 0..30 {
        room.tick();
    }
    assert_eq!(casting(&room, player).tenets[0], 1.0, "Charged before it released: it cost nothing");
    assert!(!room.fighter(player).expect("in").statuses.has(Status::Haste));
}

#[test]
fn a_body_dead_past_its_section_casts_nothing_and_takes_no_spell() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[]);
    let fallen = room.join().expect("a room with space");
    room.players.get_mut(&fallen).expect("in").standing = crate::Standing::Dead { ticks: 0 };
    cast(&mut room, player, QUICKEN, None, 0);
    assert!(room.fighter(player).expect("in").statuses.has(Status::Haste));
    assert!(!room.fighter(fallen).expect("in").statuses.has(Status::Haste), "Quicken passes the section-dead by");
    room.ready_arts(player);
    room.ask_cast(player, Some(Cast { spell: QUICKEN, aim: None }));
    room.players.get_mut(&player).expect("in").standing = crate::Standing::Dead { ticks: 0 };
    for _ in 0..30 {
        room.tick();
    }
    assert_eq!(casting(&room, player).tenets[0], 1.0, "dead past the edge before it released: it cost nothing");
}

#[test]
fn an_account_s_arts_are_kept_while_it_is_away_and_given_back_as_it_rejoins() {
    let (mut room, player) = room_with_player();
    assert!(room.own(player, "ada"));
    room.players.get_mut(&player).expect("in").casting.tenets = [0.25, 0.5];
    room.leave(player);
    let back = room.join().expect("a room with space");
    assert_eq!(casting(&room, back).tenets, [1.0, 1.0], "a join starts the Tenets ready");
    assert!(room.own(back, "ada"));
    assert_eq!(casting(&room, back).tenets, [0.25, 0.5], "given back as they left them");
    let other = room.join().expect("a room with space");
    assert!(room.own(other, "bea"));
    assert_eq!(casting(&room, other).tenets, [1.0, 1.0], "a first join starts them ready");
    room.leave(back);
    room.clock += 60 * 600;
    let late = room.join().expect("a room with space");
    assert!(room.own(late, "ada"));
    assert_eq!(casting(&room, late).tenets, [1.0, 1.0], "forgotten after ten minutes away");
    for nth in 0..=crate::PLAYERS_MOST {
        let passing = room.join().expect("a room with space");
        assert!(room.own(passing, &format!("passer {nth}")));
        room.leave(passing);
    }
    assert_eq!(room.spells.kept.len(), crate::PLAYERS_MOST, "kept for as many as the room holds");
}

#[test]
fn a_cast_is_refused_while_mounted() {
    let (mut room, player) = room_with_player();
    let controls = movement::Controls { mounted: true, ..movement::Controls::default() };
    let intent = combat::Intent { controls, combat: combat::CombatInput::default() };
    let cast = Some(Cast { spell: QUICKEN, aim: None });
    room.input(player, Input { sequence: 1, intent, cast, seen: room.clock(), ..Input::default() }).expect("in order");
    room.tick();
    assert_eq!(casting(&room, player).releasing, None, "on horseback");
}

#[test]
fn a_kill_charges_the_anima_and_a_volt_kill_cuts_the_tenets_with_recharge() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 1, &[3]);
    let foe = stand_foe(&mut room, 0.0, -3.0, 5.0);
    room.players.get_mut(&player).expect("in").casting.anima = 0.0;
    cast(&mut room, player, 3, None, 0);
    assert!(room.fighter(foe).expect("lying there").dead(), "Arc Lash kills it");
    let after = casting(&room, player);
    let share = arts().cast.anima_kill_share;
    assert!(after.anima >= share, "2% a kill");
    let cut = arts().art(1).and_then(|art| art.fragment("recharge")).expect("Recharge").cooldown_share;
    assert!((after.tenets[1] - cut).abs() < 1e-3, "spent, then 4% back for a Volt kill");
    assert!(room.player(player).expect("in").character.xp > 0, "a spell's kill pays as a weapon's");
}

#[test]
fn a_crit_out_of_vanish_gives_back_half_its_cooldown_with_hunt() {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[3]);
    cast(&mut room, player, VANISH, None, 0);
    assert!(room.fighter(player).expect("in").statuses.has(Status::Veiled));
    assert!(casting(&room, player).tenets[1] < 0.01, "spent");
    let foe = stand_foe(&mut room, 0.0, 1.0, 1000.0);
    let blow = combat::judge::Blow {
        striker: player,
        kind: combat::BlowKind::Swing(combat::Stroke::Down),
        from: [0.0, 2.0],
        damage: 10.0,
        poise: 0.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: true,
    };
    let hit = combat::Verdict::Hit { damage: 10.0, poise: 0.0 };
    room.settle(&blow, crate::How::Swing, foe, hit, None);
    let back = casting(&room, player).tenets[1];
    assert!((0.5..0.52).contains(&back), "half back, {back}");
    room.settle(&blow, crate::How::Swing, foe, hit, None);
    assert!((casting(&room, player).tenets[1] - back).abs() < 1e-9, "once a Vanish");
}

#[test]
fn the_room_answers_the_arts_asks_and_the_test_ground_readies_every_spell() {
    let (mut room, player) = room_with_player();
    let code = |room: &Room| room.player(player).expect("in").answer;
    room.answer(player, Asked::Art(ArtAsk::Wear { art: 5 }));
    assert_eq!(code(&room), 110);
    room.answer(player, Asked::Art(ArtAsk::SetCore { art: 1, slot: 3, fragment: 0 }));
    assert_eq!(code(&room), 111);
    room.answer(player, Asked::Art(ArtAsk::SetCore { art: 1, slot: 0, fragment: 6 }));
    assert_eq!(code(&room), 112);
    room.answer(player, Asked::Art(ArtAsk::SetCore { art: 1, slot: 0, fragment: 1 }));
    room.answer(player, Asked::Art(ArtAsk::SetCore { art: 1, slot: 2, fragment: 1 }));
    assert_eq!(code(&room), 113);
    room.players.get_mut(&player).expect("in").character.arts.owned = Some(vec![0; 3]);
    room.answer(player, Asked::Art(ArtAsk::SetCore { art: 1, slot: 2, fragment: 3 }));
    assert_eq!(code(&room), 114, "a fragment not owned");
    room.answer(player, Asked::Art(ArtAsk::Wear { art: 3 }));
    assert_eq!((code(&room), room.player(player).expect("in").character.art().key.as_str()), (0, "shadow"));
    room.answer(player, Asked::Grant(Grant::ArtsReady));
    assert_eq!((casting(&room, player).anima, casting(&room, player).tenets), (1.0, [1.0, 1.0]));
}

#[test]
fn the_test_ground_sets_an_art_s_level_and_owns_all_its_fragments() {
    let (mut room, player) = room_with_player();
    let character = |room: &Room| room.player(player).expect("in").character.clone();
    room.players.get_mut(&player).expect("in").character.arts.owned = Some(vec![0; 3]);
    room.players.get_mut(&player).expect("in").character.arts.xp = vec![500; 3];
    room.answer(player, Asked::Grant(Grant::ArtLevel { art: 2, level: 3 }));
    let now = character(&room);
    assert_eq!((now.art_level(2), now.art_xp(2), now.art_level(1)), (3, 0, 5));
    assert!((0..6).all(|fragment| now.owns_fragment(2, fragment)));
    assert!(!now.owns_fragment(1, 0), "another Art's fragments stay as they were");
    room.answer(player, Asked::Grant(Grant::ArtLevel { art: 2, level: 9 }));
    assert_eq!(character(&room).art_level(2), 5, "a level past the highest is the highest");
    room.answer(player, Asked::Grant(Grant::ArtLevel { art: 2, level: 0 }));
    assert_eq!(character(&room).art_level(2), 1);
    room.answer(player, Asked::Grant(Grant::ArtLevel { art: 7, level: 2 }));
    assert_eq!(room.player(player).expect("in").answer, 110, "an Art the rules do not know");
    assert_eq!(character(&room).art_shares(2), (0.6, 0.6), "level 1's shares");
}

#[test]
fn a_test_ground_player_joins_with_every_art_at_its_highest_owning_every_fragment() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.answer(player, Asked::Art(ArtAsk::SetCore { art: 1, slot: 0, fragment: 0 }));
    let found = room.player(player).expect("in");
    assert_eq!(found.answer, 0, "a Core pick is taken");
    assert!((1..=3).all(|art| found.character.art_shares(art) == (1.0, 1.0)), "every spell as written");
}

#[test]
fn wearing_another_art_starts_it_empty_so_no_recharge_runs_at_another_art_s_pace() {
    let (mut room, player) = room_with_player();
    room.ready_arts(player);
    assert_eq!(room.ask_art(player, ArtAsk::Wear { art: 1 }), 0);
    assert_eq!(casting(&room, player).tenets, [1.0, 1.0], "the worn Art again changes nothing");
    assert_eq!(room.ask_art(player, ArtAsk::Wear { art: 3 }), 0);
    let now = casting(&room, player);
    assert_eq!((now.anima, now.tenets, now.releasing.is_none()), (0.0, [0.0, 0.0], true));
}
