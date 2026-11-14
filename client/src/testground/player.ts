import type { Orbit } from '../editor/orbit.ts';
import type { InputFrame } from './input.ts';
import { type Block, type Body, eyeHeight, stepBody, standing } from './motor.ts';
import { cameraOrbit, eased, FIRST_PERSON, scrolled, toggled, type ViewMode } from './playerCamera.ts';

/** The player: their body, where they look, how the camera is held, whether they ride, their weapon out or away, and
 *  the cast or chosen move playing. The first person's weapon swings; this only readies it. */
export interface Player {
  readonly body: Body;
  readonly yaw: number;
  readonly pitch: number;
  readonly view: ViewMode;
  readonly mounted: boolean;
  readonly drawn: boolean;
  readonly cast: number | null;
  readonly act: { readonly anim: string; readonly elapsed: number; readonly seconds: number } | null;
  /** The way the figure faces, which only moving or acting turns. */
  readonly facing: number;
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

export const newPlayer = (x: number, y: number): Player => ({
  body: standing(x, y),
  yaw: 0,
  pitch: 0.1,
  view: { ...scrolled(FIRST_PERSON, 1), shown: 2 },
  mounted: false,
  drawn: false,
  cast: null,
  act: null,
  facing: 0,
});

/**
 * One frame of the player with DFO's controls: the mouse (with the pointer locked) and the arrow and look keys turn
 * the view; W A S D move, Shift runs, Space jumps, C crouches; Z readies or puts away the weapon, and a right click
 * readies it too; Q casts; comma mounts or dismounts; the wheel and Mouse4 move between first and third person.
 * `swinging` says a swing is under way, which turns the figure to the view.
 */
export function updatePlayer(
  player: Player,
  input: InputFrame,
  blocks: readonly Block[],
  seconds: number,
  swinging = false,
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
  let cast = player.cast === null ? null : player.cast + seconds;
  if (cast !== null && cast >= CAST_SECONDS) cast = null;
  if (cast === null && input.pressed('cast') && !mounted) cast = 0;
  let act = player.act ? { ...player.act, elapsed: player.act.elapsed + seconds } : null;
  if (act && act.elapsed >= act.seconds) act = null;

  const forward = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0);
  const sideways = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
  const body = stepBody(
    player.body,
    {
      forward,
      sideways,
      yaw,
      run: input.held('run'),
      jump: input.pressed('jump'),
      crouch: input.pressed('crouch'),
      mounted,
    },
    blocks,
    seconds,
  );
  // DFO's figure faces where it moves and keeps its facing when still; striking or casting, it turns to the view.
  const acting = swinging || cast !== null;
  const facing = acting ? yaw : body.mode !== 'ground' ? body.facing : body.moving ? body.facing : player.facing;
  return { body, yaw, pitch, view, mounted, drawn, cast, act, facing };
}

/** The camera the scene draws the player's frame from. */
export function playerCamera(player: Player, blocks: readonly Block[]): Orbit {
  const { body } = player;
  const head = [body.x, body.y, body.z + eyeHeight(body) + (player.mounted ? SADDLE : 0)] as const;
  return cameraOrbit(head, player.yaw, player.pitch, player.view, blocks);
}
