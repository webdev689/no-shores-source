// Where the story's storm is: out past Saltmere's harbour, far enough that no coast shows through the storm, in open
// water deep enough for the wreck to sink in and for every ship of the ambush to float; and the Brig's heading across
// the swell, so she rolls and pitches both.
import type { Landmass } from '../landmass.ts';
import { islandFrame } from './introShots.ts';
import type { Places } from './story.ts';

/** How far out the storm may be, metres, nearest first; how deep the sea must be under it; and how far round it, the
 *  whole disc the story's ships sail in, from the ram's wreck to the ambush's farthest captain. */
const OUT_M = [24_000, 30_000, 38_000];
const DEEP_M = 40;
export const CLEAR_M = 3000;
/** How close together the disc is sampled, metres: a shoal narrower than this can lie between soundings. */
const SAMPLE_M = 150;
/** Turned a little at a time either way from straight out until the water is open. */
const TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, Math.PI];

/** How many points of the disc round a point lie too shallow: ground within `CLEAR_M` that rises above `DEEP_M` under
 *  the water. Ground the landmass does not know (off its map) is the open sea. */
function shallows(heightAt: (x: number, y: number) => number, x: number, y: number): number {
  let shallow = 0;
  for (let reach = 0; reach <= CLEAR_M; reach += SAMPLE_M) {
    const around = Math.max(1, Math.ceil((2 * Math.PI * reach) / SAMPLE_M));
    for (let step = 0; step < around; step++) {
      const bearing = (step / around) * Math.PI * 2;
      const ground = heightAt(x + Math.sin(bearing) * reach, y - Math.cos(bearing) * reach);
      if (Number.isFinite(ground) && ground > -DEEP_M) shallow++;
    }
  }
  return shallow;
}

/** The storm's place off a landmass's town, its swell running toward `swellBearing`: the nearest open sea out past
 *  the harbour, or, where none is open, the place with the fewest shallows. */
export function stormPlaces(landmass: Landmass, swellBearing: number): Places {
  const frame = islandFrame(landmass);
  const [x, y] = frame.anchorage;
  let best: { storm: [number, number]; shallow: number } | null = null;
  search: for (const out of OUT_M) {
    for (const turn of TURNS) {
      const bearing = frame.out + turn;
      const storm: [number, number] = [x + Math.sin(bearing) * out, y - Math.cos(bearing) * out];
      const shallow = shallows(landmass.heightAt, storm[0], storm[1]);
      if (!best || shallow < best.shallow) best = { storm, shallow };
      if (shallow === 0) break search;
    }
  }
  const storm = best?.storm ?? [x, y];
  const home = Math.atan2(frame.town[0] - storm[0], storm[1] - frame.town[1]);
  return { storm, heading: swellBearing + 1.2, home };
}
