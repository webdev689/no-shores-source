//! A land room's part in its players' guilds: its gains given each tick, and a claim asked through the room.

use crate::Room;
use crate::asks::{Asked, answer_code};
use crate::guild_book::GuildSeen;
use gear::asks::Refusal;
use gear::guild::{Boons, SLOTS, Standing};

/// A minute in week 2,916.
const IN_THE_WEEK: u64 = 29_397_780;

#[test]
fn a_member_s_gains_in_the_room_give_their_guild_its_share_each_tick() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(IN_THE_WEEK);
    let player = room.join().expect("a room with space");
    room.players.get_mut(&player).expect("in").claimed = true;
    let seen = GuildSeen { id: "salt".to_owned(), standing: Standing::default(), boons: Boons::default() };
    assert!(room.guild_player(player, Some(seen)));
    room.tick();
    room.players.get_mut(&player).expect("in").character.xp += 2_500;
    room.tick();
    let kept = &room.players[&player].character.guild;
    assert_eq!((kept.week, kept.given), (gear::clock::week_of(IN_THE_WEEK), 250));
    assert!(!room.guild_player(99, None), "no such player");
}

#[test]
fn a_guild_bounty_is_claimed_through_the_room_once_and_refused_in_no_guild() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(IN_THE_WEEK);
    let player = room.join().expect("a room with space");
    room.answer(player, Asked::ClaimGuild { slot: 1 });
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::NotInGuild)));
    let week = Some(gear::clock::week_of(IN_THE_WEEK));
    let standing = Standing { done: [true; SLOTS], before_the_week: true, week };
    room.guild_player(player, Some(GuildSeen { id: "salt".to_owned(), standing, boons: Boons::default() }));
    room.answer(player, Asked::ClaimGuild { slot: 1 });
    assert_eq!(room.players[&player].answer, 0);
    assert_eq!(room.players[&player].character.vestiges.len(), 1, "a guild package");
    room.answer(player, Asked::ClaimGuild { slot: 1 });
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::GuildBountyClaimed)));
}

#[test]
fn a_claim_just_after_the_week_turns_waits_for_the_week_s_standing() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(IN_THE_WEEK);
    let player = room.join().expect("a room with space");
    let week = gear::clock::week_of(IN_THE_WEEK);
    let last = Standing { done: [true; SLOTS], before_the_week: true, week: Some(week) };
    room.guild_player(player, Some(GuildSeen { id: "salt".to_owned(), standing: last, boons: Boons::default() }));
    room.set_minute(IN_THE_WEEK + 7 * 24 * 60);
    room.answer(player, Asked::ClaimGuild { slot: 1 });
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::OutpostTrouble)), "last week's done");
    assert!(room.players[&player].character.vestiges.is_empty(), "no package");
    let now = Standing { done: [false; SLOTS], week: Some(week + 1), ..last };
    room.guild_player(player, Some(GuildSeen { id: "salt".to_owned(), standing: now, boons: Boons::default() }));
    room.answer(player, Asked::ClaimGuild { slot: 1 });
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::GuildBountyNotDone)), "this week's");
}

#[test]
fn for_ten_seconds_after_the_week_turns_a_record_of_the_week_before_waits_so_its_last_count_is_saved() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(IN_THE_WEEK);
    let player = room.join().expect("a room with space");
    room.players.get_mut(&player).expect("in").claimed = true;
    let week = gear::clock::week_of(IN_THE_WEEK);
    let standing = Standing { done: [true; SLOTS], before_the_week: true, week: Some(week + 1) };
    room.guild_player(player, Some(GuildSeen { id: "salt".to_owned(), standing, boons: Boons::default() }));
    room.tick();
    room.players.get_mut(&player).expect("in").character.xp += 2_500;
    room.tick();
    room.set_minute(IN_THE_WEEK + 7 * 24 * 60);
    room.players.get_mut(&player).expect("in").character.xp += 2_500;
    room.tick();
    let kept = &room.players[&player].character.guild;
    assert_eq!((kept.week, kept.given), (week, 250), "last week's record, kept as it was");
    room.answer(player, Asked::ClaimGuild { slot: 1 });
    assert_eq!(room.players[&player].answer, answer_code(Err(Refusal::OutpostTrouble)));
    for _ in 0..600 {
        room.tick();
    }
    let kept = &room.players[&player].character.guild;
    assert_eq!((kept.week, kept.given), (week + 1, 250), "the new week's, given what was gained meanwhile");
}
