// A landmass's node layouts as the layout crate serialises them (the land worker hands them over as JSON), and what
// the game reads off them: each node's section and spawns, and which layouts stand near a point.
import type { Pad, Solid } from '../city/plan.ts';
import type { NodeInfo } from '../game/worldData.ts';
import { ringMiddle } from '../game/worldData.ts';

type Point = readonly [number, number];

/** A model a layout stood on the land: origin (east, south, up), yaw in degrees, and the ground it covers. */
export interface Seated {
  readonly model: number;
  readonly at: readonly [number, number, number];
  readonly yaw: number;
  readonly building: boolean;
  readonly footprint: readonly [number, number, number, number];
  /** A building walked into: its doorways stand open onto its rooms. */
  readonly open: boolean;
}

/** A tile of a block's streets or yards: its middle, its byte as the block keeps it, its block's quarter turns, and
 *  the ground's height at its corners (north-west, north-east, south-east, south-west). */
export interface LaidTile {
  readonly at: Point;
  readonly byte: number;
  readonly turns: number;
  readonly corners: readonly [number, number, number, number];
}

/** A path: its tier, its points and the ground's height at each, and its river crossings. */
export interface LaidPath {
  readonly tier: 'track' | 'footpath';
  readonly points: readonly Point[];
  readonly heights: readonly number[];
  readonly crossings: readonly (readonly [Point, Point])[];
}

/** One area of a layout. */
export interface LayoutArea {
  readonly kind: string;
  readonly name: string;
  readonly at: Point;
  readonly radius: number;
  readonly leads_to?: string;
}

/** A node's layout. */
export interface NodeLayout {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly theme: string;
  readonly ring: readonly Point[];
  readonly spawns: readonly Point[];
  readonly areas: readonly LayoutArea[];
  readonly paths: readonly LaidPath[];
  readonly buildings: readonly Seated[];
  readonly props: readonly Seated[];
  readonly tiles: readonly LaidTile[];
  readonly solids: readonly Solid[];
  /** The rooms of the buildings walked into: linings, floors, ceilings, stairs. */
  readonly rooms: readonly Solid[];
  readonly pads: readonly Pad[];
}

/** The track's and the footpath's widths, metres, as the layout crate lays them. */
export const PATH_WIDTH_M = { track: 4.5, footpath: 2.6 } as const;

/** The drawn nodes with each laid node's section and spawns in place of the ring it was drawn with. */
export function laidNodes(drawn: readonly NodeInfo[], layouts: readonly NodeLayout[]): NodeInfo[] {
  const byId = new Map(layouts.map((layout) => [layout.id, layout]));
  return drawn.map((node) => {
    const laid = byId.get(node.id);
    if (!laid || laid.ring.length < 3 || !laid.spawns.length) return node;
    return { ...node, ring: laid.ring, spawns: laid.spawns, centre: ringMiddle(laid.ring) };
  });
}

/** A layout's bounds: its ring's, west, north, east and south. */
export function layoutBounds(layout: NodeLayout): [number, number, number, number] {
  const eastings = layout.ring.map((point) => point[0]);
  const southings = layout.ring.map((point) => point[1]);
  return [Math.min(...eastings), Math.min(...southings), Math.max(...eastings), Math.max(...southings)];
}

/** The layouts whose section comes within `reach` metres of a point (by their bounds), in their order. */
export function layoutsNear(layouts: readonly NodeLayout[], at: Point, reach: number): NodeLayout[] {
  return layouts.filter((layout) => {
    if (layout.ring.length < 3) return false;
    const [west, north, east, south] = layoutBounds(layout);
    const across = Math.max(west - at[0], 0, at[0] - east);
    const down = Math.max(north - at[1], 0, at[1] - south);
    return Math.hypot(across, down) <= reach;
  });
}
