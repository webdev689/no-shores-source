// What a player's gear lays on foot: over each resource node they may still gather a beam of light seen across the
// patrol, so a route can be planned through them, standing clear over the node's mark; the marks over what they can
// use are `combat/marksOver.ts`'s, the drops lying for them their own pictures (`combat/drops.ts`). And what E does
// where they stand: a station's or Shape's offer opened, or a node within reach gathered. The room judges every
// gather; the beams only show where.

import { type Marked, TALLEST_M } from '../combat/marksOver.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { resourceName } from '../player/gear.ts';
import { openGearWindow } from './gearScreen.ts';
import { SERVED_M, offerAt } from './plazaLife.ts';
import { KEEPERS } from './keepers.ts';
import { shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

/** How near a resource node a player stands to gather it, as the room has it. */
export const NODE_REACH_M = 2.5;
/** A resource node's beam in sea green, beating slowly so it is seen across the ground. */
const NODE = [0.35, 0.85, 0.7] as const;
/** How tall a node's beam stands, and half of how wide it is, metres: it is seen across the patrol, hundreds of metres
 *  off. */
const NODE_BEAM = { height: 40, half: 0.5 } as const;
/** How much of its opacity a beam keeps at its top. */
const BEAM_TOP = 0.2;

/** Shape's offer, opened as a counter's is, within the reach a counter serves. */
const SHAPE_OFFER = { words: KEEPERS.shape.title, opens: { view: 'shape' } } as const;

/** The stations of the place a player stands in, and where Shape may stand there. */
type Here = Pick<NodeInfo, 'stations' | 'visitorSpots'>;

/** What E does where a player stands: its deed in words, and the doing. */
export interface Use {
  readonly words: string;
  readonly run: () => void;
}

/** The use within reach of a player at (x, y): a station's offer, then Shape's, before a node, so a counter is never
 *  lost to one. */
export function useAt(
  x: number,
  y: number,
  here: Here,
  gear: GearState | null,
  ask: (asked: GearAsk) => void,
): Use | null {
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  const near = shape && Math.hypot(shape[0] - x, shape[1] - y) <= SERVED_M;
  const offer = offerAt(here.stations ?? [], x, y) ?? (near ? SHAPE_OFFER : null);
  if (offer) return { words: offer.words, run: () => openGearWindow(offer.opens) };
  const node = gear?.nodes.find((each) => Math.hypot(each.x - x, each.y - y) <= NODE_REACH_M);
  if (!node) return null;
  return { words: `Gather ${resourceName(node.resource)}`, run: () => ask({ kind: ASKS.gather, node: node.index }) };
}

/** A beam of light standing `height` over `base`, in two crossed planes so it is seen from every side, fading upward. */
function markBeam(
  out: number[],
  base: readonly number[],
  { height, half }: { readonly height: number; readonly half: number },
  colour: readonly number[],
): void {
  const [x = 0, y = 0, z = 0] = base;
  const [red = 1, green = 1, blue = 1, opacity = 1] = colour;
  const vertex = (east: number, south: number, up: number, alpha: number) =>
    out.push(x + east, y + south, z + up, red, green, blue, alpha);
  const top = opacity * BEAM_TOP;
  for (const [east, south] of [
    [half, 0],
    [0, half],
  ] as const) {
    vertex(-east, -south, 0, opacity);
    vertex(east, south, 0, opacity);
    vertex(east, south, height, top);
    vertex(-east, -south, 0, opacity);
    vertex(east, south, height, top);
    vertex(-east, -south, height, top);
  }
}

/** The beams over the marks that stand under one (the nodes') at `seconds` of the page's clock, each standing over
 *  the tallest its mark is drawn, so the mark reads clear of it. */
export function nodeBeams(marked: readonly Marked[], seconds: number): number[] {
  const out: number[] = [];
  const beat = 0.55 + 0.25 * Math.sin(seconds * 3);
  for (const { at, beam } of marked)
    if (beam) markBeam(out, [at[0], at[1], at[2] + TALLEST_M], NODE_BEAM, [...NODE, Math.min(1, beat + 0.25)]);
  return out;
}
