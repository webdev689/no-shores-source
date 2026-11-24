use crate::island::WRECK_REACH;
use crate::{PlayerId, Room, asks};
use ::foes::factions::GREY_TITHE;
use isle::{Kind, Plan};
use movement::Terrain;

/// Where the islands of these tests lie in the world.
const AT: [f64; 2] = [612_345.5, 287_654.25];

fn seed_of(kind: Kind) -> u64 {
    (0..).find(|&seed| Kind::of(seed) == kind).unwrap_or(0)
}

fn plan(kind: Kind) -> Plan {
    Plan::new(seed_of(kind), "woodland").expect("woodland dresses islands")
}

fn stand_at(room: &mut Room, player: PlayerId, [x, y]: [f64; 2]) {
    let mut there = *room.fighter(player).expect("in");
    there.body.x = x;
    there.body.y = y;
    room.set_fighter(player, there);
}

fn scavenged(room: &mut Room, player: PlayerId, wreck: u8) -> u8 {
    room.answer(player, asks::Asked::Scavenge { wreck });
    room.player(player).expect("in").answer
}

#[test]
fn a_player_lands_on_the_islands_beach_standing_on_its_ground() {
    let plan = plan(Kind::Cove);
    let mut room = Room::island(&plan, AT, Some(GREY_TITHE), Some((5, 9)), None);
    let player = room.join().expect("a room with space");
    let body = room.fighter(player).expect("in").body;
    assert_eq!([body.x, body.y], isle::placed(plan.sites.spawns[0], AT));
    let [x, y] = plan.sites.spawns[0];
    assert!((body.z - plan.ground.height_at(x, y)).abs() < 1e-6, "on the island's own ground, moved to its place");
    assert!(body.z > 0.5, "landed in the sea");
}

#[test]
fn a_cove_holds_no_foes_and_an_isle_holds_the_grey_tithes_guards() {
    let cove = Room::island(&plan(Kind::Cove), AT, Some(GREY_TITHE), Some((5, 9)), None);
    assert!(cove.foes.is_empty());
    for kind in [Kind::Ruin, Kind::Quarry] {
        {
            let faction = GREY_TITHE;
            let room = Room::island(&plan(kind), AT, Some(faction), Some((5, 9)), None);
            assert!(room.foes.len() >= 6, "{kind:?}: {} guards", room.foes.len());
            for foe in room.foes.values() {
                assert_eq!(foe.brain.foe_type.faction, faction, "{kind:?}");
                assert!((5..=9).contains(&foe.level), "{kind:?}: level {}", foe.level);
            }
        }
    }
}

#[test]
fn an_isles_guards_stand_by_its_landmark_at_its_door_and_at_its_camp() {
    for kind in [Kind::Ruin, Kind::Quarry] {
        let plan = plan(kind);
        let room = Room::island(&plan, AT, Some(GREY_TITHE), Some((5, 9)), None);
        let near = |point: [f64; 2]| {
            let [x, y] = isle::placed(point, AT);
            room.foes.values().filter(|foe| libm::hypot(foe.fighter.body.x - x, foe.fighter.body.y - y) <= 12.0).count()
        };
        let [landmark, door, camp] = [plan.sites.guards[0], plan.sites.door.at, plan.sites.camp.expect("a camp")];
        assert!(near(landmark) >= 3, "{kind:?}: {} by the landmark", near(landmark));
        assert!(near(door) >= 2, "{kind:?}: {} at the door", near(door));
        assert!(near(camp) >= 2, "{kind:?}: {} at the camp", near(camp));
    }
}

#[test]
fn every_machine_stands_an_isles_guards_alike() {
    let plan = plan(Kind::Ruin);
    let places = |room: &Room| room.foes.values().map(|foe| foe.fighter.body).collect::<Vec<_>>();
    let one = Room::island(&plan, AT, Some(GREY_TITHE), None, None);
    let other = Room::island(&plan, AT, Some(GREY_TITHE), None, None);
    assert_eq!(places(&one), places(&other));
}

