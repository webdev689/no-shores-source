use crate::{PlayerId, ResourceNode, Room, asks::Asked};
use combat::Action;
use gear::objectives::{ELITE_RANK, GREY_TITHE, MINIBOSS_RANK};

/// A Friday's 09:00 UTC: day 20,778, whose board's place 0 is "Defeat 30 Grey Tithe foes.".
const FRIDAY_NINE: u64 = 29_919_420;

fn holding(room: &mut Room, places: &[u8]) -> PlayerId {
    let player = room.join().expect("a room with space");
    let day = room.day();
    let character = &mut room.players.get_mut(&player).expect("in").character;
    character.activity.today(day).bounties.extend(places.iter().map(|&place| (place, 0)));
    player
}

fn count(room: &Room, player: PlayerId, place: u8) -> Option<u32> {
    room.players[&player].character.activity.today.bounties.get(&place).copied()
}

/// Fells every foe at a post, and ticks: a dungeon's end post so felled opens its cache.
fn fell_post(room: &mut Room, post: usize) {
    for id in room.garrison[post].standing.clone() {
        let found = room.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    room.tick();
}

#[test]
fn a_foe_felled_counts_toward_the_bounty_of_each_player_who_shares_its_kill() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(FRIDAY_NINE);
    let [first, second, idle] = [holding(&mut room, &[0]), holding(&mut room, &[0]), holding(&mut room, &[0])];
    let foe = crate::arts::arts_tests::stand_foe(&mut room, 2.0, 0.0, 1.0);
    let clock = room.clock;
    let standing = room.foes.get_mut(&foe).expect("standing");
    standing.brain.foe_type = ::foes::foe_type(::foes::roster::COLLECTOR).expect("the Grey Tithe's");
    for player in [first, second] {
        standing.struck_by.insert(player, (clock, gear::Slot::Melee));
    }
    room.pay_kill(foe);
    assert_eq!([first, second, idle].map(|player| count(&room, player, 0)), [Some(1), Some(1), Some(0)]);
}

#[test]
fn a_node_gathered_and_a_dungeon_cleared_count_on_the_island_the_room_stands_on() {
    // Thursday 09:00: day 20,777, whose board holds Gather 6 at place 0, Clear a dungeon at 4 and Clear 3 at 5.
    let thursday = FRIDAY_NINE - 1_440;
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    room.set_minute(thursday);
    room.furnish(None, vec![ResourceNode { x: 1.0, y: 0.0, resource: 0 }]);
    let gatherer = holding(&mut room, &[0]);
    room.answer(gatherer, Asked::Gather { node: 0 });
    assert_eq!(count(&room, gatherer, 0), Some(0), "not until it is gathered");
    for _ in 0..=crate::asks::GATHER_TICKS {
        room.tick();
    }
    assert_eq!(count(&room, gatherer, 0), Some(1));
    let mut dungeon = Room::dungeon("gullwing-vale", 0, Some((1, 4))).expect("a patrol's dungeon");
    assert_eq!(dungeon.island, Some("continent-1"));
    dungeon.set_minute(thursday);
    let (delver, unkept) = (holding(&mut dungeon, &[4, 5]), holding(&mut dungeon, &[4]));
    assert!(dungeon.own(delver, "an account"));
    let post = dungeon.cache.expect("a cache").post;
    fell_post(&mut dungeon, post);
    assert_eq!([4, 5].map(|place| count(&dungeon, delver, place)), [Some(1), Some(1)]);
    assert_eq!(count(&dungeon, unkept, 4), Some(0), "a clear counts as it pays, for those the room keeps");
    room.set_island("glade");
    assert_eq!(room.island, None, "no island's continent");
}

