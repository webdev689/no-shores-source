// What a player's gear lays on the ground on foot: each resource node they may still gather, a ring in sea green
// under a beam of light seen across the patrol, so a route can be planned through them; each station that deals with
// them, a brass ring at its counter, and Shape's spot while he is here; a quest's puzzle points under beams, gold once
// lit, and a named ward it defends. The drops lying for them stand as their own pictures (`combat/drops.ts`). And what
// E does where they stand: a station's or Shape's offer opened (or its keeper spoken with, while a quest asks it), a
// puzzle's point used, or a node within reach gathered. The room judges every use; the rings only show where.

import { markRing } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { resourceName } from '../player/gear.ts';
import { openGearWindow } from './gearScreen.ts';
import { SERVED_M, offerAt } from './plazaLife.ts';
import { KEEPERS } from './keepers.ts';
import { goalOf, puzzlePoints } from './quests/questBook.ts';
import { shapeSpot } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

/** How near a resource node a player stands to gather it, and a puzzle's point to use it, as the room has them. */
export const NODE_REACH_M = 2.5;
export const POINT_REACH_M = 3;
/** A puzzle's point unlit and lit, and a ward a quest defends, in the players' green. */
const UNLIT = [0.62, 0.72, 0.9] as const;
const LIT = [0.98, 0.84, 0.45] as const;
const WARD = [0.42, 0.86, 0.42] as const;
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

/** What E does at a counter of a kind (its offer's view) besides opening it: speaking with its keeper, while a quest
 *  asks it (quests/quests.ts). */
export type Speak = (counter: string, ask: (asked: GearAsk) => void) => Use | null;

/** The use within reach of a player at (x, y): a station's offer (its keeper spoken with where `speak` says so), then
 *  Shape's, before a node, so a counter is never lost to one. */
export function useAt(
  x: number,
  y: number,
  here: Here,
  gear: GearState | null,
  ask: (asked: GearAsk) => void,
  speak: Speak = () => null,
): Use | null {
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  const near = shape && Math.hypot(shape[0] - x, shape[1] - y) <= SERVED_M;
  const offer = offerAt(here.stations ?? [], x, y) ?? (near ? SHAPE_OFFER : null);
  if (offer) return speak(offer.opens.view, ask) ?? { words: offer.words, run: () => openGearWindow(offer.opens) };
  // A point already lit is used no more: the room would take it as a wrong one.
  const reached = (each: { x: number; y: number }) => Math.hypot(each.x - x, each.y - y) <= POINT_REACH_M;
  const point = puzzlePoints(gear?.quest).find((each) => !each.lit && reached(each));
  if (point) {
    const named = point.name.replace(/^The /, 'the ');
    return { words: `Use ${named}`, run: () => ask({ kind: ASKS.usePoint, column: point.index }) };
  }
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
  const counters = stations.filter((station) => offerAt([station], ...station.counter)).map((each) => each.counter);
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  for (const [x, y] of shape ? [...counters, shape] : counters)
    markRing(out, [x, y, floor(x, y)], SERVED_M - 0.12, SERVED_M, [...BRASS, 0.6]);
  for (const { x, y } of gear?.nodes ?? []) {
    const base = [x, y, floor(x, y)] as const;
    markRing(out, base, NODE_REACH_M - 0.1, NODE_REACH_M, [...NODE, 0.5]);
    markRing(out, base, 0.3, 0.6, [...NODE, beat]);
    markBeam(out, base, NODE_BEAM, [...NODE, Math.min(1, beat + 0.25)]);
  }
  for (const { x, y, lit } of puzzlePoints(gear?.quest)) {
    const base = [x, y, floor(x, y)] as const;
    const colour = lit ? LIT : UNLIT;
    markRing(out, base, POINT_REACH_M - 0.1, POINT_REACH_M, [...colour, 0.5]);
    markRing(out, base, 0.3, 0.6, [...colour, lit ? 1 : beat]);
    markBeam(out, base, NODE_BEAM, [...colour, lit ? 1 : Math.min(1, beat + 0.25)]);
  }
  // A ward a figure stands for is drawn as that figure (quests/quests.ts); a named one is marked here.
  const ward = gear?.quest?.claimed === false ? null : gear?.quest?.ward;
  if (ward && !goalOf(gear?.quest, 'defend')?.who) {
    const base = [ward.x, ward.y, floor(ward.x, ward.y)] as const;
    markRing(out, base, 1.4, 1.6, [...WARD, 0.7]);
    markBeam(out, base, NODE_BEAM, [...WARD, Math.min(1, beat + 0.25)]);
  }
  return out;
}
