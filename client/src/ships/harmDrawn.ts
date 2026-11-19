// How her harm (`ShipHarm`) changes what her view draws: her torn sails falling to the sea and floating astern, her
// fallen masts' sails going over with them, her canvas's holes left out, each mast's fall for her shader, and her
// colours coming down her mast. Worked out on her own frame, so it is tested without a device.
import { type Fallen, dropOf, FALL_S, fallAngle, fallenPoint, type ShipHarm } from './shipHarm.ts';
import { SAIL_COLUMNS, SAIL_ROWS } from './sails.ts';
import { MOST_MASTS } from './shipShader.ts';
import type { MastSpan } from './shipTags.ts';

type Point = readonly [number, number, number];

/** A torn sail lands this far outboard of her side, metres. */
const OVERBOARD_M = 3;

/** A torn sail's point as it lies (`Fallen`), `seconds` after it tore: it drops to the water and is blown out over her
 *  side, then drifts astern; its head tears from the yard first, so its rows fall one after another. */
function tornPoint(point: Point, row: number, lies: Fallen, seconds: number, halfBeamM: number): Point {
  const late = (1 - row / (SAIL_ROWS - 1)) * 0.3;
  const falling = Math.max(0, seconds - late);
  const out = Math.min(1, falling / FALL_S) * (halfBeamM + OVERBOARD_M - Math.abs(point[1]));
  return [
    point[0] - lies.astern,
    point[1] + lies.side * Math.max(0, out),
    point[2] - dropOf(point[2], falling) - lies.sunk,
  ];
}

/** Each sail's canvas as her harm leaves it `now`: a torn sail falling and afloat astern, a fallen mast's sails over
 *  her side with it; the rest as her rig sets them. */
export function harmedCanvas(
  canvas: readonly Float32Array[],
  harm: ShipHarm,
  masts: readonly MastSpan[],
  halfBeamM: number,
  now: number,
): Float32Array[] {
  return canvas.map((points, sail) => {
    const mast = harm.layout.sailMast[sail] ?? -1;
    const fell = harm.mastFallen(mast, now);
    const torn = fell ? null : harm.sailLost(sail, now);
    if (!fell && !torn) return points;
    const moved = new Float32Array(points.length);
    const span = masts[mast] ?? { footZ: 0, topZ: 0 };
    const turn = { footZ: span.footZ, most: fallAngle(span.footZ, span.topZ - span.footZ) };
    for (let index = 0; index < points.length; index += 3) {
      const point: Point = [points[index] ?? 0, points[index + 1] ?? 0, points[index + 2] ?? 0];
      const row = Math.floor(index / 3 / SAIL_COLUMNS);
      const at = fell
        ? fallenPoint(point, fell, turn)
        : tornPoint(point, row, torn as Fallen, (torn as Fallen).down ** 0.5 * FALL_S, halfBeamM);
      moved.set(at, index);
    }
    return moved;
  });
}

/** Whether a sail's cell is drawn `now`: not shot through, and its sail not gone under. */
export function cellShows(harm: ShipHarm, sail: number, cell: number, now: number): boolean {
  if (harm.holes[sail]?.has(cell)) return false;
  const gone = harm.mastFallen(harm.layout.sailMast[sail] ?? -1, now) ?? harm.sailLost(sail, now);
  return !gone || gone.shows;
}

/** Each mast's fall for her shader, two vec4s a mast (`MAST_FLOATS_AT`): its foot, the turn over her side, whether
 *  it shows; then its drift astern and how far it has sunk. A mast standing is turned by nothing. */
export function mastFalls(harm: ShipHarm, masts: readonly MastSpan[], now: number): Float32Array {
  const values = new Float32Array(MOST_MASTS * 8);
  for (let mast = 0; mast < MOST_MASTS; mast++) {
    const span = masts[mast] ?? { footZ: 0, topZ: 0 };
    const fell = harm.mastFallen(mast, now);
    const angle = fell ? fell.down * fallAngle(span.footZ, span.topZ - span.footZ) * fell.side : 0;
    values.set(
      [span.footZ, Math.cos(angle), Math.sin(angle), fell && !fell.shows ? 0 : 1, fell?.astern ?? 0, fell?.sunk ?? 0],
      mast * 8,
    );
  }
  return values;
}

/** Where her flag flies `now`, from her masthead: lowered down her mast to a metre over its foot as her colours are
 *  struck, and gone once struck or once its mast has fallen. */
export function flagAt(
  masthead: Point,
  harm: ShipHarm,
  masts: readonly MastSpan[],
  now: number,
): { readonly at: Point; readonly shows: boolean } {
  const mast = harm.layout.masts.reduce(
    (best, x, index) => (Math.abs(x - masthead[0]) < Math.abs((harm.layout.masts[best] ?? 0) - masthead[0]) ? index : best),
    0,
  );
  const share = harm.struck(now);
  const bottom = (masts[mast]?.footZ ?? 0) + 1;
  const at: Point = [masthead[0], masthead[1], masthead[2] - share * Math.max(0, masthead[2] - bottom)];
  return { at, shows: share < 1 && !harm.isFallen(mast) };
}
