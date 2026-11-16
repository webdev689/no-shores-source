import type { SeenPlayer } from '../network/messages.ts';
import type { Body } from '../rules/movementRules.ts';
import type { Placed } from './figures.ts';

/** Faster than a walk on foot is running. */
export const RUNNING = 5.5;

/** The forge move another player's figure plays for the body the room last saw. */
export function moveOf(body: Body): string {
  if (body.mode === 'hang') return body.moving ? 'shimmy' : 'hang';
  if (body.mode === 'climb' || body.mode === 'mantle' || body.mode === 'vault') return body.mode;
  if (body.mode === 'air') return 'jump';
  if (body.crouched) return body.moving ? 'crouch_walk' : 'crouch_idle';
  if (!body.moving) return 'idle';
  return Math.hypot(body.vx, body.vy) > RUNNING ? 'run' : 'walk';
}

/** Moves another player's figure to the body the room last saw. It shows the move their own screen showed with it,
 *  facing as it faced, where the forge draws that move for this figure; else the move their body is in. */
export function showOther(placed: Placed, seen: SeenPlayer, draws: (anim: string) => boolean): void {
  const own = seen.anim !== '' && draws(seen.anim);
  const { x, y, z } = seen.body;
  const look = own
    ? { anim: seen.anim, frame: seen.frame, facing: seen.facing }
    : { anim: moveOf(seen.body), frame: null, facing: seen.body.facing };
  Object.assign(placed, { x, y, z, ...look });
}
