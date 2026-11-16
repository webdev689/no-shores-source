//! A foe's brain: whom it fights and where it last saw them, the way it faces, what it is about in its fight, and
//! what it keeps for its telegraphed blows, its answers to blows at it and its bow. And what it notes of what the room
//! tells it happened.

use crate::Seen;
use crate::kinds::{Kind, numbers};
use crate::react::Reactions;
use crate::shoot::Bow;
use crate::tell::Tells;
use crate::tuning::{HURT_WINDOW, PHASE_MIGHT};
use combat::{FighterId, Verdict};

/// What a foe is about in its fight.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Plan {
    /// On the ring, waiting its turn.
    Wait,
    /// In to fight: holding a token, or its target open.
    Engage,
    /// Its own swing or shot under way.
    Strike,
    /// The beat after a blow: a hop out, then its ground held.
    Recover,
    /// Hurt or near breaking: out to a farther ring for a while.
    Backoff,
    /// A coward running.
    Flee,
}

/// Health samples this many ticks apart, enough to span the hurt window.
pub const SAMPLE_TICKS: u64 = 15;
pub const SAMPLES: usize = (HURT_WINDOW * 60.0) as usize / SAMPLE_TICKS as usize + 1;

/// A foe's brain.
#[derive(Clone, Debug, PartialEq)]
pub struct Brain {
    pub kind: Kind,
    pub(crate) target: Option<FighterId>,
    pub(crate) last_seen: Option<[f64; 3]>,
    pub(crate) seen_at: u64,
    /// The bearing it faces and steers by, turning at its own pace.
    pub(crate) heading: f64,
    pub(crate) plan: Plan,
    pub(crate) until: u64,
    pub(crate) hop_until: u64,
    pub(crate) backoff_ready: u64,
    pub(crate) fled: bool,
    /// Its own place on the ring, a bearing from its target: it starts where the foe first stands on the ring, so foes
    /// do not cross each other to reach theirs.
    pub(crate) slot: Option<f64>,
    /// Its health at the last few samples, oldest first, and when the newest was taken.
    pub(crate) health: [f64; SAMPLES],
    pub(crate) sampled: u64,
    /// When, in reach, it may swing.
    pub(crate) ready_at: Option<u64>,
    /// Its swings blocked running by a guard still raised.
    pub(crate) blocked: u8,
    pub(crate) tells: Tells,
    pub(crate) reactions: Reactions,
    pub(crate) bow: Bow,
}

impl Brain {
    pub(crate) fn new(kind: Kind, facing: f64) -> Self {
        Brain {
            kind,
            target: None,
            last_seen: None,
            seen_at: 0,
            heading: facing,
            plan: Plan::Wait,
            until: 0,
            hop_until: 0,
            backoff_ready: 0,
            fled: false,
            slot: None,
            health: [numbers(kind).health; SAMPLES],
            sampled: 0,
            ready_at: None,
            blocked: 0,
            tells: Tells::default(),
            reactions: Reactions::default(),
            bow: Bow::default(),
        }
    }

    /// What its fighter's blows are multiplied by now (a boss's second phase strikes harder).
    #[must_use]
    pub fn might(&self) -> f64 {
        numbers(self.kind).might * if self.tells.phase_two { PHASE_MIGHT } else { 1.0 }
    }

    /// The fighter its soft lock should hold: its chosen target, but while it answers a blow, the one whose blow it
    /// is, so its guard and its dodge face that one.
    #[must_use]
    pub fn target(&self) -> Option<FighterId> {
        self.reactions.defence.map(|defence| defence.from).or(self.target)
    }

    /// Notes its health every few ticks; answers how much of its most it lost across the hurt window.
    pub(crate) fn hurt(&mut self, health: f64, health_max: f64, tick: u64) -> f64 {
        if tick >= self.sampled + SAMPLE_TICKS {
            self.health.rotate_left(1);
            self.health[SAMPLES - 1] = health;
            self.sampled = tick;
        }
        (self.health[0] - health) / health_max.max(1.0)
    }

    /// Forgets the hurt so far, as a foe that has backed off from it.
    pub(crate) fn heal_window(&mut self, health: f64) {
        self.health = [health; SAMPLES];
    }
}

/// What the room tells a foe's brain it saw happen this tick, noted for its next thought.
#[must_use]
pub fn notice(brain: &Brain, me: FighterId, seen: &Seen, tick: u64) -> Brain {
    let mut next = brain.clone();
    match *seen {
        Seen::Swung { by, attack } if by != me => next.reactions.saw_swing(by, &attack, tick),
        Seen::Loosed { by } if by != me => next.reactions.saw_shot(by, tick),
        Seen::Struck { by, .. } if next.target.is_none() => {
            // The one that strikes it is its foe, as the soft lock takes it.
            next.target = Some(by);
            next.seen_at = tick;
        }
        Seen::Landed { verdict, .. } => {
            next.blocked = if matches!(verdict, Verdict::Blocked { .. }) { next.blocked.saturating_add(1) } else { 0 };
        }
        Seen::TelegraphEnded { missed, .. } => next.tells.ended = Some(!missed),
        _ => {}
    }
    next
}
