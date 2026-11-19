//! A shooter's post: a place to fire from with cover to fall back behind, picked from the room's firing spots by its
//! score against where the shooter believes its target is. At its post it hides behind its cover to draw, to reload
//! and when hurt, and steps aside to its line to shoot; it picks again when its target moves far, when its post loses
//! the line or its cover, and once when it looks out and its target is not there. With no post near, it fights as on
//! open ground.

use crate::Spot;
use crate::board::Board;
use crate::brain::{Brain, Plan};
use crate::dice::{Dice, Purpose};
use crate::senses::{Here, Sight};
use crate::shoot::{draw_ticks, fire, shooting, turn};
use crate::steer::{Ask, way_to};
use crate::tell::aim_ready;
use crate::tuning::{
    AIMED_SHARE, ASIDE_STRIDE, ASIDE_WEIGHT, BAND_BOW, BAND_CROSSBOW, BAND_PISTOLET, BAND_THUNDERLOCK, BAND_WEIGHT,
    COVER_WEIGHT, EYE, FLANK_WEIGHT, HIDE, KITE_OUT, NEAR_WEIGHT, PEEK, POST_GAP, POST_LEAVE, POST_RETRY, POST_SEEK,
    POST_TRIES, REPICK, ROUTE_TRIES, RUN_FROM, SHOOT_RANGE, STEP_ASIDE,
};
use combat::fighter::Action;
use combat::sight::{apart, bearing, clear_line, off};
use combat::tuning::CHEST;
use combat::{FighterId, Ranged};
use core::f64::consts::{FRAC_PI_2, PI, TAU};
use movement::{Block, TUNING, Terrain};

/// Near enough to where it means to stand.
const THERE: f64 = 0.15;

/// A shooter's post: the spot it holds, where there it hides from its target and where it fires from (the spot
/// itself, the other a step aside), whom it was picked against and where that one stood, and whether it was picked
/// with its target out of sight.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Post {
    pub spot: [f64; 3],
    pub hide: [f64; 3],
    pub fire: [f64; 3],
    pub target: FighterId,
    pub against: [f64; 3],
    pub blind: bool,
}

fn flat(point: [f64; 3]) -> [f64; 2] {
    [point[0], point[1]]
}

fn chest(feet: [f64; 3]) -> [f64; 3] {
    [feet[0], feet[1], feet[2] + CHEST]
}

/// How a target's chest sees a body standing at `feet`: whether its chest's line is clear, and its eye's.
fn lines(blocks: &[Block], terrain: &dyn Terrain, feet: [f64; 3], target: [f64; 3]) -> (bool, bool) {
    let eye = [feet[0], feet[1], feet[2] + EYE];
    (clear_line(blocks, terrain, chest(feet), target), clear_line(blocks, terrain, eye, target))
}

/// Seen at all: either line clear.
fn exposed(blocks: &[Block], terrain: &dyn Terrain, feet: [f64; 3], target: [f64; 3]) -> bool {
    let (chest, eye) = lines(blocks, terrain, feet, target);
    chest || eye
}

/// Free to fire: both lines clear, the shot's from its chest and the look's from its eye.
fn fires(blocks: &[Block], terrain: &dyn Terrain, feet: [f64; 3], target: [f64; 3]) -> bool {
    let (chest, eye) = lines(blocks, terrain, feet, target);
    chest && eye
}

/// The distances a shooter likes its target at, near and far, by its weapon.
fn band(ranged: Ranged) -> (f64, f64) {
    match ranged {
        Ranged::Bow => BAND_BOW,
        Ranged::Crossbow => BAND_CROSSBOW,
        Ranged::Pistolet | Ranged::DoublePistolet => BAND_PISTOLET,
        Ranged::Thunderlock => BAND_THUNDERLOCK,
    }
}

