// The bits a blow throws: steel's sparks, an element's motes, a body's chips and a star's glints, each two of a
// figure's pixels across, cooling down its ramp a stop at a time as it ages, falling or held up as it flies, and
// coming to rest on the ground it was thrown over. Their number is capped, so a crowd of blows costs no more.
import { type Ramp, layLine, layUpright } from './impactPixels.ts';
import { BODY, CELL_M, GLINTS, HOT } from './spellPixels.ts';

type Point = readonly [number, number, number];

/** What a bit is drawn as: a streak along its flight, a square, or a glint's cross of cells. */
export type BitShape = 'spark' | 'mote' | 'glint';

/** A bit in flight, metres and seconds: where it is, its velocity (east, south, up), its age and life, its ramp, how
 *  hard it is held up against gravity, its shape, how many cells across it is, the stop it keeps (null to cool by
 *  age) and the height it comes to rest at. */
export interface Bit {
  x: number;
  y: number;
  z: number;
  east: number;
  south: number;
  up: number;
  age: number;
  readonly life: number;
  readonly ramp: Ramp;
  readonly lift: number;
  readonly shape: BitShape;
  readonly cells: number;
  readonly stop: number | null;
  readonly floor: number;
}

/** How a throw of bits flies: their ramp, speed and life (each between two), how hard they are held up, their shape
 *  and size, the stop they keep (none to cool), how far up they are thrown (0 flat, 1 straight up at most) and how
 *  far round from the way thrown they spread (0 a line, 1 a half-sphere). */
export interface Throw {
  readonly ramp: Ramp;
  readonly speed: readonly [number, number];
  readonly life: readonly [number, number];
  readonly lift?: number;
  readonly shape?: BitShape;
  readonly cells?: number;
  readonly stop?: number | null;
  readonly rise?: number;
  readonly spread?: number;
  readonly floor?: number;
}

const GRAVITY = 9.81;
/** No more bits fly at once than this: a throw past it is let fall. */
export const MOST_BITS = 900;
/** A spark is a streak as long as this much of its flight (seconds), two cells at least. */
const STREAK_S = 0.025;

/** Every bit in flight. */
export class Bits {
  private readonly random: () => number;
  readonly flying: Bit[] = [];

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Throws `count` bits from `from` along `toward` (a way over the ground, east and south; none for every way) as
   *  `how` says. */
  throw(from: Point, toward: readonly [number, number], count: number, how: Throw): void {
    const { ramp, speed, life, lift = 0, shape = 'spark', cells = 1, stop = null, rise = 0.5, spread = 1 } = how;
    const between = (range: readonly [number, number]) => range[0] + (range[1] - range[0]) * this.random();
    for (let bit = 0; bit < count && this.flying.length < MOST_BITS; bit++) {
      const way = [
        toward[0] + (this.random() - 0.5) * 2 * spread,
        toward[1] + (this.random() - 0.5) * 2 * spread,
        rise * (0.25 + this.random() * 0.75),
      ] as const;
      const length = Math.hypot(...way) || 1;
      const fast = between(speed) / length;
      this.flying.push({
        x: from[0],
        y: from[1],
        z: from[2],
        east: way[0] * fast,
        south: way[1] * fast,
        up: way[2] * fast,
        age: 0,
        life: between(life),
        ramp,
        lift,
        shape,
        cells,
        stop,
        floor: how.floor ?? -Infinity,
      });
    }
  }

  /** Flies every bit on by `seconds`, resting those that reach their ground, and lets go of those burnt out. */
  update(seconds: number): void {
    for (let index = this.flying.length - 1; index >= 0; index--) {
      const bit = this.flying[index];
      if (!bit) continue;
      bit.age += seconds;
      if (bit.age >= bit.life) {
        this.flying[index] = this.flying[this.flying.length - 1] ?? bit;
        this.flying.pop();
        continue;
      }
      bit.x += bit.east * seconds;
      bit.y += bit.south * seconds;
      bit.z += bit.up * seconds;
      bit.up -= (GRAVITY - bit.lift) * seconds;
      if (bit.z < bit.floor) [bit.z, bit.east, bit.south, bit.up] = [bit.floor, 0, 0, 0];
    }
  }

  /** Every bit as mark vertices seen from `eye`, each in one stop of its ramp, fully opaque. */
  lay(out: number[], eye: Point): void {
    for (const bit of this.flying) {
      // A cooling bit steps down to its ramp's body and no further: its dark would read as dirt, not light.
      const stop = bit.stop ?? Math.max(BODY, HOT - Math.floor((bit.age / bit.life) * 3));
      const colour = bit.ramp[stop] ?? bit.ramp[0];
      const place: Point = [bit.x, bit.y, bit.z];
      const width = bit.cells * CELL_M;
      const glint = bit.shape === 'glint' ? GLINTS[stop] : undefined;
      if (glint) {
        layUpright(out, glint, bit.ramp, place, eye, width);
        continue;
      }
      const speed = Math.hypot(bit.east, bit.south, bit.up);
      if (bit.shape === 'spark' && speed > 0.5) {
        const length = Math.max(2 * width, speed * STREAK_S) / speed;
        const tail: Point = [bit.x - bit.east * length, bit.y - bit.south * length, bit.z - bit.up * length];
        layLine(out, eye, tail, place, width, colour);
        continue;
      }
      layLine(out, eye, [bit.x, bit.y, bit.z - width / 2], [bit.x, bit.y, bit.z + width / 2], width, colour);
    }
  }
}
