// How much of a city is drawn how: each cell's buildings whole near the eye, as their masses further out, and as one
// hull a building past that, with a band at each change where the two dither into each other so nothing pops. Every
// test is on the eye's distance to the cell's middle at its level, the same on the CPU and in the shaders.

/** Within this the cells are whole (forged models and props); the band below it dithers them into masses. */
export const NEAR_M = 700;
export const NEAR_BAND_M = 140;
/** Within this the cells are masses; past it each building is one hull. */
export const FAR_M = 2600;
export const FAR_BAND_M = 400;

/** A ruin's middle-distance crystal: how far from the eye a chunk's is drawn, metres (past the near cells, to where a
 *  heavily overtaken building's crystal is a few pixels; crystalInstances.ts). */
export const MIDDLE_M = 1200;
/** The band short of `MIDDLE_M` over which it fades out, dithered as the buildings' tiers are, so none pops. */
export const MIDDLE_BAND_M = 300;

/** How far a middle-distance formation `distance` metres from the eye has faded out: 0 whole, 1 gone. The city's
 *  shaders fade it alike (cityShaders.ts `crystal_fade`). */
export const middleFade = (distance: number): number =>
  Math.min(1, Math.max(0, (distance - (MIDDLE_M - MIDDLE_BAND_M)) / MIDDLE_BAND_M));

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** How far a cell has turned from whole to masses (0 whole, 1 masses), and from masses to hulls. */
export function tierFades(distance: number): { toMasses: number; toHulls: number } {
  return {
    toMasses: clamp01((distance - (NEAR_M - NEAR_BAND_M)) / NEAR_BAND_M),
    toHulls: clamp01((distance - (FAR_M - FAR_BAND_M)) / FAR_BAND_M),
  };
}

export type Tier = 'whole' | 'masses' | 'hulls';

/** The tiers a cell at this distance is drawn in: one, or two inside a band. */
export function tiersAt(distance: number): Tier[] {
  const { toMasses, toHulls } = tierFades(distance);
  const tiers: Tier[] = [];
  if (toMasses < 1) tiers.push('whole');
  if (toMasses > 0 && toHulls < 1) tiers.push('masses');
  if (toHulls > 0) tiers.push('hulls');
  return tiers;
}

/** Whether a pixel whose dither threshold (0 to 1) is `threshold` keeps a tier's fragment: of two tiers in a band
 *  exactly one does, so the pair always covers the pixel once. */
export function keeps(tier: Tier, distance: number, threshold: number): boolean {
  const { toMasses, toHulls } = tierFades(distance);
  if (tier === 'whole') return threshold >= toMasses;
  if (tier === 'masses') return threshold < toMasses && threshold >= toHulls;
  return threshold < toHulls;
}

/** The planes a view sees between, each [a, b, c, d] with a x + b y + c z + d >= 0 inside, for points measured from
 *  the eye, read from the column-major view-projection: left, right, bottom, top and in front. */
export function viewPlanes(fromEye: Float32Array): number[][] {
  const row = (index: number): number[] => [
    fromEye[index],
    fromEye[4 + index],
    fromEye[8 + index],
    fromEye[12 + index],
  ];
  const [across, upward, , ahead] = [row(0), row(1), row(2), row(3)];
  const plus = (a: number[], b: number[], sign: number): number[] => a.map((value, k) => value + sign * b[k]);
  return [plus(ahead, across, 1), plus(ahead, across, -1), plus(ahead, upward, 1), plus(ahead, upward, -1), ahead];
}

/** Whether a box (low and high corners, measured from the eye) reaches inside every plane. */
export function boxSeen(planes: readonly number[][], low: readonly number[], high: readonly number[]): boolean {
  for (const plane of planes) {
    const x = plane[0] >= 0 ? high[0] : low[0],
      y = plane[1] >= 0 ? high[1] : low[1],
      z = plane[2] >= 0 ? high[2] : low[2];
    if (plane[0] * x + plane[1] * y + plane[2] * z + plane[3] < 0) return false;
  }
  return true;
}

/** The nearest and farthest a box (low and high corners, measured from the eye) reaches. */
export function boxReach(low: readonly number[], high: readonly number[]): { nearest: number; farthest: number } {
  let nearest = 0,
    farthest = 0;
  for (let axis = 0; axis < 3; axis++) {
    const gap = Math.max(low[axis], 0, -high[axis]);
    nearest += gap * gap;
    const most = Math.max(Math.abs(low[axis]), Math.abs(high[axis]));
    farthest += most * most;
  }
  return { nearest: Math.sqrt(nearest), farthest: Math.sqrt(farthest) };
}

/** The tiers a group of cells may need, from how near and far its cells' middles come. */
export function tiersReached(nearest: number, farthest: number): Set<Tier> {
  const reached = new Set<Tier>();
  if (nearest < NEAR_M) reached.add('whole');
  if (nearest < FAR_M && farthest > NEAR_M - NEAR_BAND_M) reached.add('masses');
  if (farthest > FAR_M - FAR_BAND_M) reached.add('hulls');
  return reached;
}
