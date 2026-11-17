import type { LandView } from '../rules/landRules.ts';
import { splineAt } from '../water/spline.ts';
import { screenProjector } from './closeUp.ts';
import type { Places } from './marks.ts';
import type { Orbit } from './orbit.ts';
import { NODE_COLOURS, WALL_RADIUS_M } from './sites.ts';

/** A world point on the screen, or null where it cannot be drawn (behind the 3D camera). */
export type Project = (x: number, y: number) => { readonly x: number; readonly y: number } | null;

/** One thing drawn over a view for the port city and the nodes, in screen pixels. */
export type SiteMark =
  | { readonly shape: 'wall'; readonly path: string }
  | { readonly shape: 'section'; readonly path: string; readonly colour: string; readonly whole: boolean }
  | {
      readonly shape: 'dot';
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly fill: string;
      readonly stroke: string;
    }
  | { readonly shape: 'label'; readonly x: number; readonly y: number; readonly text: string; readonly colour: string };

/** A node smaller than this on screen, pixels across, is drawn as a dot so it stays seen. */
const DOT_BELOW_PX = 10;
/** Spawns are drawn once their node is this wide on screen; smaller, they would only clutter it. */
const SPAWNS_FROM_PX = 40;
/** The wall is drawn once it is this wide on screen; smaller, the city's marker says where it stands. */
const WALL_FROM_PX = 14;
const WALL_POINTS = 96;
const CITY_COLOUR = '#fff1c2';
/** A label's box: about 6.6 pixels a character of the 12 px font, and its height. */
const CHARACTER_PX = 6.6;
const LABEL_PX = 14;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const span = (box: Box) => Math.max(box.right - box.left, box.bottom - box.top);

/** An SVG path round a ring of projected points, broken where one cannot be drawn, with the box round those that
 *  can; `whole` when every point was drawn. */
