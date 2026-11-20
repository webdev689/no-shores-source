import type { Swell } from '../rules/landRules.ts';

/** A swell the page draws round its view: the weather's waves at the view's middle (`SeaWeather`), and how high the
 *  swell stands at a point against there, so the lee of land and a roadstead lie calmer. */
export interface ShelteredSwell extends Swell {
  readonly shelterAt?: (x: number, y: number) => number;
}

/** The share of the swell left in water `depth` metres deep, as crates/land/src/sea.rs reaches it. */
export function reach(swell: Swell, depth: number): number {
  const fraction = Math.min(1, Math.max(0, (depth - swell.goneDepthM) / (swell.fullDepthM - swell.goneDepthM)));
  return fraction * fraction * (3 - 2 * fraction);
}

/** Where the water at rest at (x, y) is carried at `time` in the sea `depth` metres deep: east, south and up, the
 *  height as a hull of time constant `lag` seconds feels it (crates/land/src/sea.rs `lagged_displacement`: each wave
 *  answered as a first-order lag answers a sine). */
export function displacement(
  swell: Swell,
  x: number,
  y: number,
  time: number,
  depth: number,
  lag = 0,
): [number, number, number] {
  const share = reach(swell, depth);
  const out: [number, number, number] = [0, 0, 0];
  if (share <= 0) return out;
  for (const wave of swell.waves) {
    const phase = wave.number * (wave.direction[0] * x + wave.direction[1] * y) - wave.frequency * time + wave.phase;
    const [sine, cosine] = [Math.sin(phase), Math.cos(phase)];
    const slowness = wave.frequency * lag;
    out[0] += wave.shift * wave.direction[0] * cosine;
    out[1] += wave.shift * wave.direction[1] * cosine;
    out[2] += (wave.amplitude * (sine + slowness * cosine)) / (1 + slowness * slowness);
  }
  return [out[0] * share, out[1] * share, out[2] * share];
}

/**
 * The sea's surface over (x, y) from still water: the water at rest whose carried place is (x, y), found in four
 * steps as the server finds it, sheltered as the swell says, and felt through a hull's `lag` seconds of inertia. The
 * browser's sine is not the server's, so this is for drawing, never for a rule.
 */
export function swellHeight(swell: ShelteredSwell, x: number, y: number, time: number, depth: number, lag = 0): number {
  const sheltered = swell.shelterAt?.(x, y) ?? 1;
  // The carry is the view's middle's at most, as the water's drawing has it.
  const carry = Math.min(sheltered, 1);
  let [restX, restY] = [x, y];
  for (let step = 0; step < 4; step++) {
    const [east, south] = displacement(swell, restX, restY, time, depth);
    [restX, restY] = [x - east * carry, y - south * carry];
  }
  return displacement(swell, restX, restY, time, depth, lag)[2] * sheltered;
}
