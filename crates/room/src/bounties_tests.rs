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
    assert_eq!(count(&room, gatherer, 0), Some(1));
    let mut dungeon = Room::dungeon("gullwing-vale", 0, Some((1, 4))).expect("a patrol's dungeon");
    assert_eq!(dungeon.island, Some("continent-1"));
    dungeon.set_minute(thursday);
    let (delver, unkept) = (holding(&mut dungeon, &[4, 5]), holding(&mut dungeon, &[4]));
    assert!(dungeon.own(delver, "an account"));
    let post = dungeon.cache.expect("a cache").post;
    for id in dungeon.garrison[post].standing.clone() {
        let found = dungeon.foes.get_mut(&id).expect("standing");
        (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
    }
    dungeon.tick();
    assert_eq!([4, 5].map(|place| count(&dungeon, delver, place)), [Some(1), Some(1)]);
    assert_eq!(count(&dungeon, unkept, 4), Some(0), "a clear counts as it pays, for those the room keeps");
    room.set_island("glade");
    assert_eq!(room.island, None, "no island's continent");
}

#[test]
fn a_run_counts_on_its_own_island_and_a_sea_islands_on_its_continent() {
    use crate::RunOf;
    let elite = RunOf::Elite { place: "pearl-tomb".into() };
    let sea = RunOf::Sea { seed: 7, style: "crypt".into(), continent: "continent-4".into() };
    let patrol = RunOf::Patrol { patrol: "highwater-glen".into(), number: 1 };
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
