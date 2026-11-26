//! A dungeon's room for a run: each Elite Dungeon laid by its style in four or five blocks to a Boss of its own; the
//! week's two standing every foe at their own level, whatever the difficulty set after; each run's modifiers and
//! revives; and what a first clear pays once in its period, and a clear again its cache alone.

use super::*;
use crate::PlayerId;
use combat::Action;
use dungeon::Dungeon;
use gear::activities::{Modifier, Weekly};
use std::collections::BTreeSet;

/// A Friday's 09:00 UTC: day 20,778, in week 2,968.
const FRIDAY_NINE: u64 = 29_919_420;

/// A character, kept in the room for an account.
fn kept_in(room: &mut Room, character: &gear::Character) -> PlayerId {
    let player = room.join().expect("a room with space");
    assert!(room.restore_character(player, &character.to_json()));
    assert!(room.own(player, "an account"));
    player
}

/// A character past the prologue at level 10, which Elite asks.
fn past_the_prologue() -> gear::Character {
    let mut character = gear::Character::starting();
    character.story.prologue = true;
    character.earn_xp(45_000, None);
    character
}

/// Fells every foe of the end post, and ticks the room once.
fn clear_the_end(room: &mut Room) {
    crate::encounters::encounters_tests::unseal(room);
    for id in room.garrison[0].standing.clone() {
        let found = room.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
}

/// A player's Vestiges: those lying for them, and those their character keeps.
fn vestiges_for(room: &Room, player: PlayerId) -> (usize, usize) {
    let laid = room
        .drops
        .iter()
        .filter(|drop| drop.player == player && matches!(drop.what, crate::Dropped::Vestige(_)))
        .count();
    (laid, room.players[&player].character.vestiges.len())
}

#[test]
fn every_elite_dungeon_lays_by_its_style_in_four_or_five_blocks_and_ends_at_a_boss_of_its_own() {
    for elite in gear::activities::elite_dungeons() {
        let (seed, style) = elite_laid(elite.id).expect(elite.id);
        assert_eq!(style.key, elite.style);
        assert!((4..=5).contains(&Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS).squares.len()));
        assert_eq!(::foes::foe_type(elite.boss).map(|boss| boss.ranks), Some(&[::foes::Rank::Boss][..]));
    }
    for place in ["krakens-grotto", "smugglers-labyrinth", "brine-catacombs"] {
        let of = RunOf::Elite { place: place.into() };
        let room = Room::dungeon_run(&of, gear::Difficulty::Normal, FRIDAY_NINE).expect(place);
        let elite = gear::activities::elite_dungeon(place).expect("one");
        assert_eq!(room.garrison[0].members[0].0, elite.boss);
        assert_eq!(room.garrison[0].members[0].1, ::foes::Rank::Boss);
        assert_eq!(room.place, Some(gear::gate::Place::EliteDungeon));
    }
    assert_eq!(elite_laid("saltgrass-downs"), None);
}

#[test]
fn the_weeks_dungeons_stand_every_foe_at_their_own_level_whatever_the_difficulty_set_after() {
    let weeks = [("forsaken-cistern", gear::Difficulty::Elite, 26), ("saltworm-warrens", gear::Difficulty::Abyss, 30)];
    for (place, tier, level) in weeks {
        let mut room = Room::dungeon_run(&RunOf::Elite { place: place.into() }, tier, FRIDAY_NINE).expect(place);
        room.set_difficulty(tier);
        assert!(room.foes.values().all(|foe| foe.level == level), "{place}");
        assert_eq!(room.place, Some(gear::gate::Place::Week(Weekly::of(tier).expect("a week's"))));
    }
    let elite = |place: &str| RunOf::Elite { place: place.into() };
    let abyss = Room::dungeon_run(&elite("forsaken-cistern"), gear::Difficulty::Abyss, FRIDAY_NINE);
    assert!(abyss.is_none(), "the Elite's, not the Abyss's");
    let not_this_weeks = Room::dungeon_run(&elite("krakens-grotto"), gear::Difficulty::Elite, FRIDAY_NINE);
    assert!(not_this_weeks.is_none(), "not this week's");
}

