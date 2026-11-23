// Where the eye stands while a broadside is laid, for each hull, as Black Flag's does: aboard, over its deck near its
// battery, its rail and guns along the foot of the view, in a gap of its rig no sail comes into whatever the wind,
// as high as that gap allows, and placed so the water at its guns' nearest lay shows over its rail. A hull whose rig
// leaves no such gap keeps an eye out past its side, clear of its hull and every sail's swing.
import { type Deck, HULL_DECKS, cellHeight } from '../ships/deck.ts';
import { hullBox, hullMouths, hullPaint, hullSails, hullWaterline } from '../ships/hulls.ts';
import type { SailCorners } from '../ships/sails.ts';
import { BELLY_M, STAY_SWAY_M, type Swing, swingOf } from './shipClear.ts';

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

/** A square yard is braced at most this far round its mast (`squareBrace`), radians. */
const BRACED_MOST = Math.PI / 4;
/** How far an eye over the deck keeps from any of its rig, and its masts' half thickness, metres. */
const RIG_CLEAR_M = 0.8;
const MAST_M = 0.4;
/** An eye over the deck stands this high over it at best, this high at least, and this far over its rail. */
const BEST_OVER_DECK_M = 3;
const LEAST_OVER_DECK_M = 1.7;
const OVER_RAIL_M = 0.4;
/** The water at its guns' nearest shows this far over its rail. */
const SIGHT_OVER_RAIL_M = 0.2;
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

/** Whether a point over the deck (along, out, up) stands within `RIG_CLEAR_M` of where a sail swinging as `swing`
 *  can come in any wind: a square sail braced at most 45° round its mast and bellied either way, a gaff swung to
 *  either beam aft of its luff, a staysail swaying on its stay; or within `RIG_CLEAR_M` of the mast it sets on, as
 *  thick as `MAST_M` each side of its line. */
function inRig(swing: Swing, [along, out, up]: Point, pad = RIG_CLEAR_M): boolean {
  const mast = swing.kind !== 'stay' && Math.abs(along - swing.pivot) < MAST_M + pad && Math.abs(out) < MAST_M + pad;
  if (mast) return true;
  if (up < swing.low - pad || up > swing.high + pad) return false;
  if (swing.kind === 'stay')
    return along > swing.along[0] - pad && along < swing.along[1] + pad && Math.abs(out) < STAY_SWAY_M + pad;
  if (Math.abs(out) > swing.reach + pad) return false;
  const [fore, aft] =
    swing.kind === 'gaff'
      ? [swing.pivot + BELLY_M, swing.pivot - swing.reach]
      : [
          swing.pivot + swing.reach * Math.sin(BRACED_MOST) + BELLY_M,
          swing.pivot - swing.reach * Math.sin(BRACED_MOST) - BELLY_M,
        ];
  return along < fore + pad && along > aft - pad;
}

/** Whether a point in a hull's frame stands within `pad` of where its rig can come in any wind (`inRig`). */
export const inItsRig = (hull: number, point: Point, pad = RIG_CLEAR_M): boolean =>
  hullSails(hull).some((sail) => inRig(swingOf(sail), point, pad));

/** The highest the deck or its rail stands across `deck` at `along`. */
function railAt(deck: Deck, along: number): number {
  let rail = -Infinity;
  for (let column = 0; column < deck.columns; column++)
    rail = Math.max(rail, cellHeight(deck, deck.west + (column + 0.5) * deck.cell, -along) ?? -Infinity);
  return rail;
}

/** The eye over the deck that scores best, or null where no spot near the battery is clear of the rig: high over the
 *  deck, near its battery's middle, toward its centreline, and with the water at `nearestM` out showing over its
 *  rail. */
function deckEye(hull: number, battery: readonly number[], nearestM: number): Point | null {
  const deck = HULL_DECKS[hull];
  if (!deck) return null;
  const swings = hullSails(hull).map(swingOf);
  const [first, last] = [Math.min(...battery) - PAST_BATTERY_M, Math.max(...battery) + PAST_BATTERY_M];
  const middle = mean(battery);
  const halfBeam = Math.abs(hullBox(hull)[1][1]);
  let best: { readonly eye: Point; readonly score: number } | null = null;
  for (let along = first; along <= last; along += SEARCH_STEP_M) {
    const rail = railAt(deck, along);
    // In whole steps, so its centreline is out 0 exactly and not a hair to port.
    for (let step = -10; step <= 15; step++) {
      const share = step / 20;
      const out = share * halfBeam;
      const under = cellHeight(deck, out, -along);
      if (under === null) continue;
      for (let over = LEAST_OVER_DECK_M; over <= BEST_OVER_DECK_M + 2; over += 0.1) {
        const up = under + over;
        const score = Math.abs(over - BEST_OVER_DECK_M) + 0.35 * Math.abs(along - middle) + Math.abs(share);
        if (up < rail + OVER_RAIL_M || (best && score >= best.score)) continue;
        // The look down to the nearest lay, where it passes over the rail.
        const atRail = up - (up * (halfBeam - out)) / Math.max(1e-6, nearestM - out);
        if (atRail < rail + SIGHT_OVER_RAIL_M) continue;
        // The eye and the way in to it from abeam, square over its rail (`wayAboard`), clear of the rig.
        let clear = true;
        for (let across = out; clear && across <= halfBeam + 1; across += SEARCH_STEP_M)
          for (const swing of swings) if (inRig(swing, [along, across, up])) clear = false;
        if (clear) best = { eye: [along, out, up], score };
      }
    }
  }
  return best?.eye ?? null;
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
