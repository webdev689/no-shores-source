// What a player's gear lays on the ground on foot: each resource node they may still gather, a ring in sea green
// under a beam of light seen across the patrol, so a route can be planned through them; each Vestige lying for them,
// a ring and a beam in its rarity's colour, picked up by walking over it; each station that deals with them, a brass
// ring at its counter. And what E does where they stand: a station's offer opened, or a node
// within reach gathered. The room judges every gather; the rings only show where.

import { markRing } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { RARITIES, resourceName } from '../player/gear.ts';
import { openGearWindow } from './gearScreen.ts';
import type { StationInfo } from './nodes.ts';
import { SERVED_M, offerAt } from './plazaLife.ts';

/** How near a resource node a player stands to gather it, as the room has it. */
export const NODE_REACH_M = 2.5;
/** A station's ring in brass, a resource node's in sea green, each beating slowly so it is seen across the ground. */
const BRASS = [0.93, 0.74, 0.32] as const;
const NODE = [0.35, 0.85, 0.7] as const;
/** How tall a node's beam stands and a Vestige's, and half of how wide each is, metres: a node's is seen across the
 *  patrol, hundreds of metres off. */
const NODE_BEAM = { height: 40, half: 0.5 } as const;
const VESTIGE_BEAM = { height: 8, half: 0.2 } as const;
/** How much of its opacity a beam keeps at its top. */
const BEAM_TOP = 0.2;

/** What E does where a player stands: its deed in words, and the doing. */
export interface Use {
  readonly words: string;
  readonly run: () => void;
}

/** The use within reach of a player at (x, y): a station's offer before a node, so a counter is never lost to one. */
export function useAt(
  x: number,
  y: number,
  stations: readonly StationInfo[],
  gear: GearState | null,
  ask: (asked: GearAsk) => void,
): Use | null {
  const offer = offerAt(stations, x, y);
  if (offer) return { words: offer.words, run: () => openGearWindow(offer.opens) };
  const node = gear?.nodes.find((each) => Math.hypot(each.x - x, each.y - y) <= NODE_REACH_M);
  if (!node) return null;
  return { words: `Gather ${resourceName(node.resource)}`, run: () => ask({ kind: ASKS.gather, node: node.index }) };
}

/** A colour written `#rrggbb` as red, green and blue from 0 to 1. */
function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
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
  stations: readonly StationInfo[],
  floor: (x: number, y: number) => number,
  seconds: number,
): number[] {
  const out: number[] = [];
  const beat = 0.55 + 0.25 * Math.sin(seconds * 3);
  for (const { counter } of stations.filter((station) => offerAt([station], ...station.counter))) {
    const [x, y] = counter;
    markRing(out, [x, y, floor(x, y)], SERVED_M - 0.12, SERVED_M, [...BRASS, 0.6]);
  }
  for (const { x, y } of gear?.nodes ?? []) {
    const base = [x, y, floor(x, y)] as const;
    markRing(out, base, NODE_REACH_M - 0.1, NODE_REACH_M, [...NODE, 0.5]);
    markRing(out, base, 0.3, 0.6, [...NODE, beat]);
    markBeam(out, base, NODE_BEAM, [...NODE, Math.min(1, beat + 0.25)]);
  }
  for (const drop of gear?.drops ?? []) {
    const colour = rgbOf(RARITIES[drop.rarity]?.colour ?? '#e8e2d8');
    markRing(out, drop.at, 0.15, 0.45, [...colour, beat + 0.2]);
    markRing(out, drop.at, 0.6, 0.7, [...colour, beat * 0.6]);
    markBeam(out, drop.at, VESTIGE_BEAM, [...colour, beat]);
  }
  return out;
}
