//! A shooter's post: a place to fire from with cover to fall back behind, picked from the room's firing spots by its
//! score against where the shooter believes its target is. At its post it hides behind its cover to draw, to reload
//! and when hurt, and steps aside to its line to shoot; it picks again when its target moves far, when its post loses
//! the line or its cover, and once when it looks out and its target is not there. With no post near, it fights as on
//! open ground.

use crate::board::Board;
use crate::brain::{Brain, Plan};
use crate::dice::Purpose;
use crate::senses::{Here, Sight};
use crate::shoot::{draw_ticks, fire, shooting, turn};
use crate::steer::{Ask, way_to};
use crate::tuning::{
    BAND_BOW, BAND_CROSSBOW, BAND_PISTOLET, BAND_THUNDERLOCK, BAND_WEIGHT, COVER_WEIGHT, FLANK_WEIGHT, HIDE, KITE_OUT,
    NEAR_WEIGHT, PEEK, POST_GAP, POST_LEAVE, POST_RETRY, POST_SEEK, REPICK, RUN_FROM, SHOOT_RANGE, STEP_ASIDE,
};
use combat::fighter::Action;
use combat::sight::{apart, bearing, clear_line, off};
use combat::tuning::CHEST;
use combat::{FighterId, Ranged};
use core::f64::consts::{FRAC_PI_2, PI, TAU};
use movement::{Block, TUNING};

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

