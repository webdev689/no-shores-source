import type { Orbit } from '../editor/orbit.ts';
import type { Block, Body, MovementRules } from '../rules/movementRules.ts';
import { MELEE, RANGED_SLOT } from './gear.ts';
import { type InputFrame, axis } from './input.ts';
import { RUNNING } from './others.ts';
import {
  AIM,
  type AimPlace,
  aimEased,
  boomFollowed,
  cameraOrbit,
  eased,
  FIRST_PERSON,
  scrolled,
  toggled,
  type ViewMode,
} from './playerCamera.ts';

/** The player: their body, where they look, how the camera is held, whether they ride, their weapon out or away and
 *  which loadout it is, and the cast or chosen move playing. The first person's weapon swings; this only readies it. */
export interface Player {
  readonly body: Body;
  /** The body a tick before, which the drawing eases from, and how far it has eased toward `body` (0..1). */
  readonly previous: Body;
  readonly blend: number;
  /** Seconds since the last tick, toward the next. */
  readonly carry: number;
  /** A jump or a crouch pressed since the last tick, kept for the next so a press between ticks is never lost. */
  readonly queued: { readonly jump: boolean; readonly crouch: boolean };
  readonly yaw: number;
  readonly pitch: number;
  readonly view: ViewMode;
  readonly mounted: boolean;
  readonly drawn: boolean;
  /** The loadout drawn: the gear's slot, Melee (the first) or Ranged. */
  readonly loadout: number;
  readonly cast: number | null;
  readonly act: { readonly anim: string; readonly elapsed: number; readonly seconds: number } | null;
  /** The way the figure faces, which only moving or acting turns. */
  readonly facing: number;
  /** How far the camera has eased into aiming's view, 0 to 1. */
  readonly aim: number;
}

/** A cast lasts its four frames at 0.125 s each. */
export const CAST_SECONDS = 4 * 0.125;
/** How far the mouse turns the view, in radians a pixel, and the arrow and look keys in radians a second. */
const MOUSE_TURN = 0.0025;
const KEY_TURN = 2;
/** The highest and lowest the view looks. */
const PITCH_LIMIT = 1.4;
/** A rider's eye is this much higher than on foot. */
const SADDLE = 0.9;

export function newPlayer(movement: MovementRules, x: number, y: number): Player {
  const body = movement.standing(x, y);
  return {
    body,
    previous: body,
    blend: 1,
    carry: 0,
    queued: { jump: false, crouch: false },
    yaw: 0,
    pitch: 0.1,
    view: { ...scrolled(FIRST_PERSON, 1), shown: 2 },
    mounted: false,
    drawn: false,
    loadout: MELEE,
    cast: null,
    act: null,
    facing: 0,
    aim: 0,
  };
}

/**
 * One frame of the player with their controls: the mouse (with the pointer locked) and the turn and look controls
 * turn the view; the move controls move, as far as a stick leans; run, jump, crouch; ready readies or puts away the
 * weapon, as a swing readies it; the loadouts draw theirs; mount mounts or dismounts; the wheel and perspective move
 * between first and third person. A cast plays once the fight takes one (`Walker.beginCast`). The body moves in
 * whole ticks of the movement rules; the view turns every frame.
 * `swinging` says a swing is under way, which turns the figure to the view; `toward` is the bearing to the soft lock's
 * target, which a figure on foot faces however it walks; `aiming` says a ranged weapon is held up to aim, which eases
 * the camera into aiming's view.
 */
