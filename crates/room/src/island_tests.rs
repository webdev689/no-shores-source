use crate::island::WRECK_REACH;
use crate::{PlayerId, Room, asks};
use ::foes::factions::{GREY_TITHE, PIRATES};
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
    let mut room = Room::island(&plan, AT, Some(GREY_TITHE), Some((5, 9)));
    let player = room.join().expect("a room with space");
    let body = room.fighter(player).expect("in").body;
    assert_eq!([body.x, body.y], isle::placed(plan.sites.spawns[0], AT));
    let [x, y] = plan.sites.spawns[0];
    assert!((body.z - plan.ground.height_at(x, y)).abs() < 1e-6, "on the island's own ground, moved to its place");
    assert!(body.z > 0.5, "landed in the sea");
}

#[test]
fn a_cove_holds_no_foes_and_an_isle_holds_its_holders_guards() {
    let cove = Room::island(&plan(Kind::Cove), AT, Some(PIRATES), Some((5, 9)));
    assert!(cove.foes.is_empty());
    for kind in [Kind::Ruin, Kind::Quarry] {
        for faction in [GREY_TITHE, PIRATES] {
            let room = Room::island(&plan(kind), AT, Some(faction), Some((5, 9)));
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
        let room = Room::island(&plan, AT, Some(PIRATES), Some((5, 9)));
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
    let one = Room::island(&plan, AT, Some(GREY_TITHE), None);
    let other = Room::island(&plan, AT, Some(GREY_TITHE), None);
    assert_eq!(places(&one), places(&other));
}

#[test]
fn a_wreck_is_scavenged_once_by_each_account_from_beside_its_heap() {
    let plan = plan(Kind::Cove);
    let mut room = Room::island(&plan, AT, None, None);
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
    room.leave(player);
    let back = room.join().expect("a room with space");
    room.own(back, "account-a");
    assert_eq!(room.player(back).expect("in").spent, vec![0], "the page is told it is spent, rejoined");
    stand_at(&mut room, back, [wreck[0] + 1.0, wreck[1]]);
    assert_eq!(scavenged(&mut room, back, 0), asks::OUT_OF_REACH, "spent for the account, not the socket");
    let other = room.join().expect("a room with space");
    room.own(other, "account-b");
    stand_at(&mut room, other, [wreck[0] + 1.0, wreck[1]]);
    assert!(room.player(other).expect("in").spent.is_empty());
    assert_eq!(scavenged(&mut room, other, 0), 0, "another account has its own lot");
    assert_eq!(room.player(other).expect("in").spent, vec![0], "the page is told it is spent");
    assert_eq!(scavenged(&mut room, other, 99), asks::OUT_OF_REACH, "no such wreck");
}

#[test]
fn a_wrecks_salvage_is_paid_into_the_scavengers_ship_materials() {
    let plan = plan(Kind::Cove);
    let mut room = Room::island(&plan, AT, None, Some((5, 9)));
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
    assert!(gained >= 4, "a cove's wreck pays two materials of two or more: {gained}");
    assert_eq!(gained, told, "what is told is what was paid in");
}
