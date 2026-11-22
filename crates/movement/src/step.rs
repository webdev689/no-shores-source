//! One step of a body: the rules for each way it can be held.

use crate::blocks::{
    Block, WallAhead, feet_after, ground_at, pushed_out, room_at, slide, under_ceiling, wall_ahead, wall_top,
};
use crate::body::{Body, Controls, Mode, Over, TUNING};
use crate::near::Near;
use crate::terrain::Terrain;
use std::f64::consts::PI;

/// Where the player's controls point the body on the ground, in metres east and south per unit, how long that is, and
/// the share of its pace it moves at there.
#[derive(Clone, Copy, Debug)]
struct Wish {
    x: f64,
    y: f64,
    length: f64,
    pace: f64,
}

fn ease(current: f64, target: f64, seconds: f64) -> f64 {
    current + (target - current) * (seconds / TUNING.crouch_seconds).min(1.0)
}

/// The speed the body moves at on the ground.
fn pace_of(crouched: bool, controls: &Controls) -> f64 {
    if controls.mounted {
        if controls.run { TUNING.ride_gallop } else { TUNING.ride_walk }
    } else if crouched {
        TUNING.crouch
    } else if controls.run {
        TUNING.run
    } else {
        TUNING.walk
    }
}

/// Whether a body has room to stand at a point with its feet at `z`.
fn room_to_stand<B: Near + ?Sized>(blocks: &B, x: f64, y: f64, z: f64) -> bool {
    room_at(blocks, x, y, z, TUNING.height)
}

/// Starts a mantle up onto a lip, or a vault over a low, thin block: the body goes over it in time with its rise.
/// None where there is no room to stand over the lip, or where a vault lands, under a floor above it; or where the
/// terrain walls the way over, as at a deck's edge: the body is never carried past one.
fn go_over<B: Near + ?Sized>(
    body: &Body,
    ahead: &WallAhead,
    bearing: f64,
    vault: bool,
    blocks: &B,
    terrain: &dyn Terrain,
) -> Option<Body> {
    let (dir_x, dir_y) = (libm::sin(bearing), -libm::cos(bearing));
    let rise = ahead.block.top - body.z;
    let onto = TUNING.radius + 0.3;
    if !room_to_stand(blocks, body.x + dir_x * onto, body.y + dir_y * onto, ahead.block.top) {
        return None;
    }
    let reach_over = if vault { clearing(&ahead.block, body, dir_x, dir_y) + 0.2 } else { onto };
    if vault && !room_to_stand(blocks, body.x + dir_x * reach_over, body.y + dir_y * reach_over, body.z) {
        return None;
    }
    let to = [body.x + dir_x * reach_over, body.y + dir_y * reach_over, if vault { body.z } else { ahead.block.top }];
    if terrain.walled((body.x, body.y), (to[0], to[1])) {
        return None;
    }
    // DFO's mantle time at middling skill: (0.25 + 0.22 rise)(1.3 - 0.5 skill).
    let seconds = (0.25 + 0.22 * rise.max(0.0)) * 1.05;
    Some(Body {
        mode: if vault { Mode::Vault } else { Mode::Mantle },
        over: Some(Over { from: [body.x, body.y, body.z], to, progress: 0.0, seconds }),
        vx: 0.0,
        vy: 0.0,
        vz: 0.0,
        lip: ahead.block.top,
        facing: bearing,
        ..*body
    })
}

/// How far a body goes along (`dir_x`, `dir_y`) before its radius clears the block's far side, head on or slantwise.
/// A vault carries it that far and a little more, so it lands past the block wherever it met it from.
fn clearing(block: &Block, body: &Body, dir_x: f64, dir_y: f64) -> f64 {
    let out = |at: f64, dir: f64, low: f64, high: f64| {
        if dir > 0.0 {
            (high + TUNING.radius - at) / dir
        } else if dir < 0.0 {
            (low - TUNING.radius - at) / dir
        } else {
            f64::INFINITY
        }
    };
    out(body.x, dir_x, block.min_x, block.max_x).min(out(body.y, dir_y, block.min_y, block.max_y))
}

