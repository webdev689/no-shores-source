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
use crate::tuning::{BREAK, HURT_WINDOW};
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
/// as it roars into a new phase; its shout as it turns alert, passing its allies the place it believes its foe is; the
/// health it gets back this tick, walking back to its post; and its Expose and Charge shed as it turns home.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Calls {
    pub refill_poise: bool,
    pub crew: Option<Call>,
    pub shout: Option<[f64; 3]>,
    pub heal: f64,
    pub cleanse: bool,
}

/// A garrison foe's place in its group and the way it faces there, and whether the group walks on, its place moving
/// with it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Home {
    pub at: [f64; 3],
    pub facing: f64,
    pub marching: bool,
}

/// Why a garrison foe walks back to its post: its target led it past its leash, when it heeds nothing on the way but a
/// blow; its search found no one, when it heeds what it sees and hears as ever; or its group gave ground, when it runs
/// to its new place, its target and its awareness kept, and fights again from there.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Homeward {
    Leashed,
    Searched,
    Falling,
}

/// What a garrison foe's group asks of it, set by the room each tick: whether it is the leader its followers screen,
/// held back behind them while one fights hand to hand at its target (`screened`), or the leader going in at once now
/// they are gone (`push`); and whether its group defends its ground.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Orders {
    pub screened: bool,
    pub push: bool,
    pub defend: bool,
}

/// How a foe holds up, as the room sends it: steady, broken by its leader's fall, or raging.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mood {
    Steady = 0,
    Broken = 1,
    Raging = 2,
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
    /// When it took its target and when a blow last drew it to one, and the fighter that struck it since while it
    /// fought another.
    pub(crate) taken_at: u64,
    pub(crate) drawn_at: Option<u64>,
    pub(crate) struck_by: Option<FighterId>,
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
    /// Whether, waiting, it works round to its target's flank rather than hold the line.
    pub(crate) flanking: bool,
    /// Its health at the last few samples, oldest first, and when the newest was taken.
    pub(crate) health: [f64; SAMPLES],
    pub(crate) sampled: u64,
    /// When, in reach, it may swing.
    pub(crate) ready_at: Option<u64>,
    /// Its swings blocked running by a guard still raised; since when that guard has walled it off, and the side it
    /// steps round to (1 clockwise about its target, -1 not), chosen as the wall begins so a guard turning with it
    /// never flips it.
    pub(crate) blocked: u8,
    pub(crate) walled: Option<(u64, f64)>,
    pub(crate) tells: Tells,
    pub(crate) reactions: Reactions,
    pub(crate) bow: Bow,
    /// A garrison foe's place at its post, and why it walks back there, if it does.
    pub(crate) home: Option<Home>,
    pub(crate) returning: Option<Homeward>,
    /// What its group asks of it; until when it is broken, and whether it rages; when a blow last struck it.
    pub(crate) orders: Orders,
    pub(crate) broken_until: u64,
    pub(crate) raging: bool,
    pub(crate) struck_at: Option<u64>,
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
            taken_at: 0,
            drawn_at: None,
            struck_by: None,
            awareness: Awareness::default(),
            heading: facing,
            plan: Plan::Wait,
            until: 0,
            hop_until: 0,
            backoff_ready: 0,
            fled: false,
            slot: None,
            flanking: false,
            health: [foe_type.numbers(rank, 1).health; SAMPLES],
            sampled: 0,
            ready_at: None,
            blocked: 0,
            walled: None,
            tells: Tells { phase: 1, ..Tells::default() },
            reactions: Reactions::default(),
            bow: Bow::default(),
            home: None,
            returning: None,
            orders: Orders::default(),
            broken_until: 0,
            raging: false,
            struck_at: None,
        }
    }

    /// Posts it at a garrison's place, facing `facing`: from now on it leashes to it.
    pub fn posted_at(&mut self, at: [f64; 3], facing: f64) {
        self.home = Some(Home { at, facing, marching: false });
    }

    /// Moves its place, as its group walks its beat (`marching`) or stands at a point of it: it leashes to its place
    /// as it is, and with nothing to fight keeps to it.
    pub fn keep_to(&mut self, at: [f64; 3], facing: f64, marching: bool) {
        self.home = Some(Home { at, facing, marching });
    }

    /// Its place in its group, if it is a garrison's.
    #[must_use]
    pub fn home(&self) -> Option<Home> {
        self.home
    }

    /// Whether it walks back to its post, its fight given up or its search let go; falling back with its group, it
    /// still fights.
    #[must_use]
    pub fn returning(&self) -> bool {
        matches!(self.returning, Some(Homeward::Leashed | Homeward::Searched))
    }

    /// Its group gives ground: fighting, it runs to its new place and fights from there.
    pub fn fall_back(&mut self) {
        if self.target.is_some() && self.home.is_some() && self.returning.is_none() {
            self.returning = Some(Homeward::Falling);
        }
    }

    /// What its group asks of it this tick.
    pub fn order(&mut self, orders: Orders) {
        self.orders = orders;
    }

    /// What its group asks of it.
    #[must_use]
    pub fn orders(&self) -> Orders {
        self.orders
    }

    /// Its leader fell: from `tick` it breaks for BREAK by its role, or rages for the rest of its fight.
    pub fn breaks(&mut self, tick: u64, rages: bool) {
        if rages {
            self.raging = true;
            self.broken_until = 0;
        } else if !self.raging {
            self.broken_until = tick + u64::from(combat::ticks(BREAK));
        }
    }

    /// How it holds up at `tick`.
    #[must_use]
    pub fn mood(&self, tick: u64) -> Mood {
        if self.raging {
            Mood::Raging
        } else if tick < self.broken_until {
            Mood::Broken
        } else {
            Mood::Steady
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

    /// Whom it fights: its chosen target, whatever blow it answers.
    #[must_use]
    pub fn fights(&self) -> Option<FighterId> {
        self.target
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
            brain.struck_at = Some(tick);
            // The one that strikes it is its foe, as the soft lock takes it, and where it stands now is its place;
            // fighting another, it weighs turning on it as it next thinks.
            if brain.target.is_none() {
                brain.target = Some(by);
                (brain.seen_at, brain.taken_at, brain.drawn_at) = (tick, tick, Some(tick));
                brain.last_seen = None;
            } else if brain.target != Some(by) {
                brain.struck_by = Some(by);
            }
        }
        // Its own side's noises it pays no heed; an ally's shout it does.
        Seen::Heard(noise) if noise.side != brain.foe_type.side() => brain.awareness.heard.push(*seen),
        Seen::Shouted { .. } => brain.awareness.heard.push(*seen),
        Seen::Landed { verdict, .. } => {
            brain.blocked =
                if matches!(verdict, Verdict::Blocked { .. }) { brain.blocked.saturating_add(1) } else { 0 };
        }
        Seen::TelegraphEnded { missed, .. } => brain.tells.ended = Some(!missed),
        _ => {}
    }
}
