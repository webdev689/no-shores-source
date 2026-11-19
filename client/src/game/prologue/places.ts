// Where the story's storm is: out past Saltmere's harbour, far enough that no coast shows through the storm, in open
// water deep enough for the wreck to sink in; and the Brig's heading across the swell, so she rolls and pitches both.
import type { Landmass } from '../landmass.ts';
import { islandFrame } from './introShots.ts';
import type { Places } from './story.ts';

/** How far out the storm is, metres, and how deep the sea must be under it and round it. */
const OUT_M = 24_000;
const DEEP_M = 40;
const CLEAR_M = 3000;
/** Turned a little at a time either way from straight out until the water is open. */
const TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, Math.PI];

/** Whether the sea round a point is open: no ground within `CLEAR_M` that rises above `DEEP_M` under the water. */
function open(heightAt: (x: number, y: number) => number, x: number, y: number): boolean {
  for (let ring = 0; ring <= 8; ring++) {
    const bearing = (ring / 8) * Math.PI * 2;
    const reach = ring === 8 ? 0 : CLEAR_M;
    const ground = heightAt(x + Math.sin(bearing) * reach, y - Math.cos(bearing) * reach);
    if (Number.isFinite(ground) && ground > -DEEP_M) return false;
  }
  return true;
}

/** The storm's place off a landmass's town, its swell running toward `swellBearing`. */
export function stormPlaces(landmass: Landmass, swellBearing: number): Places {
  const frame = islandFrame(landmass);
  const [x, y] = frame.anchorage;
  for (const turn of TURNS) {
    const out = frame.out + turn;
    const storm: [number, number] = [x + Math.sin(out) * OUT_M, y - Math.cos(out) * OUT_M];
    if (!open(landmass.heightAt, storm[0], storm[1])) continue;
    const home = Math.atan2(frame.town[0] - storm[0], storm[1] - frame.town[1]);
    return { storm, heading: swellBearing + 1.2, home };
  }
  const storm: [number, number] = [x + Math.sin(frame.out) * OUT_M, y - Math.cos(frame.out) * OUT_M];
  return { storm, heading: swellBearing + 1.2, home: frame.out + Math.PI };
}
