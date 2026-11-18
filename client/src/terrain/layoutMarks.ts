// What the World Editor draws of a landmass's node layouts. The land worker's full layouts run to megabytes (every
// building, solid, room and box); the editor needs only their plans, so the worker cuts them down before handing
// them to the page, and the page never parses the rest.

type Point = readonly [number, number];

/** One area of a layout: its kind, name, middle and reach; a gate names the node it leads to. */
export interface AreaMark {
  readonly kind: string;
  readonly name: string;
  readonly at: Point;
  readonly radius: number;
  readonly leadsTo?: string;
}

/** A way between the areas, with the laid ground's height at each point. */
export interface PathMark {
  readonly tier: 'track' | 'footpath';
  readonly points: readonly Point[];
  readonly heights: readonly number[];
}

/** Where an activity stands: a landing, a gate, an event, a beacon, a resource or foes. */
export interface SiteMarkOfLayout {
  readonly kind: string;
  readonly at: Point;
  readonly radius: number;
  readonly holds?: string;
}

/** A run breaking off a zone: its name, kind (gorge, ledge, rampart, keep, mine, undercroft), place (rock or beyond),
 *  its line, its beats and its sealed door. */
export interface RunMark {
  readonly name: string;
  readonly kind: string;
  readonly place: string;
  readonly line: readonly Point[];
  readonly beats: readonly { readonly at: Point; readonly radius: number }[];
  readonly door: Point;
}

/** A node's layout as the editor draws it: its section ring, areas, paths, sites and runs. */
export interface LayoutMarks {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly ring: readonly Point[];
  readonly areas: readonly AreaMark[];
  readonly paths: readonly PathMark[];
  readonly sites: readonly SiteMarkOfLayout[];
  readonly runs: readonly RunMark[];
}

interface Laid {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly ring: readonly Point[];
  readonly areas: readonly (Omit<AreaMark, 'leadsTo'> & { readonly leads_to?: string })[];
  readonly paths: readonly PathMark[];
  readonly sites: readonly SiteMarkOfLayout[];
  readonly runs?: readonly (RunMark & { readonly beats: readonly { readonly at: Point; readonly radius: number }[] })[];
}

/** The marks of the layouts in the land worker's layouts JSON (a list as the layout crate writes it). */
export function layoutMarksOf(text: string): LayoutMarks[] {
  const laid = JSON.parse(text) as unknown;
  if (!Array.isArray(laid)) return [];
  return (laid as Laid[]).map(({ id, kind, name, ring, areas, paths, sites, runs }) => ({
    id,
    kind,
    name,
    ring,
    areas: areas.map(({ kind: areaKind, name: areaName, at, radius, leads_to: leadsTo }) => ({
      kind: areaKind,
      name: areaName,
      at,
      radius,
      ...(leadsTo === undefined ? {} : { leadsTo }),
    })),
    paths: paths.map(({ tier, points, heights }) => ({ tier, points, heights })),
    sites: sites.map(({ kind: siteKind, at, radius, holds }) => ({
      kind: siteKind,
      at,
      radius,
      ...(holds === undefined ? {} : { holds }),
    })),
    runs: (runs ?? []).map(({ name: runName, kind: runKind, place, line, beats, door }) => ({
      name: runName,
      kind: runKind,
      place,
      line,
      beats: beats.map(({ at, radius }) => ({ at, radius })),
      door,
    })),
  }));
}

/** The named layouts from the land worker's layouts JSON, whole as the city layer draws them, as a JSON list in the
 *  order named; their collision boxes and carving claims, which nothing on the page reads, are left behind. */
export function layoutsNamed(text: string, ids: readonly string[]): string {
  const laid = JSON.parse(text) as unknown;
  if (!Array.isArray(laid)) return '[]';
  const byId = new Map((laid as { id: string }[]).map((layout) => [layout.id, layout]));
  const named = ids.flatMap((id) => {
    const layout = byId.get(id);
    if (!layout) return [];
    const drawn: Record<string, unknown> = { ...layout };
    delete drawn.boxes;
    delete drawn.sculpt;
    return [drawn];
  });
  return JSON.stringify(named);
}
