//! Where a player stands beyond their gear, in the room: an Art below its highest level casting its share, a spell
//! already out keeping its Art's level and Core, the factions', the Tailor's and the Tack's asks served only at their
//! own counters, Shape on the plaza only from Friday to Sunday, and the Shapes a kill gives at the Elite and Abyss seas.

use crate::arts::Cast;
use crate::arts::arts_tests::{cast, room_with_player, stand_foe, wearing};
use crate::asks::{Asked, Counter, CounterKind, answer_code};
use crate::{FighterId, Input, PlayerId, Room};
use combat::Status;
use gear::arts::ArtAsk;
use gear::{Ask, Refusal, Slot};

const SUNWELL: u8 = 4;
const MEND: u8 = 5;
const DAWNFLARE: u8 = 6;
const DUSKRAVEN: u8 = 7;
/// Minutes since 1970 at the start of a Thursday, UTC, and at noon the day after, a Friday.
const THURSDAY: u64 = (1_793_491_200 / 60) + 18 * 1_440;
const FRIDAY_NOON: u64 = THURSDAY + 1_440 + 12 * 60;

fn ask(room: &mut Room, player: PlayerId, sequence: u32, ask: Ask) -> u8 {
    for _ in 0..crate::asks::ASK_EVERY_TICKS {
        room.tick();
    }
    room.input(player, Input { sequence, ask: Some(Asked::Gear(ask)), seen: room.clock(), ..Input::default() })
        .unwrap();
    room.tick();
    room.player(player).expect("in the room").answer
}

fn move_to(room: &mut Room, player: PlayerId, at: [f64; 2]) {
    let mut fighter = *room.fighter(player).expect("in the room");
    fighter.body.x = at[0];
    fighter.body.y = at[1];
    room.set_fighter(player, fighter);
}

fn health(room: &Room, id: FighterId) -> f64 {
    room.foes.get(&id).map_or(0.0, |foe| foe.fighter.health)
}

#[test]
fn an_art_at_its_first_level_harms_heals_and_lasts_its_share() {
    let (mut room, player) = room_with_player();
    room.players.get_mut(&player).expect("in").character.arts.levels[1] = 1;
    wearing(&mut room, player, 2, &[]);
    let mut hurt = *room.fighter(player).expect("in");
    hurt.health = 10.0;
    room.set_fighter(player, hurt);
    cast(&mut room, player, MEND, None, 0);
    let healed = room.fighter(player).expect("in").health;
    assert!((healed - 34.0).abs() < 1e-9, "Mend heals 40 at level 5, 24 at 1: {healed}");
    let near = stand_foe(&mut room, 2.0, -10.0, 1000.0);
    room.ready_arts(player);
    cast(&mut room, player, DAWNFLARE, None, 120);
    assert!((1000.0 - health(&room, near) - 14.0 * 0.6).abs() < 1e-6, "burns 14 at level 5, its share at 1");
    room.ready_arts(player);
    cast(&mut room, player, SUNWELL, None, 0);
    let lasts = |room: &Room| room.spells_seen().filter(|spell| spell.kind == SUNWELL).count();
    for _ in 0..(12 * 60 * 6 / 10) - 10 {
        room.tick();
    }
    assert_eq!(lasts(&room), 1, "the Sunwell still stands");
    for _ in 0..20 {
        room.tick();
    }
    assert_eq!(lasts(&room), 0, "12 s at level 5, 7.2 s at level 1");
}

