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

/** Moves another player's figure to the body the room last saw. */
export function showOther(placed: Placed, body: Body): void {
  Object.assign(placed, { x: body.x, y: body.y, z: body.z, facing: body.facing, anim: moveOf(body) });
}
