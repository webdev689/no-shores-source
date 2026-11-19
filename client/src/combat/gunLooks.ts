// A gun's shot as black powder looks, held in whole frames: a star of fire at the muzzle, then three tongues of flame
// along the barrel, then sparks thrown out ahead; under it the ground lit for two frames; and five puffs of grey smoke
// that rise and drift the shot's way, thinning by an ordered dither in four steps. Every size is held to a share of
// the eye's view, so a shot fired in first person, its muzzle an arm's length off, flashes without filling the screen.
import { CELL_M, CLEAR, DARK, BODY, LIGHT, HOT, type Sprite, hashOf, sprite } from './spellPixels.ts';
import { POWDER, SMOKE, layPicture, starSprite } from './markSprites.ts';
import { markRing } from './marks.ts';

type Point = readonly [number, number, number];

/** A frame of the flash: 60 a second, as the rules tick. A shot fired this frame is not aged by it, so its first
 *  frame, the star, is always seen. */
const FRAME_S = 1 / 60;
const UNSHOWN = -1;
/** The flash's star across (metres), a pistolet's and a thunderlock's; its tongues' length; the most of the eye's view
 *  each may take (radians). */
const STAR_M = { light: 0.6, heavy: 0.9 } as const;
const TONGUES_M = { light: 0.9, heavy: 1.2 } as const;
const MOST_VIEW = 0.25;
/** The star's arms, cells from its middle; the tongues' picture, cells across and along. */
const STAR_REACH = 4;
const TONGUES = { across: 9, along: 15 } as const;
/** Sparks thrown ahead in frames 3 and 4: how many, how fast (m/s), how far off the shot's line (a share). */
const SPARKS = { count: 6, speed: 9, spread: 0.45 } as const;
/** The ground lit under the muzzle for the first two frames: its radius (metres), its three steps' light, and how
 *  high a muzzle may stand over the ground and still light it. */
const POOL = { radius: { light: 0.9, heavy: 1.3 }, light: [0.16, 0.24, 0.34], highest: 3 } as const;
/** The smoke: five puffs, their size across (metres) least and most and how much they swell a second, how far along
 *  the shot they start (metres), the frame they rise from (after the flash, so it reads alone), how fast they rise
 *  and drift (m/s), how long they last (seconds), their cell, and how near the eye one is left out. */
const SMOKE_LOOK = {
  puffs: 5,
  across: [0.12, 0.3],
  swell: 0.15,
  along: [0.2, 1.2],
  from: 2,
  rise: 0.8,
  drift: 0.6,
  life: 1.2,
  cell: CELL_M,
  nearest: 1.8,
} as const;
/** A puff keeps this share of its cells through each quarter of its life: thin from the first, so it never hides the
 *  shot's mark for long. */
const THINNING = [0.6, 0.4, 0.25, 0.1] as const;
const ORDER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** A shot fired: its muzzle, the way it flew (a unit vector), whether a thunderlock fired it, its seconds since, its
 *  seed and the ground under its muzzle once known. */
interface Shot {
  readonly muzzle: Point;
  readonly way: Point;
  readonly heavy: boolean;
  readonly seed: number;
  age: number;
  ground: number | null;
}

/** The flash's star at each of its first two frames: white-hot, then a stop cooler. */
const FLASH_STARS: readonly Sprite[] = [0, 1].map((cooled) => {
  const star = starSprite(STAR_REACH);
  return { ...star, cells: star.cells.map((stop) => (stop >= 0 ? Math.max(DARK, stop - cooled) : stop)) };
});

/** Three tongues of flame from the muzzle (the picture's foot) along the barrel: the middle one long, two at its sides
 *  shorter, white-hot at the root and cooling to their tips. */
