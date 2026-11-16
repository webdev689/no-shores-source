//! Every number a foe's brain turns on, in one place: DFO's tactics and TELL tables, and the reactions Overlook's own
//! fight adds. Distances in metres, times in seconds (the brain counts them in ticks of 1/60 s), angles in radians.

const DEGREES: f64 = core::f64::consts::PI / 180.0;

/// How many foes fight one target hand to hand at once, and how many shoot at it.
pub const MELEE_TOKENS: usize = 2;
pub const RANGED_TOKENS: usize = 2;
/// A foe fights a target it sees within this; a shooter within this.
pub const ENGAGE_RANGE: f64 = 14.0;
pub const SHOOT_RANGE: f64 = 51.2;
/// Out of sight, a foe hunts where it last saw its target this long before it lets it go, and keeps its turn at it
/// this long (DFO's stale lease), so a moment behind a pillar does not lose its place.
pub const HUNT: f64 = 5.0;
pub const STALE: f64 = 1.5;
/// A foe notices a fighter it is not already fighting only within this much of where it faces, as DFO's do: half of
/// all round.
pub const SIGHT_ARC: f64 = 90.0 * DEGREES;

/// The ring the waiting stand on: this far outside their reach, with this much give either side. A waiting foe circles
/// at this share of its walk toward its place on the ring, which drifts this far round a second.
pub const RING_GAP: f64 = 1.5;
pub const RING_SLACK: f64 = 0.6;
pub const CIRCLE_PACE: f64 = 0.4;
pub const SLOT_TURN: f64 = 0.15;
/// Stepping back out of reach, at this share of a walk.
pub const STEP_PACE: f64 = 0.7;
/// After its blow a foe hops back at most this long, then holds its ground for between these before it waits again.
pub const RECOVER_HOP: f64 = 0.4;
pub const RECOVER: (f64, f64) = (0.8, 1.6);
/// A foe that has waited this long goes in, whatever the tokens say.
pub const PATIENCE: f64 = 6.0;

/// This share of its health lost inside the window, a foe backs off to a farther ring for a while, at most once a
/// cooldown; its poise this full, one that defends itself backs off before the next blow breaks it.
pub const HURT_SHARE: f64 = 0.25;
pub const HURT_WINDOW: f64 = 3.0;
pub const BACKOFF: f64 = 2.0;
pub const BACKOFF_GAP: f64 = 2.0;
pub const BACKOFF_COOLDOWN: f64 = 10.0;
pub const POISE_NEAR: f64 = 0.8;
/// A coward below this share of its health runs, once, for this long.
pub const FLEE_SHARE: f64 = 0.2;
pub const FLEE: f64 = 8.0;

/// A shooter closer than KITE_IN walks out to KITE_OUT, one burst of at most KITE_MAX, and not again for
/// KITE_COOLDOWN; caught or cornered it fights close for KITE_CORNERED. A ranged token held this long unused goes on.
pub const KITE_IN: f64 = 6.0;
pub const KITE_OUT: f64 = 7.0;
pub const KITE_MAX: f64 = 2.0;
pub const KITE_COOLDOWN: f64 = 8.0;
pub const KITE_CORNERED: f64 = 3.0;
pub const RANGED_LEASE: f64 = 5.0;

/// Walking somewhere, a foe turns first and steps only within this of its way, so no foe walks backwards.
pub const WALK_FACE: f64 = 45.0 * DEGREES;
/// A target turned this far from a foe has its back to it, and is open; so is one closing on it faster than this
/// inside the ring's near edge.
pub const BACK_TURNED: f64 = 110.0 * DEGREES;
pub const CLOSING: f64 = 0.5;
/// How fast a foe turns: DFO's 0.35 radians a classic tick of 1/16 s, a fighter squaring up.
pub const TURN: f64 = 0.35 * 16.0 / 60.0;
/// A foe runs to a spot farther than this.
pub const RUN_FROM: f64 = 5.0;
/// Foes steer apart inside this, by up to this share of a walk: DFO's push of 3 m/s, as steering.
pub const SPACING: f64 = 1.2;
pub const SPACING_PACE: f64 = 0.7;

