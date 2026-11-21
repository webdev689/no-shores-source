// A sea fight as the tracker reads it: DFO's messages now, and the fight's task, which counts the ships still afloat
// and their men. The player's ship, the card and the broadside's warning are the drawn readout's
// (`combat/seaReadout.ts`), and DFO's messages are the HUD's toasts.
import type { FightView } from '../rules/fightRules.ts';
import type { Quest } from './tasks.ts';

/** A fight's frame as the HUD shows it: DFO's messages now, how many captains are still afloat, and how many men they
 *  have between them. */
export interface FightReadout {
  readonly said: readonly string[];
  readonly left: number;
  readonly men: number;
}

/** What the HUD shows of fight `view`, with the messages `said` now. */
export function readoutOf(view: FightView, said: readonly string[]): FightReadout {
  const captains = [view.captain, ...(view.others ?? [])];
  // Only those fighting the player are theirs to beat: a rival's ship in a clash the player joined is not.
  const afloat = captains.filter((each) => each.state === 'afloat' && each.hostile);
  return { said, left: afloat.length, men: afloat.reduce((sum, each) => sum + Math.ceil(each.crew), 0) };
}

/** The task of a sea fight, under quest `name`, with `left` ships afloat and their `men`: by the naval rules a
 *  captain strikes once its men are gone (or its hull is beaten low), and a struck ship is beaten without sinking. */
export function seaFightQuest(name: string, left: number, men: number): Quest {
  return {
    name,
    task: 'Defeat their crews',
    steps: [{ text: 'Ships left', count: left }, { text: 'Their men', count: men }, { text: 'No need to sink them' }],
  };
}