export const TONGUE_SPRITE: Sprite = sprite(TONGUES.across, TONGUES.along, (across, up) => {
  const along = up + (TONGUES.along - 1) / 2;
  const share = along / (TONGUES.along - 1);
  const middle = Math.abs(across) <= Math.max(0, 1.5 * (1 - share)) + 0.25;
  const sides = along > 1 && along < TONGUES.along * 0.6 && Math.abs(Math.abs(across) - along * 0.55) < 0.6;
  if (!middle && !sides) return CLEAR;
  if (share < 0.2) return HOT;
  return share < 0.55 ? LIGHT : BODY;
});

/** How a shot's flash stands `age` seconds after it: the frame it is in. */
export const flashFrame = (age: number): number => Math.floor(Math.max(0, age) / FRAME_S + 1e-6);

const smokeKept = new Map<string, Sprite>();

/** A puff of `radius` cells, lit from above at `step` of its thinning, its ragged edge and its dither by `seed`. */
export function puffOf(radius: number, step: number, seed: number): Sprite {
  const key = `${radius}:${step}:${seed}`;
  const kept = smokeKept.get(key);
  if (kept) return kept;
  const size = 2 * radius + 1;
  const keep = THINNING[step] ?? 0;
  const made = sprite(size, size, (across, up) => {
    const apart = Math.hypot(across, up);
    if (apart > radius + (hashOf(seed, across, up) - 0.5) * 1.2) return CLEAR;
    const order = ORDER[(((up % 4) + 4) % 4) * 4 + (((across % 4) + 4) % 4)] ?? 0;
    if (keep * 16 <= order + 0.5) return CLEAR;
    // Lit from above and ahead: pale grey, its top lighter and its foot darker, never black.
    const lit = up - across * 0.4;
    if (lit > radius * 0.45) return HOT;
    return lit < -radius * 0.35 ? BODY : LIGHT;
  });
  smokeKept.set(key, made);
  return made;
}

/** Each gun's shot, flashing and smoking where it was fired, seen from any eye. */
export class GunLooks {
  private shots: Shot[] = [];
  private fired = 0;

  /** A shot fired from `muzzle` along `way` (any length), by a thunderlock when `heavy`. */
  fire(muzzle: Point, way: Point, heavy: boolean): void {
    const length = Math.hypot(...way) || 1;
    const unit: Point = [way[0] / length, way[1] / length, way[2] / length];
    this.fired += 1;
    this.shots.push({ muzzle, way: unit, heavy, seed: this.fired, age: UNSHOWN, ground: null });
  }

  /** Runs every shot on by `seconds`, reading the ground under each new one (level at 0 without `groundAt`), and lets
   *  go of those whose smoke is gone. */
  update(seconds: number, groundAt?: (x: number, y: number) => number | null): void {
    for (const shot of this.shots) {
      shot.ground ??= groundAt?.(shot.muzzle[0], shot.muzzle[1]) ?? 0;
      shot.age = shot.age === UNSHOWN ? 0 : shot.age + seconds;
    }
    this.shots = this.shots.filter((shot) => shot.age < SMOKE_LOOK.life);
  }

  /** Whether any shot still shows. */
  get showing(): boolean {
    return this.shots.length > 0;
  }

  /** Every shot's flash, light and smoke, seen from `eye`, as mark vertices into `out`. */
  mesh(out: number[], eye: Point): void {
    for (const shot of this.shots) {
      const frame = flashFrame(shot.age);
      const distance = Math.hypot(shot.muzzle[0] - eye[0], shot.muzzle[1] - eye[1], shot.muzzle[2] - eye[2]);
      const held = (metres: number) => Math.min(metres, distance * MOST_VIEW);
      const kind = shot.heavy ? 'heavy' : 'light';
      if (frame < 2) {
        const star = held(STAR_M[kind]) * (frame === 0 ? 1 : 0.7);
        const picture = FLASH_STARS[frame] ?? FLASH_STARS[0];
        if (picture) layPicture(out, picture, POWDER, shot.muzzle, eye, { cell: star / picture.width });
        this.pool(out, shot, kind);
      }
      if (frame === 1) {
        const length = held(TONGUES_M[kind]);
        const middle = along(shot.muzzle, shot.way, length / 2);
        layPicture(out, TONGUE_SPRITE, POWDER, middle, eye, { cell: length / TONGUES.along, up: shot.way });
      }
      if (frame === 2 || frame === 3) this.sparks(out, shot, eye, held(STAR_M[kind]) / (2 * STAR_REACH + 1));
      this.smoke(out, shot, eye);
    }
  }

