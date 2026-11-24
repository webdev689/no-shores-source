//! The tactics brain, DFO's, standing on the game's fight: whom a foe fights and whether it is its turn. As many foes a
//! target as the director allows fight it hand to hand and shoot at it; the rest stand on a ring just outside their
//! reach and circle round to its flanks. A holder walks in and strikes, hops back after its blow and hands its turn to
//! whoever waited longest; one that waited past its patience goes in anyway, one over the count at most, and a target
//! that turns its back or walks inside the ring is open to anyone. The waiting stand apart, a ring farther out for those
//! a ring has no room for. A hurt foe backs off, a coward runs, and a shooter kites. Each turn it answers blows at it
//! first, then takes the openings it is given, as its group asks: broken, raging, defending or screened.

use crate::board::Board;
use crate::brain::{Brain, Homeward, Plan};
use crate::cover::{hide_at, leave_post, unseen};
use crate::dice::Purpose;
use crate::flank::{drift, in_place, ring_of};
use crate::leash::{leash, unoccupied};
use crate::pace;
use crate::rally::{broken, hold_ground};
use crate::react::{Reactions, defend, opening};
use crate::senses::{Here, Sight, sense};
use crate::share::share;
use crate::shoot::{ranged, shooting};
use crate::steer::{Ask, taken, way_to};
use crate::tell::{After, follow, roar, throw};
use crate::tuning::{
    BACK_TURNED, BACKOFF, BACKOFF_COOLDOWN, BACKOFF_GAP, BLOCKED_ENOUGH, CIRCLE_PACE, CLOSE_IN, CLOSING, FLEE,
    FLEE_SHARE, FOLLOW, GUARD_RESERVE, HURT_SHARE, KITE_CORNERED, POISE_NEAR, RANK_GAP, RECOVER, RECOVER_HOP,
    RING_ROOM, RING_SLACK, RUN_FROM, STALE, STEP_PACE, SWING_FACE, SWING_SLACK, WAIT_GAP, WALLED,
};
use combat::arms::{stroke_shape, weapon};
use combat::fighter::Action;
use combat::sight::{apart, bearing, clear_line, off, wrap};
use combat::strike::reach_of;
use combat::tuning::{ATTACK_PACE, BODY_RADIUS, guard_of};
use combat::{CombatInput, FighterId, Stroke};
use core::f64::consts::{FRAC_PI_2, PI};
use movement::blocks::blocking_at;
use movement::{TICK_SECONDS, TUNING};