#[test]
fn the_factions_the_tailor_and_the_tack_serve_only_at_their_own_counters() {
    let (mut room, player) = room_with_player();
    let counters = [(CounterKind::Faction(2), [10.0, 0.0]), (CounterKind::Tack, [-10.0, 0.0])];
    room.counters = Some(counters.map(|(kind, at)| Counter { kind, at }).to_vec());
    room.players.get_mut(&player).expect("in").character.materials.aurem = 20_000;
    let not_here = answer_code(Err(Refusal::NotHere));
    assert_eq!(ask(&mut room, player, 1, Ask::Pledge { faction: 2 }), not_here, "mid-plaza");
    move_to(&mut room, player, [9.0, 0.0]);
    assert_eq!(ask(&mut room, player, 2, Ask::Pledge { faction: 3 }), not_here, "not the Veiled's counter");
    assert_eq!(ask(&mut room, player, 3, Ask::Pledge { faction: 2 }), 0, "the Lamplighters'");
    assert_eq!(room.player(player).expect("in").character.allegiance.pledge, 2);
    let rise = |art| Ask::RiseArt { art, fragment: 0 };
    assert_eq!(ask(&mut room, player, 4, rise(2)), answer_code(Err(Refusal::LevelMost)), "Divine's faction");
    assert_eq!(ask(&mut room, player, 5, rise(1)), not_here, "Storm's is the Stormcallers'");
    let dye = gear::cosmetics::number_of("harbour_blue").expect("a dye");
    move_to(&mut room, player, [-9.0, 0.0]);
    assert_eq!(ask(&mut room, player, 6, Ask::BuyCosmetic { cosmetic: dye }), not_here, "dyes are the Tailor's");
    assert_eq!(crate::asks::counter_for(&Ask::BuyCosmetic { cosmetic: dye }), Some(CounterKind::Tailor));
}

#[test]
fn shape_stands_on_the_plaza_from_friday_to_sunday_and_sells_there() {
    let (mut room, player) = room_with_player();
    room.counters = Some(Vec::new());
    room.shape_spots = (0..8).map(|spot| [f64::from(spot) * 20.0, 30.0]).collect();
    room.set_minute(THURSDAY);
    assert_eq!(room.shape_at(), None, "not on a Thursday");
    room.take_gear_change(player);
    room.set_minute(FRIDAY_NOON);
    let week = gear::shape::week_of(FRIDAY_NOON);
    let spot = room.shape_spots[gear::shape::place(week)];
    assert_eq!(room.shape_at(), Some(spot));
    assert!(room.players.get(&player).expect("in").gear_changed, "his coming is sent");
    room.players.get_mut(&player).expect("in").character.add_shapes(20);
    assert_eq!(ask(&mut room, player, 1, Ask::BuyFromShape { ware: 0 }), answer_code(Err(Refusal::NotHere)));
    move_to(&mut room, player, [spot[0] + 1.0, spot[1]]);
    assert_eq!(ask(&mut room, player, 2, Ask::BuyFromShape { ware: 0 }), 0);
    assert_eq!(room.player(player).expect("in").character.materials.shapes, 13);
    room.counters = None;
    assert_eq!(room.shape_at(), None, "he keeps to a social space");
}

#[test]
fn a_boss_slain_at_the_abyss_seas_gives_shapes_and_at_normal_none() {
    for (difficulty, shapes) in
        [(gear::Difficulty::Calm, 0), (gear::Difficulty::Rough, 2), (gear::Difficulty::Storm, 4)]
    {
        let (mut room, player) = room_with_player();
        room.difficulty = difficulty;
        let boss = stand_foe(&mut room, 0.0, -2.0, 10.0);
        room.foes.get_mut(&boss).expect("stood").brain.rank = ::foes::Rank::Boss;
        room.mark_struck(player, boss, Slot::Melee);
        room.pay_kill(boss);
        assert_eq!(room.player(player).expect("in").character.materials.shapes, shapes, "{difficulty:?}");
    }
}

/// The health a hurt player standing in a Sunwell gains over three seconds, cast at a Divine level.
fn sunwell_gain(level: u8) -> f64 {
    let (mut room, player) = room_with_player();
    room.players.get_mut(&player).expect("in").character.arts.levels[1] = level;
    wearing(&mut room, player, 2, &[]);
    let mut hurt = *room.fighter(player).expect("in");
    hurt.health = 10.0;
    room.set_fighter(player, hurt);
    cast(&mut room, player, SUNWELL, None, 0);
    let before = room.fighter(player).expect("in").health;
    for _ in 0..180 {
        room.tick();
    }
    room.fighter(player).expect("in").health - before
}