/// A swing begins only with the foe's aim this near its target; in reach it waits between these first, which gives a
/// holder the moment DFO's motor gave it to wind up a telegraphed blow instead.
pub const SWING_FACE: f64 = 22.5 * DEGREES;
pub const SWING_DELAY: (f64, f64) = (0.3, 0.9);
/// A foe that guards keeps this much stamina for its guard when it swings.
pub const GUARD_RESERVE: f64 = 30.0;
/// Blocked this many times running by a guard still raised, a foe stops swinging into it.
pub const BLOCKED_ENOUGH: u8 = 2;

/// Telegraphed blows: DFO's one in ten a classic tick of 1/16 s for a holder in reach off its cooldown, with no other
/// wind-up within BLOW_NEAR of its target; and the cooldowns between one foe's blows by tier.
pub const BLOW_CHANCE: f64 = 0.1;
pub const CLASSIC_TICKS_A_TICK: f64 = 16.0 / 60.0;
pub const BLOW_NEAR: f64 = 20.0;
pub const COOLDOWN_ORDINARY: (f64, f64) = (8.0, 15.0);
pub const COOLDOWN_ELITE: (f64, f64) = (6.0, 11.0);
/// A wind-up is its shape's times U(WINDUP_VARY), an elite's times WINDUP_ELITE, never under WINDUP_LEAST.
pub const WINDUP_VARY: (f64, f64) = (0.9, 1.25);
pub const WINDUP_ELITE: f64 = 0.9;
pub const WINDUP_LEAST: f64 = 0.6;
/// An elite's blow is iron one time in this.
pub const IRON_ELITE: f64 = 1.0 / 3.0;
/// A feint: one wind-up in five, cut at this share of it, never two within this many wind-ups.
pub const FEINT_CHANCE: f64 = 0.2;
pub const FEINT_AT: f64 = 0.55;
pub const FEINT_GAP: u32 = 3;
/// A chain: at a landing, another blow at once this often, its wind-up this long and never under the least.
pub const CHAIN_CHANCE: f64 = 0.35;
pub const CHAIN_WINDUP: f64 = 0.6;
pub const CHAIN_LEAST: f64 = 0.55;
/// A wind-up ended, a foe waits this long at most for the room's word on whether its blow landed: the room judges
/// each player as their own screen showed it, which may lag.
pub const WORD_WAIT: f64 = 0.5;
/// An archer's shots aimed, one in this.
pub const AIMED_SHARE: f64 = 1.0 / 3.0;

/// The boss's second phase: at this share of its health, once, a roar this long as an iron ring; then its wind-ups and
/// cooldowns shortened by these, its blows harder by this, and its chains this long.
pub const PHASE_TWO: f64 = 0.35;
pub const ROAR: f64 = 1.2;
pub const PHASE_WINDUP: f64 = 0.75;
pub const PHASE_COOLDOWN: f64 = 0.6;
pub const PHASE_MIGHT: f64 = 1.25;
pub const PHASE_CHAINS: u32 = 2;

/// Answering a blow: a parry or a dodge is pressed between these many ticks before it lands, by the dice, as a
/// person's timing wanders: early in that span a parry's window has closed (it blocks instead) and a dodge is past its
/// perfect stretch. Never later than PRESS_LATEST before it, so the room sees the guard or the hop whichever fighter it
/// steps first. A guard is held this long past the blow it was raised for.
pub const PRESS_LEAD: (u64, u64) = (2, 14);
pub const PRESS_LATEST: u64 = 2;
pub const GUARD_AFTER: u64 = 4;
/// A swing threatens a foe within the striker's reach and this, the step it may take while its blow comes round.
pub const THREAT_MARGIN: f64 = 1.0;

/// A shooter waits between these after a shot.
pub const SHOT_GAP: (f64, f64) = (0.5, 1.5);
