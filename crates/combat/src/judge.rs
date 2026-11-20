//! A blow judged against the fighter it reaches, and what the verdict does to both: a parry staggers the striker and
//! opens a riposte; a guard takes the blow at a cost in stamina, or breaks; a dodge lets it pass, and a perfect one
//! earns a counter; anything else lands, filling poise until the fighter staggers.

use crate::arms::{OffHand, Ranged, Stroke, stroke_shape, weapon};
use crate::fighter::{Action, Attack, Cause, Fighter, FighterId, Swing};
use crate::shapes::{Shape, Telegraph, numbers};
use crate::sight::{bearing, off};
use crate::tuning::{
    BEHIND, COUNTER_DAMAGE, COUNTER_POISE, COUNTER_STAMINA, COUNTER_TICKS, FLINCH, GUARD_BROKEN, GUARD_BROKEN_TAKEN,
    KNOCKED_DOWN, PARRIED, POISE_BEHIND, POISE_IMMUNE, POISE_PER_WEIGHT, PUNISH_IRON, PUNISH_PERFECT, PUNISH_TAKEN,
    RIPOSTE_DAMAGE, STAGGER_TAKEN, STAMINA,
};

/// What struck the blow.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlowKind {
    Swing(Stroke),
    Telegraph(Shape),
    Shot(Ranged),
    /// A player's spell, by its number among the Arts' (1 Tempest to 9 Vanish, 10 a Duskraven's bolt): never parried or
    /// guarded.
    Spell(u8),
}

/// A blow on its way to a fighter: who struck it and from where, what it does, and what may stop it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Blow {
    pub striker: FighterId,
    pub kind: BlowKind,
    pub from: [f64; 2],
    pub damage: f64,
    pub poise: f64,
    /// The stamina a guard pays for it, before a shield's share.
    pub guard: f64,
    pub parryable: bool,
    pub blockable: bool,
    pub knocks_down: bool,
    /// What a guard lets through of it, times its share; and how long a stagger it causes lasts, times: its striker's
    /// gear.
    pub through: f64,
    pub stagger: f64,
    /// Its striker's weapon's element, by the gear's number, 0 for none: combat carries it, and the host weighs it
    /// against a shield.
    pub element: u8,
    /// Marked a crit by what struck it, whatever its striker holds (`status::crits`).
    pub crit: bool,
}

impl Blow {
    /// Whether it is a riposte: the one swing no guard can answer.
    #[must_use]
    pub fn riposte(&self) -> bool {
        matches!(self.kind, BlowKind::Swing(_)) && !self.parryable
    }
}

/// What a blow came to.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Verdict {
    Parried,
    Blocked { damage: f64, stamina: f64 },
    GuardBroken { damage: f64 },
    Dodged { perfect: bool },
    Hit { damage: f64, poise: f64 },
}

/// The blow a swing lands on `defender`: a riposte at the fighter its striker parried strikes harder and cannot be
/// guarded; a counter strikes harder and heavier.
#[must_use]
pub fn swing_blow(striker_id: FighterId, striker: &Fighter, attack: &Attack, defender: FighterId) -> Blow {
    let held = weapon(striker.arms.melee);
    let shape = stroke_shape(attack.stroke);
    let riposte = attack.swing == Swing::Riposte(defender);
    let counter = attack.swing == Swing::Counter;
    let damage = held.damage * shape.damage * striker.might;
    let weight = held.weight * POISE_PER_WEIGHT;
    let trim = &striker.trim;
    Blow {
        striker: striker_id,
        kind: BlowKind::Swing(attack.stroke),
        from: [striker.body.x, striker.body.y],
        damage: damage
            * if riposte {
                RIPOSTE_DAMAGE * trim.riposte
            } else if counter {
                COUNTER_DAMAGE * trim.counter
            } else {
                1.0
            },
        poise: weight * shape.poise * if counter { COUNTER_POISE } else { 1.0 } * trim.poise_given,
        guard: weight * shape.guard * trim.guard_wear,
        parryable: !riposte,
        blockable: !riposte,
        knocks_down: false,
        through: trim.guard_through,
        stagger: trim.stagger_given,
        element: 0,
        crit: false,
    }
}