  /** The ground under the muzzle lit in three steps, light added to it, for the flash's two frames. */
  private pool(out: number[], shot: Shot, kind: 'light' | 'heavy'): void {
    const ground = shot.ground ?? 0;
    if (shot.muzzle[2] - ground > POOL.highest) return;
    const radius = POOL.radius[kind];
    const centre: Point = [shot.muzzle[0], shot.muzzle[1], ground];
    POOL.light.forEach((light, step) => {
      const colour = POWDER[step + 1] ?? POWDER[3];
      const [inner, outer] = [(radius * (2 - step)) / 3, (radius * (3 - step)) / 3];
      markRing(out, centre, inner, outer, [colour[0] * light, colour[1] * light, colour[2] * light, -1]);
    });
  }

  /** The sparks thrown ahead of the muzzle, a cell each at its body stop. */
  private sparks(out: number[], shot: Shot, eye: Point, cell: number): void {
    for (let spark = 0; spark < SPARKS.count; spark++) {
      const off = (axis: number) => (hashOf(shot.seed, spark, axis) - 0.5) * 2 * SPARKS.spread;
      const way: Point = [shot.way[0] + off(0), shot.way[1] + off(1), shot.way[2] + off(2) + 0.1];
      const place = along(shot.muzzle, way, SPARKS.speed * shot.age);
      layPicture(out, SPARK_CELL, POWDER, place, eye, { cell });
    }
  }

  /** The smoke's puffs as they stand now, each thinning by its quarter of the smoke's life. */
  private smoke(out: number[], shot: Shot, eye: Point): void {
    if (flashFrame(shot.age) < SMOKE_LOOK.from) return;
    const step = Math.min(3, Math.floor((shot.age / SMOKE_LOOK.life) * 4));
    // The smoke drifts the shot's way, slowing as it goes, and rises.
    const drifted = SMOKE_LOOK.drift * shot.age * (1 - shot.age / (2 * SMOKE_LOOK.life));
    for (let puff = 0; puff < SMOKE_LOOK.puffs; puff++) {
      const share = puff / (SMOKE_LOOK.puffs - 1);
      const start = SMOKE_LOOK.along[0] + (SMOKE_LOOK.along[1] - SMOKE_LOOK.along[0]) * share;
      const base = along(shot.muzzle, shot.way, start + drifted * (0.5 + share));
      const spread = (axis: number) => (hashOf(shot.seed, puff, axis, 7) - 0.5) * 0.25;
      const place: Point = [base[0] + spread(0), base[1] + spread(1), base[2] + spread(2) + SMOKE_LOOK.rise * shot.age];
      if (Math.hypot(place[0] - eye[0], place[1] - eye[1], place[2] - eye[2]) < SMOKE_LOOK.nearest) continue;
      const [least, most] = SMOKE_LOOK.across;
      const metres = least + (most - least) * hashOf(shot.seed, puff, 3) + SMOKE_LOOK.swell * shot.age;
      const radius = Math.max(2, Math.round(metres / 2 / SMOKE_LOOK.cell));
      const picture = puffOf(radius, step, (shot.seed * 5 + puff) % 8);
      layPicture(out, picture, SMOKE, place, eye, { cell: SMOKE_LOOK.cell });
    }
  }
}

/** A spark: one cell at the powder's body stop. */
const SPARK_CELL: Sprite = sprite(1, 1, () => BODY);

const along = (from: Point, way: Point, metres: number): Point => [
  from[0] + way[0] * metres,
  from[1] + way[1] * metres,
  from[2] + way[2] * metres,
];