#[test]
fn a_sunwell_heals_by_the_level_of_its_caster_s_art() {
    let (whole, first) = (sunwell_gain(5), sunwell_gain(1));
    assert!(whole > 0.0, "a Sunwell heals");
    assert!((first - whole * 0.6).abs() < 1e-9, "level 1 heals 0.6 of level 5's: {first} against {whole}");
}

/// The harm Dusk Daggers do to a foe held in their ring, cast at a Shadow level, the caster wearing Storm (at its
/// highest) once the ring is out if `switch`.
fn daggers_harm(level: u8, switch: bool) -> f64 {
    let (mut room, player) = room_with_player();
    room.players.get_mut(&player).expect("in").character.arts.levels[2] = level;
    wearing(&mut room, player, 3, &[]);
    let foe = stand_foe(&mut room, 0.0, -10.0, 1000.0);
    room.give(foe, combat::Status::Charge, Some(400), None);
    cast(&mut room, player, 8, Some([0.0, -10.0, 0.0]), 0);
    if switch {
        room.answer(player, Asked::Art(gear::arts::ArtAsk::Wear { art: 1 }));
    }
    for _ in 0..300 {
        room.tick();
    }
    1000.0 - health(&room, foe)
}

#[test]
fn a_spell_already_out_strikes_at_the_level_of_the_art_that_cast_it() {
    let (kept, switched) = (daggers_harm(1, false), daggers_harm(1, true));
    assert!(kept > 0.0);
    assert!((kept - switched).abs() < 1e-9, "wearing Storm after the cast changes nothing: {kept} against {switched}");
}

/// A hurt second player standing in a Sunwell its caster cast at Divine's first level, once the well is up.
fn linked_by_a_first_level_sunwell() -> (Room, PlayerId, PlayerId) {
    let (mut room, caster) = room_with_player();
    room.players.get_mut(&caster).expect("in").character.arts.levels[1] = 1;
    wearing(&mut room, caster, 2, &[]);
    let other = room.join().expect("a room with space");
    move_to(&mut room, other, [1.0, 0.0]);
    let mut hurt = *room.fighter(other).expect("in");
    hurt.health = 10.0;
    room.set_fighter(other, hurt);
    cast(&mut room, caster, SUNWELL, None, 0);
    (room, caster, other)
}

#[test]
fn linked_lingers_and_heals_by_its_sunwell_s_level_after_its_caster_leaves() {
    let (mut room, caster, other) = linked_by_a_first_level_sunwell();
    let lingers = room.fighter(other).expect("in").statuses.left(Status::Linked);
    assert!((107..=108).contains(&lingers), "3 s at level 5, 1.8 s at level 1: {lingers}");
    room.leave(caster);
    let before = room.fighter(other).expect("in").health;
    for _ in 0..180 {
        room.tick();
    }
    let gained = room.fighter(other).expect("in").health - before;
    assert!(!room.fighter(other).expect("in").statuses.has(Status::Linked), "Linked has run out");
    let heals = gained / 3.0;
    assert!(gained > 0.0 && (heals - heals.round()).abs() < 1e-9, "3 a heal at level 1, not 5: {gained}");
}

/// The health a Shadow caster's Duskraven with Hunger gives back over its first bolts, the caster wearing Storm once
/// the raven is out if `switch`.
fn hunger_heal(switch: bool) -> f64 {
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[place_of(3, "hunger")]);
    let mut hurt = *room.fighter(player).expect("in");
    hurt.health = 50.0;
    room.set_fighter(player, hurt);
    stand_foe(&mut room, 0.0, -15.0, 1000.0);
    cast(&mut room, player, DUSKRAVEN, None, 0);
    if switch {
        room.answer(player, Asked::Art(ArtAsk::Wear { art: 1 }));
    }
    for _ in 0..120 {
        room.tick();
    }
    room.fighter(player).expect("in").health - 50.0
}

