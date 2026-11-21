//! A zone's public events, run by its room on a clock as Destiny 1's are: each of Saltmere's three zones runs one
//! every PERIOD_MINUTES of wall time, alternating its two, the zones ZONE_APART_MINUTES apart, so somewhere on the
//! island one begins every five minutes. Each has COUNTDOWN_MINUTES to win; won or failed, its result shows for
//! RESULT_TICKS, and the next is shown from then. The Fissure (`fissure.rs`) is sealed with shards its foes drop; the
//! Grey Tithe's raid (`raid.rs`) is held at a hamlet's stores. Every player who took part in a win gets a chest of
//! their own (`chest.rs`). The room knows only the node's grounds, its minute and its zone; it keeps no event across
//! its closing, and one opened during an event starts it with the time its start minute leaves.

use crate::{EventKind, Floor, PlayerId, Room};
use ::foes::{Rank, foe_type};
use combat::fighter::FighterId;
use combat::sight::apart;
use movement::{Block, Terrain};
use navmesh::NavMesh;
use std::collections::{BTreeMap, BTreeSet};

mod chest;
mod fissure;
mod raid;
mod seen;
mod walk;

pub use chest::CHEST_REACH;
pub use seen::{PublicMark, PublicSeen};

/// The zones that hold public events, in the order of their place on the clock.
pub const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];
pub const PERIOD_MINUTES: u64 = 15;
pub const ZONE_APART_MINUTES: u64 = 5;
pub const COUNTDOWN_MINUTES: u64 = 8;
pub const TICKS_PER_MINUTE: u64 = 3_600;
pub const COUNTDOWN_TICKS: u64 = COUNTDOWN_MINUTES * TICKS_PER_MINUTE;
pub const RESULT_TICKS: u64 = 12 * 60;
/// A player took part who stood on the ground this long, or struck one of its foes, or set a shard.
pub const PRESENT_TICKS: u32 = 30 * 60;
/// The most foes a zone's room that holds events stands alive, its garrison's and its event's together.
pub const EVENT_FOES_MOST: usize = 32;
/// How far past each ground (and a raid's approach) its room bakes navmesh of its own.
const SQUARE_PAST: f64 = 4.0;
/// The event's draws come from a stream of their own, apart from the garrison's.
const STREAM: u64 = 0x7075_626c_6963;

/// Which event.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Fissure = 1,
    Raid = 2,
}

/// How a running event stands.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Running = 1,
    Won = 2,
    Failed = 3,
}

/// Its heroic task: not yet offered, offered (its window open), met, or missed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Heroic {
    NotYet = 0,
    Offered = 1,
    Met = 2,
    Missed = 3,
}

/// The event a zone runs at `minute` (Unix minutes), and the minute it starts: the slot holding that minute. None for
/// a zone that holds no events, or a minute before its first slot.
#[must_use]
pub fn schedule(zone: &str, minute: u64) -> Option<(Kind, u64)> {
    let place = ZONES.iter().position(|each| *each == zone)? as u64;
    let offset = place * ZONE_APART_MINUTES;
    let slot = minute.checked_sub(offset)? / PERIOD_MINUTES;
    // Neighbouring zones run different events at once, and each alternates its own.
    let kind = if (slot + place).is_multiple_of(2) { Kind::Fissure } else { Kind::Raid };
    Some((kind, offset + slot * PERIOD_MINUTES))
}

/// The Fissure's ground: the middle of its wilds, how far round it the event is fought, and where its growth rises.
#[derive(Clone, Debug, PartialEq)]
pub struct FissureGround {
    pub at: [f64; 2],
    pub radius: f64,
    pub growth: [f64; 2],
}

/// The raid's ground: its middle and how far round it the raid is fought, its three stores, where its raiders come
/// in from, and where their banners are planted.
#[derive(Clone, Debug, PartialEq)]
pub struct RaidGround {
    pub at: [f64; 2],
    pub radius: f64,
    pub stores: Vec<[f64; 2]>,
    pub approach: [f64; 2],
    pub banners: Vec<[f64; 2]>,
}

/// Where a zone's public events are fought.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Grounds {
    pub fissure: Option<FissureGround>,
    pub raid: Option<RaidGround>,
}

/// A player's part in the running event: the ticks they stood on its ground, and whether they did something for it.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct Part {
    pub present: u32,
    pub did: bool,
}

