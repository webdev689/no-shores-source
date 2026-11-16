import { type NodeInfo, ringMiddle } from './worldData.ts';

type Point = readonly [number, number];

/** A rect of the world: west, north, east and south, metres. */
export type Rect = readonly [number, number, number, number];

/** A pad: a rect of ground the city sets to a level. */
export interface Pad {
  readonly bounds: Rect;
  readonly level: number;
}

/** What the game reads of a city's plan, as the land worker hands it over (the city crate's `Plan` as JSON). */
export interface CityPlan {
  readonly id: string;
  readonly name: string;
  readonly motif: string;
  readonly centre: Point;
  readonly harbour: Point | null;
  readonly social: {
    readonly bounds: Rect;
    readonly level: number;
    readonly ring: readonly Point[];
    readonly spawns: readonly Point[];
  };
  readonly pads: readonly Pad[];
}

/** How far past a section's ring its window of the ground reaches, as the bake cuts it: past the 60 m where a body
 *  dies, so every place a living body stands is on it. */
export const WINDOW_MARGIN_M = 100;

/** The rect a node's window of the ground covers: its ring's bounds and the margin past them each way. */
export function windowRect(ring: readonly Point[]): Rect {
  const eastings = ring.map((point) => point[0]);
  const southings = ring.map((point) => point[1]);
  return [
    Math.min(...eastings) - WINDOW_MARGIN_M,
    Math.min(...southings) - WINDOW_MARGIN_M,
    Math.max(...eastings) + WINDOW_MARGIN_M,
    Math.max(...southings) + WINDOW_MARGIN_M,
  ];
}

/** A city's social space as a node: `<city id>-social`, named for its city, its plaza's section and spawns. */
export function socialNode(plan: CityPlan, continent: string): NodeInfo {
  const { ring, spawns } = plan.social;
  return {
    id: `${plan.id}-social`,
    kind: 'social',
    name: plan.name,
    continent,
    ring,
    spawns,
    centre: ringMiddle(ring),
  };
}

/** The compass bearing from one point to another: 0 north (-y), a quarter turn east (+x). */
export function bearingTo(from: Point, to: Point): number {
  return Math.atan2(to[0] - from[0], from[1] - to[1]);
}

/** Whether a point stands on ground the city has set (its terraces, plaza and landmark's ground), so nothing wild
 *  grows there. */
export function clearedBy(pads: readonly Pad[]): (x: number, y: number) => boolean {
  return (x, y) =>
    pads.some(({ bounds: [west, north, east, south] }) => x >= west && x <= east && y >= north && y <= south);
}

/** The way a player faces on arriving in a node: in a city's social space, out from its landmark over the city;
 *  elsewhere, inland, the way they came ashore from `from` (their ship), or north with nowhere to come from. */
export function arrivalFacing(node: NodeInfo, plan: CityPlan | null, from: Point | null): number {
  const spawn = node.spawns[0] ?? node.centre;
  if (node.kind === 'social' && plan) return bearingTo(plan.centre, node.centre);
  return from && Math.hypot(spawn[0] - from[0], spawn[1] - from[1]) > 1 ? bearingTo(from, spawn) : 0;
}
