//! Telegraphed blows, as DFO's TELL throws them: who winds one up and when, which shape, how long, whether it is iron,
//! whether it is a feint, what chains after it, and the boss's roar into its second phase. The brain only orders a
//! blow; the combat rules wind it up, and the room judges its landing.

use crate::brain::Brain;
use crate::dice::Purpose;
use crate::senses::{Here, Sight};
use crate::tuning::{
    AIMED_SHARE, BLOW_CHANCE, BLOW_NEAR, CHAIN_CHANCE, CHAIN_LEAST, CHAIN_WINDUP, CLASSIC_TICKS_A_TICK, COOLDOWN_ELITE,
    COOLDOWN_ORDINARY, FEINT_AT, FEINT_CHANCE, FEINT_GAP, IRON_ELITE, PHASE_CHAINS, PHASE_COOLDOWN, PHASE_TWO,
    PHASE_WINDUP, ROAR, WINDUP_ELITE, WINDUP_LEAST, WINDUP_VARY,
};
use combat::fighter::{Action, Weight};
use combat::shapes::{CHARGE_FROM, IRON_EXTRA, LEAP_FROM, Shape, TelegraphOrder, numbers};
use combat::sight::{apart, clear_line};

/// A blow it ordered: the order, and whether its wind-up has been seen begun.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Windup {
    pub order: TelegraphOrder,
    pub begun: bool,
}

/// What a foe keeps for its telegraphed blows: when it may throw again, the blow winding up, how many it has wound up
/// and when it last feinted, its last shape, whether its last landed (a chain may follow) and how many have chained,
/// and its second phase.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Tells {
    pub blow_ready: u64,
    pub windup: Option<Windup>,
    pub windups: u32,
    pub last_feint: Option<u32>,
    pub last: Option<Shape>,
    pub landed: bool,
    pub chained: u32,
    pub phase_two: bool,
    pub roar: bool,
}

/// What comes of a blow's wind-up ending: a feint's plain swing at once, a chained blow, or nothing more: its turn
/// spent.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum After {
    Swing,
    Chain(TelegraphOrder),
    Spent,
}

const GAP_CLOSERS: [Shape; 2] = [Shape::Charge, Shape::Leap];

/// A holder in reach winds one up with DFO's one in ten a classic tick, here as a chance a tick of 1/60 s.
fn chance_a_tick() -> f64 {
    1.0 - libm::pow(1.0 - BLOW_CHANCE, CLASSIC_TICKS_A_TICK)
}

/// A wind-up's ticks: `base` seconds times U(WINDUP_VARY) when it is drawn (a chain's is not), quicker for an elite and
/// in a second phase, never under `least`. Iron's extra the combat rules add.
fn windup_ticks(here: &Here<'_, '_>, tells: &Tells, base: f64, drawn: bool, least: f64) -> u32 {
    let mut seconds = base * if drawn { here.dice.between(Purpose::Windup, WINDUP_VARY) } else { 1.0 };
    if here.numbers.elite {
        seconds *= WINDUP_ELITE;
    }
    if tells.phase_two {
        seconds *= PHASE_WINDUP;
    }
    combat::ticks(seconds.max(least))
}

/// Ticks to the next blow after one: by tier, shorter in a second phase.
fn cooldown(here: &Here<'_, '_>, tells: &Tells) -> u64 {
    let range = if here.numbers.elite { COOLDOWN_ELITE } else { COOLDOWN_ORDINARY };
    let seconds = here.dice.between(Purpose::Cooldown, range) * if tells.phase_two { PHASE_COOLDOWN } else { 1.0 };
    Here::ticks(seconds)
}

/// Iron: a heavy body's slam and ring, and one elite blow in three.
fn iron(here: &Here<'_, '_>, shape: Shape) -> bool {
    let heavy = matches!(here.numbers.weight, Weight::Heavy | Weight::Massive);
    (heavy && matches!(shape, Shape::Slam | Shape::Ring))
        || (here.numbers.elite && here.dice.roll(Purpose::Iron) < IRON_ELITE)
}