/// What a running event plays by; set aside while a tick of it plays.
#[derive(Debug)]
pub(crate) enum Play {
    Fissure(fissure::Fissure),
    Raid(raid::Raid),
    Aside,
}

/// The event running: what, from which minute, how it stands, its countdown (or its result's time left), its stage,
/// its heroic task and the time left to do it, whether its bonus holds, its foes and those of them whose fall it has
/// counted, each player's part, and its foes withdrawing, each with where it goes and the tick it is gone by.
#[derive(Debug)]
pub(crate) struct Running {
    pub kind: Kind,
    pub start: u64,
    pub phase: Phase,
    pub ticks_left: u64,
    pub stage: u8,
    pub stages: u8,
    pub heroic: Heroic,
    pub heroic_ticks: u64,
    pub bonus: bool,
    pub foes: Vec<FighterId>,
    pub fallen: BTreeSet<FighterId>,
    pub parts: BTreeMap<PlayerId, Part>,
    pub withdrawing: Vec<(FighterId, [f64; 3], u64)>,
    pub play: Play,
}

/// A zone's events as its room keeps them: the zone, its grounds, the level their foes stand at, the start minute of
/// the last event it began (or let pass), and the one running.
#[derive(Debug)]
pub(crate) struct Public {
    pub zone: &'static str,
    pub grounds: Grounds,
    pub level: u8,
    pub handled: Option<u64>,
    pub running: Option<Running>,
}

/// Navmesh over the rectangle round a ground's circle and the points given, SQUARE_PAST further, baked as the
/// garrison's is among the boxes inside it: a bake's cost grows far faster than its area.
fn square(floor: &Floor, blocks: &[Block], (middle, radius): ([f64; 2], f64), also: &[[f64; 2]]) -> NavMesh {
    let start = [middle[0] - radius, middle[1] - radius, middle[0] + radius, middle[1] + radius];
    let [west, north, east, south] = also
        .iter()
        .fold(start, |[west, north, east, south], &[x, y]| [west.min(x), north.min(y), east.max(x), south.max(y)]);
    let bounds = navmesh::Bounds {
        min_x: west - SQUARE_PAST,
        min_y: north - SQUARE_PAST,
        max_x: east + SQUARE_PAST,
        max_y: south + SQUARE_PAST,
    };
    let inside = |block: &&Block| {
        block.min_x < bounds.max_x
            && block.max_x > bounds.min_x
            && block.min_y < bounds.max_y
            && block.max_y > bounds.min_y
    };
    let walked: Vec<Block> = blocks.iter().filter(inside).copied().collect();
    NavMesh::bake_on(&walked, floor, bounds, &navmesh::AGENT)
}

impl Room {
    /// Gives a zone's room its public events, if its zone holds them: a square of navmesh is baked round each ground
    /// and joined to the garrison's, and their foes stand at the top of the island's band of `levels`.
    // shortcut: a ground's square that overlaps the garrison's joins no way across the two; join them by a shared
    // edge if a zone's ground is ever laid that near its spawn.
    pub fn open_public(&mut self, zone: &str, grounds: Grounds, levels: Option<(u8, u8)>) {
        let Some(zone) = ZONES.iter().find(|each| **each == zone) else { return };
        let mut squares = Vec::new();
        if let Some(fissure) = &grounds.fissure {
            squares.push(square(&self.floor, &self.blocks, (fissure.at, fissure.radius), &[fissure.growth]));
        }
        if let Some(raid) = &grounds.raid {
            squares.push(square(&self.floor, &self.blocks, (raid.at, raid.radius), &[raid.approach]));
        }
        self.nav.join(squares);
        let level = levels.map_or(0, |(_, high)| high);
        self.foes_most = self.foes_most.max(EVENT_FOES_MOST);
        self.public = Some(Public { zone, grounds, level, handled: None, running: None });
    }

    /// Each tick, after the garrison: the event due begins; the one running plays, its countdown runs, and its result
    /// shows its time and is gone.
    pub(crate) fn keep_public(&mut self) {
        let Some(mut public) = self.public.take() else { return };
        if public.running.is_none() {
            public.running = self.begin_due(&mut public);
        }
        if let Some(mut running) = public.running.take() {
            if running.phase == Phase::Running {
                self.play(&public, &mut running);
            }
            self.walk_away(&mut running);
            running.ticks_left = running.ticks_left.saturating_sub(1);
            if running.ticks_left == 0 && running.phase == Phase::Running {
                self.fail(&mut running);
            } else if running.ticks_left == 0 {
                self.close(&mut running);
            }
            if running.ticks_left > 0 {
                public.running = Some(running);
            }
        }
        self.public = Some(public);
    }