/// A foe's whole tick of thinking, before its controls: what it asks.
pub fn decide(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board) -> Ask {
    let me = here.me;
    let hurt = brain.hurt(here.fighter.health, here.fighter.health_max, here.tick());
    if brain.raging {
        // A rage lasts its fight; raging, it answers no blow.
        brain.raging = brain.awareness.alert || brain.target.is_some();
        brain.reactions = Reactions::default();
    }
    if let Some(ask) = leash(brain, here, board) {
        return ask;
    }
    let (before, was_alert) = (brain.target, brain.awareness.alert);
    let sight = sense(brain, here, board);
    let sight = share(brain, here, board, sight);
    if sight.is_some() && brain.returning != Some(Homeward::Falling) {
        // Something to fight: any walk home is over; a fall back goes on once a wind-up of its own is done.
        brain.returning = None;
    }
    if brain.target != before {
        board.forget(me);
        brain.taken_at = here.tick();
        brain.plan = Plan::Wait;
        brain.ready_at = None;
        brain.slot = None;
        brain.blocked = 0;
    }
    if let Some(ask) = held(brain, here, board) {
        return ask;
    }
    // Walking home it roars into no phase: it arrives whole, in its first.
    if brain.returning != Some(Homeward::Searched)
        && let Some(order) = roar(brain, here)
    {
        return telegraph(brain, order);
    }
    match follow(brain, here, sight.as_ref()) {
        Some(After::Chain(order)) => return telegraph(brain, order),
        Some(After::Swing) => {
            let face = sight.map_or(brain.heading, |sight| sight.toward);
            let combat = CombatInput { attack: Some(Stroke::Down), ..CombatInput::default() };
            return Ask { face: Some(face), combat, ..Ask::default() };
        }
        Some(After::Spent) => recover(brain, here, board),
        Some(After::Wait) => return Ask::facing(sight.map_or(brain.heading, |sight| sight.toward)),
        None => {}
    }
    if matches!(here.fighter.action, Action::Attack(_)) {
        brain.plan = Plan::Strike;
        // Mid-swing it may still dodge a blow at it, as its answers allow.
        if let Some(ask) = defend(brain, here) {
            return ask;
        }
        let toward = sight.map_or(brain.heading, |sight| sight.toward);
        // Its blow follows a target walking away from it, as far as a swing lets it move.
        let chased = sight.filter(|sight| board.holds(sight.id, me, false) && speed_away(sight) > CLOSING);
        return chased
            .and_then(|sight| way_to(here, sight.spot))
            .map_or_else(|| Ask::facing(toward), |way| Ask::stepping(way, 1.0, toward));
    }
    if brain.plan == Plan::Strike {
        recover(brain, here, board);
    }
    let Some(sight) = sight else {
        brain.plan = Plan::Wait;
        return unoccupied(brain, here, was_alert);
    };
    broken(brain, here, board, &sight);
    if let Some(cover) = brain.cover.filter(|_| !here.numbers.shooter) {
        board.forget(me);
        return hide_at(here, cover, &sight);
    }
    if let Some(ask) = flee(brain, here, board, &sight) {
        return ask;
    }
    if let Some(ask) = hold_ground(brain, here, board, &sight) {
        return ask;
    }
    if here.tick() < brain.broken_until && (!sight.seen || sight.distance > here.range()) {
        // Broken, it neither hunts its target nor closes on it.
        board.forget(me);
        let guard = here.numbers.block > 0.0 && here.fighter.stamina > GUARD_RESERVE;
        return Ask::facing(sight.toward).guarded(guard);
    }
    // A shooter out of sight behind its own post's cover hid there on purpose: it keeps to its post.
    if !sight.seen
        && let Some(ask) = unseen(brain, here, board, &sight)
    {
        return ask;
    }
    if !sight.seen {
        // Its turn it keeps a moment, as DFO's stale lease does; past that it waits again like anyone.
        if here.tick() > brain.seen_at + Here::ticks(STALE) {
            board.forget(me);
        }
        // It hunts where it last saw its target, and stands behind an ally already there rather than shove it.
        if sight.distance < 0.5 || taken(here, sight.spot) {
            return Ask::default();
        }
        return way_to(here, sight.spot).map_or_else(Ask::default, |way| Ask::walking(way, 1.0, true));
    }
    // A shooter closing walks on well inside its range, so a target walking off along its edge never stops and
    // starts it every tick.
    let back_in = if brain.bow.closing { CLOSE_IN } else { 0.0 };
    brain.bow.closing = here.numbers.shooter && sight.distance > here.range() - back_in;
    if sight.distance > here.range() - back_in {
        if sight.distance > here.range() {
            board.forget(me);
        }
        return way_to(here, sight.spot).map_or_else(|| Ask::facing(sight.toward), |way| Ask::walking(way, 1.0, true));
    }
    if let Some(ask) = defend(brain, here) {
        return ask;
    }
    let engaged = brain.plan == Plan::Engage;
    // A riposte or a counter it earned it strikes at once; a spent target it punishes in its own beat.
    let earned = here.fighter.riposte.is_some() || here.fighter.counter > 0;
    let opened = opening(here, Some((sight.id, sight.seen)), engaged);
    // Broken, it takes no opening but the riposte or the counter it earned.
    let opened = opened.filter(|_| earned || here.tick() >= brain.broken_until);
    let opened = opened.filter(|_| earned || pace::may(here, board, sight.id, pace::swing_lands(here)));
    if let Some((whom, combat)) = opened {
        let toward = here.find(whom).map_or(sight.toward, |other| bearing(here.at(), [other.body.x, other.body.y]));
        let facing = off(brain.heading, toward) <= SWING_FACE;
        return Ask {
            face: Some(toward),
            combat: if facing { combat } else { CombatInput::default() },
            ..Ask::default()
        };
    }
    back_off(brain, here, board, &sight, hurt);
    if here.numbers.shooter {
        return if shooting(brain, here, &sight) {
            // A shooter never passes through the melee's ring, where these run out: they run out here too.
            if matches!(brain.plan, Plan::Recover | Plan::Backoff) && here.tick() >= brain.until {
                brain.plan = Plan::Wait;
            }
            ranged(brain, here, board, &sight)
        } else {
            // Caught, it fights close a while: judged afresh each tick, a target that follows at the edge of its
            // reach would turn it between its fists and its weapon every other tick.
            brain.bow.close_until = brain.bow.close_until.max(here.tick() + Here::ticks(KITE_CORNERED));
            leave_post(brain, board, me);
            melee(brain, here, board, &sight)
        };
    }
    melee(brain, here, board, &sight)
}

