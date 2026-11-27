//! Every number a fight turns on, in one place: seconds as ticks of 1/60 s, distances in metres, angles in radians.

use crate::arms::OffHand;

const DEGREES: f64 = core::f64::consts::PI / 180.0;

/// Stamina: the pool, how long it rests after being spent before it comes back, and how fast.
pub const STAMINA: f64 = 100.0;
pub const STAMINA_REST: u32 = 30;
pub const STAMINA_PER_TICK: f64 = 45.0 / 60.0;
/// Holding a guard, stamina comes back this much slower.
pub const STAMINA_GUARDING: f64 = 0.4;

/// A player's health and poise; a foe's are its kind's.
pub const PLAYER_HEALTH: f64 = 100.0;
pub const PLAYER_POISE: f64 = 40.0;
/// A player's weapon reaches this much further than its class's own; a foe's reaches its class's.
pub const PLAYER_REACH: f64 = 1.1;
/// A blow's poise is its weapon's weight times this, times its stroke's share.
pub const POISE_PER_WEIGHT: f64 = 10.0;
/// From behind (past this off the fighter's aim), a blow weighs half again.
pub const BEHIND: f64 = 110.0 * DEGREES;
pub const POISE_BEHIND: f64 = 1.5;
/// Poise drains a quarter of the meter a second once nothing has filled it for this long.
pub const POISE_REST: u32 = 120;
/// After a poise stagger ends, no new one for this long.
pub const POISE_IMMUNE: u32 = 180;
/// A staggered fighter takes this much more.
pub const STAGGER_TAKEN: f64 = 1.25;

/// A player's healing charges: how many they hold at most, the share of their most health each heals, and how long a
/// drink lasts before its health comes (about a second).
pub const CHARGES: u8 = 3;
pub const DRINK_HEALS: f64 = 0.4;
pub const DRINK_TICKS: u32 = 60;

/// A press is kept this many ticks: one made while the fighter is busy (a dodge in a swing's blow, a guard late in a
/// wind-up) is acted on as soon as it can be.
pub const PRESS_KEPT: u8 = 8;
/// A swap between loadouts, the weapon held changed: no blow or shot starts for this long. A click or a pull made in it
/// is kept for its end.
pub const SWAP_TICKS: u32 = 24;

/// A swing: moving while it is struck, and how fast its aim turns after the soft lock's target.
pub const ATTACK_PACE: f64 = 0.35;
pub const AIM_TURN: f64 = 540.0 * DEGREES / 60.0;
/// The soft lock steers a blow at its target when the target is within the weapon's reach and this.
pub const STEER_REACH: f64 = 2.5;

/// The guard: a player's press opens a parry window this long, a quarter of a second (a foe's, `FOE_PARRY_WINDOW`); a
/// press this soon after an unused window opens none.
pub const PARRY_WINDOW: u32 = 15;
/// A foe's press opens a shorter window: it reads a swing at the fight's pace, and the lead its raised guard needs to
/// block a blow rather than parry it is short with it.
pub const FOE_PARRY_WINDOW: u32 = 9;
pub const PARRY_RUSHED: u32 = 30;

/// The parry window a side's press opens.
#[must_use]
pub fn parry_window(player: bool) -> u32 {
    if player { PARRY_WINDOW } else { FOE_PARRY_WINDOW }
}
/// The guard's arc either side of its aim, by what the left hand holds, and how fast it turns.
pub const GUARD_ARC: f64 = 60.0 * DEGREES;
pub const SHIELD_ARC: f64 = 80.0 * DEGREES;
pub const GUARD_TURN: f64 = 720.0 * DEGREES / 60.0;
/// Moving while guarding.
pub const GUARD_PACE: f64 = 0.45;
/// A blocked blow's damage gets through at this share; a shield takes the guard's stamina at this share.
pub const CHIP_WEAPON: f64 = 0.2;
pub const CHIP_SHIELD: f64 = 0.05;
pub const SHIELD_GUARD: f64 = 0.6;
/// A guard broken by a blow it could not pay for: staggered this long, and half the blow gets through.
pub const GUARD_BROKEN: u32 = 48;
pub const GUARD_BROKEN_TAKEN: f64 = 0.5;

