/** A block standing on the ground: its footprint (x east, y south, metres) and its top. */
export interface Block {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly top: number;
}

/** What the player asks of the body this frame: movement relative to where it looks (-1..1), the look's bearing,
 *  and the keys that act once. */
export interface Controls {
  readonly forward: number;
  readonly sideways: number;
  readonly yaw: number;
  readonly run: boolean;
  readonly jump: boolean;
  readonly crouch: boolean;
  readonly mounted: boolean;
}

/** How the body is held: on its feet, in the air, hanging from a lip, on a wall, or mantling or vaulting over one. */
export type Mode = 'ground' | 'air' | 'hang' | 'climb' | 'mantle' | 'vault';

/** The player's body: its feet (x, y, z), its velocity, the way it faces, and how it is held. */
export interface Body {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly facing: number;
  readonly mode: Mode;
  readonly crouched: boolean;
  /** 0 standing to 1 crouched, easing between. */
  readonly crouch: number;
  /** How long it has stood on the ground, for the jump. */
  readonly grounded: number;
  /** A mantle's or a vault's start, end and progress 0..1, and how long it takes. */
  readonly over: { from: Point3; to: Point3; progress: number; seconds: number } | null;
  /** The lip it hangs from or climbs towards. */
  readonly lip: number;
  /** Whether it moved along the ground or the wall this frame. */
  readonly moving: boolean;
}

type Point3 = readonly [number, number, number];

/** The body's measures and pace: DFO's numbers, the owner's choice ("Same numbers"). */
export const TUNING = {
  walk: 4.43,
  run: 7.59,
  crouch: 2.53,
  rideWalk: 6,
  rideGallop: 12,
  jump: 4.5,
  gravity: 20,
  radius: 0.35,
  step: 0.5,
  eye: 1.7,
  crouchedEye: 0.8,
  crouchSeconds: 0.1,
  groundedToJump: 0.1,
  crouchedJump: 0.8,
  /** How high a lip can be grabbed from the feet, standing and jumping. */
  reach: 1.8,
  reachInAir: 0.15,
  /** The highest lip vaulted over, and the deepest block. */
  vault: 1.2,
  vaultDepth: 0.8,
  /** Hanging from a lip, it is this far over the feet. */
  hang: 1.8,
  shimmy: 1.0,
  climb: 1.0,
} as const;

export const standing = (x: number, y: number): Body => ({
  x,
  y,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  facing: Math.PI,
  mode: 'ground',
  crouched: false,
  crouch: 0,
  grounded: 1,
  over: null,
  lip: 0,
  moving: false,
});

/** Where the eye is over the feet: standing, crouched, or easing between. */
export const eyeHeight = (body: Body): number => TUNING.eye + (TUNING.crouchedEye - TUNING.eye) * body.crouch;

const inside = (block: Block, x: number, y: number, margin: number) =>
  x > block.minX - margin && x < block.maxX + margin && y > block.minY - margin && y < block.maxY + margin;

/** The ground under a point: the highest block top at or below `z` plus a step, or the open ground. */
export function groundAt(blocks: readonly Block[], x: number, y: number, z: number, margin = 0): number {
  let ground = 0;
  for (const block of blocks)
    if (inside(block, x, y, margin) && block.top <= z + TUNING.step && block.top > ground) ground = block.top;
  return ground;
}

/** A block standing in the way at a point: one whose top is above a step over `z`. */
function blockingAt(blocks: readonly Block[], x: number, y: number, z: number): Block | null {
  return blocks.find((block) => inside(block, x, y, TUNING.radius) && block.top > z + TUNING.step) ?? null;
}

/** The block ahead of the body along a bearing, a short reach past its radius, and how deep it runs that way. */
export function wallAhead(
  blocks: readonly Block[],
  body: Body,
  bearing: number,
): { block: Block; depth: number } | null {
  const [dirX, dirY] = [Math.sin(bearing), -Math.cos(bearing)];
  const probe = TUNING.radius + 0.15;
  const block = blockingAt(blocks, body.x + dirX * probe, body.y + dirY * probe, body.z);
  if (!block) return null;
  const depth = Math.abs(dirX) > Math.abs(dirY) ? block.maxX - block.minX : block.maxY - block.minY;
  return { block, depth };
}

/** Moves along the ground, sliding along a block's side and stepping up onto one no higher than a step. */
function slide(blocks: readonly Block[], body: Body, moveX: number, moveY: number): { x: number; y: number } {
  let { x, y } = body;
  if (!blockingAt(blocks, x + moveX, y, body.z)) x += moveX;
  if (!blockingAt(blocks, x, y + moveY, body.z)) y += moveY;
  return { x, y };
}