/// A telegraphed blow ordered: it faces where it aims.
fn telegraph(brain: &mut Brain, order: combat::TelegraphOrder) -> Ask {
    brain.heading = order.bearing;
    Ask { combat: CombatInput { telegraph: Some(order), ..CombatInput::default() }, ..Ask::default() }
}

/// What its own action holds it to: a wind-up stood through, facing where it aims; a stagger, a knockdown or an
/// overreach waited out, its turn handed on and the beat after a blow to follow; a dodge's hop or a flinch.
fn held(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board) -> Option<Ask> {
    let tick = here.tick();
    let left = match here.fighter.action {
        Action::Telegraph(telegraph) => {
            let _ = follow(brain, here, None);
            brain.heading = telegraph.bearing;
            return Some(Ask::default());
        }
        Action::Staggered { left, .. } | Action::Down { left } | Action::Overreach { left } => u64::from(left),
        Action::Dodge { .. } | Action::Flinch { .. } | Action::Dead { .. } => return Some(Ask::default()),
        _ => return None,
    };
    // A wind-up broken or missed is over: nothing follows it.
    brain.tells.windup = None;
    brain.tells.ended = None;
    if brain.plan != Plan::Recover || brain.until < tick + left {
        if let Some(target) = brain.target {
            board.hand_on(target, here.me, tick);
        }
        brain.plan = Plan::Recover;
        brain.until = tick + left + Here::ticks(here.dice.between(Purpose::Recover, RECOVER));
        brain.hop_until = tick + left + Here::ticks(RECOVER_HOP);
        brain.ready_at = None;
    }
    Some(Ask::default())
}

/// Its blow done: a hop out, its ground held for a beat (raging, the hop alone), its turn handed on to whoever waited
/// longest.
fn recover(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board) {
    let tick = here.tick();
    brain.plan = Plan::Recover;
    let held = if brain.raging { RECOVER_HOP } else { here.dice.between(Purpose::Recover, RECOVER) };
    brain.until = tick + Here::ticks(held);
    brain.hop_until = tick + Here::ticks(RECOVER_HOP);
    brain.ready_at = None;
    if let Some(target) = brain.target {
        board.hand_on(target, here.me, tick);
    }
}

/// A coward below a fifth of its health runs from its target, once, for a while; a foe raging never runs.
fn flee(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight) -> Option<Ask> {
    let tick = here.tick();
    let fighter = &here.fighter;
    if brain.raging {
        if brain.plan == Plan::Flee {
            brain.plan = Plan::Wait;
        }
        return None;
    }
    if here.numbers.coward && !brain.fled && fighter.health < FLEE_SHARE * fighter.health_max {
        brain.fled = true;
        brain.plan = Plan::Flee;
        brain.until = tick + Here::ticks(FLEE);
    }
    if brain.plan != Plan::Flee {
        return None;
    }
    if tick >= brain.until {
        brain.plan = Plan::Wait;
        return None;
    }
    board.forget(here.me);
    brain.reactions = crate::react::Reactions::default();
    Some(Ask::walking(sight.toward + PI, 1.0, true))
}