/// Whether a lip `rise` over the feet, on a block `depth` deep, is vaulted rather than mantled.
fn vaults(rise: f64, ahead: &WallAhead) -> bool {
    rise <= TUNING.vault && ahead.depth <= TUNING.vault_depth
}

/// An angle wrapped into (-PI, PI].
#[must_use]
pub fn wrap(angle: f64) -> f64 {
    let turns = libm::floor((angle + PI) / (2.0 * PI));
    let wrapped = angle - turns * 2.0 * PI;
    if wrapped <= -PI { wrapped + 2.0 * PI } else { wrapped }
}

/// One step of the body for `seconds` among `blocks` standing on `terrain`: walking, running and crouching on the
/// ground, up steps and slopes; jumping and falling; grabbing a lip on a jump to hang, mantle or vault; shimmying
/// along a lip; climbing a wall too high to grab.
#[must_use]
pub fn step_body<B: Near + ?Sized>(
    body: &Body,
    controls: &Controls,
    blocks: &B,
    terrain: &dyn Terrain,
    seconds: f64,
) -> Body {
    step_body_paced(body, controls, blocks, terrain, seconds, 1.0)
}

/// One step of the body as `step_body` takes it, moving `pace` times its pace on the ground: a Hasted fighter's.
#[must_use]
pub fn step_body_paced<B: Near + ?Sized>(
    body: &Body,
    controls: &Controls,
    blocks: &B,
    terrain: &dyn Terrain,
    seconds: f64,
    pace: f64,
) -> Body {
    // The controls come from a player's machine: held to their range here, a body never takes a NaN from them, and a
    // look turned past half a turn is wrapped, as the fight's rules wrap it, so a browser's step and a room's agree.
    let unit = |value: f64| if value.is_finite() { value.clamp(-1.0, 1.0) } else { 0.0 };
    let yaw = if controls.yaw.is_finite() { wrap(controls.yaw) } else { 0.0 };
    let controls = &Controls { forward: unit(controls.forward), sideways: unit(controls.sideways), yaw, ..*controls };
    let (sin, cos) = (libm::sin(controls.yaw), libm::cos(controls.yaw));
    let wish_x = sin * controls.forward + cos * controls.sideways;
    let wish_y = -cos * controls.forward + sin * controls.sideways;
    let wish = Wish { x: wish_x, y: wish_y, length: (wish_x * wish_x + wish_y * wish_y).sqrt(), pace };
    match body.mode {
        Mode::Mantle | Mode::Vault => going_over(body, blocks, seconds),
        Mode::Hang | Mode::Climb => on_wall(body, controls, blocks, terrain, seconds),
        Mode::Air => in_air(body, controls, blocks, terrain, seconds, wish),
        Mode::Ground => on_ground(body, controls, blocks, terrain, seconds, wish),
    }
}

/// Mantling or vaulting: along the way at its pace, rising first and then going over, so it never cuts the lip.
fn going_over<B: Near + ?Sized>(body: &Body, blocks: &B, seconds: f64) -> Body {
    let Some(over) = body.over else { return Body { mode: Mode::Ground, ..*body } };
    let progress = (over.progress + seconds / over.seconds).min(1.0);
    let along = |axis: usize| over.from[axis] + (over.to[axis] - over.from[axis]) * progress;
    let z = if body.mode == Mode::Vault {
        over.from[2] + libm::sin(progress * PI) * (body.lip - over.from[2] + 0.2)
    } else {
        over.from[2] + (over.to[2] - over.from[2]) * (progress * 1.6).min(1.0)
    };
    let (x, y) = (along(0), along(1));
    let z = under_ceiling(blocks, x, y, body.z, z, body.height());
    let next = Body { x, y, z, over: Some(Over { progress, ..over }), moving: true, ..*body };
    if progress >= 1.0 { Body { mode: Mode::Ground, over: None, z: over.to[2], grounded: 0.0, ..next } } else { next }
}

