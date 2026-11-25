// Where the eye stands while a broadside is laid, for each hull, as Black Flag's does: aboard, over its deck near its
// battery, its rail and guns along the foot of the view, where no canvas comes within a metre whatever the wind,
// as high as that allows, and placed so the water at its guns' nearest lay shows over its rail. A hull whose rig
// leaves no such gap keeps an eye out past its side, clear of its hull and every sail's swing.
import { type Deck, HULL_DECKS, cellHeight } from '../ships/deck.ts';
import { hullBox, hullMouths, hullPaint, hullSails, hullWaterline } from '../ships/hulls.ts';
import { type SailCorners, SailRig } from '../ships/sails.ts';
import { abeamOut, BELLY_M, type Swing, swingOf } from './shipClear.ts';

type Point = readonly [number, number, number];

/** The aim's places in its ship's frame on its starboard side (port mirrors them), metres along its keel from its
 *  middle, out from its centreline and up from its waterline: the eye, and its ports' middle; whether the eye stands
 *  over its deck; and the nearest its guns lay on the water, out from its middle. */
export interface AimStation {
  readonly eye: Point;
  readonly ports: Point;
  readonly onDeck: boolean;
  readonly nearestM: number;
}

/** How far past the widest of its hull and its guns' mouths an eye out past its side stands, metres. */
const HULL_CLEAR_M = 1.5;
/** How far over its gun line an eye out past its side stands: DFO's eye over the Sloop's, metres. */
const EYE_OVER_GUNS_M = 3.1;
/** How far an eye keeps from the farthest a sail can swing, metres. */
const SWING_CLEAR_M = 1;
/** The farthest out an eye past its side goes for a rig that swings wide, metres. */
const OUT_MOST_M = 12;
/** The rules' guns depress to this, radians: the swivel's lowest elevation. */
export const LOWEST_ELEVATION = (10 * Math.PI) / 180;

/** How far an eye over the deck keeps from its masts, and their half thickness, metres. */
const RIG_CLEAR_M = 0.8;
const MAST_M = 0.4;
/** An eye over the deck stands this high over it at best (a sailor's eye, under a square course's foot), this high
 *  at least and at most, and this far over its rail. */
const BEST_OVER_DECK_M = 2;
const LEAST_OVER_DECK_M = 1.7;
const MOST_OVER_DECK_M = 5;
const OVER_RAIL_M = 0.4;
/** The share of its half beam out toward the side laid an eye over the deck stands at best, so its rail stands at the
 *  foot of the view and its masts' canvas, centred on its keel, keeps out of it. */
const BEST_OUT_SHARE = 0.75;
/** The way in to the eye passes no nearer than this to any canvas, metres: it never goes through a sail. */
const WAY_CLEAR_M = 0.3;
/** Its rail's top stands at least this far under the look to the water at its guns' nearest lay, radians, so the
 *  rail stands at the foot of the view. */
const RAIL_UNDER_SIGHT = (10 * Math.PI) / 180;
/** The rail a spot sees over is the highest its deck stands within this far along its keel, metres: the deck's grid
 *  holds where a body stands, so a bulwark shows in it only where its cap is walked, by its posts. */
const RAIL_ROWS_M = 2.5;
/** How finely the deck is searched, metres, and how far past its battery's ends. */
const SEARCH_STEP_M = 0.25;
const PAST_BATTERY_M = 4;

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

/** Whether a point (along, out, up) stands within `RIG_CLEAR_M` of a mast its rig sets on, as thick as `MAST_M` each
 *  side of its line. */
const byMast = (swings: readonly Swing[], [along, out]: Point): boolean =>
  swings.some(
    (swing) =>
      swing.kind !== 'stay' &&
      Math.abs(along - swing.pivot) < MAST_M + RIG_CLEAR_M &&
      Math.abs(out) < MAST_M + RIG_CLEAR_M,
  );