/// How full on `toward` a spot's cover stands: 1 for cover on that very bearing, down to 0 for none within a quarter
/// turn of it.
fn alignment(cover: u16, toward: f64) -> f64 {
    (0..16_u8)
        .filter(|bit| cover & (1 << bit) != 0)
        .map(|bit| libm::cos(f64::from(bit) * TAU / 16.0 - toward))
        .fold(0.0, f64::max)
}

/// Whether a body walks from one point to another a step aside: nothing above a step in the way, nor where it stops,
/// and no wall of the terrain between.
fn free(blocks: &[Block], terrain: &dyn Terrain, from: [f64; 3], to: [f64; 3]) -> bool {
    let knee = |point: [f64; 3]| [point[0], point[1], point[2] + TUNING.step];
    let radius = TUNING.radius;
    let inside = |block: &Block| {
        block.top > to[2] + TUNING.step
            && to[0] > block.min_x - radius
            && to[0] < block.max_x + radius
            && to[1] > block.min_y - radius
            && to[1] < block.max_y + radius
    };
    clear_line(blocks, terrain, knee(from), knee(to)) && !blocks.iter().any(inside)
}

/// Where at a spot it hides from a target's chest and where it fires at it: the spot hidden and the shortest step
/// aside, either way, that fires; or the spot firing and the shortest step aside that hides. A step counts only when a
/// stride short of it does too, so a body that stops a little short still stands as it means to. None without both.
pub(crate) fn stances(
    blocks: &[Block],
    terrain: &dyn Terrain,
    spot: [f64; 3],
    target: [f64; 3],
) -> Option<([f64; 3], [f64; 3])> {
    let open = fires(blocks, terrain, spot, target);
    if !open && exposed(blocks, terrain, spot, target) {
        return None;
    }
    let toward = bearing(flat(spot), flat(target));
    let aside = |step: f64, side: f64| {
        let way = toward + side * FRAC_PI_2;
        [spot[0] + libm::sin(way) * step, spot[1] - libm::cos(way) * step, spot[2]]
    };
    let turned =
        |point| if open { !exposed(blocks, terrain, point, target) } else { fires(blocks, terrain, point, target) };
    // A side whose longest step does not turn it is not searched.
    let sides: Vec<f64> = [1.0, -1.0].into_iter().filter(|side| turned(aside(STEP_ASIDE.1, *side))).collect();
    let strides = libm::round((STEP_ASIDE.1 - STEP_ASIDE.0) / ASIDE_STRIDE) as u32;
    let steps = (0..=strides).flat_map(|stride| sides.iter().map(move |side| (stride, *side)));
    steps.into_iter().find_map(|(stride, side)| {
        let step = STEP_ASIDE.0 + f64::from(stride) * ASIDE_STRIDE;
        let point = aside(step, side);
        let stands = turned(point) && turned(aside(step - ASIDE_STRIDE, side)) && free(blocks, terrain, spot, point);
        stands.then_some(if open { (point, spot) } else { (spot, point) })
    })
}

