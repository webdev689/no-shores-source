// What a spell leaves as it lands, ends or is cast, after the room has let it go: the impact star, a Tempest orb's nova
// and forks, a fire's burst, Arc Lash's scorch, the Dawnflare's burning lane, a dagger's slash, smoke, a spell's pop
// as it ends, and an Anima's ring and its flourish. Each lives its own few frames, timed in whole frames of 1/60 s.
import type { GlowElement } from '../elementGlow.ts';
import { boltLine, colourOf, groundRing, groundStrip, groundWidth, jagged, lineRibbon } from './spellLines.ts';
import { type Frame, type Point, apartFrom } from './spellPlaces.ts';
import { flameSprite, impactSprite } from './spellPictures.ts';
import { BODY, CELL_M, DARK, HOT, LIGHT, billboard, hashOf, puffSprite, stepOf } from './spellPixels.ts';

/** A frame (seconds), and how many marks are kept at once: the oldest goes first. A picture left nearer the eye than
 *  this for each of its sizes (metres) is not drawn: through the player's own eyes it would fill the view. */
const FRAME_S = 1 / 60;
const MOST = 120;
const NEAR_EYE_M = 1.2;
const PICTURES = new Set<LandKind>(['impact', 'pop', 'nova', 'flame', 'smoke']);

/** Each kind of mark and how long it lives (seconds). */
export const LAND = {
  impact: 3 * FRAME_S,
  nova: 10 * FRAME_S,
  flame: 12 * FRAME_S,
  scorch: 1.2,
  lane: 1.5,
  slash: 3 * FRAME_S,
  pop: 4 * FRAME_S,
  smoke: 1,
  zap: 8 * FRAME_S,
  pillar: 5 * FRAME_S,
  ring: 6 * FRAME_S,
} as const;
export type LandKind = keyof typeof LAND;

/** A mark left: its kind, where (and where to, for a line), its element, its size (a share of its own), a seed for its
 *  own jitter, and the clock it was left at. */
export interface Land {
  readonly kind: LandKind;
  readonly at: Point;
  readonly to: Point | null;
  readonly look: GlowElement;
  readonly size: number;
  readonly seed: number;
  readonly born: number;
}

/** The marks the spells have left, drawn until each has lived its time. */
export class Lands {
  private readonly all: Land[] = [];

  /** Leaves a mark of `kind` at `place` (and to `to`, for a line) in `look`, `size` times its own, from `clock`. */
  add(
    kind: LandKind,
    place: Point,
    look: GlowElement,
    clock: number,
    { to = null, size = 1, seed = 0 }: { to?: Point | null; size?: number; seed?: number } = {},
  ): void {
    if (this.all.length >= MOST) this.all.shift();
    this.all.push({ kind, at: place, to, look, size, seed, born: clock });
  }

  /** Lets go of every mark: the room left, or its word stopped coming. */
  clear(): void {
    this.all.length = 0;
  }

  /** Every mark still living at `frame`'s clock, each as a job to run far to near with its distance from the eye. */
  jobs(frame: Frame, into: { far: number; run: () => void }[]): void {
    let kept = 0;
    for (const land of this.all) {
      const age = frame.clock - land.born;
      if (age < 0 || age >= LAND[land.kind]) continue;
      this.all[kept++] = land;
      const far = apartFrom(frame.eye, land.at);
      if (PICTURES.has(land.kind) && far < NEAR_EYE_M * land.size) continue;
      into.push({ far, run: () => drawLand(frame, land, age) });
    }
    this.all.length = kept;
  }
}

/** The whole frames a mark has lived. */
const framesOf = (age: number) => Math.floor(age / FRAME_S + 1e-6);

