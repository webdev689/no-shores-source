//! The War Horn's foe: called by the horn's tier to the muster ground at the highest member's level, one at a time,
//! and paid for once felled.

use crate::asks::{Asked, answer_code};
use crate::guild_book::GuildSeen;
use crate::outpost::{OutpostAsk, guild_key};
use crate::{PlayerId, Room};
use gear::asks::Refusal;
use gear::guild::{Boons, Standing};

const GUILD: &str = "c0ffee00-0000-0000-0000-000000000000";

/// The guild as its member is told it: in it before the week turned, or only since.
fn seen(before_the_week: bool) -> GuildSeen {
    let standing = Standing { before_the_week, ..Standing::default() };
    GuildSeen { id: GUILD.to_owned(), standing, boons: Boons::default() }
}

fn sounded(tier: u32) -> (Room, PlayerId) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.open_outpost(&guild_key(GUILD), [30.0, 0.0]);
    let player = room.join().expect("a room with space");
    room.guild_player(player, Some(seen(true)));
    let found = room.players.get_mut(&player).expect("in");
    found.owner = Some("salt".to_owned());
    found.character.xp = gear::power::xp_for_level(12);
    room.answer(player, Asked::Outpost(OutpostAsk::Horn));
    let errand = room.outpost_errands().remove(0);
    room.outpost_answered(errand.id, Some(i64::from(tier)));
    for _ in 0..3 {
        room.tick();
    }
    (room, player)
}

#[test]
fn the_horn_calls_a_boss_and_four_majors_to_the_muster_ground_at_its_tier() {
    let (room, player) = sounded(2);
    assert_eq!(room.players[&player].answer, 0);
    let standing = &room.outpost.as_ref().expect("an outpost").boss;
    let foes: Vec<_> = room.foes.values().collect();
    assert_eq!(foes.len(), 5, "{standing:?}");
    let ranks: Vec<_> = foes.iter().map(|foe| foe.brain.rank).collect();
    assert_eq!(ranks.iter().filter(|rank| **rank == ::foes::Rank::Boss).count(), 1);
    assert_eq!(ranks.iter().filter(|rank| **rank == ::foes::Rank::Major).count(), 4);
    let level = gear::Difficulty::Elite.raise(12);
    assert!(foes.iter().all(|foe| foe.level == level), "the highest member's level raised to Elite");
    let body = foes[0].fighter.body;
    assert!(libm::hypot(body.x - 30.0, body.y) <= 15.0, "on the muster ground");
}

#[test]
fn one_horn_foe_at_a_time() {
    let (mut room, player) = sounded(1);
    room.answer(player, Asked::Outpost(OutpostAsk::Horn));
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::HornFoeStands)));
    assert!(room.outpost_errands().is_empty(), "the accounts are not asked");
}

#[test]
fn felled_the_horn_s_foe_pays_who_fought_it_and_its_guild_s_package_once_a_week() {
    let (mut room, player) = sounded(1);
    let ids: Vec<_> = room.foes.keys().copied().collect();
    room.foes.get_mut(&ids[0]).expect("the boss").struck_by.insert(player, (0, gear::Slot::Melee));
    room.tick();
    for id in ids {
        room.foes.remove(&id);
    }
    let aurem = room.players[&player].character.materials.aurem;
    room.tick();
    let character = &room.players[&player].character;
    assert!(character.materials.aurem > aurem, "a world boss's clear's Aurem");
    assert!(character.guild.horn, "the guild's package taken");
    assert_eq!(character.vestiges.len(), 1);
    assert!(!room.horn_foe_up(), "and the horn may call another");
}

#[test]
fn a_player_who_struck_none_of_the_horn_s_foes_is_not_paid() {
    let (mut room, player) = sounded(1);
    let ids: Vec<_> = room.foes.keys().copied().collect();
    for id in ids {
        room.foes.remove(&id);
    }
    let aurem = room.players[&player].character.materials.aurem;
    room.tick();
    assert_eq!(room.players[&player].character.materials.aurem, aurem);
    assert!(!room.players[&player].character.guild.horn);
    assert!(!room.horn_foe_up(), "felled all the same");
}

#[test]
fn a_member_who_joined_since_the_week_turned_is_paid_the_clear_but_not_the_guild_s_package() {
    let (mut room, player) = sounded(1);
    room.guild_player(player, Some(seen(false)));
    let ids: Vec<_> = room.foes.keys().copied().collect();
    room.foes.get_mut(&ids[0]).expect("the boss").struck_by.insert(player, (0, gear::Slot::Melee));
    room.tick();
    for id in ids {
        room.foes.remove(&id);
    }
    let aurem = room.players[&player].character.materials.aurem;
    room.tick();
    let character = &room.players[&player].character;
    assert!(character.materials.aurem > aurem, "a world boss's clear's Aurem");
    assert!(!character.guild.horn && character.vestiges.is_empty(), "no guild package");
}