/// The order for a blow of `shape` along `bearing`, its cooldown begun. A blade of the higher tier feints one wind-up
/// in five, never two within three, never a chain's, a gap-closer's or a shot's.
fn order(
    brain: &mut Brain,
    here: &Here<'_, '_>,
    shape: Shape,
    bearing: f64,
    ahead: f64,
    chain: bool,
) -> TelegraphOrder {
    let tells = &mut brain.tells;
    let windup = if chain {
        windup_ticks(here, tells, CHAIN_WINDUP, false, CHAIN_LEAST)
    } else {
        windup_ticks(here, tells, numbers(shape).windup, true, WINDUP_LEAST)
    };
    let iron = iron(here, shape);
    tells.windups += 1;
    let since_feint = tells.last_feint.map_or(u32::MAX, |last| tells.windups - last);
    let may_feint = here.numbers.feints && !chain && shape != Shape::Aimed && !GAP_CLOSERS.contains(&shape);
    let feint_at =
        (may_feint && since_feint >= FEINT_GAP && here.dice.roll(Purpose::Feint) < FEINT_CHANCE).then(|| {
            tells.last_feint = Some(tells.windups);
            let whole = windup + if iron { combat::ticks(IRON_EXTRA) } else { 0 };
            combat::ticks(f64::from(whole) * FEINT_AT / 60.0)
        });
    let order = TelegraphOrder { shape, windup, iron, feint_at, bearing, ahead };
    tells.blow_ready = here.tick() + u64::from(windup) + cooldown(here, tells);
    tells.windup = Some(Windup { order, begun: false });
    tells.last = Some(shape);
    if !chain {
        tells.chained = 0;
    }
    order
}

/// Whether another fighter winds a blow up within BLOW_NEAR of a spot: one at a time near a target.
#[must_use]
pub fn windup_near(here: &Here<'_, '_>, spot: [f64; 3]) -> bool {
    here.world.fighters.iter().any(|(id, other)| {
        *id != here.me
            && matches!(other.action, Action::Telegraph(telegraph)
                if apart([telegraph.origin[0], telegraph.origin[1]], [spot[0], spot[1]]) <= BLOW_NEAR)
    })
}

/// The shapes it may throw at its target from here: in reach its blows of reach; out of it the gap-closers whose band
/// it stands in, a charge's lane and a leap's line clear of the blocks.
fn pool(here: &Here<'_, '_>, sight: &Sight, reach: f64) -> Vec<Shape> {
    let near = sight.distance <= reach + 0.5;
    let feet = here.feet();
    here.numbers
        .shapes
        .iter()
        .copied()
        .filter(|shape| *shape != Shape::Aimed && GAP_CLOSERS.contains(shape) != near)
        .filter(|shape| match shape {
            Shape::Charge => {
                let length = numbers(Shape::Charge).length.min(sight.distance + 1.0);
                let from = [feet[0], feet[1], feet[2] + 0.9];
                let to = [
                    feet[0] + libm::sin(sight.toward) * length,
                    feet[1] - libm::cos(sight.toward) * length,
                    feet[2] + 0.9,
                ];
                (CHARGE_FROM.0..=CHARGE_FROM.1).contains(&sight.distance) && clear_line(here.world.blocks, from, to)
            }
            Shape::Leap => (LEAP_FROM.0..=LEAP_FROM.1).contains(&sight.distance) && sight.seen,
            _ => true,
        })
        .collect()
}

/// A holder's telegraphed blow at its target, if it throws one this tick: off its cooldown, ready, nobody else winding
/// up near its target, a shape that reaches, and the roll (unless `forced`, as against a guard it will not swing into).
pub fn throw(
    brain: &mut Brain,
    here: &Here<'_, '_>,
    sight: &Sight,
    reach: f64,
    forced: bool,
) -> Option<TelegraphOrder> {
    let ready = matches!(here.fighter.action, Action::Idle) && here.tick() >= brain.tells.blow_ready && sight.seen;
    if !ready || windup_near(here, sight.spot) {
        return None;
    }
    let shapes = pool(here, sight, reach);
    if shapes.is_empty() || !(forced || here.dice.roll(Purpose::Blow) < chance_a_tick()) {
        return None;
    }
    let pick = (here.dice.roll(Purpose::Shape) * shapes.len() as f64) as usize;
    let shape = shapes[pick.min(shapes.len() - 1)];
    let ahead = if shape == Shape::Leap { sight.distance.min(LEAP_FROM.1) } else { 0.0 };
    Some(order(brain, here, shape, sight.toward, ahead, false))
}