function pathThrough(ring: readonly ReturnType<Project>[]): { path: string; whole: boolean; box: Box | null } {
  const gapAt = ring.findIndex((point) => point === null);
  const whole = gapAt < 0;
  // Started at a gap, the ring's edge from its last point back to its first is drawn with the rest.
  const points = whole ? ring : [...ring.slice(gapAt), ...ring.slice(0, gapAt)];
  let path = '';
  let gap = true;
  let box: Box | null = null;
  for (const point of points) {
    if (!point) {
      gap = true;
      continue;
    }
    path += `${gap ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    gap = false;
    box = box
      ? {
          left: Math.min(box.left, point.x),
          top: Math.min(box.top, point.y),
          right: Math.max(box.right, point.x),
          bottom: Math.max(box.bottom, point.y),
        }
      : { left: point.x, top: point.y, right: point.x, bottom: point.y };
  }
  return { path: whole ? `${path}Z` : path, whole, box };
}

/**
 * What to draw for a landmass's port city and nodes through `project`: the city's marker, name and wall; each node's
 * section in its kind's colour, or a dot when it is too small to see, its name and, when it is large enough, its
 * spawns. Labels are placed city first, then the nodes largest on screen first, and one that would cover another is
 * left out, so names stay readable however far the view is zoomed out.
 */
export function siteMarks(places: Places, project: Project): SiteMark[] {
  const below: SiteMark[] = [];
  const dots: SiteMark[] = [];
  const labels: SiteMark[] = [];
  const taken: Box[] = [];
  const label = (x: number, y: number, text: string, colour: string) => {
    const half = (text.length * CHARACTER_PX) / 2 + 2;
    const box = { left: x - half, top: y - LABEL_PX + 3, right: x + half, bottom: y + 3 };
    const covers = (other: Box) =>
      box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom;
    if (taken.some(covers)) return;
    taken.push(box);
    labels.push({ shape: 'label', x, y, text, colour });
  };
  const { city } = places;
  if (city) {
    const [centreX, centreY] = city.centre;
    const ring = Array.from({ length: WALL_POINTS }, (_unused, index) => {
      const angle = (index / WALL_POINTS) * 2 * Math.PI;
      return project(centreX + Math.cos(angle) * WALL_RADIUS_M, centreY + Math.sin(angle) * WALL_RADIUS_M);
    });
    const wall = pathThrough(ring);
    if (wall.box && span(wall.box) >= WALL_FROM_PX) below.push({ shape: 'wall', path: wall.path });
    const centre = project(centreX, centreY);
    if (centre) {
      dots.push({ shape: 'dot', x: centre.x, y: centre.y, radius: 6, fill: CITY_COLOUR, stroke: '#1b1b1b' });
      label(centre.x, centre.y - 11, city.name, CITY_COLOUR);
      // No node's name is laid over the city's marker.
      taken.push({ left: centre.x - 8, top: centre.y - 8, right: centre.x + 8, bottom: centre.y + 8 });
    }
  }
  const nodes = (places.nodes ?? [])
    .map((node) => ({ node, outline: pathThrough(node.ring.map(([x, y]) => project(x, y))) }))
    .flatMap(({ node, outline }) => (outline.box ? [{ node, outline, box: outline.box }] : []))
    .sort((first, second) => span(second.box) - span(first.box));
  for (const { node, outline, box } of nodes) {
    const colour = NODE_COLOURS[node.kind] ?? '#cccccc';
    const middle = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    const small = span(box) < DOT_BELOW_PX;
    if (small) dots.push({ shape: 'dot', ...middle, radius: 4, fill: colour, stroke: '#000000aa' });
    else below.push({ shape: 'section', path: outline.path, colour, whole: outline.whole });
    if (span(box) >= SPAWNS_FROM_PX)
      for (const [x, y] of node.spawns) {
        const spawn = project(x, y);
        if (spawn) dots.push({ shape: 'dot', ...spawn, radius: 3, fill: '#ffffff', stroke: colour });
      }
    label(middle.x, small ? middle.y - 7 : box.top - 5, node.name, colour);
  }
  return [...below, ...dots, ...labels];
}

/** Projects world points onto the 3D view: on the land as drawn, its heights `shownHeight` times, the sea level
 *  where the ground lies under it. */
export function groundProjector(
  view: LandView,
  orbit: Orbit,
  size: { readonly width: number; readonly height: number },
  shownHeight: number,
): Project {
  const toScreen = screenProjector(orbit, size);
  return (x, y) => {
    const [windowX, windowY] = [x - view.leftM, y - view.topM];
    const gridX = windowX / view.cellM - 0.5;
    const gridY = windowY / view.cellM - 0.5;
    const ground = splineAt(view.heights, view.width, view.height, gridX, gridY);
    return toScreen([windowX, windowY, Math.max(0, ground) * shownHeight]);
  };
}

/** Adds the marks to the overlay. */
export function drawSites(svg: SVGSVGElement, marks: readonly SiteMark[]): void {
  const add = (name: string, attributes: Record<string, string | number>, text = '') => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    node.textContent = text;
    svg.append(node);
  };
  for (const mark of marks) {
    if (mark.shape === 'wall')
      add('path', {
        'd': mark.path,
        'fill': 'none',
        'stroke': CITY_COLOUR,
        'stroke-width': 1.5,
        'stroke-dasharray': '7 5',
      });
    else if (mark.shape === 'section')
      add('path', {
        'd': mark.path,
        'fill': mark.whole ? `${mark.colour}30` : 'none',
        'stroke': mark.colour,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      });
    else if (mark.shape === 'dot')
      add('circle', {
        cx: mark.x,
        cy: mark.y,
        r: mark.radius,
        fill: mark.fill,
        stroke: mark.stroke,
        'stroke-width': 1.5,
      });
    else
      add(
        'text',
        {
          'x': mark.x,
          'y': mark.y,
          'fill': mark.colour,
          'font-size': 12,
          'font-weight': 600,
          'text-anchor': 'middle',
          'paint-order': 'stroke',
          'stroke': '#000000cc',
          'stroke-width': 3,
        },
        mark.text,
      );
  }
}
