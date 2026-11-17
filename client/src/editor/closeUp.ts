import type { GroundPatch } from '../rules/landRules.ts';
import { type Orbit, viewProjection } from './orbit.ts';
import { heldSplineAt } from '../water/spline.ts';
import type { CloseUpData } from '../terrain/terrainView.ts';

/** Under this distance from its target, the 3D camera shows the exact ground around the target. */
export const CLOSE_RANGE_M = 8000;
/** The close-up's samples a side and their spacing: 2 km square, every 4 m. */
export const PATCH_SAMPLES = 513;
export const PATCH_STEP_M = 4;
/** The close-up is sampled again once the target moves this far from its centre. */
export const REFRESH_M = 400;
/** A walker's eyes, and the figure that shows a person's height, metres. */
export const FIGURE_M = 1.8;

/** A walker's step: `held` keys (W A S D or arrows, Shift to run) move the target along the ground for `seconds`, at
 *  6 m/s or 40 running, forward being where the camera looks. */
export function walkStep(orbit: Orbit, held: ReadonlySet<string>, seconds: number): Orbit {
  const speed = (held.has('shift') ? 40 : 6) * seconds;
  const forward = Number(held.has('w') || held.has('arrowup')) - Number(held.has('s') || held.has('arrowdown'));
  const sideways = Number(held.has('d') || held.has('arrowright')) - Number(held.has('a') || held.has('arrowleft'));
  const [sin, cos] = [Math.sin(orbit.yaw), Math.cos(orbit.yaw)];
  return {
    ...orbit,
    targetX: orbit.targetX + (sin * forward + cos * sideways) * speed,
    targetY: orbit.targetY + (-cos * forward + sin * sideways) * speed,
  };
}

/** Heights drawn at true scale close up, easing to the chosen exaggeration from 3 km to 30 km away. */
export function shownExaggeration(exaggeration: number, distance: number): number {
  const fraction = Math.min(1, Math.max(0, (distance - 3000) / 27_000));
  return 1 + (exaggeration - 1) * fraction * fraction * (3 - 2 * fraction);
}

/** The close-up as the 3D view draws it: its samples placed in the landmass's window, with their still water. */
export function closeUpData(
  patch: GroundPatch,
  levels: Float32Array,
  window: { readonly leftM: number; readonly topM: number },
): CloseUpData {
  return {
    corner: [patch.left - window.leftM, patch.top - window.topM],
    step: patch.step,
    width: patch.width,
    height: patch.height,
    heights: patch.heights,
    levels,
    marks: patch.marks,
  };
}

/** The exact ground's height at a world point, along the splines the 3D view draws it by, or null off the patch. */
export function groundUnder(patch: GroundPatch, x: number, y: number): number | null {
  const [gridX, gridY] = [(x - patch.left) / patch.step, (y - patch.top) / patch.step];
  if (gridX < 0 || gridY < 0 || gridX >= patch.width - 1 || gridY >= patch.height - 1) return null;
  return heldSplineAt(patch.heights, patch.width, patch.height, gridX, gridY);
}

/** Puts points in the window's metres (z up) on the screen through one camera, or null behind it. */
export function screenProjector(
  orbit: Orbit,
  size: { readonly width: number; readonly height: number },
): (point: readonly [number, number, number]) => { x: number; y: number } | null {
  const matrix = viewProjection(orbit, size.width / size.height);
  return ([x, y, z]) => {
    const row = (index: number) =>
      (matrix[index] ?? 0) * x +
      (matrix[index + 4] ?? 0) * y +
      (matrix[index + 8] ?? 0) * z +
      (matrix[index + 12] ?? 0);
    const clipW = row(3);
    if (clipW <= 0) return null;
    return { x: ((row(0) / clipW + 1) / 2) * size.width, y: ((1 - row(1) / clipW) / 2) * size.height };
  };
}

/** A point in the window's metres (z up) on the screen, or null behind the camera. */
export function toScreen(
  orbit: Orbit,
  size: { readonly width: number; readonly height: number },
  point: readonly [number, number, number],
): { x: number; y: number } | null {
  return screenProjector(orbit, size)(point);
}

/** Draws a person's height at the target and a scale bar beside it over the 3D view, so the ground's size reads.
 *  Adds to what the overlay holds. */
export function drawScaleCues(
  svg: SVGSVGElement,
  orbit: Orbit,
  size: { readonly width: number; readonly height: number },
  feet: readonly [number, number, number],
  exaggeration: number,
): void {
  const draw = (name: string, attributes: Record<string, string | number>, text = '') => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    node.textContent = text;
    svg.append(node);
  };
  const base = toScreen(orbit, size, feet);
  const head = toScreen(orbit, size, [feet[0], feet[1], feet[2] + FIGURE_M * exaggeration]);
  if (!base || !head) return;
  draw('line', { x1: base.x, y1: base.y, x2: head.x, y2: head.y, stroke: '#ffe28a', 'stroke-width': 3 });
  draw('circle', { cx: head.x, cy: head.y, r: Math.max(2, Math.abs(base.y - head.y) / 8), fill: '#ffe28a' });
  const across: readonly [number, number] = [Math.cos(orbit.yaw), Math.sin(orbit.yaw)];
  for (const metres of [1000, 100, 10, 1]) {
    const end = toScreen(orbit, size, [feet[0] + across[0] * metres, feet[1] + across[1] * metres, feet[2]]);
    if (!end || Math.hypot(end.x - base.x, end.y - base.y) > 180) continue;
    const label = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
    draw('line', { x1: base.x, y1: base.y + 14, x2: end.x, y2: end.y + 14, stroke: '#fff', 'stroke-width': 2 });
    draw(
      'text',
      { x: (base.x + end.x) / 2, y: (base.y + end.y) / 2 + 30, fill: '#fff', 'text-anchor': 'middle', 'font-size': 12 },
      label,
    );
    break;
  }
}