/// A quarter of its health lost in a few seconds (`hurt`, its share), or its poise near breaking for one that defends
/// itself: out to a farther ring for a while, its turn handed on, at most once a cooldown; never while it rages.
fn back_off(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight, hurt: f64) {
    let tick = here.tick();
    let fighter = &here.fighter;
    if brain.raging {
        return;
    }
    let breaking =
        here.numbers.defends() && fighter.poise >= POISE_NEAR * fighter.poise_max && fighter.poise_immune == 0;
    if (hurt >= HURT_SHARE || breaking) && brain.plan != Plan::Backoff && tick >= brain.backoff_ready {
        brain.plan = Plan::Backoff;
        brain.until = tick + Here::ticks(BACKOFF);
        brain.hop_until = brain.until;
        brain.backoff_ready = tick + Here::ticks(BACKOFF_COOLDOWN);
        brain.heal_window(fighter.health);
        brain.ready_at = None;
        board.hand_on(sight.id, here.me, tick);
    }
}

/// A fighter hand to hand: its turn taken or waited for, then in to strike or out on the ring.
fn melee(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight) -> Ask {
    let (me, tick) = (here.me, here.tick());
    let reach = reach_of(&here.fighter);
    let director = here.world.director;
    let pressed = director.pressed();
    // The ring a foe with a turn holds, and the one farther out that the waiting stand on while another fights
    // their target; a foe alone at its target never waits for a turn, so its fight is its own.
    let ring = reach + pressed.ring_gap;
    let crowd = board.fighting(sight.id, me) > 0;
    let waiting = ring + if crowd { WAIT_GAP } else { 0.0 };
    // A leader its followers screen takes no turn while they fight, nor waits in their line for one, so the first of
    // them to have waited goes in; raging, or going in now they are gone, it takes one at once, one over the count at
    // most.
    let screened = brain.orders.screened && !brain.raging;
    if screened {
        board.forget(me);
    } else {
        board.join(sight.id, me, false, tick);
    }
    let from_target = bearing([sight.spot[0], sight.spot[1]], here.at());
    // Only a foe where its group means it to stand strikes a back turned to it: the flanker, or one in the line; and
    // not a back walking away, which the one whose turn it is runs after.
    let turned_away = off(sight.fighter.aim, from_target) > BACK_TURNED && speed_away(sight) <= CLOSING;
    let flanker = board.flanker(sight.id);
    let back_turned = turned_away && in_place(here, sight, flanker);
    // Walked in on, it fights back rather than backpedal, and goes on fighting while the target stays that close; a
    // foe's own hop that ends inside the ring opens nothing. While its target breathes nothing is open: it keeps its
    // place, and steps back from a target walking in on it.
    let body = sight.fighter.body;
    let closing = body.vx * libm::sin(from_target) - body.vy * libm::cos(from_target) > CLOSING;
    let inside = sight.distance < ring - RING_SLACK && (closing || brain.plan == Plan::Engage);
    let opened =
        ((back_turned && sight.distance <= waiting + RING_SLACK) || inside) && !board.breathing(sight.id, tick);
    let open = board.opening(sight.id, me, opened && !board.holds(sight.id, me, false));
    let patience = if brain.raging || brain.orders.push { 0 } else { Here::ticks(pressed.patience) };
    if brain.plan == Plan::Wait
        && ((!screened && board.take(sight.id, me, false, tick, patience, director.caps())) || open)
    {
        brain.plan = Plan::Engage;
    }
    if brain.plan == Plan::Engage && !board.holds(sight.id, me, false) && !open {
        brain.plan = Plan::Wait;
    }
    if matches!(brain.plan, Plan::Recover | Plan::Backoff | Plan::Flee) && tick >= brain.until {
        brain.plan = Plan::Wait;
    }
    match brain.plan {
        // While another goes in, or waits in reach for the beat to strike, one in to fight keeps to the ring, not crowd
        // in beside it, and while its target breathes it stands back with the waiting; one walked in on without a turn
        // fights back where it stands.
        Plan::Engage if !(open && inside) && !board.go_in(sight.id, me, tick) => {
            let ring = if board.breathing(sight.id, tick) { waiting } else { ring };
            hold_ring(brain, here, sight, ring, crowd, flanker)
        }
        Plan::Engage => engage(brain, here, board, sight, reach),
        Plan::Backoff => hold_ring(brain, here, sight, ring + BACKOFF_GAP, crowd, flanker),
        Plan::Wait => {
            // Screened, it waits a ring farther out, right behind its shield-bearer if it has one: its shield front.
            let ring = ring_of(brain, here, board, sight, waiting) + if screened { RANK_GAP } else { 0.0 };
            if let Some(shield) = brain.orders.behind.filter(|_| screened).and_then(|id| here.find(id)) {
                brain.slot = Some(bearing([sight.spot[0], sight.spot[1]], [shield.body.x, shield.body.y]));
            }
            hold_ring(brain, here, sight, ring, crowd, board.flanker(sight.id))
        }
        _ => hold_ring(brain, here, sight, ring, crowd, flanker),
    }
}

