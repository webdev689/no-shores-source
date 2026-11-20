// The puffs a sea fight throws round its ships: a gun's flash and its powder smoke, a ball's faint trail, a splash's
// column and its ring of foam, a hit's splinters, a fire's flames and smoke, and the foam and bubbles where a ship
// went down. Each is a few spheres moving on their own for a moment, kept at their true size about the point they
// came from, so a fight seen from the raised view, where ships are drawn larger, draws them as large about it.
import type { MarkShape } from './markView.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number];

/** A shape drawn for a moment: where (window metres, its height as drawn), how big, what colour; a sphere unless
 *  said, turned by `yaw` (radians) about the upright. */
export interface Mark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly colour: Colour;
  readonly shape?: MarkShape;
  readonly yaw?: number;
}

/** A push on the water's ripples where a ball fell. */
export interface Splash {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
  readonly strength: number;
}

/** A puff: the point it came from (`anchor`, window metres) and its own start off it (true metres), its velocity,
 *  how fast that dies away (a second), its radius and growth, its gravity (none for smoke), whether the wind takes
 *  it, how low it may go, its colour, when it began and how long it lasts (seconds). */
interface Puff {
  readonly anchor: Point;
  readonly from: Point;
  readonly velocity: Point;
  readonly drag: number;
  readonly radius: number;
  readonly grow: number;
  readonly gravity: number;
  readonly windborne: boolean;
  readonly floor: number;
  readonly colour: Colour;
  readonly born: number;
  readonly life: number;
  /** The share of its life it holds its size before it thins away, and how fast it thins then: 1 evenly, 2 most of
   *  the way early (smoke, so what it hid shows again). */
  readonly thins: number;
  /** The share of its life it holds its size before it thins away. */
  readonly holds: number;
}

type PuffMaking = Partial<Omit<Puff, 'anchor' | 'born' | 'colour' | 'life'>> & Pick<Puff, 'colour' | 'life'>;

const GRAVITY = 9.81;
const FLASH: Colour = [1, 0.78, 0.35];
/** White powder smoke, a fire's dark smoke, and a ball's faint grey trail. */
const POWDER: Colour = [0.93, 0.93, 0.9];
const DARK_SMOKE: Colour = [0.22, 0.21, 0.2];
const TRAIL: Colour = [0.62, 0.62, 0.62];
const SPRAY: Colour = [0.9, 0.95, 1];
const FOAM: Colour = [0.96, 0.97, 0.98];
/** Water thrown up, the sea's own green-blue, paler; and a gathered piece's gold. */
const WATER: Colour = [0.55, 0.74, 0.8];
const GLINT: Colour = [1, 0.82, 0.3];
const DUST: Colour = [0.55, 0.47, 0.36];
const CANVAS: Colour = [0.92, 0.9, 0.82];
const TIMBER: Colour = [0.45, 0.3, 0.16];
const FLAME: Colour = [1, 0.45, 0.12];
/** A gun's flash lasts this long, seconds; its smoke this long, drifting this fast downwind (m/s). */
export const FLASH_S = 0.1;
export const SMOKE_S = 7;
const SMOKE_DRIFT_MS = 1.5;
/** A splash's column stands this high (metres) and is back down in this long (seconds); its foam lasts this long. */
export const SPLASH_M = 4;
export const SPLASH_S = 1;
/** A round shot's radius, metres (crates/naval/src/guns.rs): a splash is sized by its ball beside it. */
export const ROUND_SHOT_M = 0.07;
const FOAM_S = 2.5;
/** Foam flecks, and bubbles with them, a second over where a ship goes down. */
const FOAM_PER_S = 80;
/** A ball leaves a trail puff this often (seconds), each lasting this long. */
const TRAIL_EVERY_S = 0.04;
const TRAIL_S = 0.5;
/** A hull hit throws this many chips of her paint. */
export const SPLINTERS = 32;
/** Flames and smoke a burning ship sends up a second, for each fire aboard. */
const FLAMES_PER_S = 12;

