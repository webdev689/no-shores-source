use crate::island::{WRECK_REACH, haul};
use crate::{PlayerId, Room, asks};
use ::foes::factions::{GREY_TITHE, PIRATES};
use gear::dice::Dice;
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
    assert_eq!(hauls.len(), 1);
    assert_eq!((hauls[0].0, hauls[0].1), (player, 0));
    assert_eq!(scavenged(&mut room, player, 0), asks::OUT_OF_REACH, "spent for them");
    room.leave(player);
    let back = room.join().expect("a room with space");
    room.own(back, "account-a");
    stand_at(&mut room, back, [wreck[0] + 1.0, wreck[1]]);
    assert_eq!(scavenged(&mut room, back, 0), asks::OUT_OF_REACH, "spent for the account, not the socket");
    let other = room.join().expect("a room with space");
    room.own(other, "account-b");
    stand_at(&mut room, other, [wreck[0] + 1.0, wreck[1]]);
    assert_eq!(scavenged(&mut room, other, 0), 0, "another account has its own lot");
    assert_eq!(scavenged(&mut room, other, 99), asks::OUT_OF_REACH, "no such wreck");
}

#[test]
fn a_haul_holds_materials_and_now_and_then_a_module_more_often_on_an_isle() {
    let modules = |kind| (0..4_000).filter(|&tick| haul(&Dice { seed: 3, tick, player: 1 }, kind).module).count();
    let (cove, isle) = (modules(Kind::Cove), modules(Kind::Ruin));
    assert!((250..420).contains(&cove), "{cove} modules in 4000 coves' wrecks");
    assert!((550..800).contains(&isle), "{isle} modules in 4000 isles' wrecks");
    let one = haul(&Dice { seed: 3, tick: 9, player: 1 }, Kind::Cove);
    assert!(one.timber >= 2 && one.canvas >= 1 && one.iron >= 1);
}
