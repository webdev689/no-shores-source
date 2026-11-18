//! A foe's brain: whom it fights and where it last saw or heard them, how aware it is, the way it faces, what it is
//! about in its fight, and what it keeps for its telegraphed blows, its answers to blows at it and its bow. And what it
//! notes of what the room tells it happened.

use crate::Seen;
use crate::awareness::Awareness;
use crate::ranks::{Call, Rank};
use crate::react::Reactions;
use crate::roles::{Numbers, Role};
use crate::roster::FoeType;
use crate::shoot::Bow;
use crate::tell::Tells;
use crate::tuning::HURT_WINDOW;
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

/// What a foe's brain asks of its room beyond its fighter's controls: its poise refilled and the foes its phase calls,
/// as it roars into a new phase, and its shout as it turns alert, passing its allies the place it believes its foe is.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Calls {
    pub refill_poise: bool,
    pub crew: Option<Call>,
    pub shout: Option<[f64; 3]>,
}

/// A foe's brain: its type and rank, and all it keeps.
#[derive(Clone, Debug, PartialEq)]
pub struct Brain {
    pub foe_type: &'static FoeType,
    pub rank: Rank,
    pub(crate) calls: Calls,
    pub(crate) target: Option<FighterId>,
    /// Where it believes its foe is: where it last saw its target, or what last stirred it.
    pub(crate) last_seen: Option<[f64; 3]>,
    pub(crate) seen_at: u64,
    pub(crate) awareness: Awareness,
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
    pub(crate) fn new(foe_type: &'static FoeType, rank: Rank, facing: f64) -> Self {
        Brain {
            foe_type,
            rank,
            calls: Calls::default(),
            target: None,
            last_seen: None,
            seen_at: 0,
            awareness: Awareness::default(),
            heading: facing,
            plan: Plan::Wait,
            until: 0,
            hop_until: 0,
            backoff_ready: 0,
            fled: false,
            slot: None,
            health: [foe_type.numbers(rank, 1).health; SAMPLES],
            sampled: 0,
            ready_at: None,
            blocked: 0,
            tells: Tells { phase: 1, ..Tells::default() },
            reactions: Reactions::default(),
            bow: Bow::default(),
        }
    }

    /// Its numbers now: its type's at its rank, in its phase.
    #[must_use]
    pub fn numbers(&self) -> Numbers {
        self.foe_type.numbers(self.rank, self.tells.phase)
    }

    #[must_use]
    pub fn role(&self) -> Role {
        self.foe_type.role
    }

    /// The phase it fights in: 1, then 2 and 3 for those that have them.
    #[must_use]
    pub fn phase(&self) -> u8 {
        self.tells.phase
    }

    /// What its fighter's blows are multiplied by now (a later phase strikes harder).
    #[must_use]
    pub fn might(&self) -> f64 {
        self.numbers().might * self.foe_type.phase(self.rank, self.tells.phase).might
    }

    /// What it asks of its room since it was last asked, taken once.
    pub fn take_calls(&mut self) -> Calls {
        core::mem::take(&mut self.calls)
    }

    /// What it is about in its fight.
    #[must_use]
    pub fn plan(&self) -> Plan {
        self.plan
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

/// What the room tells a foe's brain it saw happen this tick, noted in place for its next thought. Only an alert foe
/// sees a blow coming; a blow on it alerts it at once.
pub fn notice(brain: &mut Brain, me: FighterId, seen: &Seen, tick: u64) {
    let alert = brain.awareness.alert;
    match *seen {
        Seen::Swung { by, attack } if by != me && alert => brain.reactions.saw_swing(by, &attack, tick),
        Seen::Loosed { by, speed } if by != me && alert => brain.reactions.saw_shot(by, speed, tick),
        Seen::Struck { by, .. } => {
            brain.awareness.level = 1.0;
            // The one that strikes it is its foe, as the soft lock takes it, and where it stands now is its place.
            if brain.target.is_none() {
                brain.target = Some(by);
                brain.seen_at = tick;
                brain.last_seen = None;
            }
        }
        // Its own side's noises it pays no heed; an ally's shout it does.
        Seen::Heard(noise) if noise.side != brain.foe_type.side() => brain.awareness.heard.push(*seen),
        Seen::Shouted { .. } => brain.awareness.heard.push(*seen),
        Seen::Landed { verdict, .. } => {
            brain.blocked = if matches!(verdict, Verdict::Blocked { .. }) { brain.blocked.saturating_add(1) } else { 0 };
        }
        Seen::TelegraphEnded { missed, .. } => brain.tells.ended = Some(!missed),
        _ => {}
    }
}
