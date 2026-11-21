// What a player's gear lays on the ground on foot: each station that deals with them, a brass ring at its counter, and
// Shape's spot while he is here. The drops lying for them stand as their own pictures (`combat/drops.ts`), and the
// resource nodes as the forge draws them (`nodeCards.ts`). And what E does where they stand: a station's or Shape's
// offer opened, or a node within reach gathered while E is held. The room judges every gather.

import { markRing } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { resourceName } from '../player/gear.ts';
import { openGearWindow } from './gearScreen.ts';
import { SERVED_M, offerAt } from './plazaLife.ts';
import { KEEPERS } from './keepers.ts';
import { shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

/** How near a resource node a player stands to gather it; how long E is held to gather it, and how far the body may
 *  stir meanwhile: as the room has them (`asks.rs`). The most of a resource a player carries, as the gear crate has
 *  it (`character.rs`): a node of one they are full of is not offered. */
export const NODE_REACH_M = 2.5;
export const GATHER_S = 2;
export const GATHER_STIR_M = 0.3;
export const STOCK_MOST = 200;
/** A station's ring in brass. */
const BRASS = [0.93, 0.74, 0.32] as const;

/** Shape's offer, opened as a counter's is, within the reach a counter serves. */
const SHAPE_OFFER = { words: KEEPERS.shape.title, opens: { view: 'shape' } } as const;

/** The stations of the place a player stands in, and where Shape may stand there. */
type Here = Pick<NodeInfo, 'stations' | 'visitorSpots'>;

/** What E does where a player stands: its deed in words, and the doing; and for a node, which, as E is held there. */
export interface Use {
  readonly words: string;
  readonly run: () => void;
  readonly gather?: number;
}

/** The use within reach of a player at (x, y): a station's offer, then Shape's, before a node, so a counter is never
 *  lost to one. A node is not offered on horseback (`mounted`), nor one whose resource the player is full of. */
export function useAt(
  x: number,
  y: number,
  here: Here,
  gear: GearState | null,
  ask: (asked: GearAsk) => void,
  mounted = false,
): Use | null {
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  const near = shape && Math.hypot(shape[0] - x, shape[1] - y) <= SERVED_M;
  const offer = offerAt(here.stations ?? [], x, y) ?? (near ? SHAPE_OFFER : null);
  if (offer) return { words: offer.words, run: () => openGearWindow(offer.opens) };
  const node = gear?.nodes.find((each) => Math.hypot(each.x - x, each.y - y) <= NODE_REACH_M);
  if (!node || mounted || (gear?.resources[node.resource] ?? 0) >= STOCK_MOST) return null;
  return {
    words: `Hold to gather ${resourceName(node.resource)}`,
    run: () => ask({ kind: ASKS.gather, node: node.index }),
    gather: node.index,
  };
}

/** The rings on the ground, each standing on `floor`'s height where it is. */
export function groundRings(gear: GearState | null, here: Here, floor: (x: number, y: number) => number): number[] {
  const out: number[] = [];
  const stations = here.stations ?? [];
  const counters = stations.filter((station) => offerAt([station], ...station.counter)).map((each) => each.counter);
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  for (const [x, y] of shape ? [...counters, shape] : counters)
    markRing(out, [x, y, floor(x, y)], SERVED_M - 0.12, SERVED_M, [...BRASS, 0.6]);
  return out;
}
