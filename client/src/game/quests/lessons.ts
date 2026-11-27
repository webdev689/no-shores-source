// The opening's riding and sailing lessons on the page, and the steps that teach the keepers' gifts (`use`): each
// step's keys as bound now on the keys or the pad played last, as the wreck's teaching names them; which steps are done
// anywhere, so the compass points past them. A step is ticked in the tracker alone, never announced at the foot: the
// lessons' steps come seconds apart. The rooms judge every step; this only shows.
import type { Binds, Device } from '../../player/binds.ts';
import { keysOf } from '../hints.ts';
import type { Goal } from './questBook.ts';

/** The controls each lesson's act is done with, as the key strip names them (keys|pad where they differ). */
const LESSON_KEYS: Readonly<Record<string, string>> = {
  'ride:mount': 'mount',
  'ride:walk': 'forward',
  'ride:gallop': 'run',
  'ride:boost': 'jump',
  'ride:dismount': 'mount',
  'sail:board': 'leave',
  'sail:sail': 'sailOn',
  'sail:steer': 'steerLeft / steerRight',
  // The pace dial is gone: W sails on at a click's ×60, a voyage planned on the map at ×200.
  'sail:trim': 'sailOn / map',
  'sail:map': 'map',
  'sail:fire': 'aim|fire',
  'use:dye': 'character',
};

/** The lesson's act a goal asks, `ride:gallop` and so on; none for a goal with no act. */
const actOf = (goal: Goal): string | null => (goal.act ? `${goal.kind}:${goal.act}` : null);

/** The keys a lesson's step is done with on `device` under `binds`, every key of each; none for any other goal. */
export function lessonKeys(goal: Goal, device: Device, binds: Binds): string[] {
  const act = actOf(goal);
  const names = act ? LESSON_KEYS[act] : undefined;
  return names ? keysOf(names, device, binds, true) : [];
}

/** Whether a lesson's step is done wherever the player is, so nothing is pointed at for it: a riding act but riding
 *  up to a counter, a gift used at no counter (the dye), and at sea every sailing act but the hulk's gunnery. */
export function doneAnywhere(goal: Goal, atSea: boolean): boolean {
  if (goal.kind === 'ride' || goal.kind === 'use') return goal.to === undefined;
  return goal.kind === 'sail' && atSea && goal.act !== 'fire';
}
