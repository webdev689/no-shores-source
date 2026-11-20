import type { LayoutMarks } from '../terrain/layoutMarks.ts';
import { type Labels, pathThrough, type Project, type SiteMark, span } from './screenMarks.ts';

/** An area's colour by what it is for, so a map of many reads at a glance; the panel's legend names each. */
const AREA_GROUPS = [
  { name: 'Arrival', colour: '#ffffff', kinds: ['landing', 'entrance'] },
  { name: 'Gate', colour: '#c9a7ff', kinds: ['gate'] },
  { name: 'Settlement', colour: '#f4b860', kinds: ['hamlet', 'farm', 'camp', 'keep'] },
  { name: 'Works', colour: '#7fc6d9', kinds: ['tower', 'lighthouse', 'dock', 'mill', 'quarry', 'causeway'] },
  {
    name: 'Haunt',
    colour: '#e08ad8',
    kinds: ['ruin', 'graveyard', 'coven', 'shrine', 'bones', 'cave', 'wreck', 'hulks'],
  },
  { name: 'Wilds', colour: '#8fd17a', kinds: ['wilds'] },
  { name: 'Arena', colour: '#ff6b5b', kinds: ['arena'] },
] as const;
const AREA_COLOUR = new Map<string, string>(
  AREA_GROUPS.flatMap(({ colour, kinds }) => kinds.map((kind) => [kind, colour])),
);

const SITE_COLOURS: Record<string, string> = {
  landing: '#ffffff',
  gate: '#c9a7ff',
  event: '#ffb347',
  beacon: '#5ee0ff',
  resource: '#9be36b',
  foes: '#ff4d4d',
  objective: '#ffd84d',
  door: '#ff9f1c',
};
/** A run's colour by whether it runs in the open or through a building, and the thinnest its line is drawn, pixels. */
const RUN_COLOURS = { open: '#ff7a3d', building: '#d45cff' } as const;
const BUILDING_RUNS = new Set(['keep', 'mine', 'undercroft']);
const RUN_THINNEST_PX = 3;
/** A run's width either side of its line, metres, as the layout crate cuts its narrowest kind. */
const RUN_HALF_M = 2.5;
/** The layout crate's widths, metres, the colours of the two tiers of way, and the thinnest each is drawn, pixels,
 *  so a way stays seen from afar and a track still reads wider than a footpath. */
const PATHS = {
  track: { widthM: 4.5, colour: '#e2b26f', thinnestPx: 2.5 },
  footpath: { widthM: 2.6, colour: '#f6e7c4', thinnestPx: 1.5 },
} as const;
const RING_COLOUR = '#ffffffd0';

/** What the panel's legend shows: each colour and what it marks. */
export const LAYOUT_LEGEND: readonly (readonly [string, string])[] = [
  ...AREA_GROUPS.map(({ name, colour }) => [name, colour] as const),
  ['Track', PATHS.track.colour],
  ['Footpath', PATHS.footpath.colour],
  ['Section', RING_COLOUR],
  ['Run in the open', RUN_COLOURS.open],
  ['Run through a building', RUN_COLOURS.building],
  ...Object.entries(SITE_COLOURS).map(
    ([kind, colour]) => [`${kind[0]?.toUpperCase()}${kind.slice(1)} site`, colour] as const,
  ),
];

/** A layout is drawn once its section is this wide on screen, pixels: smaller, its node's outline or dot says where
 *  it is. Its sites follow once it is wider, and the smaller sites' names wider still. */
const LAYOUT_FROM_PX = 40;
const SITES_FROM_PX = 120;
const SITE_NAMES_FROM_PX = 600;
/** An area's name is laid once it is this wide on screen. */
const AREA_NAME_FROM_PX = 24;
const CIRCLE_POINTS = 48;
/** The sites drawn as rings at their reach, once a ring is this wide on screen, pixels. */
const RINGED = new Set(['event', 'foes']);
const RING_FROM_PX = 12;

