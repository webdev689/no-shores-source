import type { Orbit } from '../editor/orbit.ts';
import type { Block, Body, MovementRules } from '../rules/movementRules.ts';
import { MELEE, RANGED_SLOT } from './gear.ts';
import type { InputFrame } from './input.ts';
import { RUNNING } from './others.ts';
import {
  AIM,
  type AimPlace,
  aimEased,
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
 * One frame of the player with DFO's controls: the mouse (with the pointer locked) and the arrow and look keys turn
 * the view; W A S D move, Shift runs, Space jumps, C crouches; Z readies or puts away the weapon, and a right click
 * readies it too; 1 draws the Melee loadout and 2 the Ranged; R casts the Art's Anima, Q and G its Tenets; comma
 * mounts or dismounts; the wheel and Mouse4 move between first and third person. A cast plays once the fight takes
 * one (`Walker.beginCast`). The body moves in whole ticks of the movement rules; the view turns every frame.
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
  const turn = (input.held('turnRight') ? 1 : 0) - (input.held('turnLeft') ? 1 : 0);
  const look = (input.held('lookDown') ? 1 : 0) - (input.held('lookUp') ? 1 : 0);
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

  const forward = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0);
  const sideways = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
  let queued = {
    jump: player.queued.jump || input.pressed('jump'),
    crouch: player.queued.crouch || input.pressed('crouch'),
  };
  let { body, previous } = player;
  let carry = player.carry + seconds;
  while (carry >= movement.tickSeconds) {
    carry -= movement.tickSeconds;
    previous = body;
    body = movement.step(body, { forward, sideways, yaw, run: input.held('run'), ...queued, mounted });
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

/** The camera the scene draws the player's frame from, its aiming view at `place`. */
export function playerCamera(
  player: Player,
  movement: MovementRules,
  blocks: readonly Block[],
  place: AimPlace = AIM,
): Orbit {
  const body = shownBody(player);
  const head = [body.x, body.y, body.z + movement.eyeHeight(body) + (player.mounted ? SADDLE : 0)] as const;
  return cameraOrbit(head, player.yaw, player.pitch, player.view, blocks, player.aim, place);
}
