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
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const share = reach(swell, depth);
  if (share <= 0) return out.fill(0);
  let [east, south, up] = [0, 0, 0];
  for (const wave of swell.waves) {
    const phase = wave.number * (wave.direction[0] * x + wave.direction[1] * y) - wave.frequency * time + wave.phase;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const slowness = wave.frequency * lag;
    east += wave.shift * wave.direction[0] * cosine;
    south += wave.shift * wave.direction[1] * cosine;
    up += (wave.amplitude * (sine + slowness * cosine)) / (1 + slowness * slowness);
  }
  out[0] = east * share;
  out[1] = south * share;
  out[2] = up * share;
  return out;
}

/** The carry `swellHeight` asks for at each of its steps, laid afresh over the last's. */
const CARRIED: [number, number, number] = [0, 0, 0];

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
    displacement(swell, restX, restY, time, depth, 0, CARRIED);
    restX = x - CARRIED[0] * carry;
    restY = y - CARRIED[1] * carry;
  }
  return displacement(swell, restX, restY, time, depth, lag, CARRIED)[2] * sheltered;
}
