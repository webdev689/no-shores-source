// Where a page under development may begin the wreck's teaching, to picture it: `?prologue=wreck&wisp=<n>` n - 1
// seconds into the wisp's coming, `&bow=1` with the boarder's bow lying before the player, `&lash=1` with the Storm
// given and a boarder coming for them, to be frozen on for Arc Lash. A built game never reads it.
import type { Stage } from './tutorial.ts';
import { pointAlong, topAt, type WreckLayout } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';

export interface DevStart {
  readonly stage: Stage;
  /** Seconds into the wisp's coming. */
  readonly wispInto: number;
}

/** The start an address's `search` asks for, or none. */
export function devStart(search: string): DevStart | null {
  const asked = new URLSearchParams(search);
  const wisp = Number(asked.get('wisp') ?? NaN);
  if (wisp >= 1) return { stage: 'wisp', wispInto: wisp - 1 };
  if (asked.get('bow') === '1') return { stage: 'bow', wispInto: 0 };
  if (asked.get('lash') === '1') return { stage: 'storm', wispInto: 0 };
  return null;
}

/** The start under development, read from the page's address: none in a built game. */
export const pageDevStart = (): DevStart | null =>
  import.meta.env?.DEV && typeof location !== 'undefined' ? devStart(location.search) : null;

/** How far along the path from where the player wakes the bow lies for a start at the bow, metres. */
const BOW_ALONG_M = 4;

/** Lays the world as the start asks, on its first frame: the bow on the deck, or the Storm given and a boarder sent. */
export function beginAt(start: DevStart, run: WreckRun, layout: WreckLayout): void {
  if (start.stage === 'bow') {
    const [x, y] = pointAlong(layout.path, BOW_ALONG_M);
    run.storyArms.dropBow([x, y, topAt(layout.course, x, y)]);
  }
  if (start.stage === 'storm') {
    run.giveStorm();
    run.standBoarder();
  }
}