const ease = (current: number, target: number, seconds: number) =>
  current + (target - current) * Math.min(1, seconds / TUNING.crouchSeconds);

/** The speed the body moves at on the ground. */
function paceOf(body: Body, controls: Controls): number {
  if (controls.mounted) return controls.run ? TUNING.rideGallop : TUNING.rideWalk;
  if (body.crouched) return TUNING.crouch;
  return controls.run ? TUNING.run : TUNING.walk;
}

/** Starts a mantle up onto a lip, or a vault over a low, thin block: the body goes over it in time with its rise. */
function goOver(body: Body, block: Block, bearing: number, depth: number, vault: boolean): Body {
  const [dirX, dirY] = [Math.sin(bearing), -Math.cos(bearing)];
  const rise = block.top - body.z;
  const reachOver = vault ? depth + TUNING.radius * 2 + 0.2 : TUNING.radius + 0.3;
  const to: Point3 = [body.x + dirX * reachOver, body.y + dirY * reachOver, vault ? body.z : block.top];
  // DFO's mantle time at middling skill: (0.25 + 0.22 rise)(1.3 - 0.5 skill).
  const seconds = (0.25 + 0.22 * Math.max(0, rise)) * 1.05;
  return {
    ...body,
    mode: vault ? 'vault' : 'mantle',
    over: { from: [body.x, body.y, body.z], to, progress: 0, seconds },
    vx: 0,
    vy: 0,
    vz: 0,
    lip: block.top,
    facing: bearing,
  };
}

/** One step of the body for `seconds`: walking, running and crouching on the ground and up steps; jumping and falling;
 *  grabbing a lip on a jump to hang, mantle or vault; shimmying along a lip; climbing a wall too high to grab. */
