// A sea fight's lights as the sky's lamps: each muzzle's flash, each burning ship's fire and each magazine's blast
// (the effects' `light` marks) lights the hulls, the sea and the people round it for as long as it lasts, as the
// land's lamps do.
import type { LampPlace } from '../sky/lamps.ts';
import type { Mark } from './effects.ts';

/** Where a fight is drawn from: its window's corner, world metres. */
export interface FightWindow {
  readonly leftM: number;
  readonly topM: number;
}

interface Kept {
  at: [number, number, number];
  reachM: number;
  light: [number, number, number];
  seed: number;
}

/** A fight's lamps, kept from frame to frame: the same places while their number holds, moved and dimmed in place,
 *  so the land's lamps are told of a new list only when a light comes or goes. */
export class FightLamps {
  private readonly kept: Kept[] = [];
  private list: Kept[] = [];

  /** The lamps of the `light` marks among `marks` (window metres, heights as drawn), in world metres. */
  lampsOf(marks: readonly Mark[], window: FightWindow): readonly LampPlace[] {
    let count = 0;
    for (const mark of marks) {
      if (mark.blend !== 'light') continue;
      const lamp = (this.kept[count] ??= { at: [0, 0, 0], reachM: 0, light: [0, 0, 0], seed: count + 1 });
      count += 1;
      lamp.at[0] = mark.x + window.leftM;
      lamp.at[1] = mark.y + window.topM;
      lamp.at[2] = mark.z;
      lamp.reachM = mark.radius;
      const alpha = mark.alpha ?? 1;
      for (let part = 0; part < 3; part++) lamp.light[part] = (mark.colour[part] ?? 0) * alpha;
    }
    if (count !== this.list.length) this.list = this.kept.slice(0, count);
    return this.list;
  }
}