/// A parry: its deflect plays this long; the parried fighter is staggered this long, open to a riposte.
pub const PARRY_PLAYS: u32 = 18;
pub const PARRIED: u32 = 54;
/// A riposte strikes this much harder, and no guard stops it.
pub const RIPOSTE_DAMAGE: f64 = 2.0;

/// The dodge: what it costs, its hop (rise in m/s and speed along the ground), how long it lasts, when blows pass
/// through it, the first stretch of that which is a perfect dodge, and when a swing may follow it.
pub const DODGE_STAMINA: f64 = 22.0;
pub const DODGE_LIFT: f64 = 3.0;
pub const DODGE_SPEED: f64 = 10.0;
pub const DODGE_TICKS: u32 = 26;
pub const DODGE_SAFE: (u32, u32) = (1, 18);
pub const DODGE_PERFECT: u32 = 12;
pub const DODGE_ATTACK: u32 = 18;
/// A perfect dodge's counter: how long it waits for a swing, and what that swing does; and the stamina it gives back.
pub const COUNTER_TICKS: u32 = 48;
pub const COUNTER_DAMAGE: f64 = 1.5;
pub const COUNTER_POISE: f64 = 2.0;
pub const COUNTER_STAMINA: f64 = 15.0;

/// A player struck and not guarding flinches this long, and may dodge out of it this far in.
pub const FLINCH: u32 = 15;
pub const FLINCH_DODGE: u32 = 8;
/// Knocked down by an iron slam.
pub const KNOCKED_DOWN: u32 = 60;

/// A missed telegraphed blow leaves its foe overreached, taking this much more; a perfect dodge stretches the window.
pub const PUNISH_TAKEN: f64 = 1.3;
pub const PUNISH_PERFECT: f64 = 1.5;
pub const PUNISH_IRON: u32 = 18;

/// The soft lock: how far it takes a target, how far it holds one, the arc it looks in (it lets go the tick the look
/// leaves it), and for how long out of sight.
pub const LOCK_RANGE: f64 = 9.0;
pub const LOCK_BREAK: f64 = 15.0;
pub const LOCK_ARC: f64 = 70.0 * DEGREES;
pub const LOCK_UNSEEN_TICKS: u32 = 90;
/// A swing or a guard keeps its lock's target over a better one unless that one is better by this much (in the score
/// `choose` ranks by), so the lock does not flick between two foes side by side.
pub const LOCK_KEEP: f64 = 0.3;

/// A body's radius and height, as blows and shots find it.
pub const BODY_RADIUS: f64 = 0.35;
pub const BODY_HEIGHT: f64 = 1.8;
/// A chest stands this high over its feet: where blows, shots and sight are aimed.
pub const CHEST: f64 = 1.1;
/// A blow reaches a body within this much height of the striker's feet.
pub const STRIKE_HEIGHT: f64 = 1.4;
/// Close in, a blow reaches round to this off its aim whatever its stroke.
pub const CLOSE_IN: f64 = 0.6;
pub const CLOSE_ARC: f64 = 100.0 * DEGREES;

/// How long the dead lie before a player stands again, or a foe is gone.
pub const RESPAWN: u32 = 240;
pub const FOE_GONE: u32 = 600;

/// The guard's arc and how much of a blow gets through, for what the left hand holds.
#[must_use]
pub fn guard_of(off_hand: OffHand) -> (f64, f64, f64) {
    if off_hand == OffHand::Shield { (SHIELD_ARC, CHIP_SHIELD, SHIELD_GUARD) } else { (GUARD_ARC, CHIP_WEAPON, 1.0) }
}
