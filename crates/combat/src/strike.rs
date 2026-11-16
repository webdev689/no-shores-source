//! Who a swing's blow reaches: a fighter on another side, alive, within the weapon's reach and the stroke's arc
//! (close in, almost any way it faces), near the striker's own height, with nothing between them. The nearest first,
//! the soft lock's target before all, up to the stroke's count.

use crate::arms::{Stroke, WeaponClass, stroke_shape, weapon};
use crate::fighter::{Attack, Fighter, FighterId};
use crate::sight::{apart, bearing, clear_line, off};
use crate::tuning::{BODY_RADIUS, CHEST, CLOSE_ARC, CLOSE_IN, STRIKE_HEIGHT};
use movement::Block;

/// The farthest a stroke of this weapon reaches, from the striker's feet to the middle of a body it strikes.
#[must_use]
pub fn stroke_reach(melee: WeaponClass, stroke: Stroke) -> f64 {
    weapon(melee).reach + stroke_shape(stroke).reach + BODY_RADIUS
}

/// Whether a swing's blow, struck along `aim`, reaches a body standing at `feet`.
#[must_use]
pub fn reaches(striker: &Fighter, attack: &Attack, feet: [f64; 3], blocks: &[Block]) -> bool {
    let body = striker.body;
    let shape = stroke_shape(attack.stroke);
    let distance = apart([body.x, body.y], [feet[0], feet[1]]);
    let reach = stroke_reach(striker.arms.melee, attack.stroke);
    if distance > reach || (feet[2] - body.z).abs() > STRIKE_HEIGHT {
        return false;
    }
    let arc = if distance <= CLOSE_IN { CLOSE_ARC } else { shape.half_arc };
    let facing = off(striker.aim, bearing([body.x, body.y], [feet[0], feet[1]]));
    let chest = |at: [f64; 3]| [at[0], at[1], at[2] + CHEST];
    (distance < 1e-6 || facing <= arc) && clear_line(blocks, chest([body.x, body.y, body.z]), chest(feet))
}

/// The fighters a swing's blow lands on, from `fighters` (`(id, fighter)`): those it reaches on another side, alive,
/// the striker's soft-lock target first and then the nearest, up to its stroke's count.
#[must_use]
pub fn struck(
    striker_id: FighterId,
    striker: &Fighter,
    attack: &Attack,
    fighters: &[(FighterId, Fighter)],
    blocks: &[Block],
) -> Vec<FighterId> {
    let mut reached: Vec<(bool, f64, FighterId)> = fighters
        .iter()
        .filter(|(id, other)| *id != striker_id && other.side != striker.side && !other.dead())
        .filter(|(_, other)| reaches(striker, attack, [other.body.x, other.body.y, other.body.z], blocks))
        .map(|(id, other)| {
            let distance = apart([striker.body.x, striker.body.y], [other.body.x, other.body.y]);
            (striker.target != Some(*id), distance, *id)
        })
        .collect();
    reached.sort_by(|first, second| {
        first.0.cmp(&second.0).then(first.1.total_cmp(&second.1)).then(first.2.cmp(&second.2))
    });
    reached.into_iter().take(stroke_shape(attack.stroke).targets).map(|(_, _, id)| id).collect()
}