export function stepBody(body: Body, controls: Controls, blocks: readonly Block[], seconds: number): Body {
  const [sin, cos] = [Math.sin(controls.yaw), Math.cos(controls.yaw)];
  const wishX = sin * controls.forward + cos * controls.sideways;
  const wishY = -cos * controls.forward + sin * controls.sideways;
  const wishLength = Math.hypot(wishX, wishY);
  const crouched = controls.crouch && body.mode === 'ground' ? !body.crouched : body.crouched;
  const crouch = ease(body.crouch, crouched ? 1 : 0, seconds);
  const facingMoving = wishLength > 0 ? Math.atan2(wishX, -wishY) : body.facing;

  if (body.mode === 'mantle' || body.mode === 'vault') {
    const over = body.over;
    if (!over) return { ...body, mode: 'ground' };
    const progress = Math.min(1, over.progress + seconds / over.seconds);
    const along = (axis: 0 | 1 | 2) => over.from[axis] + (over.to[axis] - over.from[axis]) * progress;
    // The body rises first and then goes over, so it never cuts through the lip.
    const z =
      body.mode === 'vault'
        ? over.from[2] + Math.sin(progress * Math.PI) * (body.lip - over.from[2] + 0.2)
        : over.from[2] + (over.to[2] - over.from[2]) * Math.min(1, progress * 1.6);
    const next = { ...body, x: along(0), y: along(1), z, over: { ...over, progress }, moving: true };
    return progress >= 1 ? { ...next, mode: 'ground', over: null, z: over.to[2], grounded: 0 } : next;
  }

  if (body.mode === 'hang' || body.mode === 'climb') {
    if (controls.crouch) return { ...body, mode: 'air', vz: 0, moving: false };
    const ahead = wallAhead(blocks, body, body.facing);
    if (!ahead) return { ...body, mode: 'air', moving: false };
    const lipAbove = ahead.block.top - body.z;
    if (controls.jump && body.mode === 'climb') {
      const [backX, backY] = [-Math.sin(body.facing) * 3, Math.cos(body.facing) * 3];
      return { ...body, mode: 'air', vx: backX, vy: backY, vz: TUNING.jump, moving: false };
    }
    if (controls.forward > 0 && lipAbove <= TUNING.hang + 0.01)
      return goOver(body, ahead.block, body.facing, ahead.depth, false);
    const [alongX, alongY] = [Math.cos(body.facing), Math.sin(body.facing)];
    const along = controls.sideways * (body.mode === 'hang' ? TUNING.shimmy : TUNING.climb) * seconds;
    const moved = { x: body.x + alongX * along, y: body.y + alongY * along };
    // Off the end of the block, there is nothing to hold.
    const holding = wallAhead(blocks, { ...body, ...moved }, body.facing) ? moved : { x: body.x, y: body.y };
    let z = body.z;
    if (body.mode === 'climb') z = Math.max(0, z + controls.forward * TUNING.climb * seconds);
    const mode = body.mode === 'climb' && ahead.block.top - z <= TUNING.hang ? 'hang' : body.mode;
    if (mode === 'hang') z = ahead.block.top - TUNING.hang;
    const moving = along !== 0 || (body.mode === 'climb' && controls.forward !== 0);
    return { ...body, ...holding, z, mode, lip: ahead.block.top, moving, vx: 0, vy: 0, vz: 0 };
  }

  if (body.mode === 'air') {
    // Exact for constant gravity, so the jump's apex does not hang on the frame rate.
    const fallSpeed = body.vz - TUNING.gravity * seconds;
    const z = body.z + body.vz * seconds - 0.5 * TUNING.gravity * seconds * seconds;
    const moved = slide(blocks, body, body.vx * seconds, body.vy * seconds);
    // Into a wall with its lip in reach, the body catches it: it hangs, or goes over a low one.
    if (wishLength > 0 && controls.forward > 0) {
      const ahead = wallAhead(blocks, { ...body, ...moved, z }, controls.yaw);
      const rise = ahead ? ahead.block.top - z : Infinity;
      if (ahead && rise <= TUNING.reach + TUNING.reachInAir) {
        if (rise <= TUNING.vault)
          return goOver(
            { ...body, ...moved, z },
            ahead.block,
            controls.yaw,
            ahead.depth,
            ahead.depth <= TUNING.vaultDepth,
          );
        return {
          ...body,
          ...moved,
          z: ahead.block.top - TUNING.hang,
          mode: 'hang',
          lip: ahead.block.top,
          facing: controls.yaw,
          vx: 0,
          vy: 0,
          vz: 0,
          moving: false,
        };
      }
    }
    const ground = groundAt(blocks, moved.x, moved.y, body.z);
    if (z <= ground) return { ...body, ...moved, z: ground, vz: 0, mode: 'ground', grounded: 0, crouch, moving: false };
    return { ...body, ...moved, z, vz: fallSpeed, crouch, moving: false };
  }

  // On the ground.
  const pace = paceOf({ ...body, crouched }, controls);
  const scale = wishLength > 0 ? (pace * seconds) / Math.max(1, wishLength) : 0;
  const moved = slide(blocks, body, wishX * scale, wishY * scale);
  const ground = groundAt(blocks, moved.x, moved.y, body.z);
  const moving = Math.hypot(moved.x - body.x, moved.y - body.y) > 1e-6;
  const velocity = {
    vx: (moved.x - body.x) / Math.max(seconds, 1e-6),
    vy: (moved.y - body.y) / Math.max(seconds, 1e-6),
  };
  const grounded = body.grounded + seconds;
  const next: Body = {
    ...body,
    ...moved,
    ...velocity,
    z: ground,
    crouched,
    crouch,
    grounded,
    facing: facingMoving,
    moving,
  };
  if (ground < body.z - TUNING.step) return { ...next, z: body.z, mode: 'air', vz: 0, grounded: 0 };
  if (controls.jump && grounded >= TUNING.groundedToJump && !controls.mounted) {
    const ahead = controls.forward > 0 ? wallAhead(blocks, next, controls.yaw) : null;
    const rise = ahead ? ahead.block.top - next.z : Infinity;
    if (ahead && rise <= TUNING.vault)
      return goOver(next, ahead.block, controls.yaw, ahead.depth, ahead.depth <= TUNING.vaultDepth);
    if (ahead && rise <= TUNING.reach)
      return {
        ...next,
        z: ahead.block.top - TUNING.hang,
        mode: 'hang',
        lip: ahead.block.top,
        facing: controls.yaw,
        vx: 0,
        vy: 0,
      };
    const lift = TUNING.jump * (crouched ? TUNING.crouchedJump : 1);
    return {
      ...next,
      mode: 'air',
      vz: lift,
      vx: velocity.vx * 1.05,
      vy: velocity.vy * 1.05,
      crouched: false,
      grounded: 0,
    };
  }
  // Pressing into a wall too high to grab, the body takes hold of it and climbs.
  const wall = controls.forward > 0 && !controls.mounted ? wallAhead(blocks, next, controls.yaw) : null;
  if (wall && wall.block.top - next.z > TUNING.reach && !moving)
    return { ...next, mode: 'climb', facing: controls.yaw, lip: wall.block.top, crouched: false };
  return next;
}
