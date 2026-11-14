import type { LandView } from '../rules/landRules.ts';
import { eachCellInRing } from './landMask.ts';

/** What a cell of a landmass's map is marked with, drawn over its ground in both views. */
export const MARK = { none: 0, river: 1, carvedRiver: 2, road: 3, town: 4, port: 5 } as const;

type Points = readonly (readonly [number, number])[];

/** The places of an edits file, as far as the map draws them. */
export interface Places {
  readonly rivers?: readonly { readonly id?: string; readonly points: Points }[];
  readonly roads?: readonly { readonly id?: string; readonly points: Points }[];
  readonly towns?: readonly { readonly id?: string; readonly outline: Points }[];
  readonly ports?: readonly { readonly id?: string; readonly at: readonly [number, number] }[];
}

/** Each cell's mark: the rivers the water gathered, then the places drawn, the later over the earlier. */
export function markCells(view: LandView, places: Places): Uint8Array {
  const marks = new Uint8Array(view.width * view.height);
  const mark = (x: number, y: number, value: number) => {
    const i = Math.floor((x - view.leftM) / view.cellM);
    const j = Math.floor((y - view.topM) / view.cellM);
    if (i >= 0 && j >= 0 && i < view.width && j < view.height) marks[j * view.width + i] = value;
  };
  const line = (points: Points, value: number, closed = false) => {
    const all = closed && points.length > 0 ? [...points, points[0] ?? [0, 0]] : points;
    for (let index = 1; index < all.length; index++) {
      const [fromX, fromY] = all[index - 1] ?? [0, 0];
      const [toX, toY] = all[index] ?? [0, 0];
      const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toY - fromY) / (view.cellM / 2)));
      for (let step = 0; step <= steps; step++)
        mark(fromX + ((toX - fromX) * step) / steps, fromY + ((toY - fromY) * step) / steps, value);
    }
  };
  for (const river of view.rivers) for (const [x, y] of river.points) mark(x, y, MARK.river);
  for (const town of places.towns ?? []) {
    eachCellInRing(view, town.outline, (index) => (marks[index] = MARK.town));
    line(town.outline, MARK.town, true);
  }
  for (const river of places.rivers ?? []) line(river.points, MARK.carvedRiver);
  for (const road of places.roads ?? []) line(road.points, MARK.road);
  for (const { at } of places.ports ?? [])
    for (const stepY of [-1, 0, 1])
      for (const stepX of [-1, 0, 1]) mark(at[0] + stepX * view.cellM, at[1] + stepY * view.cellM, MARK.port);
  return marks;
}
