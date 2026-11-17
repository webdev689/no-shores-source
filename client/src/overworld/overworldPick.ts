import { LAND_TOP_M, surfaceAt, type HeightAt, type Vec3 } from './ground.ts';
import { rayThrough, type CameraPose, type Viewport } from './overworldCamera.ts';
import { pickMark, type PlacedMark } from './overworldMarks.ts';

/**
 * The march: its shortest stride and the share of the distance a stride grows to far out (a metre near the eye is
 * wasted on a pick 30 km off, and a long stride near it could step over a ridge), the bisections of the bracket the
 * ray first went under in, and the farthest any ray is followed: the frame's width.
 */
export const MARCH = { stepMinM: 2, stepShare: 0.004, refine: 14, farthestM: 5_000_000 } as const;

/** Where a ray met the land or the sea, how far along it, and whether it met water. */
export interface SurfaceHit {
  readonly point: Vec3;
  readonly distance: number;
  readonly water: boolean;
}

/** What a click chose: a mark, a point on land, a point on the sea, or nothing (the sky, or past the reach). */
export type Pick =
  | { readonly kind: 'mark'; readonly id: string }
  | { readonly kind: 'land'; readonly point: Vec3 }
  | { readonly kind: 'sea'; readonly point: Vec3 }
  | { readonly kind: 'none' };

/**
 * Where a ray from `eye` along the unit `direction` first meets the ground or the sea's surface, within `reachM`.
 * The march starts where the ray comes under the land's top and cannot pass the sea's surface, which it always meets
 * if it gets there, so a ray from far up costs no more than one from the sea camera.
 */
export function surfaceHit(
  eye: Vec3,
  direction: Vec3,
  heightAt: HeightAt,
  reachM: number = Number.POSITIVE_INFINITY,
): SurfaceHit | null {
  const rise = direction[2];
  const pointAt = (t: number): Vec3 => [eye[0] + direction[0] * t, eye[1] + direction[1] * t, eye[2] + rise * t];
  const seaT = rise < 0 ? Math.max(0, eye[2] / -rise) : Number.POSITIVE_INFINITY;
  const topT = rise > 0 ? Math.max(0, (LAND_TOP_M - eye[2]) / rise) : Number.POSITIVE_INFINITY;
  let t = eye[2] > LAND_TOP_M ? (rise < 0 ? (eye[2] - LAND_TOP_M) / -rise : Number.POSITIVE_INFINITY) : 0;
  const end = Math.min(reachM, seaT, topT, MARCH.farthestM);
  const under = (along: number) => {
    if (along >= seaT) return true;
    const point = pointAt(along);
    return point[2] <= surfaceAt(heightAt, point[0], point[1]);
  };
  if (!(t <= end)) return null;
  if (under(t)) return hitAt(pointAt(t), t, heightAt);
  while (t < end) {
    const next = Math.min(end, t + Math.max(MARCH.stepMinM, t * MARCH.stepShare));
    if (under(next)) {
      let [above, below] = [t, next];
      for (let i = 0; i < MARCH.refine; i++) {
        const middle = (above + below) / 2;
        if (under(middle)) below = middle;
        else above = middle;
      }
      return hitAt(pointAt(below), below, heightAt);
    }
    t = next;
  }
  return null;
}

/** The hit's point set on the surface there, and whether the surface is water. */
function hitAt(point: Vec3, distance: number, heightAt: HeightAt): SurfaceHit {
  const ground = heightAt(point[0], point[1]);
  const water = !(Number.isFinite(ground) && ground > 0);
  return { point: [point[0], point[1], surfaceAt(heightAt, point[0], point[1])], distance, water };
}

/** What a click chose: the mark under it first, else the land or the sea the ray met, else nothing. */
export function classifyPick(hit: SurfaceHit | null, markId: string | null): Pick {
  if (markId !== null) return { kind: 'mark', id: markId };
  if (!hit) return { kind: 'none' };
  return hit.water ? { kind: 'sea', point: hit.point } : { kind: 'land', point: hit.point };
}

/** A click at a pixel of the picture: the marks laid this frame first, then a ray from the frame's eye. */
export function pickAt(
  pose: CameraPose,
  viewport: Viewport,
  x: number,
  y: number,
  heightAt: HeightAt,
  marks: readonly PlacedMark[] = [],
  reachM?: number,
): Pick {
  const markId = pickMark(marks, x, y);
  const hit = markId === null ? surfaceHit(pose.eye, rayThrough(pose, viewport, x, y), heightAt, reachM) : null;
  return classifyPick(hit, markId);
}