#[test]
fn a_spell_already_out_keeps_the_core_of_the_art_that_cast_it() {
    let (kept, switched) = (hunger_heal(false), hunger_heal(true));
    assert!(kept > 0.0);
    assert!((kept - switched).abs() < 1e-9, "Hunger heals all a bolt deals after a swap: {kept} against {switched}");
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 2, &[place_of(2, "searing")]);
    let foe = stand_foe(&mut room, 2.0, -10.0, 1000.0);
    room.ask_cast(player, Some(Cast { spell: DAWNFLARE, aim: None }));
    for _ in 0..19 {
        room.tick();
    }
    room.answer(player, Asked::Art(ArtAsk::Wear { art: 1 }));
    for _ in 0..60 {
        room.tick();
    }
    assert!(room.fighter(foe).expect("in").statuses.has(Status::Expose), "Searing Exposes after a swap");
    let (mut room, player) = room_with_player();
    wearing(&mut room, player, 3, &[place_of(3, "dread")]);
    let foe = stand_foe(&mut room, 0.0, -10.0, 7.0);
    cast(&mut room, player, DUSKRAVEN, None, 0);
    room.answer(player, Asked::Art(ArtAsk::Wear { art: 1 }));
    room.give(foe, Status::Expose, None, None);
    for _ in 0..40 {
        room.tick();
    }
    assert!(room.fighter(foe).expect("lying there").dead());
    let raven = room.spells_seen().find(|seen| seen.kind == DUSKRAVEN).map(|raven| raven.life);
    assert_eq!(raven, Some(840), "Dread keeps the raven 2 s longer after a swap");
}

#[test]
fn shape_sells_nowhere_outside_his_days_and_his_going_is_sent() {
    let (mut room, player) = room_with_player();
    room.counters = Some(Vec::new());
    room.shape_spots = (0..8).map(|spot| [f64::from(spot) * 20.0, 30.0]).collect();
    room.set_minute(FRIDAY_NOON);
    let spot = room.shape_at().expect("here on a Friday");
    move_to(&mut room, player, spot);
    room.players.get_mut(&player).expect("in").character.add_shapes(20);
    room.set_minute(THURSDAY);
    assert_eq!(ask(&mut room, player, 1, Ask::BuyFromShape { ware: 0 }), answer_code(Err(Refusal::NotHere)));
    // Sunday 21:00, the Friday's week: he goes, and every player is told.
    room.set_minute(FRIDAY_NOON);
    room.take_gear_change(player);
    room.players.get_mut(&player).expect("in").gear_changed = false;
    room.set_minute(THURSDAY + 3 * 1_440 + 21 * 60);
    assert_eq!(room.shape_at(), None);
    assert!(room.players.get(&player).expect("in").gear_changed, "his going is sent");
}

/// A fragment's place in its Art's Core, by its key.
fn place_of(art: u8, key: &str) -> u8 {
    let found = gear::arts::arts().art(art).and_then(|art| art.core.iter().position(|fragment| fragment.key == key));
    u8::try_from(found.expect("a fragment of the Art")).expect("a place")
}

/// Seconds a spell of `kind` cast now by a level 1 caster wearing `art` with `fragments` lives, or the ticks left of
/// `status` on its caster, as the room keeps them.
fn measured(art: u8, fragments: &[&str], spell: u8, status: Option<combat::Status>) -> f64 {
    let (mut room, player) = room_with_player();
    room.players.get_mut(&player).expect("in").character.arts.levels.fill(1);
    let places: Vec<u8> = fragments.iter().map(|key| place_of(art, key)).collect();
    wearing(&mut room, player, art, &places);
    cast(&mut room, player, spell, Some([0.0, -5.0, 0.0]), 0);
    let ticks = match status {
        Some(status) => room.fighter(player).expect("in").statuses.left(status),
        None => room.spells_seen().find(|seen| seen.kind == spell).map_or(0, |seen| seen.life),
    };
    f64::from(ticks) / 60.0
}

