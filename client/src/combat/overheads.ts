// What stands round a struck foe's head, cell by cell as the spells' pictures are: a staggered foe's three gold stars
// circling it in held steps, and an Exposed foe's cracked diamond beside it; its plate stands over the head.
import { GLOW_RAMPS, type Rgb } from '../elementGlow.ts';
import { CELL_M, CLEAR, STAR, type Sprite, sprite, stopOf } from './spellPixels.ts';
import { GOLD } from './markSprites.ts';

type Point = readonly [number, number, number];

/** A staggered foe's stars: this many, this far round its head (metres), this high over its feet, going round once
 *  in this long (s) in this many held steps. */
const DAZE = { stars: 3, radius: 0.35, high: 1.85, turn: 1, steps: 8 } as const;
/** An Exposed foe's diamond, this high over its feet and this far to the eye's right of them (metres). */
const MARK = { high: 1.6, aside: 0.42 } as const;

/** A cracked diamond nine cells across: its edge in its element's light, a crack down it, its inside dark. */
export const CRACKED: Sprite = sprite(9, 9, (across, up) => {
  const far = Math.abs(across) + Math.abs(up);
  if (far > 4) return CLEAR;
  if (far === 4) return 2;
  const crack = Math.round(up) % 2 === 0 ? 0 : up > 0 ? 1 : -1;
  return Math.round(across) === crack ? 2 : 0;
});

/** A sprite's cells in `ramp`'s stops, stood upright at `middle` and turned to `eye`, as mark vertices. */
function lay(out: number[], picture: Sprite, ramp: readonly Rgb[], middle: Point, eye: Point): void {
  const [toX, toY] = [middle[0] - eye[0], middle[1] - eye[1]];
  const apart = Math.hypot(toX, toY);
  if (apart < 0.6) return;
  const [rightX, rightY] = [-toY / apart, toX / apart];
  const corner = (across: number, up: number) => [
    middle[0] + rightX * across * CELL_M,
    middle[1] + rightY * across * CELL_M,
    middle[2] + up * CELL_M,
  ];
  for (let row = 0; row < picture.height; row++)
    for (let column = 0; column < picture.width; column++) {
      const colour = ramp[stopOf(picture, column, row)];
      if (!colour) continue;
      const [left, top] = [column - picture.width / 2, picture.height / 2 - row];
      const quad = [corner(left, top), corner(left + 1, top), corner(left + 1, top - 1), corner(left, top - 1)];
      for (const index of [0, 1, 2, 0, 2, 3]) out.push(...(quad[index] ?? []), ...colour, 1);
    }
}

/** What stands over a foe whose figure's feet are drawn at `feet`, seen from `eye` at `clock` (page seconds): its
 *  stars while `staggered`, its diamond while `exposed`. */
export function overheadMarks(
  out: number[],
  feet: Point,
  eye: Point,
  clock: number,
  { staggered, exposed }: { readonly staggered: boolean; readonly exposed: boolean },
): void {
  if (staggered) {
    const step = Math.floor((clock / DAZE.turn) * DAZE.steps);
    for (let star = 0; star < DAZE.stars; star++) {
      const angle = ((step / DAZE.steps + star / DAZE.stars) % 1) * Math.PI * 2;
      const place: Point = [
        feet[0] + Math.cos(angle) * DAZE.radius,
        feet[1] + Math.sin(angle) * DAZE.radius,
        feet[2] + DAZE.high,
      ];
      lay(out, STAR, GOLD, place, eye);
    }
  }
  if (!exposed) return;
  const [toX, toY] = [feet[0] - eye[0], feet[1] - eye[1]];
  const apart = Math.hypot(toX, toY) || 1;
  const beside: Point = [
    feet[0] - (toY / apart) * MARK.aside,
    feet[1] + (toX / apart) * MARK.aside,
    feet[2] + MARK.high,
  ];
  lay(out, CRACKED, GLOW_RAMPS[3], beside, eye);
}