/// Hanging from a lip or climbing a wall: crouch lets go, forward at the lip goes over, sideways moves along it, and on
/// the wall forward climbs and a jump kicks off.
fn on_wall<B: Near + ?Sized>(
    body: &Body,
    controls: &Controls,
    blocks: &B,
    terrain: &dyn Terrain,
    seconds: f64,
) -> Body {
    if controls.crouch {
        return Body { mode: Mode::Air, vz: 0.0, moving: false, ..*body };
    }
    let Some(ahead) = wall_ahead(blocks, body, body.facing) else {
        return Body { mode: Mode::Air, moving: false, ..*body };
    };
    let ahead = wall_top(blocks, body, body.facing, ahead);
    let lip_above = ahead.block.top - body.z;
    let climbing = body.mode == Mode::Climb;
    if controls.jump && climbing {
        let (back_x, back_y) = (-libm::sin(body.facing) * 3.0, libm::cos(body.facing) * 3.0);
        return Body { mode: Mode::Air, vx: back_x, vy: back_y, vz: TUNING.jump, moving: false, ..*body };
    }
    if controls.forward > 0.0
        && lip_above <= TUNING.hang + 0.01
        && let Some(over) = go_over(body, &ahead, body.facing, false, blocks, terrain)
    {
        return over;
    }
    let (along_x, along_y) = (libm::cos(body.facing), libm::sin(body.facing));
    let pace = if climbing { TUNING.climb } else { TUNING.shimmy };
    let along = controls.sideways * pace * seconds;
    let moved = Body { x: body.x + along_x * along, y: body.y + along_y * along, ..*body };
    // Off the end of the block there is nothing to hold, into a block beside it no room, and past the terrain's wall (a
    // rim round a course laid over the sea) nowhere to be.
    let holds = wall_ahead(blocks, &moved, body.facing).is_some()
        && room_at(blocks, moved.x, moved.y, body.z, body.height())
        && !terrain.walled((body.x, body.y), (moved.x, moved.y));
    let (x, y) = if holds { (moved.x, moved.y) } else { (body.x, body.y) };
    let mut z = body.z;
    if climbing {
        let climbed = (z + controls.forward * TUNING.climb * seconds).max(ground_at(blocks, terrain, x, y, z));
        z = under_ceiling(blocks, x, y, z, climbed, body.height());
    }
    let lip = ahead.block.top;
    // A hold taken below the wall's top, at a seam between blocks stacked on it, climbs on to the top.
    let mode = match body.mode {
        Mode::Climb if lip - z <= TUNING.hang => Mode::Hang,
        Mode::Hang if lip - z > TUNING.hang + 0.01 => Mode::Climb,
        mode => mode,
    };
    if mode == Mode::Hang {
        z = lip - TUNING.hang;
    }
    let moving = along != 0.0 || (climbing && controls.forward != 0.0);
    Body { x, y, z, mode, lip, moving, vx: 0.0, vy: 0.0, vz: 0.0, ..*body }
}