/// In to strike: a holder may wind up a telegraphed blow; otherwise it walks into reach (runs, after a target walking
/// away), squares up, waits its beat and swings, its beat kept while its target sways about the edge of its reach.
/// Walled by a guard that blocked it twice, it steps round toward the guard's open side, and chops at it again once
/// WALLED has passed. Out of stamina for a swing and its guard, it hands its turn on.
fn engage(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight, reach: f64) -> Ask {
    let tick = here.tick();
    let fighter = &here.fighter;
    let guarded = guard_toward(here, sight);
    if !guarded {
        brain.blocked = 0;
    }
    let mut walled = guarded && brain.blocked >= BLOCKED_ENOUGH;
    let (since, side) =
        if walled { *brain.walled.get_or_insert_with(|| (tick, open_side(here, sight))) } else { (tick, 1.0) };
    // Waiting on its answer to a blow at it, it neither swings nor winds up one of its own.
    let pending = brain.reactions.threat.is_some();
    if board.holds(sight.id, here.me, false)
        && !pending
        && let Some(order) = throw(brain, here, sight, reach, walled, |least| pace::may(here, board, sight.id, least))
    {
        return telegraph(brain, order);
    }
    if walled && tick >= since + Here::ticks(WALLED) {
        // Its way round found nothing: it chops at the guard again, to break it or to make it pay.
        (brain.blocked, walled) = (0, false);
    }
    if !walled {
        brain.walled = None;
    }
    let pressed = here.world.director.pressed();
    // In its turn it runs after a target walking away from it, which at a walk it would never close on, and closes in
    // nearer by as far as the target walks on while its blow comes round, but no nearer than their bodies touch: there
    // it keeps the target's pace rather than run and stop by turns.
    let chasing = board.holds(sight.id, here.me, false) && speed_away(sight) > CLOSING;
    let lead = if chasing { lead(here, speed_away(sight)) } else { 0.0 };
    let closest = (reach - lead).max(2.0 * BODY_RADIUS);
    let way = (sight.distance > closest || chasing).then(|| way_to(here, sight.spot)).flatten();
    let gap = (sight.distance - closest).max(0.0) / TICK_SECONDS;
    let pace = if chasing { ((speed_away(sight) + gap) / TUNING.run).min(1.0) } else { 1.0 };
    // Its beat begins in reach; a sway past the edge of its reach and back does not start it over.
    if sight.distance > reach + SWING_SLACK || (sight.distance > reach && brain.ready_at.is_none()) {
        brain.ready_at = None;
        let Some(way) = way else { return Ask::facing(sight.toward) };
        let near = sight.distance <= reach + pressed.ring_gap + RING_SLACK;
        return if near && !chasing {
            Ask::stepping(way, 1.0, sight.toward)
        } else {
            Ask::walking(way, 1.0, chasing || brain.raging || sight.distance > RUN_FROM)
        };
    }
    let reserve = if here.numbers.guards() { GUARD_RESERVE } else { 0.0 };
    let cost = weapon(fighter.arms.melee).stamina + reserve;
    if fighter.stamina < cost && matches!(fighter.action, Action::Idle) {
        recover(brain, here, board);
        return Ask::facing(sight.toward);
    }
    let delay = pressed.swing_delay;
    let ready_at =
        *brain.ready_at.get_or_insert_with(|| tick + Here::ticks(here.dice.between(Purpose::SwingDelay, delay)));
    let mut ask = way.map_or_else(|| Ask::facing(sight.toward), |way| Ask::stepping(way, pace, sight.toward));
    ask.run = chasing;
    if walled {
        ask = Ask::stepping(sight.toward + PI + side * FRAC_PI_2, STEP_PACE, sight.toward);
    }
    let stroke = stroke(here, sight);
    let reaches = sight.distance + lead <= reach + stroke_shape(stroke).reach + BODY_RADIUS - 0.1;
    let free = matches!(fighter.action, Action::Idle | Action::Guard { .. });
    if free
        && reaches
        && !walled
        && !pending
        && tick >= ready_at
        && off(brain.heading, sight.toward) <= SWING_FACE
        && pace::may(here, board, sight.id, pace::swing_lands(here))
    {
        ask.combat.attack = Some(stroke);
        brain.ready_at = None;
    }
    ask
}

