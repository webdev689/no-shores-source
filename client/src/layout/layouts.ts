// A landmass's node layouts as the layout crate serialises them (the land worker hands them over as JSON), and what
// the game reads off them: each node's section and spawns, and which layouts stand near a point.
import type { Pad, Solid } from '../city/plan.ts';

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
  /** A gate that crosses to another patrol area of the island (the layout crate's `crossings`). */
  readonly crosses?: boolean;
}

/** A site a layout marks (the layout crate's `Site`): what it is for, where, how much ground it takes, and what it
 *  holds or leads to. */
export interface LaidSite {
  readonly kind: 'landing' | 'gate' | 'event' | 'beacon' | 'resource' | 'foes' | 'objective' | 'door';
  readonly at: Point;
  readonly radius: number;
  readonly holds?: string;
  /** Where a resource's node stands: before its dressing, toward its path; none off the section's floor. */
  readonly node?: Point;
}

/** A run breaking off a patrol area, as the layout crate writes it: its kind, its mouth, its line and its beats. */
export interface LaidRun {
  readonly name: string;
  readonly kind: string;
  readonly place: string;
  readonly mouth: Point;
  readonly line: readonly Point[];
  readonly beats: readonly { readonly at: Point; readonly radius: number; readonly level: number }[];
  readonly door: Point;
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
  readonly sites: readonly LaidSite[];
  readonly buildings: readonly Seated[];
  readonly props: readonly Seated[];
  readonly tiles: readonly LaidTile[];
  readonly solids: readonly Solid[];
  /** The rooms of the buildings walked into: linings, floors, ceilings, stairs. */
  readonly rooms: readonly Solid[];
  readonly pads: readonly Pad[];
  /** The linear combat areas breaking off a patrol area; none written when it has none. */
  readonly runs?: readonly LaidRun[];
  /** The kinds of its climate's nature it plants and where each stands; none written when it plants none. */
  readonly plantings?: readonly { readonly kind: string; readonly points: readonly Point[] }[];
  /** The stone its cliffs and rubble wear where it is not its climate's; none written when it is. */
  readonly stone?: string;
  /** The land it carves: its claim, and the wings (capsules `[x1, y1, x2, y2, half]`) that carry it past its ring. */
  readonly sculpt?: { readonly claim: readonly Point[]; readonly wings?: readonly (readonly number[])[] };
}

/** The track's and the footpath's widths, metres, as the layout crate lays them. */
export const PATH_WIDTH_M = { track: 4.5, footpath: 2.6 } as const;

/** A place a quest names in a node: one of its areas, or one of its runs at its mouth. */
export interface NodePlace {
  readonly name: string;
  readonly at: Point;
  readonly radius: number;
}

/** How far a run's place reaches round its mouth, metres, as the bake has it. */
export const RUN_REACH_M = 25;

/** A layout's places, as its node file names them for the rules: each area within its radius, then each run within
 *  `RUN_REACH_M` of its mouth, but a run whose name an area has already (Moorhold is both), which the area keeps. */
export function placesOf(layout: Pick<NodeLayout, 'areas' | 'runs'>): NodePlace[] {
  const areas = layout.areas.map(({ name, at, radius }) => ({ name, at, radius }));
  const runs = (layout.runs ?? []).filter((run) => !areas.some((area) => area.name === run.name));
  return [...areas, ...runs.map(({ name, mouth }) => ({ name, at: mouth, radius: RUN_REACH_M }))];
}

/** A node as the game holds it: its id, its section, its spawns, its section's middle and its places. */
interface Placed {
  readonly id: string;
  readonly ring: readonly Point[];
  readonly spawns: readonly Point[];
  readonly centre: Point;
  readonly resources?: readonly { readonly at: Point; readonly holds?: string }[];
  readonly foes?: readonly Point[];
  readonly places?: readonly NodePlace[];
  readonly paths?: readonly (readonly Point[])[];
}

/** The drawn nodes with each laid node's section, spawns and places in place of the ring it was drawn with, its
 *  resource places, where its room's nodes stand, and its foes' sites in its caverns (a coven's or a cave's area) and
 *  on its runs' beats, where its room stands groups, each in the layout's order (as the bake writes them). */
export function laidNodes<Node extends Placed>(drawn: readonly Node[], layouts: readonly NodeLayout[]): Node[] {
  const byId = new Map(layouts.map((layout) => [layout.id, layout]));
  return drawn.map((node) => {
    const laid = byId.get(node.id);
    if (!laid || laid.ring.length < 3 || !laid.spawns.length) return node;
    const sum = laid.ring.reduce((total, point) => [total[0] + point[0], total[1] + point[1]] as const, [
      0, 0,
    ] as const);
    const centre = [sum[0] / laid.ring.length, sum[1] / laid.ring.length] as const;
    const resources = laid.sites.flatMap(({ kind, node, holds }) =>
      kind === 'resource' && node ? [{ at: node, holds }] : [],
    );
    const cavern = (name: string) =>
      laid.areas.some((area) => area.name === name && (area.kind === 'coven' || area.kind === 'cave'));
    const foes = laid.sites.flatMap(({ kind, at, holds }) =>
      kind === 'foes' && (holds === undefined || cavern(holds)) ? [at] : [],
    );
    const paths = laid.paths.map((path) => path.points);
    return { ...node, ring: laid.ring, spawns: laid.spawns, centre, resources, foes, places: placesOf(laid), paths };
  });
}

/** A layout's bounds: its ring's, west, north, east and south. */
export function layoutBounds(layout: Pick<NodeLayout, 'ring'>): [number, number, number, number] {
  const eastings = layout.ring.map((point) => point[0]);
  const southings = layout.ring.map((point) => point[1]);
  return [Math.min(...eastings), Math.min(...southings), Math.max(...eastings), Math.max(...southings)];
}

/** The layouts whose section comes within `reach` metres of a point (by their bounds), in their order. */
export function layoutsNear<Laid extends Pick<NodeLayout, 'ring'>>(
  layouts: readonly Laid[],
  spot: Point,
  reach: number,
): Laid[] {
  return layouts.filter((layout) => {
    if (layout.ring.length < 3) return false;
    const [west, north, east, south] = layoutBounds(layout);
    const across = Math.max(west - spot[0], 0, spot[0] - east);
    const down = Math.max(north - spot[1], 0, spot[1] - south);
    return Math.hypot(across, down) <= reach;
  });
}

/** How a frame's layouts follow the eye: once it has moved `regather` metres from where they were last gathered, the
 *  layouts within `reach` are gathered again and `moved` told; `changed` is told when the set of them differs from the
 *  set last built, once `ready` (whatever builds them has come). Called once a frame before anything is drawn. */
export function layoutFollower(
  layouts: readonly NodeLayout[],
  reach: number,
  regather: number,
  moved: (near: readonly NodeLayout[], at: Point) => void,
  changed: (near: readonly NodeLayout[]) => void,
): (eye: Point, ready: boolean) => void {
  let [gatheredAt, near, built]: [Point | null, readonly NodeLayout[], string | null] = [null, [], null];
  return (eye, ready) => {
    if (!gatheredAt || Math.hypot(eye[0] - gatheredAt[0], eye[1] - gatheredAt[1]) >= regather) {
      gatheredAt = [eye[0], eye[1]];
      near = layoutsNear(layouts, gatheredAt, reach);
      moved(near, gatheredAt);
    }
    const names = near.map((layout) => layout.id).join(',');
    if (!ready || names === built) return;
    built = names;
    changed(near);
  };
}