/// The blow a telegraphed blow lands: its foe's weapon at the shape's multiplier, half again as heavy; an iron one
/// can be neither parried nor guarded, and an iron slam or ring knocks down.
#[must_use]
pub fn telegraph_blow(striker_id: FighterId, striker: &Fighter, telegraph: &Telegraph) -> Blow {
    let held = weapon(striker.arms.melee);
    let weight = held.weight * POISE_PER_WEIGHT * 1.5;
    Blow {
        striker: striker_id,
        kind: BlowKind::Telegraph(telegraph.shape),
        from: [telegraph.origin[0], telegraph.origin[1]],
        damage: held.damage * numbers(telegraph.shape).damage * striker.might,
        poise: weight,
        guard: weight,
        parryable: !telegraph.iron,
        blockable: !telegraph.iron,
        knocks_down: telegraph.iron && matches!(telegraph.shape, Shape::Slam | Shape::Ring),
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    }
}

/// The blow a shot lands: never parried, and guarded only behind a shield.
#[must_use]
pub fn shot_blow(shot: &crate::shots::Shot, from: [f64; 2]) -> Blow {
    let weight = shot.weight * POISE_PER_WEIGHT;
    Blow {
        striker: shot.owner,
        kind: BlowKind::Shot(shot.ranged),
        from,
        damage: shot.damage,
        poise: weight,
        guard: weight,
        parryable: false,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    }
}

/// What the blow comes to against the defender as it stands.
#[must_use]
pub fn judge(blow: &Blow, defender: &Fighter) -> Verdict {
    if let Some(perfect) = defender.dodging() {
        return Verdict::Dodged { perfect };
    }
    let toward = bearing([defender.body.x, defender.body.y], blow.from);
    let behind = off(defender.aim, toward) > BEHIND;
    if let Some(window) = defender.guarding() {
        let (arc, chip, share) = crate::tuning::guard_of(defender.arms.off_hand);
        let shield = defender.arms.off_hand == OffHand::Shield;
        let blockable = blow.blockable && (shield || !matches!(blow.kind, BlowKind::Shot(_)));
        if off(defender.aim, toward) <= arc {
            if window && blow.parryable {
                return Verdict::Parried;
            }
            if blockable {
                let stamina = blow.guard * share * defender.trim.guard_stamina;
                if stamina >= defender.stamina {
                    return Verdict::GuardBroken { damage: taken(defender, blow, behind) * GUARD_BROKEN_TAKEN };
                }
                return Verdict::Blocked {
                    damage: blow.damage * chip * blow.through * telegraphed(defender, blow),
                    stamina,
                };
            }
        }
    }
    Verdict::Hit { damage: taken(defender, blow, behind), poise: blow.poise * if behind { POISE_BEHIND } else { 1.0 } }
}

/// A blow's damage as this fighter takes it: more while staggered (but a riposte, the stagger's own answer, does not
/// count it twice) or overreached; less from behind or telegraphed as its gear trims.
fn taken(defender: &Fighter, blow: &Blow, behind: bool) -> f64 {
    let staggered = if defender.staggered() && !blow.riposte() { STAGGER_TAKEN } else { 1.0 };
    let punished = if defender.punished > 0 { PUNISH_TAKEN } else { 1.0 };
    let from_behind = if behind { defender.trim.behind_taken } else { 1.0 };
    blow.damage * staggered * punished * from_behind * telegraphed(defender, blow)
}

/// What of a telegraphed blow this fighter's gear lets reach them, through a guard or not.
fn telegraphed(defender: &Fighter, blow: &Blow) -> f64 {
    if matches!(blow.kind, BlowKind::Telegraph(_)) { defender.trim.telegraph_taken } else { 1.0 }
}