    /// The event the clock has due, begun: none before the host sets the minute, for one already begun or let pass,
    /// for one whose countdown its start minute has already run out, or one this zone has no ground for.
    fn begin_due(&mut self, public: &mut Public) -> Option<Running> {
        if self.minute == 0 {
            return None;
        }
        let (kind, start) = schedule(public.zone, self.minute)?;
        if public.handled == Some(start) {
            return None;
        }
        public.handled = Some(start);
        let late = self.minute - start;
        if late >= COUNTDOWN_MINUTES {
            return None;
        }
        let play = match kind {
            Kind::Fissure => Play::Fissure(self.fissure_of(public.grounds.fissure.as_ref()?)),
            Kind::Raid => Play::Raid(self.raid_of(public.grounds.raid.as_ref()?)),
        };
        let mut running = Running {
            kind,
            start,
            phase: Phase::Running,
            ticks_left: COUNTDOWN_TICKS - late * TICKS_PER_MINUTE,
            stage: 1,
            stages: 1,
            heroic: Heroic::NotYet,
            heroic_ticks: 0,
            bonus: true,
            foes: Vec::new(),
            fallen: BTreeSet::new(),
            parts: BTreeMap::new(),
            withdrawing: Vec::new(),
            play,
        };
        self.tell(EventKind::PublicBegun, None, 0, 0, f64::from(kind as u8));
        match kind {
            Kind::Fissure => self.begin_fissure(public, &mut running),
            Kind::Raid => self.begin_raid(public, &mut running),
        }
        Some(running)
    }

    /// A tick of the running event: who is taking part, then its own play.
    fn play(&mut self, public: &Public, running: &mut Running) {
        let (middle, radius) = self.ground_of(public, running.kind);
        for (id, player) in &self.players {
            let body = player.fighter.body;
            let part = running.parts.entry(*id).or_default();
            if !player.fighter.dead() && apart([body.x, body.y], middle) <= radius {
                part.present += 1;
            }
        }
        for foe in running.foes.iter().filter_map(|id| self.foes.get(id)) {
            for player in foe.struck_by.keys() {
                running.parts.entry(*player).or_default().did = true;
            }
        }
        match running.kind {
            Kind::Fissure => self.play_fissure(public, running),
            Kind::Raid => self.play_raid(public, running),
        }
    }

    /// The middle and radius of the ground an event of `kind` is fought on.
    pub(crate) fn ground_of(&self, public: &Public, kind: Kind) -> ([f64; 2], f64) {
        match kind {
            Kind::Fissure => {
                public.grounds.fissure.as_ref().map_or(([0.0; 2], 0.0), |ground| (ground.at, ground.radius))
            }
            Kind::Raid => public.grounds.raid.as_ref().map_or(([0.0; 2], 0.0), |ground| (ground.at, ground.radius)),
        }
    }

    /// A point on the ground: its height there.
    pub(crate) fn on_ground(&self, [x, y]: [f64; 2]) -> [f64; 3] {
        [x, y, self.floor.height_at(x, y)]
    }

    /// Stands one of an event's foes of a type and rank at a place, at the event's level, at home round `home` and
    /// hunting the nearest player on its ground; none while the room has no room for it.
    pub(crate) fn stand_event_foe(
        &mut self,
        running: &mut Running,
        (number, rank): (u8, Rank),
        (at, facing): ([f64; 3], f64),
        (home, level): ([f64; 3], u8),
    ) -> Option<FighterId> {
        if self.living_foes() >= self.foes_most {
            return None;
        }
        let place = self.nav.nearest_point(at).unwrap_or(at);
        let id = self.stand_foe(foe_type(number)?, rank, place, facing, None);
        let level = if level == 0 { 0 } else { self.difficulty.raise(level) };
        self.gird(id, level, None);
        let hunted = self.nearest_player([home[0], home[1]]);
        let clock = self.clock;
        let foe = self.foes.get_mut(&id)?;
        foe.brain.posted_at(home, facing);
        if let Some((player, at)) = hunted {
            foe.brain.hunt(player, at, clock);
        }
        running.foes.push(id);
        Some(id)
    }