export function updatePlayer(
  player: Player,
  input: InputFrame,
  movement: MovementRules,
  seconds: number,
  swinging = false,
  toward: number | null = null,
  aiming = false,
): Player {
  const turn = axis(input, 'turnLeft', 'turnRight');
  const look = axis(input, 'lookUp', 'lookDown');
  const yaw = player.yaw + input.lookX * MOUSE_TURN + turn * KEY_TURN * seconds;
  const pitch = Math.max(
    -PITCH_LIMIT,
    Math.min(PITCH_LIMIT, player.pitch + input.lookY * MOUSE_TURN + look * KEY_TURN * seconds),
  );
  let view = scrolled(player.view, Math.sign(input.wheel));
  if (input.pressed('perspective')) view = toggled(view);
  view = eased(view, seconds);
  const mounted = input.pressed('mount') ? !player.mounted : player.mounted;
  let drawn = input.pressed('ready') ? !player.drawn : player.drawn;

  if (!drawn && input.pressed('swing') && !mounted) drawn = true;
  const chosen = input.pressed('ranged') ? RANGED_SLOT : input.pressed('melee') ? MELEE : null;
  const loadout = chosen ?? player.loadout;
  if (chosen !== null && !mounted) drawn = true;
  let cast = player.cast === null ? null : player.cast + seconds;
  if (cast !== null && cast >= CAST_SECONDS) cast = null;
  let act = player.act ? { ...player.act, elapsed: player.act.elapsed + seconds } : null;
  if (act && act.elapsed >= act.seconds) act = null;

  // A stick leant part of the way walks part of the pace.
  const forward = axis(input, 'back', 'forward');
  const sideways = axis(input, 'left', 'right');
  let queued = {
    jump: player.queued.jump || input.pressed('jump'),
    crouch: player.queued.crouch || input.pressed('crouch'),
  };
  let { body, previous } = player;
  let carry = player.carry + seconds;
  while (carry >= movement.tickSeconds) {
    carry -= movement.tickSeconds;
    previous = body;
    // A horse never jumps (the movement crate's rule), so a rider's jump is the horse's boost.
    body = movement.step(body, {
      forward,
      sideways,
      yaw,
      run: input.held('run'),
      ...queued,
      boost: queued.jump,
      mounted,
    });
    queued = { jump: false, crouch: false };
  }
  // DFO's figure faces where it moves and keeps its facing when still; striking or casting, it turns to the view.
  // Locked on, it faces its foe on foot, so walking away backs off rather than turning its back; a sprint faces where
  // it runs, and once it ends the figure faces its foe again. A sprint is a run's pace, as the run's frames are: the
  // run held while crouched, or slowed against a wall, goes no faster than a walk.
  const acting = swinging || cast !== null;
  const sprinting = Math.hypot(body.vx, body.vy) > RUNNING;
  const locked = toward !== null && !mounted && body.mode === 'ground' && !sprinting;
  const walked = body.moving ? body.facing : player.facing;
  const facing = acting ? yaw : locked ? toward : body.mode !== 'ground' ? body.facing : walked;
  const blend = carry / movement.tickSeconds;
  const aim = aimEased(player.aim, aiming, seconds);
  return { body, previous, blend, carry, queued, yaw, pitch, view, mounted, drawn, loadout, cast, act, facing, aim };
}

/** The body as drawn: eased from the tick before toward the last, so it moves smoothly at any frame rate, a move over
 *  a lip too while the same move goes on. */
export function shownBody(player: Player): Body {
  const { body, previous, blend } = player;
  const between = (from: number, to: number) => from + (to - from) * blend;
  const going = body.over && previous.over && previous.over.progress <= body.over.progress ? previous.over : null;
  return {
    ...body,
    x: between(previous.x, body.x),
    y: between(previous.y, body.y),
    z: between(previous.z, body.z),
    crouch: between(previous.crouch, body.crouch),
    over: body.over && going ? { ...body.over, progress: between(going.progress, body.over.progress) } : body.over,
  };
}

/** Where the player's eyes are, as drawn. */
function headOf(player: Player, movement: MovementRules): readonly [number, number, number] {
  const body = shownBody(player);
  return [body.x, body.y, body.z + movement.eyeHeight(body) + (player.mounted ? SADDLE : 0)];
}

/** A node's boxes, an outpost's walls and any more the camera keeps off (a boarded deck's), as one list made once
 *  while all stay the same lists: a node has thousands of boxes, and the camera is set every frame. */
interface Joined {
  readonly walls: readonly Block[];
  readonly more: readonly Block[];
  readonly blocks: readonly Block[];
}
const JOINED = new WeakMap<readonly Block[], Joined>();
const NONE: readonly Block[] = [];
export function withBlocks(
  boxes: readonly Block[],
  walls: readonly Block[] = NONE,
  more: readonly Block[] = NONE,
): readonly Block[] {
  if (!walls.length && !more.length) return boxes;
  const kept = JOINED.get(boxes);
  if (kept?.walls === walls && kept.more === more) return kept.blocks;
  const blocks = [...boxes, ...walls, ...more];
  JOINED.set(boxes, { walls, more, blocks });
  return blocks;
}

/** The camera the scene draws the player's frame from, its aiming view at `place`, kept off `blocks` and, given its
 *  height, the ground, and under the ceiling `roof` gives. */
export function playerCamera(
  player: Player,
  movement: MovementRules,
  blocks: readonly Block[],
  place: AimPlace = AIM,
  groundAt: ((x: number, y: number) => number | null) | null = null,
  roof: ((x: number, y: number) => number | null) | null = null,
): Orbit {
  const head = headOf(player, movement);
  return cameraOrbit(head, player.yaw, player.pitch, player.view, blocks, player.aim, place, groundAt, roof);
}

/** The player with the third-person camera's boom eased over `seconds` clear of `blocks` and the ground: called
 *  once a frame before `playerCamera`, so the camera comes in and goes out smoothly. */
export function cameraFollowed(
  player: Player,
  movement: MovementRules,
  blocks: readonly Block[],
  groundAt: ((x: number, y: number) => number | null) | null,
  seconds: number,
): Player {
  const head = headOf(player, movement);
  const { yaw, pitch, view, aim } = player;
  return { ...player, view: boomFollowed(head, yaw, pitch, view, blocks, aim, AIM, groundAt, seconds) };
}
