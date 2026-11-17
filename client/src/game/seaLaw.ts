import type { HeightAt, Point2 } from '../overworld/ground.ts';
import { coastDistance } from '../overworld/islandView.ts';
import type { Voyage } from '../overworld/voyage.ts';

/** Where a ship lies off a harbour: out from the city's middle through its harbour in steps of `stepM`, past the
 *  shore to water `depthM` deep, then `clearM` on, within `farthestM` of the harbour. */
export const OFFSHORE = { stepM: 50, depthM: 4, clearM: 600, farthestM: 20_000 } as const;

/** A ship's place off a harbour (`through`), out along the way from `from` to it; the harbour itself where no water
 *  that deep lies that way. */
export function offshore(heightAt: HeightAt, from: Point2, through: Point2): Point2 {
  const length = Math.hypot(through[0] - from[0], through[1] - from[1]) || 1;
  const way = [(through[0] - from[0]) / length, (through[1] - from[1]) / length] as const;
  let deepFrom: number | null = null;
  for (let along = 0; along <= OFFSHORE.farthestM; along += OFFSHORE.stepM) {
    const point: Point2 = [through[0] + way[0] * along, through[1] + way[1] * along];
    const ground = heightAt(point[0], point[1]);
    if (Number.isFinite(ground) && ground > -OFFSHORE.depthM) {
      deepFrom = null;
      continue;
    }
    deepFrom ??= along;
    if (along - deepFrom >= OFFSHORE.clearM) return point;
  }
  return through;
}

/** How near another continent's coast a ship comes before that landmass is opened and drawn in place of the open
 *  one, metres. */
export const CHART_REACH_M = 60_000;

/** The continent to open as the ship sails: the one whose coast is nearest it, when that is not the open one and
 *  lies within reach; else null, and the open one stays. */
export function continentToOpen(
  ship: Point2,
  continents: readonly { readonly id: string; readonly outline: readonly Point2[] }[],
  openId: string,
  reachM: number = CHART_REACH_M,
): string | null {
  let nearest: { id: string; distance: number } | null = null;
  for (const { id, outline } of continents) {
    const distance = coastDistance(ship, outline);
    if (!nearest || distance < nearest.distance) nearest = { id, distance };
  }
  return nearest && nearest.id !== openId && nearest.distance <= reachM ? nearest.id : null;
}

/** The points of a voyage still ahead of a ship `travelledM` along it, as the sea room takes a course: it sails from
 *  where the ship is through each in turn. */
export function courseAhead(voyage: Voyage, travelledM: number): Point2[] {
  return voyage.points.filter((unused, index) => (voyage.along[index] ?? 0) > travelledM);
}

/** Other players' ships' paints, taken in turn by their numbers: none is the player's own blue. */
const PAINTS: readonly (readonly [number, number, number])[] = [
  [0.62, 0.16, 0.12],
  [0.78, 0.6, 0.18],
  [0.2, 0.46, 0.24],
  [0.46, 0.24, 0.52],
  [0.86, 0.86, 0.82],
  [0.12, 0.12, 0.14],
];

/** The paint of another player's ship, by their number in the room. */
export function paintOf(player: number): readonly [number, number, number] {
  const index = ((Math.trunc(player) % PAINTS.length) + PAINTS.length) % PAINTS.length;
  return PAINTS[index] ?? [1, 1, 1];
}

/** Marks laid farthest first, less any nearer than `gapPx` on the picture to a nearer one kept, so marks of one place
 *  (a city and its port) or far behind one another do not pile up; still farthest first. */
export function declutter<T extends { readonly x: number; readonly y: number }>(
  placed: readonly T[],
  gapPx: number,
): T[] {
  const kept: T[] = [];
  for (let index = placed.length - 1; index >= 0; index--) {
    const mark = placed[index];
    if (mark && kept.every((other) => Math.hypot(other.x - mark.x, other.y - mark.y) >= gapPx)) kept.push(mark);
  }
  return kept.reverse();
}

/** About how wide a letter of a mark's name is, and how tall its name and note are under it, CSS pixels. */
export const LABEL = { letterPx: 8, linesPx: 34 } as const;

/** The marks whose names show, of marks laid farthest first: nearest first, a name shows where the box it takes
 *  under its mark meets no name shown already, so names never print over each other. */
export function namesShown(
  marks: readonly {
    readonly id: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly sizePx: number;
  }[],
): Set<string> {
  const shown: { left: number; right: number; top: number; bottom: number }[] = [];
  const named = new Set<string>();
  for (let index = marks.length - 1; index >= 0; index--) {
    const mark = marks[index];
    if (!mark) continue;
    const half = (mark.name.length * LABEL.letterPx) / 2;
    const top = mark.y + mark.sizePx / 2;
    const box = { left: mark.x - half, right: mark.x + half, top, bottom: top + LABEL.linesPx };
    const meets = shown.some(
      (other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
    );
    if (meets) continue;
    shown.push(box);
    named.add(mark.id);
  }
  return named;
}

/** A voyage's time left, as the player reads it: seconds under a minute, then minutes. */
export function timeText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  return `${Math.round(seconds / 60)} min`;
}