    /// The living player nearest a point, and where they stand.
    pub(crate) fn nearest_player(&self, point: [f64; 2]) -> Option<(PlayerId, [f64; 3])> {
        let living = self.players.iter().filter(|(_, player)| !player.fighter.dead());
        let at = |player: &crate::players::Player| {
            let body = player.fighter.body;
            [body.x, body.y, body.z]
        };
        let nearest = living.min_by(|one, two| {
            let far = |player: &crate::players::Player| apart([player.fighter.body.x, player.fighter.body.y], point);
            far(one.1).total_cmp(&far(two.1)).then(one.0.cmp(two.0))
        });
        nearest.map(|(id, player)| (*id, at(player)))
    }

    /// The event's foes fallen since it last looked, each with who killed it (the player whose blow last landed on it,
    /// or the striker the room told) and where it fell.
    pub(crate) fn killed_now(&self, running: &mut Running) -> Vec<(FighterId, FighterId, [f64; 3])> {
        let fallen: Vec<FighterId> = running
            .foes
            .iter()
            .copied()
            .filter(|id| !running.fallen.contains(id) && self.foes.get(id).is_some_and(|foe| foe.fighter.dead()))
            .collect();
        running.fallen.extend(&fallen);
        fallen
            .into_iter()
            .filter_map(|id| {
                let foe = self.foes.get(&id)?;
                let told =
                    self.events.iter().rev().find(|event| event.kind == EventKind::Killed && event.defender == id);
                let last =
                    foe.struck_by.iter().max_by_key(|(player, (tick, _))| (*tick, **player)).map(|(player, _)| *player);
                let killer = told.map(|event| event.striker).or(last).unwrap_or(0);
                let body = foe.fighter.body;
                Some((killer, id, [body.x, body.y, body.z]))
            })
            .collect()
    }

    /// The draws of an event's `nth` wave, apart from every other's.
    pub(crate) fn wave_draws(&self, running: &Running, nth: u32) -> naval::random::Mulberry32 {
        let seed = self.world_seed ^ STREAM ^ running.start.rotate_left(17) ^ u64::from(nth);
        naval::random::Mulberry32::new((seed ^ (seed >> 32)) as u32)
    }

    /// Won: every player who took part gets a chest of the tier the event earned, at its ground.
    pub(crate) fn win(&mut self, public: &Public, running: &mut Running) {
        running.phase = Phase::Won;
        running.ticks_left = RESULT_TICKS;
        self.tell(EventKind::PublicWon, None, 0, 0, f64::from(running.kind as u8));
        let tier = 1 + u8::from(running.bonus) + if running.heroic == Heroic::Met { 2 } else { 0 };
        let (middle, _) = self.ground_of(public, running.kind);
        let earned: Vec<PlayerId> =
            running.parts.iter().filter(|(_, part)| took_part(part)).map(|(id, _)| *id).collect();
        for player in earned {
            self.lay_chest(player, tier, middle, public.level);
        }
        self.close_heroic(running);
    }

    /// Failed, by its countdown or its stores: its foes withdraw, and it leaves nothing lasting.
    pub(crate) fn fail(&mut self, running: &mut Running) {
        running.phase = Phase::Failed;
        running.ticks_left = RESULT_TICKS;
        running.bonus = false;
        self.tell(EventKind::PublicFailed, None, 0, 0, f64::from(running.kind as u8));
        self.close_heroic(running);
        let to = match &running.play {
            Play::Fissure(fissure) => fissure.at,
            Play::Raid(raid) => raid.approach,
            Play::Aside => return,
        };
        self.withdraw(running, to);
    }

    /// A heroic window still open closes, missed.
    fn close_heroic(&mut self, running: &mut Running) {
        if running.heroic == Heroic::Offered {
            running.heroic = Heroic::Missed;
            running.heroic_ticks = 0;
            self.tell(EventKind::HeroicMissed, None, 0, 0, f64::from(running.kind as u8));
        }
    }

    /// The event's result has shown its time: whatever of it still stands is gone with it.
    fn close(&mut self, running: &mut Running) {
        for id in std::mem::take(&mut running.foes) {
            if self.foes.get(&id).is_some_and(|foe| !foe.fighter.dead()) {
                self.gone(id);
            }
        }
    }
}

/// Whether a player's part makes them one who took part.
pub(crate) fn took_part(part: &Part) -> bool {
    part.did || part.present >= PRESENT_TICKS
}

#[cfg(test)]
mod chest_tests;
#[cfg(test)]
mod fissure_tests;
#[cfg(test)]
mod fixture;
#[cfg(test)]
mod raid_tests;
#[cfg(test)]
mod schedule_tests;