const circle = (project: Project, [x, y]: readonly [number, number], radius: number) =>
  Array.from({ length: CIRCLE_POINTS }, (_unused, index) => {
    const angle = (index / CIRCLE_POINTS) * 2 * Math.PI;
    return project(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  });

const areaName = ({ kind, name, leadsTo }: LayoutMarks['areas'][number]) =>
  kind === 'gate' ? `Gate to ${leadsTo ?? 'nowhere'}` : name ? `${name} · ${kind}` : kind;

/**
 * What to draw for the nodes' layouts through `project`: each one large enough on screen draws its areas in their
 * group's colour, its paths at their widths (never thinner than a
 * track or footpath reads), its section ring dashed and, closer,
 * its sites as dots. Its scale is read off its ring as projected, so the same rules serve the 2D map and the 3D view.
 * A path's points stand at the heights it was laid at; everything else on the ground as `project` finds it.
 */
export function layoutMarks(
  layouts: readonly LayoutMarks[],
  project: Project,
  labels: Labels,
): { below: SiteMark[]; dots: SiteMark[] } {
  const below: SiteMark[] = [];
  const dots: SiteMark[] = [];
  const shown = layouts
    .map((layout) => ({ layout, outline: pathThrough(layout.ring.map(([x, y]) => project(x, y))) }))
    .flatMap(({ layout, outline }) =>
      outline.box && span(outline.box) >= LAYOUT_FROM_PX ? [{ layout, outline, box: outline.box }] : [],
    )
    .sort((first, second) => span(second.box) - span(first.box));
  for (const { layout, outline, box } of shown) {
    const eastings = layout.ring.map(([x]) => x);
    const southings = layout.ring.map(([, y]) => y);
    const pixelsPerMetre =
      span(box) /
      Math.max(1, Math.max(...eastings) - Math.min(...eastings), Math.max(...southings) - Math.min(...southings));
    const areas = [...layout.areas].sort((first, second) => second.radius - first.radius);
    for (const area of areas) {
      const colour = AREA_COLOUR.get(area.kind) ?? '#cccccc';
      const edge = pathThrough(circle(project, area.at, area.radius));
      // Cut by the view, an area is only outlined: a fill would close each piece with a chord across it.
      const fill = edge.whole ? { fill: `${colour}2e` } : {};
      if (edge.box) below.push({ shape: 'line', path: edge.path, colour, width: 1.5, ...fill });
    }
    for (const { tier, points, heights } of layout.paths) {
      const { widthM, colour, thinnestPx } = PATHS[tier];
      const way = pathThrough(
        points.map(([x, y], index) => project(x, y, heights[index])),
        false,
      );
      const width = Math.max(thinnestPx, Math.round(widthM * pixelsPerMetre * 10) / 10);
      if (way.box) below.push({ shape: 'line', path: way.path, colour, width, casing: true });
    }
    for (const run of layout.runs) {
      const colour = BUILDING_RUNS.has(run.kind) ? RUN_COLOURS.building : RUN_COLOURS.open;
      const way = pathThrough(
        run.line.map(([x, y]) => project(x, y)),
        false,
      );
      const width = Math.max(RUN_THINNEST_PX, Math.round(2 * RUN_HALF_M * pixelsPerMetre * 10) / 10);
      if (way.box) below.push({ shape: 'line', path: way.path, colour, width, casing: true });
      for (const beat of run.beats) {
        const edge = pathThrough(circle(project, beat.at, beat.radius));
        if (edge.box) below.push({ shape: 'line', path: edge.path, colour, width: 1.5, dash: '3 3' });
      }
      const door = project(...run.door);
      if (door) dots.push({ shape: 'dot', ...door, radius: 5, fill: SITE_COLOURS.door ?? colour, stroke: '#000000cc' });
      const mouth = run.line[0] && project(...run.line[0]);
      if (mouth) labels.place(mouth.x, mouth.y - 8, `${run.name} · ${run.kind}`, colour);
    }
    below.push({ shape: 'line', path: outline.path, colour: RING_COLOUR, width: 1.5, dash: '6 4' });
    for (const area of areas) {
      const middle = project(...area.at);
      if (middle && area.radius * 2 * pixelsPerMetre >= AREA_NAME_FROM_PX)
        labels.place(middle.x, middle.y + 4, areaName(area), AREA_COLOUR.get(area.kind) ?? '#cccccc');
    }
    if (span(box) < SITES_FROM_PX) continue;
    for (const site of layout.sites) {
      const spot = project(...site.at);
      if (!spot) continue;
      const colour = SITE_COLOURS[site.kind] ?? '#cccccc';
      // An event's ground and where foes hold it lie round an area's middle, under its name: they are drawn as
      // rings at their reach, the foes' inside the event's where both hold one area.
      const reach = site.radius * (site.kind === 'foes' ? 0.8 : 1);
      const held = RINGED.has(site.kind) && reach * pixelsPerMetre >= RING_FROM_PX;
      const ring = held ? pathThrough(circle(project, site.at, reach)) : null;
      if (ring?.box)
        below.push({
          shape: 'line',
          path: ring.path,
          colour,
          width: 2.5,
          ...(site.kind === 'event' ? { dash: '6 3' } : {}),
        });
      else dots.push({ shape: 'dot', ...spot, radius: 4, fill: colour, stroke: '#000000cc' });
      // A gate's and a landing's names are their areas', and an event's or foes' would repeat their area's: a
      // resource is named by what it holds, the rest by their kind. A ring's name stands on its edge.
      const [nameX, nameY] = ring?.box ? [spot.x, ring.box.top - 3] : [spot.x, spot.y - 7];
      if (span(box) >= SITE_NAMES_FROM_PX && site.kind !== 'gate' && site.kind !== 'landing')
        labels.place(nameX, nameY, site.kind === 'resource' ? (site.holds ?? site.kind) : site.kind, colour);
    }
  }
  return { below, dots };
}
