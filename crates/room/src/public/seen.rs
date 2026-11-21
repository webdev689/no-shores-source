//! A zone's events as every snapshot shows them: the one running (or the last's result), the next and when it comes,
//! and the marks the page draws of it.

use super::fissure::SHARD_TICKS;
use super::{Heroic, PERIOD_MINUTES, Phase, Play, Public, Running, TICKS_PER_MINUTE, schedule};
use crate::Room;

/// What a mark is of, and what its state says.
pub const FISSURE: u8 = 1;
pub const GROWTH: u8 = 2;
pub const STORE: u8 = 3;
pub const SHARD: u8 = 4;
pub const CARRIED: u8 = 5;
pub const TITHE_TAKER: u8 = 6;
pub const BANNER: u8 = 7;
pub const APPROACH: u8 = 8;
/// A growth's state: rising, standing, sinking, broken; a store's: whole, plundered; the tithe-taker's: arriving,
/// counting, leaving.
pub const RISING: u8 = 1;
pub const STANDING: u8 = 2;
pub const SINKING: u8 = 3;
pub const BROKEN: u8 = 4;
pub const WHOLE: u8 = 1;
pub const PLUNDERED: u8 = 2;
pub const ARRIVING: u8 = 1;
pub const COUNTING: u8 = 2;
pub const LEAVING: u8 = 3;

/// Something of the event the page draws: what it is, its number (a carried shard's is its carrier's, the growth's
/// and the tithe-taker's their foe's), where it is, its health 0 to 1 (a fissure's: how far open; a shard's: its life
/// left), and its state.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PublicMark {
    pub kind: u8,
    pub id: u32,
    pub at: [f64; 3],
    pub health: f32,
    pub state: u8,
}

/// A zone's events as a snapshot carries them: the one running or showing its result (kind 0 for none), its phase
/// (0 waiting), its ground's middle and radius and its time left; the next's kind, ground and ticks until it starts;
/// its stage of how many; its progress toward what it needs; its heroic task and its window's time left; whether its
/// bonus holds; its marks; and the ticks until a raid's next wave comes in (0 while none is on its way).
#[derive(Clone, Debug, PartialEq)]
pub struct PublicSeen {
    pub kind: u8,
    pub phase: u8,
    pub ground: [f64; 3],
    pub radius: f64,
    pub ticks_left: u32,
    pub next_kind: u8,
    pub next_ground: [f64; 3],
    pub next_ticks: u32,
    pub stage: u8,
    pub stages: u8,
    pub progress: u16,
    pub needed: u16,
    pub heroic: u8,
    pub heroic_ticks: u32,
    pub bonus: bool,
    pub marks: Vec<PublicMark>,
    pub next_wave_ticks: u32,
}

fn ticks(count: u64) -> u32 {
    u32::try_from(count).unwrap_or(u32::MAX)
}

impl PublicSeen {
    /// The events as a page counts them on `elapsed` ticks from these, told nothing new: its countdown, its heroic
    /// window's and its next wave's run down to 0; the rest, the next event's ticks among it (to the minute), held. A
    /// snapshot leaves the events out while they stand so (client/src/network/snapshots.ts counts them on alike).
    #[must_use]
    pub fn counted_on(&self, elapsed: u64) -> Self {
        let down = |count: u32| count.saturating_sub(ticks(elapsed));
        Self {
            ticks_left: down(self.ticks_left),
            heroic_ticks: down(self.heroic_ticks),
            next_wave_ticks: down(self.next_wave_ticks),
            ..self.clone()
        }
    }
}

impl Room {
    /// The zone's events as a snapshot shows them; none for a room whose zone holds none.
    #[must_use]
    pub fn public_seen(&self) -> Option<PublicSeen> {
        let public = self.public.as_ref()?;
        let running = public.running.as_ref();
        let (_, now) = schedule(public.zone, self.minute.max(1))?;
        let (next_kind, next_start) = schedule(public.zone, now + PERIOD_MINUTES)?;
        let (next_middle, _) = self.ground_of(public, next_kind);
        // To the minute: the host sets the room's minute, and the page counts on from it.
        let next_ticks = ticks(next_start.saturating_sub(self.minute) * TICKS_PER_MINUTE);
        let mut seen = PublicSeen {
            kind: running.map_or(0, |running| running.kind as u8),
            phase: running.map_or(0, |running| running.phase as u8),
            ground: [0.0; 3],
            radius: 0.0,
            ticks_left: running.map_or(0, |running| ticks(running.ticks_left)),
            next_kind: next_kind as u8,
            next_ground: self.on_ground(next_middle),
            next_ticks,
            stage: running.map_or(0, |running| running.stage),
            stages: running.map_or(0, |running| running.stages),
            progress: 0,
            needed: 0,
            heroic: running.map_or(0, |running| running.heroic as u8),
            heroic_ticks: running.map_or(0, |running| ticks(running.heroic_ticks)),
            bonus: running.is_some_and(|running| running.bonus),
            marks: Vec::new(),
            next_wave_ticks: 0,
        };
        // The running event's ground, or, while none runs, the next's.
        let (middle, radius) = self.ground_of(public, running.map_or(next_kind, |running| running.kind));
        (seen.ground, seen.radius) = (self.on_ground(middle), radius);
        self.public_marks(public, running, &mut seen);
        Some(seen)
    }

