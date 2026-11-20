import type { LandView } from '../rules/landRules.ts';
import { splineAt } from '../water/spline.ts';
import { screenProjector } from './closeUp.ts';
import type { LayoutMarks } from '../terrain/layoutMarks.ts';
import { layoutMarks } from './layoutDrawing.ts';
import type { Places } from './marks.ts';
import type { Orbit } from './orbit.ts';
import { type Box, Labels, pathThrough, type Project, type SiteMark, span } from './screenMarks.ts';
import { NODE_COLOURS, WALL_RADIUS_M } from './sites.ts';

/** A node smaller than this on screen, pixels across, is drawn as a dot so it stays seen. */
const DOT_BELOW_PX = 10;
/** Spawns are drawn once their node is this wide on screen; smaller, they would only clutter it. */
const SPAWNS_FROM_PX = 40;
/** The wall is drawn once it is this wide on screen; smaller, the city's marker says where it stands. */
const WALL_FROM_PX = 14;
const WALL_POINTS = 96;
const CITY_COLOUR = '#fff1c2';
/** How far off the screen, in screens from its middle, a 3D point is still drawn. */
const OFF_SCREEN_REACH = 4;

/**
 * What to draw for a landmass's port city and nodes through `project`: the city's marker, name and wall; each node's
 * section in its kind's colour, or a dot when it is too small to see, its name and, when it is large enough, its
 * spawns; then each node's layout (layoutDrawing.ts). Labels are placed city first, then the nodes largest on screen
 * first, then the layouts', and one that would cover another is left out, so names stay readable however far the
 * view is zoomed out; none is laid over a box in `keepClear`.
 */
export function siteMarks(
  places: Places,
  project: Project,
  layouts: readonly LayoutMarks[] = [],
  keepClear: readonly Box[] = [],
): SiteMark[] {
  const below: SiteMark[] = [];
  const dots: SiteMark[] = [];
  const labels = new Labels();
  for (const box of keepClear) labels.keepClear(box);
  const label = (x: number, y: number, text: string, colour: string) => labels.place(x, y, text, colour);
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
      labels.keepClear({ left: centre.x - 8, top: centre.y - 8, right: centre.x + 8, bottom: centre.y + 8 });
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
  const laid = layoutMarks(layouts, project, labels);
  return [...below, ...laid.below, ...dots, ...laid.dots, ...labels.marks];
}

/** Projects world points onto the 3D view: on the land as drawn (the exact ground where `exact` knows it, else the
 *  1 km land's), its heights `shownHeight` times, the sea level where the ground lies under it. */
export function groundProjector(
  view: LandView,
  orbit: Orbit,
  size: { readonly width: number; readonly height: number },
  shownHeight: number,
  exact: (x: number, y: number) => number | null = () => null,
): Project {
  const toScreen = screenProjector(orbit, size);
  // A point just in front of the camera lands millions of pixels out; a dashed line through it makes the browser
  // lay millions of dashes and kills the page. Off this reach a line is broken instead, out of sight.
  const reach = OFF_SCREEN_REACH * Math.max(size.width, size.height);
  return (x, y, height) => {
    const [windowX, windowY] = [x - view.leftM, y - view.topM];
    const gridX = windowX / view.cellM - 0.5;
    const gridY = windowY / view.cellM - 0.5;
    const ground = height ?? exact(x, y) ?? splineAt(view.heights, view.width, view.height, gridX, gridY);
    const point = toScreen([windowX, windowY, Math.max(0, ground) * shownHeight]);
    const near = point && Math.abs(point.x - size.width / 2) < reach && Math.abs(point.y - size.height / 2) < reach;
    return near ? point : null;
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
    else if (mark.shape === 'line') {
      const line = { 'd': mark.path, 'fill': 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
      if (mark.casing) add('path', { ...line, 'stroke': '#000000a0', 'stroke-width': mark.width + 2 });
      add('path', {
        ...line,
        'fill': mark.fill ?? 'none',
        'stroke': mark.colour,
        'stroke-width': mark.width,
        ...(mark.dash ? { 'stroke-dasharray': mark.dash } : {}),
      });
    } else if (mark.shape === 'section')
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
          'font-size': 11,
          'text-anchor': 'middle',
          'paint-order': 'stroke',
          'stroke': '#000000cc',
          'stroke-width': 3,
        },
        mark.text,
      );
  }
}