#[test]
fn a_wreck_is_scavenged_once_by_each_account_from_beside_its_heap() {
    let plan = plan(Kind::Cove);
    let mut room = Room::island(&plan, AT, None, None, None);
    let wreck = isle::placed(plan.sites.wrecks[0].at, AT);
    let player = room.join().expect("a room with space");
    room.own(player, "account-a");
    stand_at(&mut room, player, [wreck[0] + WRECK_REACH + 2.0, wreck[1]]);
    assert_eq!(scavenged(&mut room, player, 0), asks::OUT_OF_REACH, "too far off");
    stand_at(&mut room, player, [wreck[0] + 1.0, wreck[1]]);
    assert_eq!(scavenged(&mut room, player, 0), 0);
    assert_eq!(room.scavenged(player), vec![0]);
    let hauls = room.take_hauls();
    assert_eq!(hauls.iter().map(|haul| (haul.0, haul.1)).collect::<Vec<_>>(), vec![(player, 0)]);
    assert_eq!(scavenged(&mut room, player, 0), asks::OUT_OF_REACH, "spent for them");
    // The keeper saves the leaver's character and gives it back on their return, as it does across rooms.
    let kept = room.kept_character(player).expect("in");
    room.leave(player);
    let back = room.join().expect("a room with space");
    assert!(room.restore_character(back, &kept));
    room.own(back, "account-a");
    assert_eq!(room.scavenged(back), vec![0], "the page is told it is spent, rejoined");
    stand_at(&mut room, back, [wreck[0] + 1.0, wreck[1]]);
    assert_eq!(scavenged(&mut room, back, 0), asks::OUT_OF_REACH, "spent for the account, not the socket");
    let other = room.join().expect("a room with space");
    room.own(other, "account-b");
    stand_at(&mut room, other, [wreck[0] + 1.0, wreck[1]]);
    assert!(room.scavenged(other).is_empty());
    assert_eq!(scavenged(&mut room, other, 0), 0, "another account has its own lot");
    assert_eq!(room.scavenged(other), vec![0], "the page is told it is spent");
    assert_eq!(scavenged(&mut room, other, 99), asks::OUT_OF_REACH, "no such wreck");
}

#[test]
fn an_islands_room_opened_again_pays_a_character_nothing_again() {
    let plan = plan(Kind::Cove);
    let wreck = isle::placed(plan.sites.wrecks[0].at, AT);
    let mut first = Room::island(&plan, AT, None, None, None);
    let player = first.join().expect("a room with space");
    stand_at(&mut first, player, [wreck[0] + 1.0, wreck[1]]);
    assert_eq!(scavenged(&mut first, player, 0), 0);
    let kept = first.kept_character(player).expect("in");
    // The room closes; the island still stands, and its room opens again.
    let mut again = Room::island(&plan, AT, None, None, None);
    let back = again.join().expect("a room with space");
    assert!(again.restore_character(back, &kept));
    again.own(back, "account-a");
    assert_eq!(again.scavenged(back), vec![0], "told it is spent");
    stand_at(&mut again, back, [wreck[0] + 1.0, wreck[1]]);
    assert_eq!(scavenged(&mut again, back, 0), asks::OUT_OF_REACH, "paid again");
    // Another island's wreck of the same number is its own.
    let other = Plan::new(plan.seed + 1, "woodland").expect("an island");
    let mut elsewhere = Room::island(&other, AT, None, None, None);
    let there = elsewhere.join().expect("a room with space");
    assert!(elsewhere.restore_character(there, &kept));
    let heap = isle::placed(other.sites.wrecks[0].at, AT);
    stand_at(&mut elsewhere, there, [heap[0] + 1.0, heap[1]]);
    assert_eq!(scavenged(&mut elsewhere, there, 0), 0);
}

#[test]
fn where_landings_are_checked_only_an_account_the_sea_says_landed_scavenges() {
    let plan = plan(Kind::Cove);
    let wreck = isle::placed(plan.sites.wrecks[0].at, AT);
    let mut room = Room::island(&plan, AT, None, None, None);
    assert!(room.check_landings());
    let (far, guest, landed) = (room.join(), room.join(), room.join());
    let [far, guest, landed] = [far, guest, landed].map(|player| player.expect("a room with space"));
    room.own(far, "far-off");
    room.own(landed, "anchored");
    assert!(room.land("anchored", 1));
    for player in [far, guest, landed] {
        stand_at(&mut room, player, [wreck[0] + 1.0, wreck[1]]);
    }
    assert_eq!(scavenged(&mut room, far, 0), asks::OUT_OF_REACH, "an account whose ship is not at the anchorage");
    assert_eq!(scavenged(&mut room, guest, 0), asks::OUT_OF_REACH, "a player of no account");
    assert_eq!(scavenged(&mut room, landed, 0), 0);
}

#[test]
fn a_wrecks_salvage_is_paid_into_the_scavengers_ship_materials() {
    let plan = plan(Kind::Cove);
    let mut room = Room::island(&plan, AT, None, Some((5, 9)), None);
    let wreck = isle::placed(plan.sites.wrecks[0].at, AT);
    let player = room.join().expect("a room with space");
    let before = room.player(player).expect("in").character.materials.ship;
    stand_at(&mut room, player, [wreck[0] + 1.0, wreck[1]]);
    assert_eq!(scavenged(&mut room, player, 0), 0);
    let after = room.player(player).expect("in").character.materials.ship;
    let (_, _, taken) = room.take_hauls()[0];
    let gained: u16 =
        gear::ship::materials::ShipMaterial::ALL.iter().map(|&each| after.of(each) - before.of(each)).sum();
    let told: u16 = gear::ship::materials::ShipMaterial::ALL.iter().map(|&each| taken.materials.of(each)).sum();
    assert!(gained >= 1, "a cove's wreck pays a material: {gained}");
    assert_eq!(gained, told, "what is told is what was paid in");
}