const canvases = new Map<number, (point: Point, within?: number) => boolean>();
/** The 27 cells round a point's own, as offsets of a cell each way, its own among them. */
const NEIGHBOURS: readonly Point[] = [-1, 0, 1].flatMap((along) =>
  [-1, 0, 1].flatMap((out) => [-1, 0, 1].map((up): Point => [along, out, up])),
);

/** Whether any of a hull's canvas comes within `SWING_CLEAR_M` of a point in its frame, or of its mirror on the other
 *  side, in any wind from ahead round to astern on either side, its sails set and trimmed to it as its rig trims them:
 *  the canvas itself, which a square yard braced round its mast sweeps as a wedge, not the box its swing spans. */
export function byCanvas(hull: number): (point: Point, within?: number) => boolean {
  const kept = canvases.get(hull);
  if (kept) return kept;
  const cells = new Map<string, number[]>();
  const cellOf = (point: Point) => point.map((value) => Math.floor(value / SWING_CLEAR_M)).join(',');
  for (let offDeg = -180; offDeg <= 180; offDeg += 10) {
    const rig = new SailRig(hullSails(hull));
    for (let step = 0; step < 60; step++) rig.step(0.1, { offDeg, set: true }, step * 0.1);
    for (const points of rig.canvas())
      for (let index = 0; index + 2 < points.length; index += 3) {
        const point: Point = [points[index] ?? 0, points[index + 1] ?? 0, points[index + 2] ?? 0];
        const cell = cells.get(cellOf(point));
        if (cell) cell.push(...point);
        else cells.set(cellOf(point), [...point]);
      }
  }
  const near = (point: Point, within: number): boolean =>
    NEIGHBOURS.some((offset) => {
      const cell = cells.get(
        cellOf([
          point[0] + offset[0] * SWING_CLEAR_M,
          point[1] + offset[1] * SWING_CLEAR_M,
          point[2] + offset[2] * SWING_CLEAR_M,
        ]),
      );
      if (!cell) return false;
      for (let index = 0; index + 2 < cell.length; index += 3) {
        const gap = Math.hypot(cell[index] - point[0], cell[index + 1] - point[1], cell[index + 2] - point[2]);
        if (gap <= within) return true;
      }
      return false;
    });
  const either = (point: Point, within = SWING_CLEAR_M) =>
    near(point, within) || near([point[0], -point[1], point[2]], within);
  canvases.set(hull, either);
  return either;
}

/** The highest `deck` stands within `RAIL_ROWS_M` of `along`: the rail an eye there sees over. */
export function railAt(deck: Deck, along: number): number {
  let rail = -Infinity;
  for (let row = along - RAIL_ROWS_M; row <= along + RAIL_ROWS_M; row += deck.cell)
    for (let column = 0; column < deck.columns; column++)
      rail = Math.max(rail, cellHeight(deck, deck.west + (column + 0.5) * deck.cell, -row) ?? -Infinity);
  return rail;
}

/** The eye over the deck that scores best, or null where no spot near the battery is clear of the rig: a sailor's
 *  height over the deck, by its battery's middle, out toward the side laid, and with the water at `nearestM` out
 *  showing over its rail. Its spots are tried best first, as the rig is felt at each of them. */
