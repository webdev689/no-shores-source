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
use combat::fighter::Side;
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
/// held back behind them while one fights hand to hand at its target (`screened`), and the shield-bearer of them it
/// stands behind (`behind`); or the leader going in at once now they are gone (`push`); and whether its group defends
/// its ground.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Orders {
    pub screened: bool,
    pub behind: Option<FighterId>,
    pub push: bool,
    pub defend: bool,
}

/// How a foe holds up: steady, broken by its leader's fall, or raging.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mood {
    Steady,
    Broken,
    Raging,
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
    /// Whether it has ever given up a fight at its leash: the foes it calls after drop nothing.
    pub(crate) leashed: bool,
    /// The side it fights for, its type's but for a companion's; and a companion's heel: how near its post it stands
    /// before it walks back there.
    pub(crate) side: Side,
    pub(crate) heel: Option<f64>,
    /// How far from its place it fights: LEASH, but for a foe given its own (`leashed`).
    pub(crate) leash: f64,
    /// What its group asks of it; until when it is broken, the cover it falls back behind, and whether it rages; who
    /// last struck it, and when.
    pub(crate) orders: Orders,
    pub(crate) broken_until: u64,
    pub(crate) cover: Option<[f64; 3]>,
    pub(crate) raging: bool,
    /// Since when, defending, it has held its ground before a target near its place.
    pub(crate) held_since: Option<u64>,
    pub(crate) struck_at: Option<(FighterId, u64)>,
    /// The lower rank whose health, poise and defence it fights with, if a story holds it to one (`held_to`).
    pub(crate) held_to: Option<Rank>,
}

impl Brain {
    /// Whether it has ever given up a fight at its leash, so the foes it calls drop nothing
    /// ([[The Audit's Leftovers Are Fixed as Claude Suggested]]).
    #[must_use]
    pub fn has_leashed(&self) -> bool {
        self.leashed
    }

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
            leashed: false,
            side: foe_type.side(),
            heel: None,
            leash: crate::tuning::LEASH,
            orders: Orders::default(),
            broken_until: 0,
            cover: None,
            raging: false,
            held_since: None,
            struck_at: None,
            held_to: None,
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

    /// Gives it a leash of its own: it fights a fighter within `leash` of its place, LEASH's distance or not.
    pub fn leashed(&mut self, leash: f64) {
        self.leash = leash;
    }

    /// Makes it a companion: it fights on the players' side and heels to its post (`posted_at`), which its room moves
    /// behind its leader each tick, walking back there once farther from it than `heel`.
    pub fn heels(&mut self, heel: f64) {
        self.side = Side::Players;
        self.heel = Some(heel);
    }

    /// Makes it fight on the players' side where it stands, its post its own: a ship's hand come aboard a struck deck.
    pub fn joins_players(&mut self) {
        self.side = Side::Players;
    }

    /// Makes it think as `side`, whatever its type's: how the foes' tests stand the crew's types as foes.
    pub fn fights_for(&mut self, side: Side) {
        self.side = side;
    }

    /// Makes it as hard to bring down as its type at `rank`, its health, poise and defence that rank's, where it
    /// stands higher: its own rank's tier, blows and look are kept. A story's foes made gentler so.
    pub fn held_to(&mut self, rank: Rank) {
        if rank < self.rank {
            self.held_to = Some(rank);
            self.health = [self.numbers().health; SAMPLES];
        }
    }

    /// The side it thinks as: whose noises it heeds and whose it hunts.
    #[must_use]
    pub fn side(&self) -> Side {
        self.side
    }

    /// Whether it walks back to its post, its fight given up or its search let go; falling back with its group, it
    /// still fights.
    #[must_use]
    pub fn returning(&self) -> bool {
        matches!(self.returning, Some(Homeward::Leashed | Homeward::Searched))
    }

    /// Called to a fight, it hunts `target` where it last stood, `at`, as though it had just seen it there: alert, it
    /// runs there, and takes it on once it sees it.
    pub fn hunt(&mut self, target: FighterId, at: [f64; 3], tick: u64) {
        (self.target, self.last_seen) = (Some(target), Some(at));
        (self.seen_at, self.taken_at) = (tick, tick);
        (self.awareness.level, self.awareness.alert) = (1.0, true);
    }

    /// Whether it falls back with its group, running to its new place.
    #[must_use]
    pub fn falling_back(&self) -> bool {
        self.returning == Some(Homeward::Falling)
    }

    /// Its group gives ground: fighting, it runs to its new place and fights from there; raging, it holds no ground.
    pub fn fall_back(&mut self) {
        if self.target.is_some() && self.home.is_some() && self.returning.is_none() && !self.raging {
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

    /// Its numbers now: its type's at its rank, in its phase; held to a lower rank (`held_to`), that rank's health,
    /// poise and defence.
    #[must_use]
    pub fn numbers(&self) -> Numbers {
        let numbers = self.foe_type.numbers(self.rank, self.tells.phase);
        let Some(held) = self.held_to else { return numbers };
        let gentle = self.foe_type.numbers(held, 1);
        let (health, poise) = (gentle.health, gentle.poise);
        Numbers { health, poise, parry: gentle.parry, block: gentle.block, dodge: gentle.dodge, ..numbers }
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

    /// The fighter whose blow it has seen coming and not yet weighed, if any.
    #[must_use]
    pub fn seen_coming(&self) -> Option<FighterId> {
        self.reactions.threat.map(|threat| threat.by)
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

    /// Forgets the hurt so far, as a foe that has backed off from it, or one just raised to its level.
    pub fn heal_window(&mut self, health: f64) {
        self.health = [health; SAMPLES];
    }

    /// Lets go of the noises and shouts told it since its last thought, for a brain that does not think them over.
    pub fn forget_heard(&mut self) {
        self.awareness.heard.clear();
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
            brain.struck_at = Some((by, tick));
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
        Seen::Heard(noise) if noise.side != brain.side => brain.awareness.heard.push(*seen),
        Seen::Shouted { .. } => brain.awareness.heard.push(*seen),
        Seen::Landed { verdict, .. } => {
            brain.blocked =
                if matches!(verdict, Verdict::Blocked { .. }) { brain.blocked.saturating_add(1) } else { 0 };
        }
        Seen::TelegraphEnded { missed, .. } => brain.tells.ended = Some(!missed),
        _ => {}
    }
}
