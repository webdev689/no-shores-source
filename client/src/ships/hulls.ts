// The hulls the browser draws, by the number the wire carries for each ship, and what each one's manifest entry
// says of her: her waterline, her sails, the height of her masthead and the line of her upper gunports. Which hull a
// rank of ship sails is the naval crate's to say; the browser only draws the hull it is told.
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import type { SailCorners } from './sails.ts';
import { BAR_OVER_M } from './shipBars.ts';
import type { Waterline } from './shipMesh.ts';

/** The hulls by their wire number: 0 the Sloop, 1 the Schooner, 2 the Brig, 3 the Frigate. */
export const HULL_NAMES = ['sloop', 'schooner', 'brig', 'frigate'] as const;
export type HullName = (typeof HULL_NAMES)[number];
export const SLOOP_HULL = 0;

type Point = readonly [number, number, number];
interface Entry {
  readonly waterline: { readonly length_m: number; readonly beam_m: number; readonly draught_m: number };
  readonly sails: readonly SailCorners[];
  readonly guns: readonly { readonly mouth_m: Point }[];
}
// The manifest is the export's own, in the repository: its entries are as `Entry` says.
const ENTRIES = ships.ships as unknown as Readonly<Record<HullName, Entry>>;

/** A hull's name by her wire number; a number the browser has no model for is drawn as the Sloop. */
export function hullName(hull: number): HullName {
  return HULL_NAMES[hull] ?? 'sloop';
}

/** The hull a captain's ship sails, by the room's word on her: at sea her `Pirate`'s `hull` and in a fleet her
 *  vessel's; in a fight's view her `hull_kind`, since `hull` there is her hull points (a fight's vessel is told by its
 *  `max_hull`). The Sloop where the room names none. */
export function hullOfCaptain(ship: {
  readonly hull?: number;
  readonly hull_kind?: number;
  readonly max_hull?: number;
}): number {
  return (ship.max_hull === undefined ? ship.hull : ship.hull_kind) ?? SLOOP_HULL;
}

/** Her waterline as her export measured it. */
export function hullWaterline(hull: number): Waterline {
  const { length_m, beam_m, draught_m } = ENTRIES[hullName(hull)].waterline;
  return { lengthM: length_m, beamM: beam_m, draughtM: draught_m };
}

/** Her sails' corners as her export measured them. */
export function hullSails(hull: number): SailCorners[] {
  return [...ENTRIES[hullName(hull)].sails];
}

/** The top of her highest sail over her waterline, metres. */
function sailTop(hull: number): number {
  const points = hullSails(hull).flatMap((sail): Point[] =>
    sail.kind === 'gaff'
      ? [sail.throat, sail.peak]
      : sail.kind === 'stay'
        ? [sail.head]
        : [sail.head_port, sail.head_starboard],
  );
  return Math.max(...points.map((point) => point[2]));
}

/** How far over her waterline a hull's plate stands, metres: as far over her highest sail as the
 *  Sloop's is over hers. */
export function plateOverM(hull: number): number {
  return BAR_OVER_M + sailTop(hull) - sailTop(SLOOP_HULL);
}

/** Her stripe's line in her frame: its height over her waterline at her middle and its rise a metre toward her bow,
 *  metres. */
export interface HullPaint {
  readonly atM: number;
  readonly rise: number;
}

/** Her stripe, fitted through the mouths of her highest tier of guns, so it follows her sheer. */
export function hullPaint(hull: number): HullPaint {
  const mouths = ENTRIES[hullName(hull)].guns.map((gun) => gun.mouth_m);
  const highest = Math.max(...mouths.map((mouth) => mouth[2]));
  // A lower tier of guns stands a deck's height under the upper one; the upper tier's own mouths keep within a metre.
  const tier = mouths.filter((mouth) => mouth[2] > highest - 1);
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const [meanX, meanZ] = [mean(tier.map((mouth) => mouth[0])), mean(tier.map((mouth) => mouth[2]))];
  const spread = tier.reduce((sum, mouth) => sum + (mouth[0] - meanX) ** 2, 0);
  const rise = spread > 0 ? tier.reduce((sum, mouth) => sum + (mouth[0] - meanX) * (mouth[2] - meanZ), 0) / spread : 0;
  return { atM: meanZ - rise * meanX, rise };
}