/// The defender after the verdict.
#[must_use]
pub fn suffer(defender: &Fighter, blow: &Blow, verdict: &Verdict) -> Fighter {
    let mut next = *defender;
    if next.target.is_none() {
        next.target = Some(blow.striker);
    }
    match *verdict {
        Verdict::Parried => {
            // The riposte is at the fighter it parried, so the lock takes that one.
            next.target = Some(blow.striker);
            next.action = Action::Parry { elapsed: 0 };
            next.riposte = Some((blow.striker, PARRIED));
            next.missed_parry = 0;
        }
        Verdict::Blocked { damage, stamina } => {
            next.health -= damage;
            next.stamina = (next.stamina - stamina).max(0.0);
            next.stamina_rest = 0;
        }
        Verdict::GuardBroken { damage } => {
            next.health -= damage;
            next.stamina = 0.0;
            next.stamina_rest = 0;
            next.action = Action::Staggered { left: GUARD_BROKEN, cause: Cause::GuardBroken };
        }
        Verdict::Dodged { perfect } => {
            if perfect {
                next.counter = COUNTER_TICKS;
                next.stamina = (next.stamina + COUNTER_STAMINA).min(STAMINA);
            }
        }
        Verdict::Hit { damage, poise } => landed(&mut next, blow, damage, poise),
    }
    if next.health <= 0.0 {
        next.health = 0.0;
        next.action = Action::Dead { elapsed: 0 };
    }
    next
}

/// A blow that landed: its poise fills the meter (not through an iron wind-up, nor while no poise stagger can begin),
/// and the fighter staggers when the meter is full or it was overreached (that opening was earned, immune or not), is
/// knocked down by an iron slam, or as a player flinches.
fn landed(next: &mut Fighter, blow: &Blow, damage: f64, poise: f64) {
    next.health -= damage;
    let iron_windup = matches!(next.action, Action::Telegraph(telegraph) if telegraph.iron);
    if !iron_windup && next.poise_immune == 0 {
        let drawn = if next.arms == crate::arms::BARE_HANDS { 1.0 } else { next.trim.drawn_poise_taken };
        next.poise = (next.poise + poise * next.trim.poise_taken * drawn).min(next.poise_max);
        next.poise_rest = 0;
    }
    let stagger = (f64::from(next.weight.stagger_ticks()) * blow.stagger).round() as u32;
    let may_stagger = (next.poise_immune == 0 || next.punished > 0) && !next.staggered();
    if may_stagger && (next.punished > 0 || next.poise >= next.poise_max) && !iron_windup {
        next.action = Action::Staggered { left: stagger, cause: Cause::Poise };
        next.poise = 0.0;
        next.punished = 0;
        next.poise_immune = stagger + POISE_IMMUNE;
    } else if blow.knocks_down {
        next.action = Action::Down { left: KNOCKED_DOWN };
    } else if next.side.is_players() && flinches(&next.action) {
        next.action = Action::Flinch { left: FLINCH };
    }
}

/// A player flinches out of rest, a swing's wind-up, a guard turned the wrong way or a draw; not out of a swing's
/// follow-through (that would end it sooner), a reload (that would load it sooner), a flinch already under way (blow
/// on blow would hold them for good), a dodge's end, or anything else that already holds them.
fn flinches(action: &Action) -> bool {
    match action {
        Action::Idle | Action::Guard { .. } | Action::Draw { .. } => true,
        Action::Attack(attack) => attack.elapsed < attack.strike,
        _ => false,
    }
}

/// The striker after the verdict: parried, it staggers open to the riposte; landing or guarded, its lock takes the
/// fighter it struck.
#[must_use]
pub fn answered(striker: &Fighter, defender: FighterId, verdict: &Verdict) -> Fighter {
    let mut next = *striker;
    match verdict {
        Verdict::Parried => next.action = Action::Staggered { left: PARRIED, cause: Cause::Parried },
        // A blow that lands on several leaves the lock where it was; a lock takes the one struck only if it had none.
        Verdict::Hit { .. } | Verdict::Blocked { .. } | Verdict::GuardBroken { .. } => {
            next.target = next.target.or(Some(defender));
        }
        Verdict::Dodged { .. } => {}
    }
    next
}

/// A foe whose telegraphed blow found no one: overreached for its shape's punish (longer for iron, longer again when
/// it was dodged perfectly), taking more, and staggered by the first blow landed.
#[must_use]
pub fn overreached(foe: &Fighter, telegraph: &Telegraph, perfectly_dodged: bool) -> Fighter {
    let punish = crate::ticks(numbers(telegraph.shape).punish) + if telegraph.iron { PUNISH_IRON } else { 0 };
    let punish = if perfectly_dodged { crate::ticks(f64::from(punish) / 60.0 * PUNISH_PERFECT) } else { punish };
    Fighter { action: Action::Overreach { left: punish }, punished: punish, ..*foe }
}