export class Effects {
  private puffs: Puff[] = [];
  private seed: number;
  private owedFlames = 0;
  private owedFoam = 0;
  /** When the balls aloft last left their trail's puffs. */
  private trailAt = -Infinity;
  /** The wind the smoke drifts on: east and south, m/s. */
  private wind: readonly [number, number] = [0, 0];

  constructor(seed: number) {
    this.seed = seed >>> 0 || 1;
  }

  /** A draw in [0, 1): the variety of the spray, not anything the fight decides. */
  private draw(): number {
    this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.seed / 4_294_967_296;
  }

  private spread(most: number): number {
    return (this.draw() * 2 - 1) * most;
  }

  private add(count: number, anchor: Point, now: number, make: (index: number) => PuffMaking): void {
    for (let index = 0; index < count; index++)
      this.puffs.push({
        from: [0, 0, 0],
        velocity: [0, 0, 0],
        drag: 0,
        radius: 0.2,
        grow: 0,
        gravity: 0,
        windborne: false,
        floor: -Infinity,
        holds: 2 / 3,
        thins: 1,
        ...make(index),
        anchor,
        born: now,
      });
  }

  /** The wind the smoke drifts on, blowing toward `bearing` (radians clockwise from north). */
  blow(bearing: number): void {
    this.wind = [Math.sin(bearing) * SMOKE_DRIFT_MS, -Math.cos(bearing) * SMOKE_DRIFT_MS];
  }

  /** A gun fired from `mouth` (true metres off `anchor`, her middle) along `launch` (m/s): a flash at its mouth, and
   *  white smoke that rolls out with the shot, then drifts downwind and thins. */
  fire(anchor: Point, mouth: Point, launch: Point, now: number): void {
    const speed = Math.hypot(launch[0], launch[1]) || 1;
    const out = [launch[0] / speed, launch[1] / speed] as const;
    this.add(1, anchor, now, () => ({ from: mouth, radius: 0.8, grow: 6, colour: FLASH, life: FLASH_S, holds: 1 }));
    this.add(10, anchor, now, (index) => ({
      from: mouth,
      velocity: [out[0] * (1.5 + index * 0.6) + this.spread(0.5), out[1] * (1.5 + index * 0.6) + this.spread(0.5), 0.8],
      drag: 0.9,
      radius: 0.9 + this.draw() * 0.5,
      grow: 0.45,
      windborne: true,
      colour: POWDER,
      life: SMOKE_S * (0.8 + this.draw() * 0.2),
      // It thins from its first second on, most of the way early, so what it hid shows again within a few.
      holds: 0.15,
      thins: 2,
    }));
  }

  /** Each ball aloft (window metres) leaves a faint grey trail, a puff of it every few hundredths of a second. */
  trail(balls: readonly Point[], now: number): void {
    if (now - this.trailAt < TRAIL_EVERY_S) return;
    this.trailAt = now;
    for (const ball of balls) this.add(1, ball, now, () => ({ radius: 0.12, colour: TRAIL, life: TRAIL_S, holds: 0 }));
  }

