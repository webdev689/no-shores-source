import type { GroundPatch } from '../rules/landRules.ts';
import { type Orbit, viewProjection } from './orbit.ts';
import type { TerrainData } from './terrainView.ts';

/** Under this distance from its target, the 3D camera shows the exact ground around the target. */
export const CLOSE_RANGE_M = 8000;
/** The close-up's samples a side and their spacing: a little over 2 km square, every 8 m. */
export const PATCH_SAMPLES = 257;
export const PATCH_STEP_M = 8;
/** The close-up is sampled again once the target moves this far from its centre. */
export const REFRESH_M = 400;
/** A walker's eyes, and the figure that shows a person's height, metres. */
export const EYE_M = 1.7;
export const FIGURE_M = 1.8;

/** Heights drawn at true scale close up, easing to the chosen exaggeration from 3 km to 30 km away. */
export function shownExaggeration(exaggeration: number, distance: number): number {
  const fraction = Math.min(1, Math.max(0, (distance - 3000) / 27_000));
  return 1 + (exaggeration - 1) * fraction * fraction * (3 - 2 * fraction);
}

/** A ground patch as the 3D renderer draws it, placed in the landmass's window. */
export function patchData(patch: GroundPatch, windowLeftM: number, windowTopM: number): TerrainData {
  return {
    width: patch.width,
    height: patch.height,
    cellM: patch.step,
    heights: patch.heights,
    lakes: patch.water,
    marks: patch.marks,
    originX: patch.left - windowLeftM - patch.step / 2,
    originY: patch.top - windowTopM - patch.step / 2,
  };
}

/** The part of the window the close-up covers, a sample in from its edge, so the coarse land meets it unbroken. */
export function patchHole(data: TerrainData): readonly [number, number, number, number] {
  const [west, north] = [(data.originX ?? 0) + data.cellM * 1.5, (data.originY ?? 0) + data.cellM * 1.5];
  return [west, north, west + (data.width - 3) * data.cellM, north + (data.height - 3) * data.cellM];
}

/** The exact ground's height at a world point, between the patch's samples, or null off the patch. */
export function groundUnder(patch: GroundPatch, x: number, y: number): number | null {
  const [gridX, gridY] = [(x - patch.left) / patch.step, (y - patch.top) / patch.step];
  const [i, j] = [Math.floor(gridX), Math.floor(gridY)];
  if (i < 0 || j < 0 || i >= patch.width - 1 || j >= patch.height - 1) return null;
  const [fractionX, fractionY] = [gridX - i, gridY - j];
  const sample = (column: number, row: number) => patch.heights[row * patch.width + column] ?? 0;
  const north = sample(i, j) + (sample(i + 1, j) - sample(i, j)) * fractionX;
  const south = sample(i, j + 1) + (sample(i + 1, j + 1) - sample(i, j + 1)) * fractionX;
  return north + (south - north) * fractionY;
}

/** A point in the window's metres (z up) on the screen, or null behind the camera. */
export function toScreen(
  orbit: Orbit,
  size: { readonly width: number; readonly height: number },
  [x, y, z]: readonly [number, number, number],
): { x: number; y: number } | null {
  const matrix = viewProjection(orbit, size.width / size.height);
  const row = (index: number) =>
    (matrix[index] ?? 0) * x + (matrix[index + 4] ?? 0) * y + (matrix[index + 8] ?? 0) * z + (matrix[index + 12] ?? 0);
  const clipW = row(3);
  if (clipW <= 0) return null;
  return { x: ((row(0) / clipW + 1) / 2) * size.width, y: ((1 - row(1) / clipW) / 2) * size.height };
}

/** Draws a person's height at the target and a scale bar beside it over the 3D view, so the ground's size reads. */
export function drawScaleCues(
  svg: SVGSVGElement,
  orbit: Orbit,
  size: { readonly width: number; readonly height: number },
  feet: readonly [number, number, number],
  exaggeration: number,
): void {
  svg.replaceChildren();
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
