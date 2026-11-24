//! A patrol stands a few chests at once at places drawn among its own, each moving on in turn, and a share of its
//! containers searchable; every dungeon stands a chest in a room of each block and a share of its containers
//! searchable, drawn again as its garrison stands again. Each player opens each once, E held, and is paid for it.

use super::*;
use crate::asks::{Asked, MOUNTED, OUT_OF_REACH};
use crate::find_holds::{CHEST_REACH, OPEN_TICKS, SEARCH_REACH, SEARCH_TICKS};
use crate::{Floor, Section};
use combat::sight::apart;

/// Twenty chest places round a patrol's ring, each facing north, and twelve crates' boxes.
fn places() -> Vec<[f64; 3]> {
    (0..20).map(|at| [f64::from(at % 5) * 60.0 - 120.0, f64::from(at / 5) * 60.0 - 90.0, 0.0]).collect()
}

fn holders() -> Vec<Holder> {
    (0..12).map(|at| [f64::from(at) * 10.0, 100.0, f64::from(at) * 10.0 + 0.8, 100.8, 0.0, 0.8, 41_816.0]).collect()
}

fn patrol() -> (Room, PlayerId) {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![[0.0, 0.0]], falls_kill: false });
    room.set_island("continent-1");
    room.start_patrol("saltgrass-downs", 0, &[[250.0, 250.0]]);
    room.lay_finds(&places(), holders());
    let player = room.join().expect("a room with space");
    room.tick();
    (room, player)
}

fn run(room: &mut Room, ticks: u64) {
    for _ in 0..ticks {
        room.tick();
    }
}

/// Stands a player at a point, on the floor.
fn stand(room: &mut Room, player: PlayerId, [x, y]: [f64; 2]) {
    let mut there = *room.fighter(player).expect("in");
    there.body.x = x;
    there.body.y = y;
    there.body.z = room.floor.height_at(x, y);
    room.set_fighter(player, there);
}

/// Asks to open a find and holds E `ticks`; answers the ask's answer.
fn hold(room: &mut Room, player: PlayerId, number: u32, ticks: u64) -> u8 {
    room.answer(player, Asked::Find { number });
    let answer = room.player(player).expect("in").answer;
    run(room, ticks);
    answer
}

fn aurem(room: &Room, player: PlayerId) -> u32 {
    room.player(player).expect("in").character.materials.aurem
}

#[test]
fn a_patrol_stands_a_chest_for_every_five_places_each_at_a_place_of_its_own_and_its_holders_one_in_six() {
    let (room, player) = patrol();
    let chests = room.chests_for(player);
    assert_eq!(chests.len(), 4, "twenty places stand four");
    let mut at: Vec<usize> = room.finds.chests.iter().map(|chest| chest.place).collect();
    at.sort_unstable();
    at.dedup();
    assert_eq!(at.len(), 4, "never two at one place");
    for (_, [x, y, z, facing]) in &chests {
        assert!(places().iter().any(|place| place[0] == *x && place[1] == *y), "at a layout's place");
        assert!(z.abs() < 1e-9 && facing.abs() < 1e-9, "on its ground, facing as laid");
    }
    assert_eq!(room.searchables_for(player).len(), 2, "one of twelve containers in six");
    let mut numbers: Vec<u32> = chests.iter().map(|(number, _)| *number).collect();
    numbers.extend(room.searchables_for(player).into_iter().map(|(number, _)| number));
    let count = numbers.len();
    numbers.sort_unstable();
    numbers.dedup();
    assert_eq!(numbers.len(), count, "each its own number");
    // Two places stand two, the least, and one stands one.
    let mut few = Room::node(
        Floor::Flat,
        Vec::new(),
        Section { ring: room.section.clone().expect("a section").ring, spawns: vec![[0.0, 0.0]], falls_kill: false },
    );
    few.lay_finds(&places()[..1], Vec::new());
    few.tick();
    assert_eq!(few.finds.chests.len(), 1);
}

#[test]
fn each_patrol_chest_moves_on_to_another_place_in_turn_as_a_new_chest() {
    let (mut room, player) = patrol();
    let first: Vec<(u32, usize)> = room.finds.chests.iter().map(|chest| (chest.number, chest.place)).collect();
    // One moves on every turn over their count, the first first.
    run(&mut room, CHEST_TURN_TICKS / 4);
    let moved: Vec<(u32, usize)> = room.finds.chests.iter().map(|chest| (chest.number, chest.place)).collect();
    assert_ne!(moved[0], first[0], "the first moved on");
    assert_ne!(moved[0].1, first[0].1, "to another place");
    assert_eq!(&moved[1..], &first[1..], "the rest stand");
    run(&mut room, CHEST_TURN_TICKS);
    let later: Vec<(u32, usize)> = room.finds.chests.iter().map(|chest| (chest.number, chest.place)).collect();
    assert!(later.iter().zip(&first).all(|(now, then)| now.0 != then.0), "every chest new");
    let mut held: Vec<usize> = later.iter().map(|(_, place)| *place).collect();
    held.sort_unstable();
    held.dedup();
    assert_eq!(held.len(), 4, "still never two at one place");
    assert!(room.chests_for(player).len() == 4, "each new one stands for the player");
}