/// How fast its target walks away from it.
fn speed_away(sight: &Sight) -> f64 {
    let body = sight.fighter.body;
    body.vx * libm::sin(sight.toward) - body.vy * libm::cos(sight.toward)
}

/// How much farther a target walking away at `away` stands once a blow begun now lands, the foe following it at the
/// pace a swing allows.
fn lead(here: &Here<'_, '_>, away: f64) -> f64 {
    let strike = f64::from(here.fighter.swing_ticks().0) * TICK_SECONDS;
    (away - ATTACK_PACE * here.walk()).max(0.0) * strike
}

/// The side round its target toward which the target's guard faces away from it (1 clockwise, -1 not): a blow from
/// outside the guard is not blocked. Dead ahead, the side its number picks.
fn open_side(here: &Here<'_, '_>, sight: &Sight) -> f64 {
    here.way_round(wrap(sight.toward + PI - sight.fighter.aim))
}

/// Whether its target's guard is raised and faces it, so a swing from here would be blocked.
fn guard_toward(here: &Here<'_, '_>, sight: &Sight) -> bool {
    let (arc, _, _) = guard_of(sight.fighter.arms.off_hand);
    let toward_me = bearing([sight.fighter.body.x, sight.fighter.body.y], here.at());
    sight.fighter.guarding().is_some() && off(sight.fighter.aim, toward_me) <= arc
}

/// The stroke a swing takes: a chop into a raised guard, a sweep across two or more, a thrust at the edge of reach,
/// and otherwise one of the rest by the dice.
fn stroke(here: &Here<'_, '_>, sight: &Sight) -> Stroke {
    if sight.fighter.guarding().is_some() {
        return Stroke::Down;
    }
    let reach = reach_of(&here.fighter) + BODY_RADIUS;
    let side = stroke_shape(Stroke::Left).half_arc;
    let near = here
        .world
        .fighters
        .iter()
        .filter(|(_, other)| here.hostile(other))
        .filter(|(_, other)| {
            let there = [other.body.x, other.body.y];
            apart(here.at(), there) <= reach && off(sight.toward, bearing(here.at(), there)) <= side
        })
        .count();
    let roll = here.dice.roll(Purpose::Stroke);
    if near >= 2 {
        return if roll < 0.5 { Stroke::Left } else { Stroke::Right };
    }
    if sight.distance > reach - 0.1 {
        return Stroke::Up;
    }
    [Stroke::DownLeft, Stroke::DownRight, Stroke::Down, Stroke::Up][((roll * 4.0) as usize).min(3)]
}

