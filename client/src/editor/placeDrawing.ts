import { type Camera, worldToScreen } from './camera.ts';
import type { Places } from './marks.ts';

export type Spot = readonly [number, number];
/** The lists of an edits file that hold places. */
export type PlaceList = 'rivers' | 'roads' | 'towns' | 'ports';

/** The next free id of a kind: one past the highest number its places use, as `road-4`. */
export function nextId(places: Places, kind: 'river' | 'road' | 'town' | 'port'): string {
  const used = (places[`${kind}s`] ?? []).map(({ id }) => Number(id?.match(new RegExp(`^${kind}-(\\d+)$`))?.[1] ?? 0));
  return `${kind}-${Math.max(0, ...used) + 1}`;
}

/** The nearest point of a polyline to a spot, and its distance; `closed` joins the last point to the first. */
export function nearestOnLine(points: readonly Spot[], spot: Spot, closed = false): { at: Spot; distance: number } {
  let best = { at: points[0] ?? spot, distance: Number.POSITIVE_INFINITY };
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index++) {
    const [fromX, fromY] = points[index] ?? spot;
    const [toX, toY] = points[(index + 1) % points.length] ?? spot;
    const [spanX, spanY] = [toX - fromX, toY - fromY];
    const length = spanX * spanX + spanY * spanY;
    const along =
      length > 0 ? Math.min(1, Math.max(0, ((spot[0] - fromX) * spanX + (spot[1] - fromY) * spanY) / length)) : 0;
    const closest: Spot = [fromX + spanX * along, fromY + spanY * along];
    const distance = Math.hypot(spot[0] - closest[0], spot[1] - closest[1]);
    if (distance < best.distance) best = { at: closest, distance };
  }
  if (points.length === 1 && points[0])
    best = { at: points[0], distance: Math.hypot(spot[0] - points[0][0], spot[1] - points[0][1]) };
  return best;
}

/** A road's point, snapped within `reachM` to the nearest port, point of another road, or edge of a town, so roads
 *  meet what they lead to exactly; whole metres either way. */
export function snapPoint(places: Places, spot: Spot, reachM: number): Spot {
  const whole = (point: Spot): Spot => [Math.round(point[0]), Math.round(point[1])];
  let best: { at: Spot; distance: number } = { at: spot, distance: reachM };
  const consider = (point: Spot, distance: number) => {
    if (distance < best.distance) best = { at: point, distance };
  };
  for (const { at: port } of places.ports ?? []) consider(port, Math.hypot(spot[0] - port[0], spot[1] - port[1]));
  for (const road of places.roads ?? [])
    for (const point of road.points) consider(point, Math.hypot(spot[0] - point[0], spot[1] - point[1]));
  for (const town of places.towns ?? []) {
    const near = nearestOnLine(town.outline, spot, true);
    consider(near.at, near.distance);
  }
  return whole(best.at);
}

/** The place under a spot, within `reachM` of a course or a port, or inside a town: the one to remove. */
export function placeAt(places: Places, spot: Spot, reachM: number): { list: PlaceList; id: string } | null {
  const found: { list: PlaceList; id: string; distance: number }[] = [];
  const consider = (list: PlaceList, id: string | undefined, distance: number) => {
    if (id !== undefined && distance <= reachM) found.push({ list, id, distance });
  };
  for (const port of places.ports ?? [])
    consider('ports', port.id, Math.hypot(spot[0] - port.at[0], spot[1] - port.at[1]));
  for (const road of places.roads ?? []) consider('roads', road.id, nearestOnLine(road.points, spot).distance);
  for (const river of places.rivers ?? []) consider('rivers', river.id, nearestOnLine(river.points, spot).distance);
  for (const town of places.towns ?? []) {
    const inside = insideRing(town.outline, spot);
    consider('towns', town.id, inside ? 0 : nearestOnLine(town.outline, spot, true).distance);
  }
  const nearest = found.reduce<(typeof found)[number] | null>(
    (best, next) => (!best || next.distance < best.distance ? next : best),
    null,
  );
  return nearest ? { list: nearest.list, id: nearest.id } : null;
}

function insideRing(ring: readonly Spot[], [x, y]: Spot): boolean {
  let inside = false;
  ring.forEach(([fromX, fromY], index) => {
    const [toX, toY] = ring[(index + 1) % ring.length] ?? [fromX, fromY];
    if (fromY > y !== toY > y && x < fromX + ((y - fromY) / (toY - fromY)) * (toX - fromX)) inside = !inside;
  });
  return inside;
}

/** Draws the place being drawn over the 2D map: its points so far, a line on to the cursor, and a closing line for
 *  a town. Nothing when there is no draft. */
export function drawDraft(
  svg: SVGSVGElement,
  view: { readonly camera: Camera; readonly width: number; readonly height: number },
  draft: { readonly kind: 'river' | 'road' | 'town'; readonly points: readonly Spot[] } | null,
  cursor: Spot | null,
): void {
  svg.replaceChildren();
  if (!draft || draft.points.length === 0) return;
  const colour = { river: '#5aa6ff', road: '#e0b070', town: '#ff8a6a' }[draft.kind];
  const screen = [...draft.points, ...(cursor ? [cursor] : [])].map(([x, y]) =>
    worldToScreen(view.camera, view.width, view.height, x, y),
  );
  const line = document.createElementNS('http://www.w3.org/2000/svg', draft.kind === 'town' ? 'polygon' : 'polyline');
  line.setAttribute('points', screen.map(({ x, y }) => `${x},${y}`).join(' '));
  line.setAttribute('fill', draft.kind === 'town' ? `${colour}33` : 'none');
  line.setAttribute('stroke', colour);
  line.setAttribute('stroke-width', '2');
  svg.append(line);
  for (const { x, y } of screen.slice(0, draft.points.length)) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    Object.entries({ cx: x, cy: y, r: 3, fill: colour }).forEach(([key, value]) =>
      dot.setAttribute(key, String(value)),
    );
    svg.append(dot);
  }
}