function deckEye(hull: number, battery: readonly number[], nearestM: number): Point | null {
  const deck = HULL_DECKS[hull];
  if (!deck) return null;
  const swings = hullSails(hull).map(swingOf);
  const [first, last] = [Math.min(...battery) - PAST_BATTERY_M, Math.max(...battery) + PAST_BATTERY_M];
  const middle = mean(battery);
  const halfBeam = Math.abs(hullBox(hull)[1][1]);
  const spots: { readonly eye: Point; readonly score: number }[] = [];
  for (let along = first; along <= last; along += SEARCH_STEP_M) {
    const rail = railAt(deck, along);
    // In whole steps, so its centreline is out 0 exactly and not a hair to port.
    for (let step = -10; step <= 15; step++) {
      const share = step / 20;
      const out = share * halfBeam;
      const under = cellHeight(deck, out, -along);
      if (under === null) continue;
      for (let over = LEAST_OVER_DECK_M; over <= MOST_OVER_DECK_M; over += 0.1) {
        const up = under + over;
        // The look down to the nearest lay, and down to the rail's top at its side: the rail well under it.
        const [toLay, toRail] = [Math.atan2(up, nearestM - out), Math.atan2(up - rail, halfBeam - out)];
        if (up < rail + OVER_RAIL_M || toRail < toLay + RAIL_UNDER_SIGHT) continue;
        const score =
          Math.abs(over - BEST_OVER_DECK_M) + 0.35 * Math.abs(along - middle) + Math.abs(BEST_OUT_SHARE - share);
        spots.push({ eye: [along, out, up], score });
      }
    }
  }
  spots.sort((one, other) => one.score - other.score);
  const canvas = byCanvas(hull);
  // The eye clear of the rig, and the way in to it from abeam (`wayAboard`), square over its rail, through no sail.
  const clear = ([along, out, up]: Point) => {
    if (byMast(swings, [along, out, up]) || canvas([along, out, up])) return false;
    for (let across = out; across <= abeamOut(hull, [along, out, up]); across += SEARCH_STEP_M)
      if (canvas([along, across, up], WAY_CLEAR_M)) return false;
    return true;
  };
  return spots.find(({ eye }) => clear(eye))?.eye ?? null;
}

const stations = new Map<number, AimStation>();
const batteries = new Map<
  number,
  { readonly ports: Point; readonly tier: readonly number[]; readonly nearestM: number }
>();

/** A hull's battery as the aim reads it, without its eye: its upper tier's ports' middle, each port's place along its
 *  keel, and the nearest its guns lay on the water, out from its middle. */
export function batteryOf(hull: number) {
  const kept = batteries.get(hull);
  if (kept) return kept;
  const mouths = hullMouths(hull);
  const highest = Math.max(...mouths.map((mouth) => mouth[2]));
  // The battery's upper tier, as its stripe is fitted; a lower tier stands a deck's height under it.
  const tier = mouths.filter((mouth) => mouth[2] > highest - 1);
  const along = mean(tier.map((mouth) => mouth[0]));
  const paint = hullPaint(hull);
  const gunLine = paint.atM + paint.rise * along;
  const mouthsOut = Math.max(...tier.map((mouth) => Math.abs(mouth[1])));
  const nearestM = mouthsOut + gunLine / Math.tan(LOWEST_ELEVATION);
  const battery = { ports: [along, mouthsOut, gunLine] as Point, tier: tier.map((mouth) => mouth[0]), nearestM };
  batteries.set(hull, battery);
  return battery;
}

/** The aim's station for a hull, by its number (0 the Sloop to 3 the Frigate), on its starboard side. */
export function aimStation(hull: number): AimStation {
  const kept = stations.get(hull);
  if (kept) return kept;
  const { ports, tier, nearestM } = batteryOf(hull);
  const [along, mouthsOut, gunLine] = ports;
  const onDeck = deckEye(hull, tier, nearestM);
  if (onDeck) {
    const station: AimStation = { eye: onDeck, ports, onDeck: true, nearestM };
    stations.set(hull, station);
    return station;
  }
  const [low, high] = hullBox(hull);
  const side = Math.max(Math.abs(low[1]), Math.abs(high[1]), mouthsOut, hullWaterline(hull).beamM / 2);
  const up = gunLine + EYE_OVER_GUNS_M;
  const swung = hullSails(hull).map((sail) => clearOfSail(sail, along, up));
  const out = Math.min(OUT_MOST_M, Math.max(side + HULL_CLEAR_M, ...swung));
  const station: AimStation = { eye: [along, out, up], ports, onDeck: false, nearestM };
  stations.set(hull, station);
  return station;
}