#[test]
fn a_run_carries_its_days_or_weeks_modifiers_and_at_abyss_its_revives() {
    let rules = |of: RunOf, tier| {
        Room::dungeon_run(&of, tier, FRIDAY_NINE).and_then(|room| room.run.map(|run| (run.modifiers, run.revives)))
    };
    let patrol = |patrol: &str, number| RunOf::Patrol { patrol: patrol.into(), number };
    use gear::Difficulty::{Abyss, Elite, Normal};
    assert_eq!(rules(patrol("gullwing-vale", 0), Elite), Some((vec![Modifier::Burn(3)], None)));
    assert_eq!(rules(patrol("gullwing-vale", 0), Abyss), Some((vec![Modifier::Burn(3)], Some(5))));
    assert_eq!(rules(patrol("gullwing-vale", 0), Normal), Some((vec![], None)));
    assert_eq!(rules(patrol("gullwing-vale", 1), Abyss), Some((vec![], Some(5))), "not today's");
    assert_eq!(
        rules(RunOf::Elite { place: "saltworm-warrens".into() }, Abyss),
        Some((vec![Modifier::Lightswitch, Modifier::Burn(2), Modifier::Juggler], Some(5)))
    );
    assert_eq!(rules(RunOf::Elite { place: "forsaken-cistern".into() }, Elite), Some((vec![Modifier::Brawler], None)));
    assert_eq!(rules(RunOf::Elite { place: "krakens-grotto".into() }, Normal), Some((vec![], None)));
    assert_eq!(rules(patrol("glade", 0), Normal), None, "no island's");
    assert_eq!(rules(patrol("gullwing-vale", 3), Normal), None);
    let sea =
        |style: &str, continent: &str| RunOf::Sea { seed: 4_242, style: style.into(), continent: continent.into() };
    assert_eq!(rules(sea("caverns", "continent-4"), Abyss), Some((vec![], Some(5))));
    assert_eq!(rules(sea("grotto", "continent-4"), Normal), None);
    assert_eq!(rules(sea("caverns", "continent-0"), Normal), None);
}

#[test]
fn the_first_clear_of_a_tier_on_any_islands_dungeon_of_the_day_pays_once_and_a_clear_again_its_cache_alone() {
    let mut character = gear::Character::starting();
    character.story.prologue = true;
    character.earn_xp(45_000, None); // level 10, which Elite asks
    let run = |patrol: &str, number, tier| {
        let of = RunOf::Patrol { patrol: patrol.into(), number };
        Room::dungeon_run(&of, tier, FRIDAY_NINE).expect(patrol)
    };
    let mut first = run("gullwing-vale", 0, gear::Difficulty::Elite);
    let player = kept_in(&mut first, &character);
    clear_the_end(&mut first);
    assert_eq!(vestiges_for(&first, player), (1, 1), "its cache's on the floor, the day's kept at once");
    let kept = first.players[&player].character.clone();
    assert_eq!(kept.activity.today.cleared, BTreeSet::from([gear::Difficulty::Elite]));
    let mut other = run("highwater-fells", 2, gear::Difficulty::Elite);
    let again = kept_in(&mut other, &kept);
    clear_the_end(&mut other);
    // The cache throws its own Vestige one time in three, by the room's rolls.
    let (thrown, kept_now) = vestiges_for(&other, again);
    assert!(thrown <= 1 && kept_now == 1, "Elite is taken today on every island: its cache alone");
    let mut shared = Room::dungeon("gullwing-vale", 0, Some((1, 4))).expect("the shared Normal room");
    shared.set_minute(FRIDAY_NINE);
    let plain = kept_in(&mut shared, &kept);
    clear_the_end(&mut shared);
    assert_eq!(vestiges_for(&shared, plain), (1, 2), "Normal is its own tier");
    let mut not_today = run("gullwing-vale", 1, gear::Difficulty::Normal);
    let late = kept_in(&mut not_today, &shared.players[&plain].character.clone());
    clear_the_end(&mut not_today);
    let (thrown, kept_late) = vestiges_for(&not_today, late);
    assert!(thrown <= 1 && kept_late == 2, "not the dungeon of the day");
}

#[test]
fn a_weeks_run_cleared_after_the_week_turns_pays_as_a_clear_again() {
    // A Tuesday's 08:59 UTC: the last minute of week 2,968
    let last_minute = 29_925_179;
    for (cleared_at, paid) in [(last_minute, true), (last_minute + 1, false)] {
        let of = RunOf::Elite { place: "saltworm-warrens".into() };
        let mut room =
            Room::dungeon_run(&of, gear::Difficulty::Abyss, last_minute).expect("week 2,968's Abyss Dungeon");
        let player = room.join().expect("in");
        assert!(room.own(player, "an account"));
        room.set_minute(cleared_at);
        clear_the_end(&mut room);
        let week = &room.players[&player].character.activity.this_week;
        assert_eq!((week.abyss, week.boon), (paid, paid), "cleared at {cleared_at}");
        assert_eq!(vestiges_for(&room, player), (1, usize::from(paid)));
    }
}