  /** A ball of `ballM` radius fell in the water at `spot` (window metres, the water's height): a column of water thrown
   *  up, white at its head and clear lower down, that rises, spreads and falls back in about a second, and a ragged
   *  patch of foam where it fell, all as large as the ball is heavy beside a round shot's. Answers its push on the
   *  water's ripples. */
  splash(spot: Point, now: number, ballM = ROUND_SHOT_M): Splash {
    const size = Math.min(2, Math.max(0.6, ballM / ROUND_SHOT_M));
    // Up `height` and down again in `SPLASH_S`: launched at 4h/T and pulled down at 8h/T².
    const height = SPLASH_M * size;
    const [rise, pull] = [(4 * height) / SPLASH_S, (8 * height) / SPLASH_S ** 2];
    this.add(28, spot, now, () => {
      const share = 0.35 + this.draw() * 0.65;
      return {
        velocity: [this.spread(size), this.spread(size), rise * Math.sqrt(share)],
        radius: (0.25 + this.draw() * 0.2) * size,
        grow: 0.4 * size,
        gravity: pull,
        floor: 0,
        // The fastest water goes highest and breaks white; the rest stays the sea's own colour.
        colour: share > 0.8 ? SPRAY : WATER,
        life: SPLASH_S * Math.sqrt(share),
      };
    });
    this.add(22, spot, now, () => {
      const [turn, away] = [this.draw() * 2 * Math.PI, Math.sqrt(this.draw()) * 0.8 * size];
      const drift = this.draw() * 0.6 * size;
      return {
        from: [Math.cos(turn) * away, Math.sin(turn) * away, 0],
        velocity: [Math.cos(turn) * drift, Math.sin(turn) * drift, 0],
        drag: 1,
        radius: (0.2 + this.draw() * 0.3) * size,
        grow: 0.05,
        colour: FOAM,
        life: FOAM_S * (0.7 + this.draw() * 0.3),
      };
    });
    return { x: spot[0], y: spot[1], radiusM: 1.2 * size, strength: -0.05 };
  }

  /** A piece of what floats gathered at `spot` (window metres, the water's height): a little water thrown up and a
   *  ring of gold glints rising from where it lay. */
  gathered(spot: Point, now: number): void {
    this.add(8, spot, now, (index) => {
      const turn = (index / 8) * 2 * Math.PI;
      return {
        from: [Math.cos(turn) * 0.5, Math.sin(turn) * 0.5, 0.2],
        velocity: [Math.cos(turn) * 0.6, Math.sin(turn) * 0.6, 2],
        radius: 0.12,
        colour: GLINT,
        life: 0.8,
        holds: 0.5,
      };
    });
    this.add(10, spot, now, () => ({
      velocity: [this.spread(1), this.spread(1), 2 + this.draw() * 1.5],
      radius: 0.2,
      gravity: GRAVITY,
      floor: 0,
      colour: SPRAY,
      life: 0.7,
    }));
  }

  /** A ball in the ground: a puff of dust. */
  dust(spot: Point, now: number): void {
    this.add(4, spot, now, () => ({
      velocity: [this.spread(0.6), this.spread(0.6), 0.5 + this.draw()],
      radius: 0.3,
      grow: 0.6,
      colour: DUST,
      life: 1.4,
    }));
  }

  /** A ball through her hull at `spot` (true metres off `anchor`, her middle), facing out `out` (east, south): a few
   *  dozen chips of her paint burst out from it and fall to the water, and a little smoke hangs there. */
  splinter(anchor: Point, spot: Point, out: readonly [number, number], paint: Colour | null, now: number): void {
    const colour = paint ?? TIMBER;
    this.add(SPLINTERS, anchor, now, () => ({
      from: spot,
      velocity: [
        out[0] * (2 + this.draw() * 4) + this.spread(2),
        out[1] * (2 + this.draw() * 4) + this.spread(2),
        1 + this.draw() * 4,
      ],
      radius: 0.08 + this.draw() * 0.08,
      gravity: GRAVITY,
      floor: 0,
      colour: this.draw() < 0.3 ? TIMBER : colour,
      life: 1.6,
      holds: 1,
    }));
    this.add(2, anchor, now, () => ({
      from: spot,
      velocity: [0, 0, 0.6],
      radius: 0.6,
      grow: 0.5,
      colour: POWDER,
      life: 2,
    }));
  }

  /** A ball through her rig at `at`: a puff of splinters at the spar. */
  spar(anchor: Point, spot: Point, now: number): void {
    this.add(12, anchor, now, () => ({
      from: spot,
      velocity: [this.spread(2.5), this.spread(2.5), this.spread(1.5)],
      radius: 0.08,
      gravity: GRAVITY,
      floor: 0,
      colour: TIMBER,
      life: 1.4,
      holds: 1,
    }));
  }