#[test]
fn an_island_of_a_harder_sea_shuts_to_a_character_below_its_level_and_gives_it_none() {
    let mut room = Room::island(&plan(Kind::Cove), AT, None, Some((5, 9)), None);
    room.set_difficulty(gear::Difficulty::Abyss);
    let player = room.join().expect("a room with space");
    let low = gear::Character::starting();
    assert_eq!(room.shut(&low), Some(gear::gate::Shut::Seas(gear::Difficulty::Abyss)), "Abyss seas open at level 20");
    assert!(!room.restore_character(player, &low.to_json()), "never given");
    room.set_difficulty(gear::Difficulty::Normal);
    assert_eq!(room.shut(&low), None, "an island of the Normal sea is open to anyone");
}

#[test]
fn an_islands_nodes_all_stand_and_each_is_gathered_once_by_each_account_while_its_room_is_open() {
    let plan = plan(Kind::Cove);
    const BRINEGLASS: u8 = 0;
    let mut room = Room::island(&plan, AT, None, None, Some(BRINEGLASS));
    let player = room.join().expect("a room with space");
    room.own(player, "account-a");
    let standing: Vec<u8> = room.nodes_for(player).map(|(index, _)| index).collect();
    assert_eq!(standing.len(), plan.sites.nodes.len(), "every one at once");
    assert!(room.nodes_for(player).all(|(_, node)| node.resource == BRINEGLASS), "the island's resource");
    let node = isle::placed(plan.sites.nodes[0], AT);
    let gather = |room: &mut Room, player: PlayerId| {
        stand_at(room, player, [node[0] + 1.0, node[1]]);
        room.answer(player, asks::Asked::Gather { node: 0 });
        for _ in 0..=asks::GATHER_TICKS {
            room.tick();
        }
        room.player(player).expect("in").character.materials.resource(usize::from(BRINEGLASS))
    };
    assert!(gather(&mut room, player) > 0, "gathered");
    room.leave(player);
    let back = room.join().expect("a room with space");
    room.own(back, "account-a");
    assert!(!room.nodes_for(back).any(|(index, _)| index == 0), "spent for the account while the room is open");
    let other = room.join().expect("a room with space");
    room.own(other, "account-b");
    assert!(gather(&mut room, other) > 0, "another account gathers it");
    // The next landing opens the room again: back for everyone.
    let mut again = Room::island(&plan, AT, None, None, Some(BRINEGLASS));
    let landed = again.join().expect("a room with space");
    again.own(landed, "account-a");
    assert!(again.nodes_for(landed).any(|(index, _)| index == 0), "back on the next landing");
    assert!(Room::island(&plan, AT, None, None, None).resource_nodes.is_empty(), "none without a resource");
}

#[test]
fn where_landings_are_checked_a_node_is_gathered_by_the_landed_alone_and_stands_again_once_the_day_turns() {
    let plan = plan(Kind::Cove);
    const BRINEGLASS: u8 = 0;
    let mut room = Room::island(&plan, AT, None, None, Some(BRINEGLASS));
    assert!(room.check_landings());
    let node = isle::placed(plan.sites.nodes[0], AT);
    let gather = |room: &mut Room, player: PlayerId| {
        stand_at(room, player, [node[0] + 1.0, node[1]]);
        room.answer(player, asks::Asked::Gather { node: 0 });
        room.player(player).expect("in").answer
    };
    let player = room.join().expect("a room with space");
    room.own(player, "anchored");
    assert_eq!(gather(&mut room, player), asks::OUT_OF_REACH, "not landed: no gathering, as no scavenging");
    room.land("anchored", 7);
    assert_eq!(gather(&mut room, player), 0);
    for _ in 0..=asks::GATHER_TICKS {
        room.tick();
    }
    assert!(room.player(player).expect("in").spent.contains(&0), "gathered");
    // Rejoined with its character, landed again, or in another room of the island, it stays spent for them until the
    // day turns.
    let kept = room.kept_character(player).expect("kept");
    room.leave(player);
    let back = room.join().expect("a room with space");
    assert!(room.restore_character(back, &kept));
    room.own(back, "anchored");
    room.land("anchored", 7);
    assert!(!room.nodes_for(back).any(|(index, _)| index == 0), "the same visit");
    room.land("anchored", 8);
    assert!(!room.nodes_for(back).any(|(index, _)| index == 0), "a new landing the same day");
    let kept = room.kept_character(back).expect("kept");
    let again = |minute: u64| {
        let mut other = Room::island(&plan, AT, None, None, Some(BRINEGLASS));
        assert!(other.check_landings());
        other.set_minute(minute);
        let player = other.join().expect("a room with space");
        assert!(other.restore_character(player, &kept));
        other.own(player, "anchored");
        other.land("anchored", 9);
        other.nodes_for(player).any(|(index, _)| index == 0)
    };
    assert!(!again(room.minute), "another room of the island, the same day");
    assert!(again(room.minute + 1_440), "the next day");
}