#[test]
fn a_chest_held_open_a_second_within_reach_pays_its_player_and_stays_for_another() {
    let (mut room, player) = patrol();
    let other = room.join().expect("space");
    let (number, [x, y, ..]) = room.chests_for(player)[0];
    stand(&mut room, player, [x + CHEST_REACH - 0.1, y]);
    let before = aurem(&room, player);
    assert_eq!(hold(&mut room, player, number, OPEN_TICKS - 1), 0, "begun");
    assert_eq!(aurem(&room, player), before, "not yet");
    room.tick();
    assert!(aurem(&room, player) > before, "opened at a second");
    let resource = room.player(player).expect("in").character.materials.resource(0);
    assert!(resource >= 2, "two to four of the island's resource");
    assert!(room.chests_for(player).iter().all(|(each, _)| *each != number), "gone for them");
    assert!(room.chests_for(other).iter().any(|(each, _)| *each == number), "still standing for another");
    assert_eq!((room.last_opened(player), room.last_opened(other)), (number, 0), "named as theirs alone");
    assert_eq!(hold(&mut room, player, number, OPEN_TICKS + 1), OUT_OF_REACH, "never twice");
}

#[test]
fn a_chest_out_of_reach_on_horseback_or_while_down_is_not_begun() {
    let (mut room, player) = patrol();
    let (number, [x, y, ..]) = room.chests_for(player)[0];
    stand(&mut room, player, [x + CHEST_REACH + 0.2, y]);
    assert_eq!(hold(&mut room, player, number, 0), OUT_OF_REACH, "too far");
    stand(&mut room, player, [x + 1.0, y]);
    room.players.get_mut(&player).expect("in").mounted = true;
    assert_eq!(hold(&mut room, player, number, 0), MOUNTED);
    room.players.get_mut(&player).expect("in").mounted = false;
    let mut down = *room.fighter(player).expect("in");
    down.health = 0.0;
    down.action = combat::fighter::Action::Dead { elapsed: 0 };
    room.set_fighter(player, down);
    assert_eq!(hold(&mut room, player, number, 0), OUT_OF_REACH, "dead");
    assert_eq!(hold(&mut room, player, 999, 0), OUT_OF_REACH, "no such chest");
}

#[test]
fn letting_go_stirring_or_being_hurt_stops_an_opening_and_letting_go_at_its_end_opens_it() {
    let (mut room, player) = patrol();
    let (number, [x, y, ..]) = room.chests_for(player)[0];
    let opening = |room: &Room| room.finds.opening.contains_key(&player);
    stand(&mut room, player, [x + 1.0, y]);
    hold(&mut room, player, number, 20);
    room.take_ask(player, Asked::StopGather);
    room.tick();
    assert!(!opening(&room) && room.chests_for(player).len() == 4, "let go of early");
    hold(&mut room, player, number, 20);
    stand(&mut room, player, [x + 1.5, y]);
    room.tick();
    assert!(!opening(&room), "a step stops it");
    hold(&mut room, player, number, 20);
    let mut hurt = *room.fighter(player).expect("in");
    hurt.health -= 1.0;
    room.set_fighter(player, hurt);
    room.tick();
    assert!(!opening(&room), "a blow stops it");
    // Let go of a few ticks short of its end, as the page's count runs a crossing of the wire ahead: opened.
    hold(&mut room, player, number, OPEN_TICKS - 5);
    room.take_ask(player, Asked::StopGather);
    room.tick();
    assert!(room.chests_for(player).iter().all(|(each, _)| *each != number), "opened all the same");
}

#[test]
fn a_chest_opened_stays_opened_for_its_account_however_often_its_player_rejoins() {
    let (mut room, player) = patrol();
    assert!(room.own(player, "account-a"));
    let (number, [x, y, ..]) = room.chests_for(player)[0];
    stand(&mut room, player, [x + 1.0, y]);
    hold(&mut room, player, number, OPEN_TICKS + 1);
    room.leave(player);
    let again = room.join().expect("space");
    assert!(room.chests_for(again).iter().any(|(each, _)| *each == number), "before the room knows the account");
    assert!(room.own(again, "account-a"));
    assert!(room.chests_for(again).iter().all(|(each, _)| *each != number), "opened for the account");
}

