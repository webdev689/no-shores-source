//! A foe's answers to blows at it, the fight Overlook adds to DFO's brain. Seeing a swing begin or a shot loosed at
//! it, a foe waits its kind's reaction time, then parries (pressing its guard so the parry window spans the landing),
//! blocks, dodges aside, or takes it, by its kind's shares and what its stamina and its own action allow. And the
//! openings a fight gives it: the riposte a parry earned, the counter a perfect dodge earned, and a target spent in its
//! own swing's follow-through, staggered, down or drawing a bow.

use crate::brain::Brain;
use crate::dice::Purpose;
use crate::senses::Here;
use crate::steer::Ask;
use crate::tuning::{GUARD_AFTER, PRESS_LATEST, PRESS_LEAD, THREAT_MARGIN};
use combat::arms::{OffHand, stroke_shape, weapon};
use combat::fighter::{Action, Attack};
use combat::shots::shot_numbers;
use combat::sight::{apart, bearing, off};
use combat::tuning::{BODY_RADIUS, DODGE_STAMINA};
use combat::{CombatInput, FighterId, Stroke};
use core::f64::consts::FRAC_PI_2;

/// A blow coming at it: who, when it was seen begun, and the tick it lands (none for a shot, timed by its distance
/// when it is weighed).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Threat {
    pub by: FighterId,
    pub seen: u64,
    pub lands: Option<u64>,
}

/// How a foe answers a blow.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Answer {
    Parry,
    Guard,
    Dodge,
}

/// An answer under way: to whose blow, the tick its button is pressed, the tick it ends, and which side a dodge
/// takes (1 right, -1 left).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Defence {
    pub answer: Answer,
    pub from: FighterId,
    pub press: u64,
    pub until: u64,
    pub side: f64,
}

/// The blow it has seen coming and not yet weighed, and the answer under way.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Reactions {
    pub threat: Option<Threat>,
    pub defence: Option<Defence>,
}

impl Reactions {
    /// A swing seen begun: it lands when its strike comes round. The sooner of two is the one to answer.
    pub fn saw_swing(&mut self, by: FighterId, attack: &Attack, tick: u64) {
        let lands = tick + u64::from(attack.strike.saturating_sub(attack.elapsed));
        if self.threat.and_then(|threat| threat.lands).is_none_or(|sooner| lands < sooner) {
            self.threat = Some(Threat { by, seen: tick, lands: Some(lands) });
        }
    }

    pub fn saw_shot(&mut self, by: FighterId, tick: u64) {
        if self.threat.is_none() {
            self.threat = Some(Threat { by, seen: tick, lands: None });
        }
    }
}

/// Whether a fighter would swing now: ready, with stamina.
fn can_swing(action: &Action) -> bool {
    matches!(action, Action::Idle | Action::Guard { .. } | Action::Parry { .. })
}

/// The answer it settles on for a threat its reaction time has passed, if any: whether the blow is at it at all, then
/// its kind's shares, then what its action and stamina allow, then whether there is time.
fn weigh(here: &Here<'_, '_>, threat: &Threat) -> Option<Defence> {
    let tick = here.tick();
    let striker = here.enemy(threat.by)?;
    let at = here.at();
    let from = [striker.body.x, striker.body.y];
    let distance = apart(from, at);
    let facing = off(striker.aim, bearing(from, at));
    let lands = match threat.lands {
        Some(lands) => {
            let Action::Attack(attack) = striker.action else { return None };
            let reach = weapon(striker.arms.melee).reach + stroke_shape(attack.stroke).reach + BODY_RADIUS;
            let aimed_here = striker.target == Some(here.me) || facing <= stroke_shape(attack.stroke).half_arc + 0.5;
            (distance <= reach + THREAT_MARGIN && aimed_here).then_some(lands)?
        }
        None => {
            let speed = shot_numbers(striker.arms.ranged?).0;
            if speed <= 0.0 || facing > 0.2 {
                return None;
            }
            threat.seen + Here::ticks(distance / speed)
        }
    };
    let shot = threat.lands.is_none();
    let numbers = &here.numbers;
    let shield = here.fighter.arms.off_hand == OffHand::Shield;
    let roll = here.dice.roll(Purpose::Answer);
    let parry = if shot { 0.0 } else { numbers.parry };
    let block = if shot && !shield {
        0.0
    } else if shot {
        numbers.parry + numbers.block
    } else {
        numbers.block
    };
    let answer = if roll < parry {
        Answer::Parry
    } else if roll < parry + block {
        Answer::Guard
    } else if roll < parry + block + numbers.dodge {
        Answer::Dodge
    } else {
        return None;
    };
    let fighter = &here.fighter;
    let answer = match (answer, fighter.action) {
        // A guard held, or one let fall with its window unused, cannot be pressed afresh into a parry: the press would
        // be rushed and open no window.
        (Answer::Parry, Action::Guard { .. }) => Answer::Guard,
        (Answer::Parry, _) if fighter.missed_parry > 0 => Answer::Guard,
        (Answer::Parry | Answer::Guard, Action::Idle | Action::Guard { .. } | Action::Parry { .. }) => answer,
        (Answer::Dodge, Action::Idle | Action::Guard { .. } | Action::Parry { .. }) => answer,
        (Answer::Dodge, Action::Attack(own)) if own.elapsed + 1 != own.strike => answer,
        _ => return None,
    };
    if answer == Answer::Dodge && fighter.stamina < DODGE_STAMINA {
        return None;
    }
    let press = tick.max(lands.saturating_sub(PRESS_LEAD));
    let press = match answer {
        Answer::Guard if tick < lands => tick,
        Answer::Parry | Answer::Dodge if press + PRESS_LATEST <= lands => press,
        Answer::Parry if tick < lands => return Some(defence(here, Answer::Guard, threat.by, tick, lands)),
        _ => return None,
    };
    Some(defence(here, answer, threat.by, press, lands))
}