/// The best post near it against where it believes its target is, or none, none within the gap of another shooter's
/// post or of `except`. Each spot costs its walk there, its distance outside its weapon's band and its target's face,
/// less its cover, and its step aside, walked out and back each shot. Weighed first with a straight walk, cheapest
/// first (by the bake's order on a tie), the cheapest few are worked out with their stances and the walk their route
/// takes, which is never shorter; the first of the lowest cost is kept, and the work stops once no spot left could
/// cost less.
fn pick(here: &Here<'_, '_>, board: &Board, sight: &Sight, except: Option<[f64; 3]>) -> Option<Post> {
    let target = chest(sight.spot);
    let standoff = here.numbers.standoff;
    let (near, far) = band(here.fighter.arms.ranged.unwrap_or(Ranged::Bow));
    let (near, far, least) = (near * standoff, far * standoff, KITE_OUT * standoff);
    let taken: Vec<[f64; 3]> = board.posts_but(here.me).chain(except).collect();
    let mut weighed: Vec<(f64, f64, Spot)> = Vec::new();
    for spot in here.world.spots.near(here.feet(), POST_SEEK) {
        let at = flat(spot.point);
        let distance = apart(at, flat(target));
        let crowded = taken.iter().any(|other| apart(at, flat(*other)) < POST_GAP);
        if spot.cover == 0 || distance <= least || distance > SHOOT_RANGE || crowded {
            continue;
        }
        let from_target = bearing(flat(target), at);
        let straight = apart(here.at(), at);
        let cost = NEAR_WEIGHT * straight + BAND_WEIGHT * ((near - distance).max(0.0) + (distance - far).max(0.0))
            - COVER_WEIGHT * alignment(spot.cover, from_target + PI)
            + FLANK_WEIGHT * (1.0 + libm::cos(off(sight.fighter.aim, from_target))) / 2.0;
        weighed.push((cost, straight, spot));
    }
    // A stable sort: spots of equal cost stay in the bake's order.
    weighed.sort_by(|first, second| first.0.total_cmp(&second.0));
    let mut best: Option<(f64, Post)> = None;
    let mut routed = 0;
    for (cost, straight, spot) in weighed.into_iter().take(POST_TRIES) {
        if best.is_some_and(|(lowest, _)| lowest <= cost) || routed == ROUTE_TRIES {
            break;
        }
        let Some((hide, fire)) = stances(here.world.blocks, here.world.terrain, spot.point, target) else { continue };
        routed += 1;
        let Some(walk) = here.world.routes.length(here.feet(), spot.point) else { continue };
        let cost = cost + NEAR_WEIGHT * (walk - straight).max(0.0) + ASIDE_WEIGHT * apart(flat(hide), flat(fire));
        if best.is_none_or(|(lowest, _)| cost < lowest) {
            let post = Post { spot: spot.point, hide, fire, target: sight.id, against: sight.spot, blind: !sight.seen };
            best = Some((cost, post));
        }
    }
    best.map(|(_, post)| post)
}

/// What a shooter's post comes to this tick: one to hold, none (it fights as on open ground), or none yet, its pick left
/// to the next tick because another shooter of the room picked this one.
enum Held {
    Post(Post),
    Open,
    Waiting,
}

/// Its post this tick: kept while its target stands near where it was picked against, its line clear and its cover
/// whole; else picked again, with its target in sight and none sought in vain just now; or, looking out with its
/// target not there, picked once more against where it believes it is, away from the post that failed.
fn post(brain: &Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight) -> Held {
    let (blocks, terrain, target) = (here.world.blocks, here.world.terrain, chest(sight.spot));
    let whole = |post: &Post| {
        post.target == sight.id
            && apart(flat(post.against), flat(sight.spot)) <= REPICK
            && fires(blocks, terrain, post.fire, target)
            && !exposed(blocks, terrain, post.hide, target)
    };
    let kept = brain.bow.post.filter(whole);
    let looking = |post: &Post| brain.bow.peeking && apart(here.at(), flat(post.fire)) <= THERE;
    let mut picked = |except: Option<[f64; 3]>| {
        if !board.may_pick(here.tick()) {
            return Held::Waiting;
        }
        pick(here, board, sight, except).map_or(Held::Open, Held::Post)
    };
    match kept {
        Some(post) if !sight.seen && looking(&post) => {
            if post.blind {
                Held::Open
            } else {
                picked(Some(post.spot))
            }
        }
        Some(post) => Held::Post(post),
        None if sight.seen && here.tick() >= brain.bow.seek_at => picked(None),
        None => Held::Open,
    }
}

/// Whether its turn is an aimed shot: one turn in three, by the dice of the tick it took the turn, while it may throw
/// one and is ready to shoot.
fn aims(brain: &Brain, here: &Here<'_, '_>, board: &Board, sight: &Sight) -> bool {
    let Some(since) = board.held_since(sight.id, here.me) else { return false };
    let ready = matches!(here.fighter.action, Action::Idle) && here.tick() >= brain.bow.shot_ready;
    ready && aim_ready(brain, here, sight) && Dice { tick: since, ..here.dice }.roll(Purpose::PostAim) < AIMED_SHARE
}