function drawLand(frame: Frame, land: Land, age: number): void {
  const { out, ground, eye } = frame;
  const { at, look, size, seed } = land;
  const lived = framesOf(age);
  switch (land.kind) {
    case 'impact':
    case 'pop': {
      const picture = impactSprite(land.kind === 'pop' ? Math.min(2, lived + 1) : lived);
      if (picture) billboard(out, picture, look, at, eye, { cell: CELL_M * size });
      break;
    }
    case 'nova': {
      // A star, a ring, a broken ring, for 3, 3 and 4 frames, with eight forks thrown out while it is young.
      const picture = impactSprite(lived < 3 ? 0 : lived < 6 ? 1 : 2);
      if (picture) billboard(out, picture, look, at, eye, { cell: CELL_M * 1.5 * size });
      if (lived < 6) for (let fork = 0; fork < 8; fork++) forkFrom(frame, at, look, seed * 8 + fork, lived);
      break;
    }
    case 'flame': {
      const foot: Point = [at[0], at[1], at[2] + 0.3 * size];
      billboard(out, flameSprite(Math.floor(lived / 3)), look, foot, eye, { cell: CELL_M * size });
      break;
    }
    case 'scorch': {
      if (!land.to) break;
      // A zigzag burnt into the ground, breaking up over its last half.
      const points = jagged(at, land.to, 9, 0.22, seed);
      const kept = points.filter((unused, joint) => hashOf(seed, joint, 7) > (age / LAND.scorch - 0.5) * 2);
      if (kept.length > 1) groundStrip(ground, kept, groundWidth(eye, at, 0.12), colourOf(look, DARK, 0.9));
      break;
    }
    case 'lane': {
      if (!land.to) break;
      // Fire along the ground where the bird flew, 1.5 m wide: a core of light flaring white-hot, flanked by its body
      // in broken tongues, all flickering and cooling to its dark as it dies.
      const flicker = Math.floor(frame.clock * 12);
      const share = age / LAND.lane;
      const core = share < 0.6 ? (hashOf(seed, flicker) < 0.25 ? HOT : LIGHT) : share < 0.85 ? BODY : DARK;
      groundStrip(ground, [at, land.to], 0.5 * size, colourOf(look, core, 0.85));
      const apart = Math.hypot(land.to[0] - at[0], land.to[1] - at[1]) || 1;
      const [aside, across] = [
        (-(land.to[1] - at[1]) / apart) * 0.5 * size,
        ((land.to[0] - at[0]) / apart) * 0.5 * size,
      ];
      for (const side of [-1, 1]) {
        if (share > 0.85 || hashOf(seed, side, flicker) < 0.35) continue;
        const shift = (point: Point): Point => [point[0] + aside * side, point[1] + across * side, point[2]];
        const width = 0.5 * size * (1 - share * 0.6);
        groundStrip(ground, [shift(at), shift(land.to)], width, colourOf(look, share < 0.6 ? BODY : DARK, 0.8));
      }
      break;
    }
    case 'slash': {
      if (!land.to) break;
      const width = 2 * (CELL_M / 2);
      lineRibbon(out, eye, [at, land.to], width, colourOf(look, lived === 0 ? HOT : LIGHT, 1), 0.0024);
      break;
    }
    case 'smoke': {
      const share = age / LAND.smoke;
      const risen: Point = [at[0], at[1], at[2] + share * 0.4];
      billboard(out, puffSprite(share, seed, 0.35 * size), look, risen, eye, { opacity: 0.85 });
      break;
    }
    case 'zap': {
      if (!land.to) break;
      boltLine(out, eye, jagged(at, land.to, 6, 0.12, seed * 13 + Math.floor(lived / 2)), look, {
        core: 0.03 * size,
        glow: 0.09 * size,
      });
      break;
    }
    case 'pillar': {
      if (!land.to) break;
      // A shaft of the element from on high, full at first and thinning in two steps.
      const thin = lived < 2 ? 1 : lived < 4 ? 0.6 : 0.3;
      const points = look === 2 ? jagged(at, land.to, 10, 0.35, seed + Math.floor(lived / 2)) : [at, land.to];
      boltLine(out, eye, points, look, { core: 0.14 * size * thin, glow: 0.4 * size * thin });
      break;
    }
    case 'ring': {
      // An Anima's release: a ring 4 m across, white-hot, then light, then its body, each a step further out.
      const step = stepOf(age / LAND.ring, 3);
      const radius = (2 + step * 0.8) * size;
      const width = groundWidth(eye, at, 0.25);
      groundRing(ground, at, radius - width, radius, colourOf(look, [HOT, LIGHT, BODY][step] ?? BODY, 1));
      break;
    }
  }
}

/** One of a nova's forks: a short jagged bolt from `from` out along its own way, struck afresh every two frames. */
function forkFrom(frame: Frame, from: Point, look: GlowElement, seed: number, lived: number): void {
  const [turn, rise] = [hashOf(seed, 1) * 2 * Math.PI, (hashOf(seed, 2) - 0.5) * 1.2];
  const reach = 0.45 + hashOf(seed, 3) * 0.35;
  const end: Point = [from[0] + Math.sin(turn) * reach, from[1] - Math.cos(turn) * reach, from[2] + rise * reach];
  const points = jagged(from, end, 4, 0.08, seed * 7 + Math.floor(lived / 2));
  boltLine(frame.out, frame.eye, points, look, { core: 0.02, glow: 0.06 });
}
