// Where a page under development may begin the wreck's teaching, to picture it: `?prologue=wreck&wisp=<n>` n - 1
// seconds into the wisp's coming, `&bow=1` with the boarder's bow lying before the player, `&lash=1` with the Storm
// given and a boarder coming for them, to be frozen on for Arc Lash. A built game never reads it.
import type { Stage } from './tutorial.ts';
import { topAt, type WreckLayout } from './wreckLayout.ts';
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

/** How far before the player the bow lies for a start at the bow, metres: where a boarder met there would fall. */
const BOW_AHEAD_M = 3;

/** How far before the player the boarder stands for a start at the Storm: in Arc Lash's reach and cone. */
const LASH_AHEAD_M = 4;

/** Where the boarder stands for a start at the Storm: `LASH_AHEAD_M` before a player at (`x`, `y`) facing `facing`,
 *  facing them. */
export function lashBoarder(x: number, y: number, facing: number): { at: [number, number]; facing: number } {
  const place: [number, number] = [x + Math.sin(facing) * LASH_AHEAD_M, y - Math.cos(facing) * LASH_AHEAD_M];
  return { at: place, facing: facing + Math.PI };
}

/** Lays the world as the start asks, on its first frame, for the player `player`: the bow on the deck, or the Storm
 *  given and a boarder stood before them. */
export function beginAt(
  start: DevStart,
  run: WreckRun,
  layout: WreckLayout,
  player: { readonly x: number; readonly y: number; readonly facing: number },
): void {
  if (start.stage === 'bow') {
    const [x, y] = [player.x + Math.sin(player.facing) * BOW_AHEAD_M, player.y - Math.cos(player.facing) * BOW_AHEAD_M];
    run.storyArms.dropBow([x, y, topAt(layout.course, x, y)]);
  }
  if (start.stage === 'storm') {
    run.giveStorm();
    run.standBoarder(lashBoarder(player.x, player.y, player.facing));
  }
}
