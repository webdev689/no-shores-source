// Where the eye stands while a broadside is laid, for each hull: abreast the middle of its battery, out past its
// side and past where any of its sails can swing, so neither its hull nor its canvas comes to the eye whatever the
// wind does to them, and over its gun line as high as DFO's eye stood over the Sloop's.
import { hullBox, hullMouths, hullPaint, hullSails, hullWaterline } from '../ships/hulls.ts';
import type { SailCorners } from '../ships/sails.ts';
import { BELLY_M, swingOf } from './shipClear.ts';

type Point = readonly [number, number, number];

/** The aim's places in its ship's frame on its starboard side (port mirrors them), metres along its keel from its
 *  middle, out from its centreline and up from its waterline: the eye, and its ports' middle, which the eye goes
 *  out from; and the nearest its guns lay on the water, out from its middle. */
export interface AimStation {
  readonly eye: Point;
  readonly ports: Point;
  readonly nearestM: number;
}

/** How far past the widest of its hull and its guns' mouths the eye stands, metres. */
const HULL_CLEAR_M = 1.5;
/** How far over its gun line the eye stands: DFO's eye over the Sloop's, metres. */
const EYE_OVER_GUNS_M = 3.1;
/** How far the eye keeps from the farthest a sail can swing, metres: a square sail's belly and a gaff's are inside
 *  it, their corners never bellying. */
const SWING_CLEAR_M = 1;
/** The farthest out the eye goes for a rig that swings wide, metres. */
const OUT_MOST_M = 12;
/** The rules' guns depress to this, radians: the swivel's lowest elevation. */
const LOWEST_ELEVATION = (10 * Math.PI) / 180;

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

/** How far out from its centreline the eye must stand at `along` and `up` to keep clear of `sail` however it swings
 *  (`swingOf`); zero where the sail never comes. */
export function clearOfSail(sail: SailCorners, along: number, up: number): number {
  const swing = swingOf(sail);
  if (up < swing.low - SWING_CLEAR_M || up > swing.high + SWING_CLEAR_M) return 0;
  if (swing.kind === 'stay') return swing.reach + SWING_CLEAR_M;
  // A gaff swings aft of its luff alone, its belly forward of it: forward of that, the eye is clear of it.
  if (swing.kind === 'gaff' && along >= swing.pivot + BELLY_M) return 0;
  const reach = swing.reach + SWING_CLEAR_M;
  const ahead = swing.kind === 'gaff' ? Math.min(0, along - swing.pivot) : along - swing.pivot;
  return Math.sqrt(Math.max(0, reach * reach - ahead * ahead));
}

const stations = new Map<number, AimStation>();

/** The aim's station for a hull, by its number (0 the Sloop to 3 the Frigate), on its starboard side. */
export function aimStation(hull: number): AimStation {
  const kept = stations.get(hull);
  if (kept) return kept;
  const mouths = hullMouths(hull);
  const highest = Math.max(...mouths.map((mouth) => mouth[2]));
  // The battery's upper tier, as its stripe is fitted; a lower tier stands a deck's height under it.
  const tier = mouths.filter((mouth) => mouth[2] > highest - 1);
  const along = mean(tier.map((mouth) => mouth[0]));
  const paint = hullPaint(hull);
  const gunLine = paint.atM + paint.rise * along;
  const mouthsOut = Math.max(...tier.map((mouth) => Math.abs(mouth[1])));
  const [low, high] = hullBox(hull);
  const side = Math.max(Math.abs(low[1]), Math.abs(high[1]), mouthsOut, hullWaterline(hull).beamM / 2);
  const up = gunLine + EYE_OVER_GUNS_M;
  const swung = hullSails(hull).map((sail) => clearOfSail(sail, along, up));
  const out = Math.min(OUT_MOST_M, Math.max(side + HULL_CLEAR_M, ...swung));
  const station: AimStation = {
    eye: [along, out, up],
    ports: [along, mouthsOut, gunLine],
    nearestM: mouthsOut + gunLine / Math.tan(LOWEST_ELEVATION),
  };
  stations.set(hull, station);
  return station;
}