#[test]
fn a_kill_under_the_abyss_boon_pays_a_quarter_more_xp() {
    let xp = |boon: bool| {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        room.set_minute(FRIDAY_NINE);
        let player = room.join().expect("in");
        room.players.get_mut(&player).expect("in").character.activity.this_week(2_968).boon = boon;
        let foe = crate::arts::arts_tests::stand_foe(&mut room, 2.0, 0.0, 1.0);
        let clock = room.clock;
        room.foes.get_mut(&foe).expect("standing").struck_by.insert(player, (clock, gear::Slot::Melee));
        room.pay_kill(foe);
        room.players[&player].character.xp
    };
    let (plain, boon) = (xp(false), xp(true));
    assert!(plain > 0);
    assert_eq!(boon, plain + plain / 4);
}

#[test]
fn a_player_playing_unkept_finds_the_caches_vestige_alone_and_their_kept_character_still_takes_the_days_clear() {
    let shared = || {
        let mut room = Room::dungeon("gullwing-vale", 0, Some((1, 4))).expect("today's dungeon of the day, shared");
        room.set_minute(FRIDAY_NINE);
        room
    };
    let mut first = shared();
    let player = first.join().expect("in, unkept until its claim answers");
    clear_the_end(&mut first);
    assert_eq!(vestiges_for(&first, player), (1, 0), "the cache's alone: a player playing unkept keeps nothing");
    assert!(first.restore_character(player, &past_the_prologue().to_json()));
    assert!(first.own(player, "an account"));
    let kept = first.players[&player].character.clone();
    assert!(kept.activity.today.cleared.is_empty(), "its record is unmarked");
    let mut later = shared();
    let again = kept_in(&mut later, &kept);
    clear_the_end(&mut later);
    assert_eq!(vestiges_for(&later, again), (1, 1), "its own clear takes the day's");
}

#[test]
fn a_days_clear_pays_only_in_a_run_opened_as_that_days_dungeon_and_cleared_that_day_or_in_the_shared_room_at_normal() {
    let mut shared = Room::dungeon("gullwing-vale", 0, Some((1, 4))).expect("today's dungeon of the day, shared");
    shared.set_difficulty(gear::Difficulty::Elite);
    shared.set_minute(FRIDAY_NINE);
    let player = kept_in(&mut shared, &past_the_prologue());
    clear_the_end(&mut shared);
    assert_eq!(
        vestiges_for(&shared, player),
        (1, 0),
        "the shared room carries no day's modifier, so pays no Elite clear"
    );
    let run_at = |minute: u64| {
        let of = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 0 };
        Room::dungeon_run(&of, gear::Difficulty::Elite, minute).expect("a run of a patrol's dungeon")
    };
    let modifiers = |room: &Room| room.run.as_ref().map(|run| run.modifiers.clone());
    let thursdays = gear::activities::dungeon_of_the_day(20_777, "continent-1");
    assert_ne!(thursdays, Some(("gullwing-vale", 0)), "the day before, another is the dungeon of the day");
    let mut early = run_at(FRIDAY_NINE - 1);
    assert_eq!(modifiers(&early), Some(vec![]));
    let player = kept_in(&mut early, &past_the_prologue());
    early.set_minute(FRIDAY_NINE);
    clear_the_end(&mut early);
    assert_eq!(vestiges_for(&early, player), (1, 0), "opened before the reset, when it was not the day's");
    let mut today = run_at(FRIDAY_NINE);
    assert_eq!(modifiers(&today), Some(vec![Modifier::Burn(3)]));
    let player = kept_in(&mut today, &past_the_prologue());
    clear_the_end(&mut today);
    assert_eq!(vestiges_for(&today, player), (1, 1), "opened as the day's, carrying its modifier");
    let mut late = run_at(FRIDAY_NINE);
    let player = kept_in(&mut late, &past_the_prologue());
    late.set_minute(FRIDAY_NINE + gear::clock::DAY_MINUTES);
    clear_the_end(&mut late);
    assert_eq!(vestiges_for(&late, player), (1, 0), "cleared after the next reset");
}

