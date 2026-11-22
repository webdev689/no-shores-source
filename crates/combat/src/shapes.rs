//! A foe's telegraphed blows, as DFO's TELL draws them: each a shape on the ground its foe winds up to, marked so
//! the player can read it, landing on whoever's feet stand in it when the wind-up ends. Iron ones cannot be guarded.

use crate::Surroundings;
use crate::sight::clear_line;
use crate::ticks;
use crate::tuning::{CHEST, STRIKE_HEIGHT};
use movement::blocks::{ground_at, pushed_out, slide};
use movement::{Block, Body, Near};

/// The shapes. A lunge and a charge are lanes ahead; a sweep an arc; a slam a disc just ahead; a ring an annulus about
/// the foe's feet, safe close in; a leap a disc where its target stood; an aimed shot a line its arrow flies along.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape {
    Lunge = 1,
    Sweep = 2,
    Slam = 3,
    Ring = 4,
    Charge = 5,
    Leap = 6,
    Aimed = 7,
}

const SHAPES: [Shape; 7] =
    [Shape::Lunge, Shape::Sweep, Shape::Slam, Shape::Ring, Shape::Charge, Shape::Leap, Shape::Aimed];

/// A shape's numbers: its wind-up in seconds; its length, half-width or radius in metres (an inner radius for the
/// ring, how far ahead for the slam); its arc's half-width; its blow's damage multiplier; how long a charge crosses
/// its lane or a leap is in the air at the end of the wind-up; and how long its foe is overreached when it misses.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShapeNumbers {
    pub windup: f64,
    pub length: f64,
    pub width: f64,
    pub inner: f64,
    pub half_arc: f64,
    pub damage: f64,
    pub travel: f64,
    pub punish: f64,
}

/// Each shape's numbers, DFO's.
#[must_use]
pub fn numbers(shape: Shape) -> ShapeNumbers {
    let plain = ShapeNumbers {
        windup: 0.0,
        length: 0.0,
        width: 0.0,
        inner: 0.0,
        half_arc: 0.0,
        damage: 1.0,
        travel: 0.0,
        punish: 1.0,
    };
    match shape {
        Shape::Lunge => ShapeNumbers { windup: 0.7, length: 4.5, width: 0.6, damage: 1.5, ..plain },
        Shape::Sweep => ShapeNumbers {
            windup: 0.8,
            length: 3.2,
            half_arc: 65.0 * core::f64::consts::PI / 180.0,
            damage: 1.25,
            punish: 0.8,
            ..plain
        },
        Shape::Slam => ShapeNumbers { windup: 0.9, length: 1.0, width: 2.0, damage: 1.75, punish: 1.2, ..plain },
        Shape::Ring => ShapeNumbers { windup: 1.0, length: 4.0, inner: 1.6, damage: 1.5, ..plain },
        Shape::Charge => {
            ShapeNumbers { windup: 0.9, length: 9.0, width: 0.8, damage: 1.5, travel: 0.45, punish: 1.4, ..plain }
        }
        Shape::Leap => ShapeNumbers { windup: 1.0, width: 1.8, damage: 1.6, travel: 0.35, punish: 1.2, ..plain },
        Shape::Aimed => ShapeNumbers { windup: 0.6, width: 0.25, damage: 1.4, ..plain },
    }
}

/// A charge is begun this far from its target at the least and the most; a leap from at least this far, at most this.
pub const CHARGE_FROM: (f64, f64) = (5.0, 12.0);
pub const LEAP_FROM: (f64, f64) = (3.0, 9.0);
/// An iron blow winds up this much longer.
pub const IRON_EXTRA: f64 = 0.2;
/// The last stretch of a wind-up, when its mark brightens; a body that leaves the shape in it dodged perfectly.
pub const NOW: f64 = 0.2;
pub const LATE: f64 = 0.25;
/// A lunge and a charge turn after their target through this share of the wind-up, this fast.
pub const TRACK_SHARE: f64 = 0.5;
pub const TRACK_TURN: f64 = 120.0 * core::f64::consts::PI / 180.0 / 60.0;

impl Shape {
    #[must_use]
    pub fn from_number(number: u8) -> Option<Self> {
        SHAPES.iter().copied().find(|shape| *shape as u8 == number)
    }

    /// Whether it turns after its target in the first part of its wind-up.
    #[must_use]
    pub fn tracks(self) -> bool {
        matches!(self, Shape::Lunge | Shape::Charge)
    }
}

/// What a foe's brain asks for when it begins a telegraphed blow: the shape, its wind-up in ticks (the brain varies
/// it), whether it is iron, the tick a feint is cut at (none: a real blow), the bearing it aims along, and how far
/// ahead its mark stands (a leap's landing, an aimed shot's line).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TelegraphOrder {
    pub shape: Shape,
    pub windup: u32,
    pub iron: bool,
    pub feint_at: Option<u32>,
    pub bearing: f64,
    pub ahead: f64,
}

/// A telegraphed blow winding up: its shape, ticks since it began, the wind-up's length, where the shape stands
/// (the foe's feet when it began) and the bearing it points, how far ahead a leap or an aimed shot reaches, whether it
/// is iron, the tick a feint is cut at, and the height a charge or a leap came down at once it lands.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Telegraph {
    pub shape: Shape,
    pub elapsed: u32,
    pub windup: u32,
    pub origin: [f64; 3],
    pub bearing: f64,
    pub ahead: f64,
    pub iron: bool,
    pub feint_at: Option<u32>,
    pub landed_z: Option<f64>,
}