#[test]
fn a_container_searched_a_second_and_a_half_beside_it_pays_less_than_a_chest_and_its_vestige_lies_at_the_feet() {
    let (mut room, player) = patrol();
    let (number, [west, north, east, ..]) = room.searchables_for(player)[0];
    stand(&mut room, player, [(west + east) / 2.0, north - SEARCH_REACH - 0.2]);
    assert_eq!(hold(&mut room, player, number, 0), OUT_OF_REACH, "too far from its side");
    stand(&mut room, player, [(west + east) / 2.0, north - SEARCH_REACH + 0.1]);
    let before = aurem(&room, player);
    assert_eq!(hold(&mut room, player, number, SEARCH_TICKS - 1), 0);
    assert_eq!(aurem(&room, player), before, "not yet at a second");
    room.tick();
    let paid = aurem(&room, player) - before;
    assert!(paid > 0 && paid < gear::finds::CHEST.aurem, "a search's Aurem: {paid}");
    assert!(room.searchables_for(player).iter().all(|(each, _)| *each != number), "searched");
    for drop in room.drops_for(player) {
        let body = room.fighter(player).expect("in").body;
        assert!(apart([drop.at[0], drop.at[1]], [body.x, body.y]) < 1e-9, "at their feet");
    }
}

#[test]
fn a_patrols_containers_are_drawn_again_in_their_turn() {
    let (mut room, player) = patrol();
    let first: Vec<u32> = room.searchables_for(player).into_iter().map(|(number, _)| number).collect();
    run(&mut room, SEARCH_TURN_TICKS);
    let next: Vec<u32> = room.searchables_for(player).into_iter().map(|(number, _)| number).collect();
    assert_eq!(next.len(), first.len());
    assert!(next.iter().all(|number| !first.contains(number)), "new numbers, so each may be searched again");
}

#[test]
fn where_the_chests_stand_comes_from_the_rooms_loot_seed_so_no_player_foresees_it() {
    let places_of = |loot: u64| {
        let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
        let mut room =
            Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![[0.0, 0.0]], falls_kill: false });
        room.lay_finds(&places(), holders());
        room.reseed(loot, 1);
        room.tick();
        room.finds.chests.iter().map(|chest| chest.place).collect::<Vec<_>>()
    };
    assert_eq!(places_of(5), places_of(5), "the same seed, the same places");
    let drawn: Vec<Vec<usize>> = (0..8).map(places_of).collect();
    assert!(drawn.iter().any(|places| *places != drawn[0]), "other seeds, other places");
}

#[test]
fn every_dungeon_stands_a_chest_in_a_room_of_each_block_against_a_wall_clear_of_rock_and_every_solid() {
    let patrols = ["saltgrass-downs", "thunderhoof-grasslands", "whitewind-tundra", "sunken-fen", "aurora-wastes"];
    let (mut blocks, mut stood) = (0, 0);
    for patrol in patrols {
        for number in 0..dungeon::PER_PATROL {
            let (seed, style) = dungeon::of_patrol(patrol, number);
            let laid = Dungeon::forge(seed, style);
            let mut room = Room::dungeon(patrol, number, Some((5, 9))).expect("a patrol's dungeon");
            let player = room.join().expect("space");
            room.tick();
            let chests = room.chests_for(player);
            assert_eq!(chests.len(), laid.squares.len(), "{patrol} {number}: a chest for each block");
            blocks += laid.squares.len();
            stood += chests.len();
            let Floor::Dungeon(ground) = &room.floor else { panic!("a dungeon's ground") };
            for (_, [x, y, z, facing]) in &chests {
                let cell = (*y / CELL_M) as usize * laid.columns + (*x / CELL_M) as usize;
                let held = laid.room_at(cell).expect("in a room");
                assert!(
                    held != laid.way_in.room && held != laid.end(),
                    "{patrol} {number}: not the way in's or the end"
                );
                assert!(z.abs() < 1e-9, "on the floor");
                // Its back is against rock: a step behind it is no room's floor.
                let behind = [x - libm::sin(*facing) * 0.8, y + libm::cos(*facing) * 0.8];
                let back = (behind[1] / CELL_M) as usize * laid.columns + (behind[0] / CELL_M) as usize;
                assert_eq!(laid.cells[back], dungeon::Cell::Rock, "{patrol} {number}: its back to the wall");
                let along = [libm::cos(*facing) * 0.2, libm::sin(*facing) * 0.2];
                assert!(
                    ground.clear_between([x - along[0], y - along[1]], [x + along[0], y + along[1]], CHEST_HALF_DEEP_M),
                    "{patrol} {number}: clear of rock and every solid"
                );
            }
            let holders = laid.props.iter().filter(|prop| dungeon::models::holder(prop.model).is_some()).count();
            let searchable = room.searchables_for(player).len();
            assert_eq!(searchable, holders.div_ceil(4).min(SEARCHABLE_MOST), "{patrol} {number}: a share");
        }
    }
    assert_eq!(stood, blocks, "every one of these fifteen dungeons stands a chest a block");
}