#[test]
fn a_first_clears_vestige_with_the_carried_ten_and_the_vault_full_goes_to_the_mail_and_nothing_more_lies() {
    let mut character = past_the_prologue();
    for _ in 0..gear::character::VESTIGES_MOST + gear::character::VAULT_MOST {
        character.keep_paid(gear::Vestige::new(0, gear::Rarity::Normal, gear::Slot::Legs, 1));
    }
    assert!(character.mail.is_empty(), "the ten and the vault filled first");
    let of = RunOf::Patrol { patrol: "gullwing-vale".into(), number: 0 };
    let mut room = Room::dungeon_run(&of, gear::Difficulty::Elite, FRIDAY_NINE).expect("the day's dungeon");
    let player = kept_in(&mut room, &character);
    clear_the_end(&mut room);
    let kept = &room.players[&player].character;
    assert_eq!(
        vestiges_for(&room, player),
        (1, gear::character::VESTIGES_MOST + gear::character::VAULT_MOST),
        "the cache's alone on the floor"
    );
    assert_eq!(kept.mail.len(), 1, "the day's in the mail");
    assert!(kept.mail[0].vestige.is_some());
}

#[test]
fn a_guild_dungeon_pays_a_sea_islands_clear_and_each_member_a_guild_package_at_their_first_clear_that_week() {
    use crate::guild_book::GuildSeen;
    use gear::guild::{Boons, Standing};
    let guild = "c0ffee00-0000-0000-0000-000000000000";
    let key = crate::outpost::guild_key(guild);
    let opened = |minute| {
        let of = RunOf::Sea { seed: 4_242, style: "caverns".into(), continent: "continent-4".into() };
        let mut room = Room::dungeon_run(&of, gear::Difficulty::Normal, minute).expect("a sea island's run");
        assert!(room.delve_for(&key));
        room
    };
    let standing = Standing { before_the_week: true, ..Standing::default() };
    let seen = || Some(GuildSeen { id: guild.to_owned(), standing, boons: Boons::default() });
    let mut first = opened(FRIDAY_NINE);
    let member = kept_in(&mut first, &past_the_prologue());
    let outsider = first.join().expect("a room with space");
    assert!(first.restore_character(outsider, &past_the_prologue().to_json()) && first.own(outsider, "another"));
    first.guild_player(member, seen());
    clear_the_end(&mut first);
    let paid = &first.players[&member].character;
    assert!(paid.guild.delve, "the member's package is taken");
    assert!(paid.xp > past_the_prologue().xp, "and the clear paid as a sea island's");
    assert!(!first.players[&outsider].character.guild.delve, "none to one of no guild");
    let carried = paid.vestiges.len();
    let mut again = opened(FRIDAY_NINE + 60);
    let back = kept_in(&mut again, paid);
    again.guild_player(back, seen());
    clear_the_end(&mut again);
    assert_eq!(again.players[&back].character.vestiges.len(), carried, "no second package that week");
    let mut next = opened(FRIDAY_NINE + gear::clock::WEEK_MINUTES);
    let later = kept_in(&mut next, &again.players[&back].character);
    next.guild_player(later, seen());
    clear_the_end(&mut next);
    assert!(next.players[&later].character.vestiges.len() > carried, "another the next week");
    let mut late = opened(FRIDAY_NINE + gear::clock::WEEK_MINUTES * 2);
    let past = kept_in(&mut late, &past_the_prologue());
    late.guild_player(past, seen());
    late.minute += gear::clock::WEEK_MINUTES;
    clear_the_end(&mut late);
    assert!(late.players[&past].character.guild.delve, "a run cleared after the week it opened in pays that week's");
    let mut joined = opened(FRIDAY_NINE);
    let newcomer = kept_in(&mut joined, &past_the_prologue());
    let new = Standing { before_the_week: false, ..Standing::default() };
    joined.guild_player(newcomer, Some(GuildSeen { id: guild.to_owned(), standing: new, boons: Boons::default() }));
    clear_the_end(&mut joined);
    assert!(!joined.players[&newcomer].character.guild.delve, "none to one who joined since the week turned");
    assert!(!Room::new(Vec::new(), (0.0, 0.0)).delve_for(&key), "no run, no guild dungeon");
}