/// A shooter's tick at its post, or None to fight as on open ground. Hidden, it waits out its hiding (or its hurt),
/// then looks out from its post's line for a while, raising its weapon behind its cover when it has its turn and
/// loosing once drawn on the line; a turn that is an aimed shot sends it out at once, unraised, to aim on the line. A
/// shot, a reload or its look spent sends it back behind its cover.
pub fn hold(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight, has: bool) -> Option<Ask> {
    let tick = here.tick();
    let post = match post(brain, here, board, sight) {
        Held::Post(post) => post,
        // Another shooter picked this tick: it stands a tick, facing its target, and picks at the next.
        Held::Waiting => return Some(Ask::facing(sight.toward)),
        Held::Open => {
            if brain.bow.seek_at <= tick {
                brain.bow.seek_at = tick + Here::ticks(POST_RETRY);
            }
            leave_post(brain, board, here.me);
            return None;
        }
    };
    if brain.bow.post.is_none_or(|old| old.spot != post.spot) {
        brain.bow.peeking = false;
        brain.bow.turn_at = tick;
    }
    brain.bow.post = Some(post);
    board.claim(here.me, post.spot);
    let hurt = brain.plan == Plan::Backoff && tick < brain.until;
    let action = here.fighter.action;
    let drawing = matches!(action, Action::Draw { .. });
    let drawn = draw_ticks(here.fighter.arms.ranged.unwrap_or(Ranged::Bow));
    let spent = tick >= brain.bow.turn_at + if drawing { drawn } else { 0 };
    let aim = has && !hurt && aims(brain, here, board, sight);
    if brain.bow.peeking && (hurt || spent || matches!(action, Action::Reload { .. })) {
        brain.bow.peeking = false;
        brain.bow.turn_at = tick + Here::ticks(here.dice.between(Purpose::Hide, HIDE));
    } else if !brain.bow.peeking && !hurt && (tick >= brain.bow.turn_at || aim) {
        brain.bow.peeking = true;
        brain.bow.turn_at = tick + Here::ticks(PEEK);
    }
    let goal = if brain.bow.peeking { post.fire } else { post.hide };
    let distance = apart(here.at(), flat(goal));
    // Near its goal it steps straight there, unless its cover stands between: then it goes round by its routes.
    if distance > POST_LEAVE || !free(here.world.blocks, here.world.terrain, here.feet(), goal) {
        let walk = |way: f64| Ask::walking(way, 1.0, distance > RUN_FROM);
        return Some(way_to(here, goal).map_or_else(|| Ask::facing(sight.toward), walk));
    }
    let shooting = if brain.bow.peeking {
        fire(brain, here, board, sight, has && !hurt, true, aim)
    } else {
        Ask::facing(sight.toward)
    };
    if shooting.combat.telegraph.is_some() {
        // Its aimed shot loosed, it falls back behind its cover as a reload would send it.
        brain.bow.peeking = false;
        brain.bow.turn_at = tick + Here::ticks(here.dice.between(Purpose::Hide, HIDE));
    }
    if shooting.combat.telegraph.is_some() || distance <= THERE {
        return Some(shooting);
    }
    Some(Ask { way: Some((bearing(here.at(), flat(goal)), 1.0)), ..shooting })
}

/// A shooter with no post, or fighting close, gives its post up so another may take it.
pub fn leave_post(brain: &mut Brain, board: &mut Board, me: FighterId) {
    brain.bow.post = None;
    board.release(me);
}

/// A shooter out of sight of its target at its post: it keeps to it, or None when it has none or it failed.
pub fn unseen(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight) -> Option<Ask> {
    if brain.bow.post.is_none() || !shooting(brain, here, sight) {
        return None;
    }
    let has = turn(here, board, sight.id);
    hold(brain, here, board, sight, has)
}

#[cfg(test)]
#[path = "cover_tests.rs"]
mod cover_tests;