  /** A ball through a sail at `at`: shreds of canvas drift down from the hole. */
  shred(anchor: Point, spot: Point, now: number): void {
    this.add(6, anchor, now, () => ({
      from: spot,
      velocity: [this.spread(1.5), this.spread(1.5), this.draw()],
      radius: 0.15,
      gravity: GRAVITY / 4,
      colour: CANVAS,
      life: 1.8,
      holds: 1,
    }));
  }

  /** A ship's fires over `seconds`: flames and dark smoke up from her deck at `deck` (true metres off `anchor`, her
   *  middle), over `spreadM` of her. */
  burn(anchor: Point, deck: Point, fires: number, spreadM: number, now: number, seconds: number): void {
    if (fires <= 0) return;
    this.owedFlames += FLAMES_PER_S * fires * seconds;
    while (this.owedFlames >= 1) {
      this.owedFlames -= 1;
      const from = [deck[0] + this.spread(spreadM), deck[1] + this.spread(spreadM), deck[2]] as const;
      this.add(1, anchor, now, () => ({
        from,
        velocity: [0, 0, 1.2],
        radius: 0.18,
        grow: 0.3,
        colour: FLAME,
        life: 0.6,
      }));
      this.add(1, anchor, now, () => ({
        from,
        velocity: [this.spread(0.2), this.spread(0.2), 1.6],
        radius: 0.3,
        grow: 0.8,
        windborne: true,
        colour: DARK_SMOKE,
        life: 3,
      }));
    }
  }

  /** Where a ship goes down, over `seconds`: foam on the water over `radiusM` round `at`, and bubbles rising to it. */
  foam(spot: Point, radiusM: number, now: number, seconds: number): void {
    this.owedFoam += FOAM_PER_S * seconds;
    while (this.owedFoam >= 1) {
      this.owedFoam -= 1;
      const turn = this.draw() * 2 * Math.PI;
      const away = Math.sqrt(this.draw()) * radiusM;
      const from = [Math.cos(turn) * away, Math.sin(turn) * away, 0] as const;
      this.add(1, spot, now, () => ({ from, radius: 0.3 + this.draw() * 0.3, grow: 0.1, colour: FOAM, life: 2.5 }));
      this.add(1, spot, now, () => ({
        from: [from[0], from[1], -1.5],
        velocity: [0, 0, 1.2],
        radius: 0.12,
        colour: FOAM,
        life: 1.3,
        holds: 1,
      }));
    }
  }

  /** Every puff still showing at `now`, where it is then, drawn `scale` times its size about where it came from;
   *  the spent are let go. */
  marks(now: number, scale = 1): Mark[] {
    this.puffs = this.puffs.filter((puff) => now - puff.born < puff.life);
    return this.puffs
      .filter((puff) => now >= puff.born)
      .map((puff) => {
        const age = now - puff.born;
        const carried = puff.drag > 0 ? (1 - Math.exp(-puff.drag * age)) / puff.drag : age;
        const [windEast, windSouth] = puff.windborne ? this.wind : [0, 0];
        const fall = (puff.gravity * age * age) / 2;
        const rawZ = puff.from[2] + puff.velocity[2] * carried - fall;
        // Each holds its size, then thins away over the rest of its life.
        const thinning = puff.life * (1 - puff.holds);
        const fade = thinning > 0 ? Math.min(1, Math.max(0, (puff.life - age) / thinning)) ** puff.thins : 1;
        return {
          x: puff.anchor[0] + (puff.from[0] + puff.velocity[0] * carried + windEast * age) * scale,
          y: puff.anchor[1] + (puff.from[1] + puff.velocity[1] * carried + windSouth * age) * scale,
          z: Math.max(puff.floor, puff.anchor[2] + rawZ * scale),
          radius: (puff.radius + puff.grow * age) * fade * scale,
          colour: puff.colour,
        };
      });
  }
}