impl Telegraph {
    /// The telegraph an order begins, from a foe standing at `origin`.
    #[must_use]
    pub fn begin(order: &TelegraphOrder, origin: [f64; 3]) -> Self {
        let iron_extra = if order.iron { ticks(IRON_EXTRA) } else { 0 };
        Telegraph {
            shape: order.shape,
            elapsed: 0,
            windup: order.windup.max(1) + iron_extra,
            origin,
            bearing: order.bearing,
            ahead: order.ahead,
            iron: order.iron,
            feint_at: order.feint_at,
            landed_z: None,
        }
    }

    /// How far through its wind-up it is, 0 to 1.
    #[must_use]
    pub fn progress(&self) -> f64 {
        f64::from(self.elapsed) / f64::from(self.windup.max(1))
    }

    /// The ticks of the wind-up's end in which a charge crosses its lane or a leap flies.
    #[must_use]
    pub fn travel_ticks(&self) -> u32 {
        ticks(numbers(self.shape).travel).min(self.windup)
    }

    /// Whether the point (x, y) on the ground stands in the shape.
    #[must_use]
    pub fn holds(&self, x: f64, y: f64) -> bool {
        let shape = numbers(self.shape);
        let (forward_x, forward_y) = (libm::sin(self.bearing), -libm::cos(self.bearing));
        let (from_x, from_y) = (x - self.origin[0], y - self.origin[1]);
        let along = from_x * forward_x + from_y * forward_y;
        let across = (from_x * forward_y - from_y * forward_x).abs();
        let distance = (from_x * from_x + from_y * from_y).sqrt();
        match self.shape {
            Shape::Lunge | Shape::Charge => (-0.3..=shape.length).contains(&along) && across <= shape.width,
            Shape::Sweep => {
                distance <= shape.length
                    && (distance < 0.5 || libm::acos((along / distance).clamp(-1.0, 1.0)) <= shape.half_arc)
            }
            Shape::Slam => {
                let ahead = along - shape.length;
                (ahead * ahead + across * across).sqrt() <= shape.width
            }
            Shape::Ring => (shape.inner..=shape.length).contains(&distance),
            Shape::Leap => {
                let ahead = along - self.ahead;
                (ahead * ahead + across * across).sqrt() <= shape.width
            }
            Shape::Aimed => (-0.3..=self.ahead).contains(&along) && across <= shape.width,
        }
    }

    /// Whether its blow strikes a body standing at `feet`: inside its shape on the ground, within a blow's height of
    /// its foe where it ends (a charge's or a leap's where it came down), and with no block between the body and where
    /// the blow comes from (a leap's landing, else its foe as it set off).
    #[must_use]
    pub fn strikes(&self, feet: [f64; 3], blocks: &[Block]) -> bool {
        let ends_z = self.landed_z.unwrap_or(self.origin[2]);
        let leap = self.landing().filter(|_| self.shape == Shape::Leap);
        let (from, from_z) = leap.map_or(([self.origin[0], self.origin[1]], self.origin[2]), |at| (at, ends_z));
        let chest = |x: f64, y: f64, z: f64| [x, y, z + CHEST];
        self.holds(feet[0], feet[1])
            && (feet[2] - ends_z).abs() <= STRIKE_HEIGHT
            && clear_line(blocks, chest(from[0], from[1], from_z), chest(feet[0], feet[1], feet[2]))
    }

    /// Where its foe's feet go at the end of a charge or a leap: along its lane, or to its disc.
    #[must_use]
    pub fn landing(&self) -> Option<[f64; 2]> {
        let reach = match self.shape {
            Shape::Charge => numbers(Shape::Charge).length,
            Shape::Leap => self.ahead,
            _ => return None,
        };
        Some([self.origin[0] + libm::sin(self.bearing) * reach, self.origin[1] - libm::cos(self.bearing) * reach])
    }
}

/// A charge crosses its lane and a leap flies to its disc in the last ticks of the wind-up.
pub(crate) fn travel<B: Near + ?Sized>(
    body: &Body,
    telegraph: &Telegraph,
    around: &Surroundings<'_, B>,
) -> Option<Body> {
    let landing = telegraph.landing()?;
    let travel = telegraph.travel_ticks();
    let begun = telegraph.windup.saturating_sub(travel);
    if telegraph.elapsed < begun || travel == 0 {
        return None;
    }
    let left = f64::from(telegraph.windup.saturating_sub(telegraph.elapsed).max(1));
    let (step_x, step_y) = ((landing[0] - body.x) / left, (landing[1] - body.y) / left);
    let share = f64::from(telegraph.elapsed - begun + 1) / f64::from(travel);
    let rise = if telegraph.shape == Shape::Leap { 4.8 * share * (1.0 - share) } else { 0.0 };
    let (x, y) = slide(around.blocks, around.terrain, body, step_x, step_y);
    // Off a drop its feet come down beside the block it slid off at its old height: it is set down clear of it.
    let feet = |x, y| ground_at(around.blocks, around.terrain, x, y, body.z) + rise;
    let (x, y) = pushed_out(around.blocks, around.terrain, x, y, body.height(), feet);
    let facing = telegraph.bearing;
    Some(Body { x, y, z: feet(x, y), vx: 0.0, vy: 0.0, vz: 0.0, facing, moving: true, ..*body })
}