#[test]
fn a_shared_dungeon_counts_its_clear_once_a_day_for_each_account_however_often_its_cache_opens() {
    // Day 20,778's place 5 is "Clear 3 dungeons.", and day 20,779's is a clear too.
    let mut dungeon = Room::dungeon("gullwing-vale", 0, Some((1, 4))).expect("a patrol's dungeon");
    dungeon.set_minute(FRIDAY_NINE);
    let delver = holding(&mut dungeon, &[5]);
    assert!(dungeon.own(delver, "ada"));
    let post = dungeon.cache.expect("a cache").post;
    fell_post(&mut dungeon, post);
    dungeon.stand_post(post);
    dungeon.tick();
    assert!(!dungeon.cache.expect("a cache").open, "shut as its end post stands again");
    fell_post(&mut dungeon, post);
    assert_eq!(count(&dungeon, delver, 5), Some(1), "its cache opened twice, one clear counted");
    dungeon.stand_post(post);
    dungeon.tick();
    dungeon.set_minute(FRIDAY_NINE + 1_440);
    let day = dungeon.day();
    dungeon.players.get_mut(&delver).expect("in").character.activity.today(day).bounties.insert(5, 0);
    fell_post(&mut dungeon, post);
    assert_eq!(count(&dungeon, delver, 5), Some(1), "the next day in the same room counts again");
}

#[test]
fn each_run_of_a_dungeon_counts_its_clear_again() {
    let of = crate::RunOf::Patrol { patrol: "gullwing-vale".into(), number: 1 };
    let mut carried: Option<gear::Character> = None;
    for counted in [1, 2] {
        let mut run = Room::dungeon_run(&of, gear::Difficulty::Elite, FRIDAY_NINE).expect("an Elite run");
        let player = holding(&mut run, &[5]);
        assert!(run.own(player, "ada"));
        if let Some(character) = carried.take() {
            run.players.get_mut(&player).expect("in").character = character;
        }
        let post = run.cache.expect("a cache").post;
        fell_post(&mut run, post);
        assert_eq!(count(&run, player, 5), Some(counted));
        carried = Some(run.players[&player].character.clone());
    }
}

#[test]
fn a_run_counts_on_its_own_island_and_a_sea_islands_on_its_continent() {
    use crate::RunOf;
    let elite = RunOf::Elite { place: "pearl-tomb".into() };
    let sea = RunOf::Sea { seed: 7, style: "crypt".into(), continent: "continent-4".into() };
    let patrol = RunOf::Patrol { patrol: "highwater-fells".into(), number: 1 };
    let islands = [elite, sea, patrol]
        .map(|of| Room::dungeon_run(&of, gear::Difficulty::Normal, FRIDAY_NINE).expect("a run's room").island);
    assert_eq!(islands, [Some("continent-1"), Some("continent-4"), Some("continent-2")]);
}

#[test]
fn the_board_numbers_factions_and_ranks_as_the_foes_and_the_ships_do() {
    assert_eq!(GREY_TITHE, ::foes::factions::GREY_TITHE);
    assert_eq!([ELITE_RANK, MINIBOSS_RANK], [::foes::Rank::Elite as u8, ::foes::Rank::Miniboss as u8]);
    assert_eq!([ELITE_RANK, MINIBOSS_RANK], [naval::ranks::Rank::Elite as u8, naval::ranks::Rank::Miniboss as u8]);
}

#[test]
fn a_foe_felled_on_a_ships_deck_counts_toward_no_land_bounty_and_earns_no_boon() {
    let felled = |deck: bool| {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        if deck {
            room.floor = crate::Floor::Deck(Box::new(crate::deck::test_deck().heights.clone()));
        }
        room.set_minute(FRIDAY_NINE);
        let player = holding(&mut room, &[0]);
        room.players.get_mut(&player).expect("in").character.activity.this_week(2_968).boon = true;
        let foe = crate::arts::arts_tests::stand_foe(&mut room, 2.0, 0.0, 1.0);
        let clock = room.clock;
        let standing = room.foes.get_mut(&foe).expect("standing");
        standing.brain.foe_type = ::foes::foe_type(::foes::roster::COLLECTOR).expect("the Grey Tithe's");
        standing.struck_by.insert(player, (clock, gear::Slot::Melee));
        room.pay_kill(foe);
        (count(&room, player, 0), room.players[&player].character.xp)
    };
    let ((land_count, land_xp), (deck_count, deck_xp)) = (felled(false), felled(true));
    assert_eq!((land_count, deck_count), (Some(1), Some(0)));
    assert_eq!(land_xp, deck_xp + deck_xp / 4, "the boon's quarter more on land alone");
}