#[test]
fn every_elite_dungeons_chests_keep_out_of_its_seals_rooms() {
    let mut laid = 0;
    for elite in gear::activities::elite_dungeons() {
        let (seed, style) = crate::elite_laid(elite.id).expect("its seed and style");
        let dungeon = Dungeon::forge_within(seed, style, dungeon::ELITE_BLOCKS);
        let end = (crate::garrison::DUNGEON[0].0, foes::Rank::Boss);
        let mut room = Room::laid_dungeon(elite.id, &dungeon, Some((20, 24)), end, None).expect("its room");
        room.tick();
        let plan = crate::encounter_plan::plan_encounters(&dungeon);
        let seals: Vec<usize> = plan.seals.iter().map(|seal| seal.room).collect();
        assert!(!room.finds.chests.is_empty(), "{}: chests", elite.id);
        for &[west, north, east, south, ..] in &room.finds.holders {
            let [x, y] = [f64::midpoint(west, east), f64::midpoint(north, south)];
            let cell = (y / CELL_M) as usize * dungeon.columns + (x / CELL_M) as usize;
            let held = dungeon.room_at(cell);
            assert!(held.is_none_or(|room| !seals.contains(&room)), "{}: a container in a seal's room", elite.id);
        }
        for chest in &room.finds.chests {
            let [x, y, ..] = room.finds.places[chest.place];
            let cell = (y / CELL_M) as usize * dungeon.columns + (x / CELL_M) as usize;
            assert!(!seals.contains(&dungeon.room_at(cell).expect("a room")), "{}: a chest in a seal's room", elite.id);
        }
        laid += 1;
    }
    assert_eq!(laid, 18, "the 18 Elite Dungeons");
}

#[test]
fn a_dungeons_chests_and_containers_are_drawn_again_as_its_garrison_stands_again() {
    let mut room = Room::dungeon("saltgrass-downs", 0, Some((5, 9))).expect("a dungeon");
    let player = room.join().expect("space");
    room.tick();
    let first: Vec<u32> = room.chests_for(player).into_iter().map(|(number, _)| number).collect();
    run(&mut room, CHEST_TURN_TICKS * 2);
    let still: Vec<u32> = room.chests_for(player).into_iter().map(|(number, _)| number).collect();
    assert_eq!(still, first, "a dungeon's chests stand until its garrison stands again");
    for id in room.garrison[0].standing.clone() {
        let Some(found) = room.foes.get_mut(&id) else { continue };
        found.fighter.health = 0.0;
        found.fighter.action = combat::fighter::Action::Dead { elapsed: 0 };
    }
    run(&mut room, 2);
    assert_eq!(room.cache().map(|cache| cache[4]), Some(1.0), "the cache opened");
    room.leave(player);
    run(&mut room, crate::garrison::GREAT_STAND_AGAIN + 2);
    let again = room.join().expect("space");
    room.tick();
    let drawn: Vec<u32> = room.chests_for(again).into_iter().map(|(number, _)| number).collect();
    assert!(!drawn.is_empty() && drawn.iter().all(|number| !first.contains(number)), "drawn anew");
}

#[test]
fn a_container_no_body_can_stand_beside_as_one_inside_a_tent_is_never_searchable() {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    // A tent's box, 4 m across and 2 m tall, over a crate inside it; and a crate in the open.
    let tent = movement::Block { min_x: -2.0, min_y: -2.0, max_x: 2.0, max_y: 2.0, top: 2.0, bottom: 0.0 };
    let section = Section { ring, spawns: vec![[50.0, 50.0]], falls_kill: false };
    let mut room = Room::node(Floor::Flat, vec![tent], section);
    let inside = [-0.4, -0.4, 0.4, 0.4, 0.0, 0.8, 41_816.0];
    let open = [20.0, 20.0, 20.8, 20.8, 0.0, 0.8, 41_816.0];
    room.lay_finds(&[], vec![inside, open]);
    assert_eq!(room.finds.holders, vec![open], "the crate in the tent is left out");
}