/// An archer's aimed shot in place of a plain one, one in three, when it may throw.
pub fn aimed(brain: &mut Brain, here: &Here<'_, '_>, sight: &Sight) -> Option<TelegraphOrder> {
    let ready = here.tick() >= brain.tells.blow_ready && !windup_near(here, sight.spot);
    let wants = here.numbers.shapes.contains(&Shape::Aimed) && here.dice.roll(Purpose::Aimed) < AIMED_SHARE;
    (ready && wants).then(|| order(brain, here, Shape::Aimed, sight.toward, sight.distance, false))
}

/// What follows a wind-up that has ended: a feint's swing at once; a chain after a blow that landed; else the blow was
/// its turn, spent. None while it winds up, or when no wind-up of its ended.
pub fn follow(brain: &mut Brain, here: &Here<'_, '_>, sight: Option<&Sight>) -> Option<After> {
    let windup = brain.tells.windup?;
    if matches!(here.fighter.action, Action::Telegraph(_)) {
        brain.tells.windup = Some(Windup { begun: true, ..windup });
        return None;
    }
    brain.tells.windup = None;
    let landed = std::mem::take(&mut brain.tells.landed);
    if !windup.begun {
        return None;
    }
    if windup.order.feint_at.is_some() {
        return Some(After::Swing);
    }
    let chained = landed && matches!(here.fighter.action, Action::Idle);
    Some(chained.then(|| chain(brain, here, sight)).flatten().map_or(After::Spent, After::Chain))
}

/// A chain after a blow that landed, for a foe that chains (an elite): at most one blow after a first (two in a second
/// phase), the shape DFO's chain law names, quick.
fn chain(brain: &mut Brain, here: &Here<'_, '_>, sight: Option<&Sight>) -> Option<TelegraphOrder> {
    let sight = sight.filter(|sight| sight.seen)?;
    let most = if brain.tells.phase_two { PHASE_CHAINS } else { 1 };
    let last = brain.tells.last?;
    let shapes: Vec<Shape> = here
        .numbers
        .shapes
        .iter()
        .copied()
        .filter(|shape| *shape != Shape::Aimed && !GAP_CLOSERS.contains(shape))
        .collect();
    let chains = here.numbers.elite && shapes.len() >= 2 && !GAP_CLOSERS.contains(&last);
    if !chains || brain.tells.chained >= most || here.dice.roll(Purpose::Chain) >= CHAIN_CHANCE {
        return None;
    }
    let wanted = match last {
        Shape::Sweep => Some(Shape::Lunge),
        Shape::Lunge | Shape::Slam => Some(Shape::Sweep),
        Shape::Ring => Some(Shape::Slam),
        _ => None,
    };
    let next = wanted
        .filter(|shape| shapes.contains(shape))
        .or_else(|| shapes.iter().copied().find(|shape| *shape != last))?;
    brain.tells.chained += 1;
    Some(order(brain, here, next, sight.toward, 0.0, true))
}

/// The boss's roar into its second phase, once, at PHASE_TWO of its health: an iron ring about its feet, wound up as
/// soon as it is free to.
pub fn roar(brain: &mut Brain, here: &Here<'_, '_>) -> Option<TelegraphOrder> {
    let fighter = &here.fighter;
    if here.numbers.phase_two && !brain.tells.phase_two && fighter.health <= fighter.health_max * PHASE_TWO {
        brain.tells.phase_two = true;
        brain.tells.roar = true;
    }
    if !brain.tells.roar || !matches!(fighter.action, Action::Idle) {
        return None;
    }
    brain.tells.roar = false;
    let windup = combat::ticks(ROAR - IRON_EXTRA);
    let order =
        TelegraphOrder { shape: Shape::Ring, windup, iron: true, feint_at: None, bearing: brain.heading, ahead: 0.0 };
    brain.tells.blow_ready = here.tick() + u64::from(windup) + cooldown(here, &brain.tells);
    brain.tells.windup = Some(Windup { order, begun: false });
    brain.tells.last = Some(Shape::Ring);
    brain.tells.chained = 0;
    Some(order)
}