/// On its ring: hop back to it after a blow (or, backing off, walk out to it facing away), hold its ground inside it
/// for the beat after a blow and step back out to it after that, walk in from afar to its own place on it, and on it
/// circle toward that place.
fn hold_ring(
    brain: &mut Brain,
    here: &Here<'_, '_>,
    sight: &Sight,
    ring: f64,
    crowd: bool,
    flanker: Option<FighterId>,
) -> Ask {
    let tick = here.tick();
    let away = sight.toward + PI;
    // A foe that blocks holds its guard up on the ring while it waits its turn, as a shield-bearer does: raised near the
    // ring's line, and kept up across the ring's give and the step back in from just past it, so a target swaying about
    // the ring's edge never has it drop and rise again tick by tick.
    // Raging, it never guards.
    let shield = here.numbers.block > 0.0 && here.fighter.stamina > GUARD_RESERVE && !brain.raging;
    let guarding = shield && matches!(here.fighter.action, Action::Guard { .. });
    if brain.plan == Plan::Backoff && sight.distance >= ring - RING_SLACK {
        // Out at its farther ring its walk out is over: a target that follows it turns it to face them, not back.
        brain.hop_until = brain.hop_until.min(tick);
    }
    // A place a block hides from its target, as beyond a wall the target stands against, or one too near a block's
    // side to stand on, is no place to fight from.
    let (spot, chest) = (sight.spot, sight.fighter.chest());
    let goal = |place: f64| [spot[0] + libm::sin(place) * ring, spot[1] - libm::cos(place) * ring, spot[2]];
    let hidden = |place: f64| {
        let at = goal(place);
        let blocks = here.world.blocks;
        !clear_line(blocks, here.world.terrain, chest, [at[0], at[1], chest[2]])
            || blocking_at(blocks, at[0], at[1], at[2], TUNING.height).is_some()
    };
    if sight.distance < ring - RING_SLACK {
        if tick < brain.hop_until {
            return if brain.plan == Plan::Backoff {
                Ask::walking(away, STEP_PACE, false)
            } else {
                Ask::stepping(away, STEP_PACE, sight.toward)
            };
        }
        if brain.plan == Plan::Recover {
            return Ask::facing(sight.toward);
        }
        // Waiting inside its ring it steps back out, leaving room for the foes whose turn it is: straight out, or,
        // backed against a block, toward the nearest place round the ring that is open to it. Waiting only just
        // inside, slipped round an ally of a crowd on its way, it goes on for its place as on the ring, so it never
        // turns about.
        let place = brain.slot.filter(|place| !hidden(*place));
        if let Some(place) =
            place.filter(|_| crowd && brain.plan == Plan::Wait && sight.distance >= ring - 2.0 * RING_SLACK)
        {
            return round_to(sight, place, ring);
        }
        let turns = (0..=6).flat_map(|turn| [1.0, -1.0].map(|side| away + side * f64::from(turn) * PI / 6.0));
        let out = turns.into_iter().find(|place| !hidden(*place)).unwrap_or(away);
        return Ask::stepping(out, CIRCLE_PACE, sight.toward);
    }
    if sight.distance > ring + RING_SLACK || hidden(away) {
        // From afar it makes for its own place on the ring rather than its target, so the waiting come in spread
        // round; to a hidden place, or from behind a block on the ring itself, it makes for its target by the
        // room's routes instead, and comes onto the ring on its own side.
        let place = brain.slot.unwrap_or(away);
        let Some(way) = way_to(here, if hidden(place) { spot } else { goal(place) }) else {
            return Ask::facing(sight.toward);
        };
        return if sight.distance <= ring + RING_SLACK + 1.0 {
            Ask::stepping(way, 1.0, sight.toward).guarded(guarding)
        } else {
            Ask::walking(way, 1.0, sight.distance - ring > RUN_FROM)
        };
    }
    // On the ring its place drifts round only as far as its target can still see it: stepped round the ring with
    // no route, a place drifted behind a block would lead it into the block's face.
    let held = brain.slot.filter(|place| !hidden(*place)).unwrap_or(away);
    let drifted = drift(here, sight, held, ring, flanker);
    let slot = if hidden(drifted) { held } else { drifted };
    brain.slot = Some(slot);
    let out = ring - sight.distance;
    round_to(sight, slot, ring).guarded(guarding || (shield && out.abs() <= RING_SLACK / 2.0))
}

/// Round the ring to its `place` and out or in to the ring's own line, not merely inside its give, the faster the
/// farther it is from its place: a place drifting on draws it along, rather than by stops and starts. Far round from
/// its place, as a foe joining the line is, it walks there; near it, it circles slowly.
fn round_to(sight: &Sight, place: f64, ring: f64) -> Ask {
    let away = sight.toward + PI;
    let (round, out) = (wrap(place - away) * ring, ring - sight.distance);
    let most = if round.abs() > RING_ROOM { 1.0 } else { CIRCLE_PACE };
    let pace = (libm::hypot(round, out) * FOLLOW / TUNING.walk).min(most);
    Ask::stepping(away + libm::atan2(round, out), pace, sight.toward)
}