/// The distances a shooter likes its target at, near and far, by its weapon.
fn band(ranged: Ranged) -> (f64, f64) {
    match ranged {
        Ranged::Bow => BAND_BOW,
        Ranged::Crossbow => BAND_CROSSBOW,
        Ranged::Pistolet => BAND_PISTOLET,
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

/// Whether a body walks from one point to another a step aside: nothing above a step in the way, nor where it stops.
fn free(blocks: &[Block], from: [f64; 3], to: [f64; 3]) -> bool {
    let knee = |point: [f64; 3]| [point[0], point[1], point[2] + TUNING.step];
    let radius = TUNING.radius;
    let inside = |block: &Block| {
        block.top > to[2] + TUNING.step
            && to[0] > block.min_x - radius
            && to[0] < block.max_x + radius
            && to[1] > block.min_y - radius
            && to[1] < block.max_y + radius
    };
    clear_line(blocks, knee(from), knee(to)) && !blocks.iter().any(inside)
}

/// Where at a spot it hides from a target's chest and where it fires at it: the spot behind cover and a step aside to
/// the line, or the spot on the line and a step aside behind cover. None without both.
fn stances(blocks: &[Block], spot: [f64; 3], target: [f64; 3]) -> Option<([f64; 3], [f64; 3])> {
    let sees = |point: [f64; 3]| clear_line(blocks, chest(point), target);
    let toward = bearing(flat(spot), flat(target));
    let open = sees(spot);
    [1.0, -1.0].into_iter().find_map(|side: f64| {
        let way = toward + side * FRAC_PI_2;
        let aside = [spot[0] + libm::sin(way) * STEP_ASIDE, spot[1] - libm::cos(way) * STEP_ASIDE, spot[2]];
        let differs = free(blocks, spot, aside) && sees(aside) != open;
        differs.then_some(if open { (aside, spot) } else { (spot, aside) })
    })
}

/// The best post near it against where it believes its target is, or none: spots in the bake's order, the first of
/// equal cost kept, none within the gap of another shooter's post or of `except`.
fn pick(here: &Here<'_, '_>, board: &Board, sight: &Sight, except: Option<[f64; 3]>) -> Option<Post> {
    let target = chest(sight.spot);
    let standoff = here.numbers.standoff;
    let (near, far) = band(here.fighter.arms.ranged.unwrap_or(Ranged::Bow));
    let (near, far, least) = (near * standoff, far * standoff, KITE_OUT * standoff);
    let taken: Vec<[f64; 3]> = board.posts_but(here.me).chain(except).collect();
    let mut best: Option<(f64, Post)> = None;
    for spot in here.world.spots.near(here.feet(), POST_SEEK) {
        let at = flat(spot.point);
        let distance = apart(at, flat(target));
        let crowded = taken.iter().any(|other| apart(at, flat(*other)) < POST_GAP);
        if spot.cover == 0 || distance <= least || distance > SHOOT_RANGE || crowded {
            continue;
        }
        let Some((hide, fire)) = stances(here.world.blocks, spot.point, target) else { continue };
        let from_target = bearing(flat(target), at);
        let cost = NEAR_WEIGHT * apart(here.at(), at)
            + BAND_WEIGHT * ((near - distance).max(0.0) + (distance - far).max(0.0))
            - COVER_WEIGHT * alignment(spot.cover, from_target + PI)
            + FLANK_WEIGHT * (1.0 + libm::cos(off(sight.fighter.aim, from_target))) / 2.0;
        if best.is_none_or(|(lowest, _)| cost < lowest) {
            let post = Post { spot: spot.point, hide, fire, target: sight.id, against: sight.spot, blind: !sight.seen };
            best = Some((cost, post));
        }
    }
    best.map(|(_, post)| post)
}

/// Its post this tick: kept while its target stands near where it was picked against, its line clear and its cover
/// whole; else picked again, with its target in sight and none sought in vain just now; or, looking out with its target not there, picked once more
/// against where it believes it is, away from the post that failed.
fn post(brain: &Brain, here: &Here<'_, '_>, board: &Board, sight: &Sight) -> Option<Post> {
    let blocks = here.world.blocks;
    let sees = |point: [f64; 3]| clear_line(blocks, chest(point), chest(sight.spot));
    let whole = |post: &Post| {
        post.target == sight.id
            && apart(flat(post.against), flat(sight.spot)) <= REPICK
            && sees(post.fire)
            && !sees(post.hide)
    };
    let kept = brain.bow.post.filter(whole);
    let looking = |post: &Post| brain.bow.peeking && apart(here.at(), flat(post.fire)) <= THERE;
    match kept {
        Some(post) if !sight.seen && looking(&post) => {
            (!post.blind).then(|| pick(here, board, sight, Some(post.spot))).flatten()
        }
        Some(post) => Some(post),
        None if sight.seen && here.tick() >= brain.bow.seek_at => pick(here, board, sight, None),
        None => None,
    }
}

/// A shooter's tick at its post, or None to fight as on open ground. Hidden, it waits out its hiding (or its hurt),
/// then looks out from its post's line for a while, raising its weapon behind its cover when it has its turn and
/// loosing once drawn on the line; a shot, a reload or its look spent sends it back behind its cover.
pub fn hold(brain: &mut Brain, here: &Here<'_, '_>, board: &mut Board, sight: &Sight, has: bool) -> Option<Ask> {
    let tick = here.tick();
    let Some(post) = post(brain, here, board, sight) else {
        if brain.bow.seek_at <= tick {
            brain.bow.seek_at = tick + Here::ticks(POST_RETRY);
        }
        leave_post(brain, board, here.me);
        return None;
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
    if brain.bow.peeking && (hurt || spent || matches!(action, Action::Reload { .. })) {
        brain.bow.peeking = false;
        brain.bow.turn_at = tick + Here::ticks(here.dice.between(Purpose::Hide, HIDE));
    } else if !brain.bow.peeking && !hurt && tick >= brain.bow.turn_at {
        brain.bow.peeking = true;
        brain.bow.turn_at = tick + Here::ticks(PEEK);
    }
    let goal = if brain.bow.peeking { post.fire } else { post.hide };
    let distance = apart(here.at(), flat(goal));
    // Near its goal it steps straight there, unless its cover stands between: then it goes round by its routes.
    if distance > POST_LEAVE || !free(here.world.blocks, here.feet(), goal) {
        let walk = |way: f64| Ask::walking(way, 1.0, distance > RUN_FROM);
        return Some(way_to(here, goal).map_or_else(|| Ask::facing(sight.toward), walk));
    }
    let shooting =
        if brain.bow.peeking { fire(brain, here, board, sight, has && !hurt, true) } else { Ask::facing(sight.toward) };
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