fn defence(here: &Here<'_, '_>, answer: Answer, from: FighterId, press: u64, lands: u64) -> Defence {
    let side = if here.dice.roll(Purpose::Side) < 0.5 { -1.0 } else { 1.0 };
    let until = if answer == Answer::Dodge { press + 1 } else { lands + GUARD_AFTER };
    Defence { answer, from, press, until, side }
}

/// What its answer to a blow asks this tick, if one is under way or due: weighing a seen threat once its reaction
/// time has passed, then holding the guard, waiting to press it, or hopping aside.
pub fn defend(brain: &mut Brain, here: &Here<'_, '_>) -> Option<Ask> {
    let tick = here.tick();
    if let Some(threat) = brain.reactions.threat
        && tick >= threat.seen + here.numbers.reaction
    {
        brain.reactions.threat = None;
        let busy = brain.reactions.defence.is_some_and(|defence| defence.until >= tick);
        if !busy && let Some(defence) = weigh(here, &threat) {
            brain.reactions.defence = Some(defence);
        }
    }
    let defence = brain.reactions.defence?;
    // A parry or a perfect dodge earned an answer: the guard comes down for it at once.
    if tick > defence.until || here.fighter.riposte.is_some() || here.fighter.counter > 0 {
        brain.reactions.defence = None;
        return None;
    }
    let toward =
        here.find(defence.from).map_or(brain.heading, |striker| bearing(here.at(), [striker.body.x, striker.body.y]));
    let mut ask = Ask::facing(toward);
    match defence.answer {
        Answer::Guard | Answer::Parry => ask.combat.guard = tick >= defence.press,
        Answer::Dodge if tick >= defence.press => {
            // Aside and a little back, still facing the blow, so a counter can follow.
            let way = toward + defence.side * FRAC_PI_2 + defence.side * 0.4;
            ask = Ask { unspaced: true, ..Ask::stepping(way, 1.0, toward) };
            ask.combat.dodge = true;
        }
        Answer::Dodge => {}
    }
    Some(ask)
}

/// Whether a target is open to a blow now: spent in its swing's follow-through, staggered, down, overreached or
/// tending a bow.
#[must_use]
pub fn spent(action: &Action) -> bool {
    match action {
        Action::Attack(attack) => attack.elapsed > attack.strike,
        Action::Staggered { .. }
        | Action::Down { .. }
        | Action::Overreach { .. }
        | Action::Draw { .. }
        | Action::Reload { .. } => true,
        _ => false,
    }
}

/// An opening it should strike now, and at whom: the riposte its parry earned, the counter its perfect dodge earned,
/// or, in its turn (`engaged`), its target spent within reach: the turns ration who comes in even against a spent
/// target. A chop: the heaviest blow, and the one that breaks a guard.
pub fn opening(
    here: &Here<'_, '_>,
    target: Option<(FighterId, bool)>,
    engaged: bool,
) -> Option<(FighterId, CombatInput)> {
    let fighter = &here.fighter;
    if !can_swing(&fighter.action) || fighter.stamina <= 0.0 || here.numbers.shooter {
        return None;
    }
    let reach = weapon(fighter.arms.melee).reach + BODY_RADIUS;
    let near =
        |id: FighterId| here.enemy(id).is_some_and(|other| apart(here.at(), [other.body.x, other.body.y]) <= reach);
    let riposte = fighter.riposte.map(|(foe, _)| foe).filter(|foe| near(*foe));
    let whom = riposte.or_else(|| {
        let (target, seen) = target?;
        let open = fighter.counter > 0 || (engaged && here.enemy(target).is_some_and(|other| spent(&other.action)));
        (seen && open && near(target)).then_some(target)
    })?;
    Some((whom, CombatInput { attack: Some(Stroke::Down), ..CombatInput::default() }))
}
