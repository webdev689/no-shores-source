//! A zone's room on open ground for the events' tests: its Fissure's ground north of its spawn and its raid's east of
//! it, players placed where a test wants them, and blows landed as the room settles them.

use super::{FissureGround, Grounds, Public, RaidGround, Running};
use crate::judging::How;
use crate::{Floor, PlayerId, Room, Section};
use combat::fighter::FighterId;
use combat::judge::Blow;
use combat::{BlowKind, Stroke, Verdict};

pub(crate) const ZONE: &str = "saltgrass-downs";
/// A minute a Fissure starts at in the zone, and one a raid starts at.
pub(crate) const FISSURE_MINUTE: u64 = 15_000;
pub(crate) const RAID_MINUTE: u64 = 15_015;
pub(crate) const FISSURE_AT: [f64; 2] = [0.0, -100.0];
pub(crate) const RAID_AT: [f64; 2] = [100.0, 0.0];

pub(crate) fn grounds() -> Grounds {
    let fissure = FissureGround { at: FISSURE_AT, radius: 30.0, growth: [17.0, -100.0] };
    let raid = RaidGround {
        at: RAID_AT,
        radius: 30.0,
        stores: vec![[92.0, -4.0], [108.0, -4.0], [100.0, 10.0]],
        approach: [100.0, -45.0],
        banners: vec![[94.0, -36.0], [106.0, -36.0]],
    };
    Grounds { fissure: Some(fissure), raid: Some(raid) }
}

/// The zone's room with `players` joined, at `minute`, before its first tick.
pub(crate) fn room_at(minute: u64, players: usize) -> (Room, Vec<PlayerId>) {
    let section = Section {
        ring: vec![[-200.0, -200.0], [200.0, -200.0], [200.0, 200.0], [-200.0, 200.0]],
        spawns: vec![[0.0, 180.0]],
        falls_kill: false,
    };
    let mut room = Room::node(Floor::Flat, Vec::new(), section);
    room.open_public(ZONE, grounds(), None);
    room.minute = minute;
    let joined = (0..players).map(|_| room.join().expect("room for the player")).collect();
    (room, joined)
}

pub(crate) fn place(room: &mut Room, player: PlayerId, [x, y]: [f64; 2]) {
    let found = room.players.get_mut(&player).expect("the player");
    (found.fighter.body.x, found.fighter.body.y, found.fighter.body.z) = (x, y, 0.0);
}

/// Lands `damage` of a player's swing on a foe, as the room settles a blow it judged a hit.
pub(crate) fn strike(room: &mut Room, player: PlayerId, foe: FighterId, damage: f64) {
    let blow = Blow {
        striker: player,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage,
        poise: 10.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    };
    room.settle(&blow, How::Swing, foe, Verdict::Hit { damage, poise: 10.0 }, Some(gear::Slot::Melee));
}

pub(crate) fn public(room: &Room) -> &Public {
    room.public.as_ref().expect("a zone's events")
}

pub(crate) fn running(room: &Room) -> &Running {
    public(room).running.as_ref().expect("an event running")
}

pub(crate) fn running_mut(room: &mut Room) -> &mut Running {
    room.public.as_mut().and_then(|public| public.running.as_mut()).expect("an event running")
}

/// The event's foes standing.
pub(crate) fn standing(room: &Room) -> Vec<FighterId> {
    let living = |id: &&FighterId| room.foes.get(id).is_some_and(|foe| !foe.fighter.dead());
    running(room).foes.iter().filter(living).copied().collect()
}

pub(crate) fn ticks(room: &mut Room, count: u64) {
    for _ in 0..count {
        room.tick();
    }
}

/// Every event of a kind told since the room was last asked.
pub(crate) fn told(room: &mut Room, kind: crate::EventKind) -> Vec<crate::Event> {
    room.take_events().into_iter().filter(|event| event.kind == kind).collect()
}

/// A foe the room moves itself, staggered with its poise half full, comes out of it as a stepped foe does: its stagger
/// runs out, its poise drains and its immunity to another ends, so it takes no more from a blow than before.
pub(crate) fn recovers_from_a_stagger(room: &mut Room, foe: FighterId) {
    let found = room.foes.get_mut(&foe).expect("the foe");
    let fighter = &mut found.fighter;
    fighter.action = combat::fighter::Action::Staggered { left: 30, cause: combat::fighter::Cause::Poise };
    (fighter.poise, fighter.poise_immune, fighter.poise_rest) = (fighter.poise_max / 2.0, 90, 0);
    ticks(room, 6 * 60);
    let fighter = &room.foes[&foe].fighter;
    assert_eq!(fighter.action, combat::fighter::Action::Idle, "its stagger ran out");
    assert!(!fighter.staggered(), "so a blow takes no more of it");
    assert_eq!((fighter.poise, fighter.poise_immune), (0.0, 0), "its poise drained and its immunity ended");
}

/// A foe of the event killed by another foe (a garrison's, as one fights it), as the room tells a kill.
pub(crate) fn killed_by_a_foe(room: &mut Room, foe: FighterId, killer: FighterId) {
    let found = room.foes.get_mut(&foe).expect("the foe");
    (found.fighter.health, found.fighter.action) = (0.0, combat::fighter::Action::Dead { elapsed: 0 });
    room.tell(crate::EventKind::Killed, None, killer, foe, 0.0);
}
