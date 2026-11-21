// The sea fight's sounds, read from the fight's own events: a gun fired, a ball striking a ship, a ball falling in the
// sea, and a ship breaking up as it goes down, each heard where it happens. Each is the owner's Freesound pick and
// plays through the sea's soundscape; until a pick has come, the fight is as silent as it always was.
import type { FightEvent, FightView, Point } from '../../../rules/fightRules.ts';

/** A frame's fight as its sounds read it: its events since the last frame, its ships as they lie, and how many times
 *  as loud its sounds are heard (1 unless said: the story's own fights are louder, to stand over its storm). */
export interface FightHeard {
  readonly events: readonly FightEvent[];
  readonly view: FightView;
  readonly gain?: number;
}

/** How near a fight's sound is heard whole, metres: a gun is a big sound, heard well across the fight. */
export const FIGHT_NEAR_M = 40;

/** Where a ship of the fight lies (0 the player's, 1 the captain's, then each other captain's), at its waterline. */
function shipAt(view: FightView, ship: number): Point | null {
  const vessel = ship === 0 ? view.player : ship === 1 ? view.captain : view.others?.[ship - 2];
  const [x, y] = vessel?.ship ?? [];
  return x === undefined || y === undefined ? null : [x, y, 1];
}

/** An event's cue and where it is heard; null for one that makes no sound. */
export function seaFightCue(event: FightEvent, view: FightView): { readonly cue: string; readonly at: Point } | null {
  switch (event.kind) {
    case 'muzzle':
      return { cue: 'sea.cannon.fire', at: event.point };
    case 'hit':
      return { cue: 'sea.ball.hull', at: event.point };
    case 'splash':
      return { cue: 'sea.ball.splash', at: event.point };
    case 'state': {
      const lying = event.state === 'sinking' ? shipAt(view, event.ship) : null;
      return lying && { cue: 'sea.ship.break', at: lying };
    }
    default:
      return null;
  }
}