    /// The marks: the hamlet's stores always; the rest of the event running or showing its result.
    fn public_marks(&self, public: &Public, running: Option<&Running>, seen: &mut PublicSeen) {
        let mark = |kind: u8, id: u32, at: [f64; 3], health: f32, state: u8| PublicMark { kind, id, at, health, state };
        let raid = running.and_then(|running| if let Play::Raid(raid) = &running.play { Some(raid) } else { None });
        if let Some(ground) = public.grounds.raid.as_ref().filter(|_| raid.is_none()) {
            for (at, store) in ground.stores.iter().enumerate() {
                seen.marks.push(mark(STORE, at as u32 + 1, self.on_ground(*store), 1.0, WHOLE));
            }
        }
        let Some(running) = running else { return };
        let live = running.phase == Phase::Running;
        match &running.play {
            Play::Fissure(fissure) => {
                let needed = fissure.needed();
                (seen.progress, seen.needed) = (fissure.set.min(needed), needed);
                let open = if live { 1.0 - f32::from(fissure.set) / f32::from(needed.max(1)) } else { 0.0 };
                seen.marks.push(mark(FISSURE, 0, fissure.at, open.max(0.0), 0));
                if let Some(id) = fissure.growth {
                    let state = match running.heroic {
                        Heroic::Met => BROKEN,
                        _ if self.clock < fissure.growth_at + super::fissure::GROWTH_RISE => RISING,
                        _ if running.heroic_ticks <= super::fissure::GROWTH_SINK => SINKING,
                        _ => STANDING,
                    };
                    let (at, health) = self.foes.get(&id).map_or((fissure.growth_spot, 0.0), |foe| {
                        let body = foe.fighter.body;
                        ([body.x, body.y, body.z], (foe.fighter.health / foe.fighter.health_max.max(1e-9)) as f32)
                    });
                    seen.marks.push(mark(GROWTH, id, at, health, state));
                }
                for shard in fissure.shards.iter().filter(|_| live) {
                    let life = shard.until.saturating_sub(self.clock) as f32 / SHARD_TICKS as f32;
                    seen.marks.push(mark(SHARD, shard.id, shard.at, life, 0));
                }
                for (player, at) in fissure.carried.iter().filter(|_| live) {
                    seen.marks.push(mark(CARRIED, *player, *at, 1.0, 0));
                }
            }
            Play::Raid(raid) => {
                (seen.progress, seen.needed) = (raid.left(), 1000);
                let coming = raid.next_wave.filter(|_| live).map(|tick| tick.saturating_sub(self.clock));
                seen.next_wave_ticks = ticks(coming.unwrap_or(0));
                for (at, (store, health)) in raid.stores.iter().enumerate() {
                    let state = if *health > 0.0 { WHOLE } else { PLUNDERED };
                    seen.marks.push(mark(STORE, at as u32 + 1, *store, *health as f32, state));
                }
                for (at, banner) in raid.banners.iter().enumerate() {
                    seen.marks.push(mark(BANNER, at as u32 + 1, *banner, 1.0, 0));
                }
                seen.marks.push(mark(APPROACH, 0, raid.approach, 1.0, 0));
                if let Some(taker) = &raid.taker {
                    let leaving = taker.leg + 1 >= taker.round.len();
                    let state = if taker.counting.is_some() {
                        COUNTING
                    } else if leaving {
                        LEAVING
                    } else {
                        ARRIVING
                    };
                    let (at, health) = self.foes.get(&taker.foe).map_or((raid.approach, 0.0), |foe| {
                        let body = foe.fighter.body;
                        ([body.x, body.y, body.z], (foe.fighter.health / foe.fighter.health_max.max(1e-9)) as f32)
                    });
                    seen.marks.push(mark(TITHE_TAKER, taker.foe, at, health, state));
                }
            }
            Play::Aside => {}
        }
    }
}