/// In the air: falling under gravity, exactly for a constant pull so a jump's apex does not hang on the tick, and
/// catching a lip in reach when pressed into a wall.
fn in_air<B: Near + ?Sized>(
    body: &Body,
    controls: &Controls,
    blocks: &B,
    terrain: &dyn Terrain,
    seconds: f64,
    wish: Wish,
) -> Body {
    let mut fall_speed = body.vz - TUNING.gravity * seconds;
    let rising = body.z + body.vz * seconds - 0.5 * TUNING.gravity * seconds * seconds;
    let (x, y) = slide(blocks, terrain, body, body.vx * seconds, body.vy * seconds);
    // The head meets a ceiling: the rise stops there and its upward speed ends.
    let z = under_ceiling(blocks, x, y, body.z, rising, body.height());
    if z < rising {
        fall_speed = fall_speed.min(0.0);
    }
    // Sinking past the top of a block beside it, a body slow to clear it is pushed out, judged where its feet end:
    // on the ground they reach, or else where they fell to.
    let (x, y) =
        pushed_out(blocks, terrain, x, y, body.height(), |x, y| z.max(ground_at(blocks, terrain, x, y, body.z)));
    let crouch = ease(body.crouch, if body.crouched { 1.0 } else { 0.0 }, seconds);
    let moved = Body { x, y, z, ..*body };
    if wish.length > 0.0
        && controls.forward > 0.0
        && let Some(ahead) = wall_ahead(blocks, &moved, controls.yaw)
        && ahead.block.top - z <= TUNING.reach + TUNING.reach_in_air
    {
        let rise = ahead.block.top - z;
        let floor = ground_at(blocks, terrain, x, y, body.z);
        // A lip too low to hang from, with the feet clear of the ground, is climbed straight over. Where bodies never
        // climb, only a lip within a vault of the floor is gone over, and none is hung from.
        let low_lip = ahead.block.top - TUNING.hang < floor;
        let goes_over =
            if terrain.climbs() { rise <= TUNING.vault || low_lip } else { ahead.block.top - floor <= TUNING.vault };
        if goes_over {
            // Over it, unless the terrain walls the way past it: then it lands as if no lip stood there.
            if let Some(over) = go_over(&moved, &ahead, controls.yaw, vaults(rise, &ahead), blocks, terrain) {
                return over;
            }
        } else if terrain.climbs() {
            return Body {
                z: ahead.block.top - TUNING.hang,
                mode: Mode::Hang,
                lip: ahead.block.top,
                facing: controls.yaw,
                vx: 0.0,
                vy: 0.0,
                vz: 0.0,
                moving: false,
                ..moved
            };
        }
    }
    let ground = ground_at(blocks, terrain, x, y, body.z);
    if z <= ground {
        return Body { z: ground, vz: 0.0, mode: Mode::Ground, grounded: 0.0, crouch, moving: false, ..moved };
    }
    Body { vz: fall_speed, crouch, moving: false, ..moved }
}

