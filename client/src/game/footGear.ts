// What a player's gear lays on the ground on foot: each resource node they may still gather, a ring in sea green
// under a beam of light seen across the patrol, so a route can be planned through them; each station that deals with
// them, a brass ring at its counter, beating at the mail's while letters wait, and Shape's spot while he is here. The
// drops lying for them stand as their own pictures (`combat/drops.ts`). And what E does where they stand: a station's or Shape's offer opened, or a node within
// reach gathered. The room judges every gather; the rings only show where.

import { markRing } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { resourceName } from '../player/gear.ts';
import { openGearWindow } from './gearScreen.ts';
import { SERVED_M, offerAt } from './plazaLife.ts';
import { KEEPERS } from './keepers.ts';
import { shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

/** How near a resource node a player stands to gather it, as the room has it. */
export const NODE_REACH_M = 2.5;
/** A station's ring in brass, a resource node's in sea green, each beating slowly so it is seen across the ground. */
const BRASS = [0.93, 0.74, 0.32] as const;
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

/** The rings on the ground at `seconds` of the page's clock, each standing on `floor`'s height where it is. */
export function groundRings(
  gear: GearState | null,
  here: Here,
  floor: (x: number, y: number) => number,
  seconds: number,
): number[] {
  const out: number[] = [];
  const beat = 0.55 + 0.25 * Math.sin(seconds * 3);
  const stations = here.stations ?? [];
  const counters = stations.filter((station) => offerAt([station], ...station.counter));
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  // The mail's ring beats while letters wait there, as a node's does, so it is seen from across the plaza.
  const waiting = (gear?.mail?.length ?? 0) > 0;
  for (const { kind, counter } of shape ? [...counters, { kind: 'shape', counter: shape }] : counters) {
    const [x, y] = counter;
    markRing(out, [x, y, floor(x, y)], SERVED_M - 0.12, SERVED_M, [...BRASS, waiting && kind === 'mail' ? beat : 0.6]);
  }
  for (const { x, y } of gear?.nodes ?? []) {
    const base = [x, y, floor(x, y)] as const;
    markRing(out, base, NODE_REACH_M - 0.1, NODE_REACH_M, [...NODE, 0.5]);
    markRing(out, base, 0.3, 0.6, [...NODE, beat]);
    markBeam(out, base, NODE_BEAM, [...NODE, Math.min(1, beat + 0.25)]);
  }
  return out;
}

/** On foot the story is always behind the page: every way there comes after it, played through or passed over (Begin
 *  at the title, a `?at=` link, a story that could not start or go on). So no character is kept out of the patrols by
 *  a prologue that did not run. */
export const STORY_BEHIND_ON_FOOT = true;

/** Whether the page tells its room the prologue is done: once the story is behind it, and once for each word on the
 *  gear that says it is not kept, so a kept character claimed after the first word is told again. */
export function tellsPrologue(gear: GearState | null, played: boolean, told: GearState | null): boolean {
  return played && gear !== null && gear !== told && gear.prologueDone === false;
}