/// Seconds of `status` a Minor foe standing at `at` first holds from the spell numbered `spell`, cast by a level 1
/// caster wearing `art` with `fragments` and aimed at the foe.
fn given(art: u8, fragments: &[&str], spell: u8, at: [f64; 2], status: Status) -> f64 {
    let (mut room, player) = room_with_player();
    room.players.get_mut(&player).expect("in").character.arts.levels.fill(1);
    let places: Vec<u8> = fragments.iter().map(|key| place_of(art, key)).collect();
    wearing(&mut room, player, art, &places);
    let foe = stand_foe(&mut room, at[0], at[1], 1000.0);
    room.foes.get_mut(&foe).expect("stood").brain.rank = ::foes::Rank::Minor;
    room.ask_cast(player, Some(Cast { spell, aim: Some([at[0], at[1], 0.0]) }));
    for _ in 0..600 {
        room.tick();
        let left = room.fighter(foe).expect("in").statuses.left(status);
        if left > 0 {
            return f64::from(left) / 60.0;
        }
    }
    0.0
}

/// The seconds a level 1 Shadow caster's Duskraven is kept longer by a Cosmic kill on an Exposed foe, with Dread.
fn dread_more() -> f64 {
    let (mut room, player) = room_with_player();
    room.players.get_mut(&player).expect("in").character.arts.levels.fill(1);
    wearing(&mut room, player, 3, &[place_of(3, "dread")]);
    let foe = stand_foe(&mut room, 0.0, -10.0, 4.0);
    cast(&mut room, player, DUSKRAVEN, None, 0);
    room.give(foe, Status::Expose, None, None);
    for _ in 0..40 {
        room.tick();
    }
    let life = room.spells_seen().find(|seen| seen.kind == DUSKRAVEN).map_or(0, |raven| raven.life);
    f64::from(life) / 60.0 - measured(3, &[], DUSKRAVEN, None)
}

/// The harm a Dawnflare does to a foe on its path, cast at a Divine level: its burn, which nothing but power weighs.
fn dawnflare_harm(level: u8) -> f64 {
    let (mut room, player) = room_with_player();
    room.players.get_mut(&player).expect("in").character.arts.levels[1] = level;
    wearing(&mut room, player, 2, &[]);
    let foe = stand_foe(&mut room, 2.0, -10.0, 1000.0);
    cast(&mut room, player, DAWNFLARE, None, 120);
    1000.0 - health(&room, foe)
}

/// What the room does at an Art's first level, measured, for the client's test of the Art's screen
/// (client/src/game/artLevels.test.ts), which must show the same.
#[test]
fn what_an_art_does_at_its_first_level_is_written_for_the_clients_test() {
    let more = |art, key, spell, status| measured(art, &[key], spell, status) - measured(art, &[], spell, status);
    let numbers = serde_json::json!({
        "level": 1,
        "life": {
            "sunwell": measured(2, &[], SUNWELL, None),
            "duskraven": measured(3, &[], 7, None),
            "duskDaggers": measured(3, &[], 8, None),
        },
        "more": {
            "radiance": more(2, "radiance", SUNWELL, None),
            "blades": more(3, "blades", 8, None),
            "gale": more(1, "gale", 2, Some(Status::Haste)),
            "night": more(3, "night", 9, Some(Status::Veiled)),
            "dread": dread_more(),
        },
        "gives": {
            "quicken": measured(1, &[], 2, Some(Status::Haste)),
            "vanish": measured(3, &[], 9, Some(Status::Veiled)),
            "momentum": measured(1, &["momentum"], 2, Some(Status::Crit)),
            "resolve": measured(2, &["resolve"], MEND, Some(Status::Crit)),
            "sunwell": measured(2, &[], SUNWELL, Some(Status::Linked)),
            "arcLash": given(1, &[], 3, [0.0, -3.0], Status::Charge),
            "duskDaggers": given(3, &[], 8, [0.0, -10.0], Status::Expose),
            "duskraven": given(3, &[], DUSKRAVEN, [0.0, -15.0], Status::Expose),
            "searing": given(2, &["searing"], DAWNFLARE, [2.0, -10.0], Status::Expose),
        },
        "healsASecond": { "sunwell": sunwell_gain(1) / 3.0 },
        "power": dawnflare_harm(1) / dawnflare_harm(5),
    });
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).expect("the folder");
    std::fs::write(format!("{folder}/art_levels.json"), numbers.to_string()).expect("written");
}
