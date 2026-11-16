import type { Swell } from '../rules/landRules.ts';

/** The share of the swell left in water `depth` metres deep, as crates/land/src/sea.rs reaches it. */
export function reach(swell: Swell, depth: number): number {
  const fraction = Math.min(1, Math.max(0, (depth - swell.goneDepthM) / (swell.fullDepthM - swell.goneDepthM)));
  return fraction * fraction * (3 - 2 * fraction);
}

/** Where the water at rest at (x, y) is carried at `time` in the sea `depth` metres deep: east, south and up. */
export function displacement(
  swell: Swell,
  x: number,
  y: number,
  time: number,
  depth: number,
): [number, number, number] {
  const share = reach(swell, depth);
  const out: [number, number, number] = [0, 0, 0];
  if (share <= 0) return out;
  for (const wave of swell.waves) {
    const phase = wave.number * (wave.direction[0] * x + wave.direction[1] * y) - wave.frequency * time + wave.phase;
    const [sine, cosine] = [Math.sin(phase), Math.cos(phase)];
    out[0] += wave.shift * wave.direction[0] * cosine;
    out[1] += wave.shift * wave.direction[1] * cosine;
    out[2] += wave.amplitude * sine;
  }
  return [out[0] * share, out[1] * share, out[2] * share];
}

/**
 * The sea's surface over (x, y) from still water: the water at rest whose carried place is (x, y), found in four
 * steps as the server finds it. The browser's sine is not the server's, so this is for drawing, never for a rule.
 */
export function swellHeight(swell: Swell, x: number, y: number, time: number, depth: number): number {
  let [restX, restY] = [x, y];
  for (let step = 0; step < 4; step++) {
    const [east, south] = displacement(swell, restX, restY, time, depth);
    [restX, restY] = [x - east, y - south];
  }
  return displacement(swell, restX, restY, time, depth)[2];
}
