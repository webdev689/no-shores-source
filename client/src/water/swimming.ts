/** How a body on foot meets water: walking on dry ground, wading, swimming at the surface, or diving under it. */
export type Stroke = 'walk' | 'wade' | 'swim' | 'dive';

/** A body: where it stands, its eyes' height (metres) and how it is moving. */
export interface Body {
  readonly x: number;
  readonly y: number;
  readonly eye: number;
  readonly stroke: Stroke;
}

/** What one step asks: metres to move east and south this step at walking pace, and whether to dive or rise. */
export interface Effort {
  readonly east: number;
  readonly south: number;
  readonly dive: boolean;
  readonly rise: boolean;
}

/** The water and ground at a point: the bed's height and the water's surface there now (null where it is dry). */
export interface Footing {
  readonly bed: number;
  readonly surface: number | null;
}

/** A walker's eyes above their feet, metres. */
export const EYE_M = 1.7;
/** Water this deep slows a walker to a wade; this deep, they swim. */
export const WADE_DEPTH_M = 0.5;
export const SWIM_DEPTH_M = 1.4;
/** A swimmer's eyes ride this far above the surface. */
export const FLOAT_M = 0.15;
/** Pace in water as a share of walking pace. */
const WADE_PACE = 0.5;
const SWIM_PACE = 0.35;
/** Metres a second: diving down, swimming up, and drifting up when neither is held. */
const DIVE_MS = 1.6;
const RISE_MS = 2.2;
const BUOYANCY_MS = 0.7;
/** How fast a floating swimmer's eyes follow the waves, a share a second, and how near the bed a diver stops. */
const FOLLOW = 8;
const BED_CLEARANCE_M = 0.5;

/**
 * One step of a body for `seconds`: it moves at the pace its water allows, then finds its height. On ground and in
 * shallows its eyes stand above the bed; in deep water they float on the moving surface; holding dive takes them
 * under, rise brings them up faster, and left alone they drift back up.
 */
export function bodyStep(
  body: Body,
  effort: Effort,
  footingAt: (x: number, y: number) => Footing,
  seconds: number,
): Body {
  const pace = body.stroke === 'walk' ? 1 : body.stroke === 'wade' ? WADE_PACE : SWIM_PACE;
  const [x, y] = [body.x + effort.east * pace, body.y + effort.south * pace];
  const { bed, surface } = footingAt(x, y);
  const depth = surface === null ? 0 : surface - bed;
  if (surface === null || depth < SWIM_DEPTH_M) {
    return { x, y, eye: bed + EYE_M, stroke: depth < WADE_DEPTH_M ? 'walk' : 'wade' };
  }
  const floating = surface + FLOAT_M;
  const lowest = bed + BED_CLEARANCE_M;
  let eye: number;
  if (effort.dive) eye = Math.max(lowest, Math.min(body.eye, floating) - DIVE_MS * seconds);
  else if (body.stroke === 'dive') eye = Math.min(floating, body.eye + (effort.rise ? RISE_MS : BUOYANCY_MS) * seconds);
  else eye = ease(body.eye, floating, seconds);
  return { x, y, eye, stroke: eye < surface - 0.2 ? 'dive' : 'swim' };
}

/** Moves `from` toward `to` by FOLLOW's share a second. */
function ease(from: number, to: number, seconds: number): number {
  return from + (to - from) * Math.min(1, FOLLOW * seconds);
}