/// On the ground: walking, running or crouching where the controls point, up steps and off edges; jumping, or going
/// over a lip in reach; and taking hold of a wall too high to grab.
fn on_ground<B: Near + ?Sized>(
    body: &Body,
    controls: &Controls,
    blocks: &B,
    terrain: &dyn Terrain,
    seconds: f64,
    wish: Wish,
) -> Body {
    // A body set down overlapping a block, as a blow's charge may leave it, is pushed out before it moves.
    let (x, y) =
        pushed_out(blocks, terrain, body.x, body.y, body.height(), |x, y| feet_after(blocks, terrain, body, x, y));
    let body = &Body { x, y, ..*body };
    // A crouched body stands up only where there is room over its head.
    let stand_up = controls.crouch && body.crouched && room_to_stand(blocks, body.x, body.y, body.z);
    let crouched = if controls.crouch && !body.crouched { true } else { body.crouched && !stand_up };
    let crouch = ease(body.crouch, if crouched { 1.0 } else { 0.0 }, seconds);
    let facing = if wish.length > 0.0 { libm::atan2(wish.x, -wish.y) } else { body.facing };
    let pace = pace_of(crouched, controls) * wish.pace;
    let scale = if wish.length > 0.0 { pace * seconds / wish.length.max(1.0) } else { 0.0 };
    // Moved as tall as it now stands, so standing up never walks the head into a slab.
    let (x, y) = slide(blocks, terrain, &Body { crouched, ..*body }, wish.x * scale, wish.y * scale);
    let ground = ground_at(blocks, terrain, x, y, body.z);
    let (moved_x, moved_y) = (x - body.x, y - body.y);
    let moving = (moved_x * moved_x + moved_y * moved_y).sqrt() > 1e-6;
    let (vx, vy) = (moved_x / seconds.max(1e-6), moved_y / seconds.max(1e-6));
    let grounded = body.grounded + seconds;
    let next = Body { x, y, vx, vy, z: ground, crouched, crouch, grounded, facing, moving, ..*body };
    if ground < body.z - TUNING.step {
        return Body { z: body.z, mode: Mode::Air, vz: 0.0, grounded: 0.0, ..next };
    }
    // Six ticks of 1/60 s add up a hair short of 0.1 s, so the stand before a jump is held to within a nanosecond.
    if controls.jump && grounded + 1e-9 >= TUNING.grounded_to_jump && !controls.mounted {
        let ahead = if controls.forward > 0.0 { wall_ahead(blocks, &next, controls.yaw) } else { None };
        // A lip in reach from the ground is vaulted if low and thin, else mantled; a higher one is caught in the air.
        // Where bodies never climb, the reach is a vault's.
        let reach = if terrain.climbs() { TUNING.reach } else { TUNING.vault };
        if let Some(ahead) = ahead.filter(|ahead| ahead.block.top - next.z <= reach)
            && let Some(over) =
                go_over(&next, &ahead, controls.yaw, vaults(ahead.block.top - next.z, &ahead), blocks, terrain)
        {
            return over;
        }
        let lift = TUNING.jump * if crouched { TUNING.crouched_jump } else { 1.0 };
        return Body {
            mode: Mode::Air,
            vz: lift,
            vx: vx * 1.05,
            vy: vy * 1.05,
            crouched: crouched && !room_to_stand(blocks, x, y, ground),
            grounded: 0.0,
            ..next
        };
    }
    // Pressing into a wall too high to grab, the body takes hold of it, square to it, and climbs: standing to, so not
    // where a crouched body has no room to stand, nor where bodies never climb.
    let takes_hold = controls.forward > 0.0 && !controls.mounted && terrain.climbs();
    let wall = if takes_hold { wall_ahead(blocks, &next, controls.yaw) } else { None };
    let can_stand = !next.crouched || room_to_stand(blocks, next.x, next.y, next.z);
    let into = wall
        .filter(|wall| wall.block.top - next.z > TUNING.reach && can_stand)
        .and_then(|wall| pressed_into(&wall.block, body, &next, controls.yaw).map(|facing| (wall.block.top, facing)));
    match into {
        Some((lip, facing)) => Body { mode: Mode::Climb, facing, lip, crouched: false, ..next },
        None => next,
    }
}

/// How near square to a wall a look must be for a body pressed into it to take hold of it.
pub const CLIMB_SQUARE: f64 = 45.0 * PI / 180.0;

/// The bearing square into the side of `block` a body stands against, if its move from `before` to `after` made no
/// way into that side, however it slid along it, and the look is within `CLIMB_SQUARE` of square to it.
fn pressed_into(block: &Block, before: &Body, after: &Body, yaw: f64) -> Option<f64> {
    let into = square_into(block, after);
    let stopped = if into == 0.0 || into == PI { after.y == before.y } else { after.x == before.x };
    (stopped && wrap(yaw - into).abs() <= CLIMB_SQUARE).then_some(into)
}

/// The bearing square into the side of `block` nearest a body standing outside it.
#[must_use]
pub fn square_into(block: &Block, body: &Body) -> f64 {
    let gap_x = (block.min_x - body.x).max(body.x - block.max_x);
    let gap_y = (block.min_y - body.y).max(body.y - block.max_y);
    if gap_y >= gap_x {
        if body.y > block.max_y { 0.0 } else { PI }
    } else if body.x > block.max_x {
        -PI / 2.0
    } else {
        PI / 2.0
    }
}
