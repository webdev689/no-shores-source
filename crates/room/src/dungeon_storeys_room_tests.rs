//! A room laid on the hand-made dungeon of two storeys: what stands in it stands on its own storey's floor.

use super::*;
use ::foes::Rank::Boss;
use dungeon::hand_made::two_storeys;

const LEVELS: Option<(u8, u8)> = Some((10, 14));

fn laid(end: (u8, Rank)) -> (Dungeon, Room) {
    let dungeon = two_storeys();
    let room = Room::laid_dungeon("two-storeys", &dungeon, LEVELS, end, None).expect("its room");
    (dungeon, room)
}

/// The storey a point stands on, by the floor nearest its height.
fn storey(dungeon: &Dungeon, at: [f64; 3]) -> usize {
    dungeon.storey_at(at[2])
}

#[test]
fn the_reeve_its_cache_and_the_bands_stand_on_their_own_rooms_storeys() {
    let (dungeon, room) = laid((REEVE, Miniboss));
    let reeve = room.garrison[0].at;
    assert!((reeve[2] + 8.0).abs() < 0.3, "the end room is on the lower storey: {reeve:?}");
    assert_eq!(dungeon.room_at(dungeon.cell_at(reeve)), Some(2));
    for post in &room.garrison[1..] {
        assert!(post.at[2].abs() < 0.3, "room 1's band on the top storey: {:?}", post.at);
        assert_eq!(dungeon.room_at(dungeon.cell_at(post.at)), Some(1));
    }
    let cache = room.cache.expect("its cache");
    assert_eq!((cache.at[2], cache.vestige[2]), (-8.0, -8.0));
    assert_eq!(dungeon.room_at(dungeon.cell_at(cache.at)), Some(2));
}

#[test]
fn a_checkpoint_and_the_chests_stand_on_their_rooms_floors() {
    let (dungeon, room) = laid((REEVE, Miniboss));
    let checkpoint = room.respawning.checkpoints.first().expect("room 1's");
    assert_eq!(checkpoint.at[2], 0.0);
    assert!(!room.finds.places.is_empty());
    for place in &room.finds.places {
        let cell = dungeon.cell_at([place[0], place[1], place[2]]);
        let room_storey = dungeon.room_at(cell).map(|number| dungeon.rooms[number].storey);
        assert_eq!(room_storey, Some(storey(&dungeon, [place[0], place[1], place[2]])), "{place:?}");
        assert_eq!(place[2], dungeon.floor_of(cell));
    }
    // With room 1 the end instead, the lower room holds the chests.
    let mut ended = dungeon.clone();
    ended.end = 1;
    let ground = crate::dungeon_ground::DungeonGround::of(&ended).expect("its ground");
    let lower = crate::finds::Finds::of_dungeon(&ended, &ground, &[]);
    assert!(!lower.places.is_empty() && lower.places.iter().all(|place| place[2] == -8.0), "{:?}", lower.places);
}

#[test]
fn the_courts_reach_goes_to_another_storey_only_by_the_flight() {
    let dungeon = two_storeys();
    let reach = crate::encounters::court::reckoning_reach(&dungeon);
    let plane = dungeon.plane();
    let stair = dungeon.stairs[0];
    assert!(stair.cells.iter().all(|&cell| reach.contains(&cell) && reach.contains(&(plane + cell))));
    assert!(dungeon.rooms[1].cells.iter().all(|cell| reach.contains(cell)), "room 1, up the flight");
    assert!(dungeon.rooms[0].cells.iter().all(|cell| !reach.contains(cell)), "room 0 over the Court is not");
}

#[test]
fn an_elite_dungeons_court_anchors_stand_on_the_end_rooms_storey() {
    let (dungeon, room) = laid((REEVE, Boss));
    let plan = &room.encounters.as_ref().expect("its encounters").plan;
    assert_eq!(plan.anchors.len(), crate::encounter_plan::ANCHORS);
    for anchor in &plan.anchors {
        assert_eq!(anchor[2], -8.0);
        assert_eq!(plan.cell_at(*anchor).and_then(|cell| dungeon.room_at(cell)), Some(2));
    }
    for seal in &plan.seals {
        let floor = dungeon::storey_floor(dungeon.rooms[seal.room].storey);
        assert!(seal.pieces.iter().all(|piece| piece[2] >= floor && piece[2] < floor + dungeon::STOREY_M));
        assert!(seal.doors.iter().all(|door| door[2] == floor));
    }
}

#[test]
fn a_player_respawns_on_a_lower_storeys_checkpoint() {
    let (dungeon, mut room) = laid((REEVE, Miniboss));
    let [x, y, z] = dungeon.standing_point(dungeon.rooms[2].cells[5]);
    let won = crate::checkpoints::Won::Post(0);
    room.respawning.checkpoints.push(crate::checkpoints::Checkpoint { at: [x, y, z], facing: 0.0, along: 99.0, won });
    room.garrison[0].cleared_at = Some(room.clock);
    let body = room.at_checkpoint().expect("won");
    assert_eq!((body.x, body.y, body.z), (x, y, -8.0));
}

#[test]
fn a_gallerys_balustrades_are_blocks_a_body_climbs_and_its_vaults_stand_their_chests() {
    let (seed, style) = (0..2000_u32)
        .map(|seed| (seed, dungeon::STYLES[seed as usize % dungeon::STYLES.len()]))
        .find(|&(seed, style)| !Dungeon::forge(seed, style).balustrades.is_empty())
        .expect("a dungeon with a gallery");
    let laid = Dungeon::forge(seed, style);
    let room = Room::laid_dungeon("gallery", &laid, LEVELS, (REEVE, Miniboss), None).expect("its room");
    for &[min_x, min_y, max_x, max_y, bottom, top] in &laid.balustrades {
        let block = movement::Block { min_x, min_y, max_x, max_y, top, bottom };
        assert!(room.blocks.contains(&block), "a balustrade the room's block");
    }
    assert_eq!(room.finds.vaults, laid.vaults, "each vault stands its chest");
}

#[test]
fn a_vault_is_guarded_once_the_main_ways_bands_are_stood_where_foes_remain() {
    let mut guarded = 0;
    for seed in 0..60_u32 {
        let laid = Dungeon::forge(seed, dungeon::STYLES[seed as usize % dungeon::STYLES.len()]);
        let size = |room: &usize| band_size(laid.rooms[*room].cells.len());
        let rooms = band_rooms(&laid, crate::NODE_FOES_MOST);
        let on_way = |room: &usize| laid.rooms[*room].cells.iter().any(|cell| laid.main_way.contains(cell));
        let mut left = crate::NODE_FOES_MOST - rooms.iter().filter(|room| on_way(room)).map(size).sum::<usize>();
        let mut vaults = laid.vaults.clone();
        vaults.sort_by_key(|&vault| (laid.rooms[vault].walk, vault));
        for vault in &vaults {
            if rooms.contains(vault) {
                guarded += 1;
                left -= size(vault);
            } else {
                let sizes: Vec<usize> = rooms.iter().map(size).collect();
                assert!(
                    size(vault) >= left,
                    "seed {seed}: vault {vault} of {} left with {left}: {rooms:?} {sizes:?}",
                    size(vault)
                );
            }
        }
    }
    assert!(guarded > 0, "some vaults guarded");
}
