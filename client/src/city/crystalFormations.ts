// The Lattice's crystal as the page draws it in a ruin: six-sided spires (a body tapering into a pointed tip, as the
// city crate's `spire`) and shards (one six-sided point), gathered into a few dozen formations made once, alike on
// every machine, and meshed as forged models are, so each is placed by instance as often as the ruin needs it, turned
// and sized there. Each formation's foot is at its origin and it grows out along its own east (`FORMATIONS`).
import { randomFromSeed } from '../models/random.ts';
import type { MeshData } from './mesh.ts';
import { type Solid, solidReach } from './plan.ts';
import { solidModel } from './solidModel.ts';
import { solidTurn } from './solidMesh.ts';

/** The faces round a spire; its body's share of its height, its body's top a share of its width (as the crate's). */
const SPIRE_SIDES = 6;
const BODY_SHARE = 0.75;
const BODY_TOP = 0.8;
/** A vein's formation: two shards a step apart up a wall, stacked a formation every two steps. */
export const VEIN_STEP_M = 1.1;

type Point = [number, number, number];
type Draw = () => number;

/** A spire of crystal on `foot`: a six-sided body tapering into a pointed tip, turned, leaned toward its own +y and
 *  rolled about its own y, radians. */
export function spire(
  foot: readonly number[],
  height: number,
  width: number,
  turns: readonly number[],
): [Solid, Solid] {
  const [turn = 0, lean = 0, roll = 0] = turns;
  const body: Solid = {
    shape: 'column',
    sides: SPIRE_SIDES,
    top: BODY_TOP,
    at: [foot[0], foot[1], foot[2]],
    size: [width, width, height * BODY_SHARE],
    turn,
    lean,
    roll,
    material: 'crystal',
  };
  const rise = solidTurn(body, [0, 0, height * BODY_SHARE]);
  const tip: Solid = {
    ...body,
    top: 0,
    at: [foot[0] + rise[0], foot[1] + rise[1], foot[2] + rise[2]],
    size: [width * BODY_TOP, width * BODY_TOP, height * (1 - BODY_SHARE)],
  };
  return [body, tip];
}

/** A shard: one six-sided point. */
function shard(foot: readonly number[], height: number, turns: readonly number[]): Solid {
  const [turn = 0, lean = 0, roll = 0] = turns;
  const width = height / 3.5;
  return {
    shape: 'column',
    sides: SPIRE_SIDES,
    top: 0,
    at: [foot[0], foot[1], foot[2]],
    size: [width, width, height],
    turn,
    lean,
    roll,
    material: 'crystal',
  };
}

export const between = (draw: Draw, least: number, most: number): number => least + (most - least) * draw();
export const countOf = (draw: Draw, least: number, most: number): number =>
  least + Math.floor((most - least + 1) * draw());

/** The turns that lean a solid out along a direction (east, south), swung up to `swing` radians either way. */
export function leaningOut(draw: Draw, out: readonly number[], lean: number, swing: number): number[] {
  const angle = Math.atan2(out[1], out[0]) + (draw() - 0.5) * 2 * swing;
  return [Math.atan2(-Math.cos(angle), Math.sin(angle)), lean, (draw() - 0.5) * 0.4];
}

/** A kind of formation and how it is made: its spires (count, heights, lean), then its shards, spread along its own
 *  y and out along its x. `radial` spreads and leans each piece away from the foot instead; `main` stands its first
 *  spire at the most height, nearly upright, in the middle; `climbs` stacks its shards up a wall a step apart, and
 *  `face` spreads them over a wall's face `face` metres high. */
type Kind = {
  readonly spires: readonly [number, number, number, number, number, number];
  readonly shards: readonly [number, number, number, number, number, number];
  readonly spread: number;
  readonly radial?: boolean;
  readonly main?: boolean;
  readonly climbs?: boolean;
  readonly face?: number;
};
const NONE = [0, 0, 0, 0, 0, 0] as const;
// [least count, most count, least height m, most height m, least lean, most lean]
const KINDS = {
  breakHeavy: { spires: [3, 4, 3, 6.5, 0.15, 0.55], shards: [8, 12, 0.5, 1.6, 0.5, 1.2], spread: 2 },
  breakLight: { spires: [2, 3, 1.5, 3.2, 0.15, 0.55], shards: [4, 7, 0.4, 1.2, 0.5, 1.2], spread: 1.6 },
  vein: { spires: NONE, shards: [2, 2, 0.5, 1.3, 0.6, 1], spread: 0.15, climbs: true },
  doorway: { spires: NONE, shards: [4, 6, 0.8, 2.2, 0.2, 0.7], spread: 0.7 },
  sill: { spires: NONE, shards: [3, 3, 0.4, 1, 0.4, 0.9], spread: 0.5 },
  patch: { spires: NONE, shards: [4, 7, 0.4, 1.6, 0.1, 0.8], spread: 1.2, radial: true },
  heap: { spires: [3, 5, 1.5, 4.5, 0.1, 0.6], shards: [4, 7, 0.5, 1.5, 0.4, 1], spread: 2.5, radial: true },
  sheet: { spires: NONE, shards: [16, 22, 0.3, 0.8, 0.5, 1], spread: 2, face: 3 },
  mass: {
    spires: [6, 9, 2, 6, 0.1, 0.6],
    shards: [6, 10, 0.4, 1.2, 0.4, 1],
    spread: 3,
    radial: true,
    main: true,
  },
  great: {
    spires: [5, 7, 5, 18, 0.25, 0.7],
    shards: [6, 10, 0.8, 3, 0.4, 1.1],
    spread: 4,
    radial: true,
    main: true,
  },
} as const satisfies Record<string, Kind>;
export type KindName = keyof typeof KINDS;
/** The formations made of each kind, so no two neighbours need match. */
const OF_EACH = 4;
const KIND_NAMES = Object.keys(KINDS) as KindName[];

/** A formation made from its kind's numbers and its own seed, its foot at the origin, growing out along +east. */
function formation(kind: Kind, seed: number): Solid[] {
  const random = randomFromSeed(seed);
  const draw: Draw = () => random.next();
  const solids: Solid[] = [];
  const pieces = (
    numbers: readonly number[],
    lay: (foot: Point, height: number, turns: number[]) => void,
    near = 1,
    main = false,
  ) => {
    const [least, most, low, high, leanLeast, leanMost] = numbers;
    for (let piece = 0, count = countOf(draw, least, most); piece < count; piece++) {
      const first = piece === 0 && (kind.radial || main);
      const spread = kind.spread * (first ? 0 : near);
      const foot: Point = kind.climbs
        ? [0.12, (draw() - 0.5) * 2 * spread, piece * VEIN_STEP_M]
        : kind.face
          ? [0.1, (draw() - 0.5) * 2 * spread, draw() * kind.face]
          : kind.radial
            ? [(draw() - 0.5) * 2 * spread, (draw() - 0.5) * 2 * spread, 0]
            : [draw() * 0.3, (draw() - 0.5) * 2 * spread, 0];
      const out = kind.radial ? [foot[0] || 1e-3, foot[1]] : [1, 0];
      const standing = main && piece === 0;
      const height = standing ? high : between(draw, low, high * (main ? 0.75 : 1));
      const lean = standing ? leanLeast * 0.3 : between(draw, leanLeast, leanMost);
      lay(foot, height, leaningOut(draw, out, lean, kind.radial ? 3.2 : 0.7));
    }
  };
  pieces(
    kind.spires,
    (foot, height, turns) => solids.push(...spire(foot, height, Math.max(0.3, height / 6), turns)),
    0.4,
    kind.main,
  );
  pieces(kind.shards, (foot, height, turns) => solids.push(shard(foot, height, turns)));
  return solids;
}

/** Every formation's solids, `OF_EACH` of each kind in `KINDS`' order, made once alike on every machine. */
export const FORMATIONS: readonly (readonly Solid[])[] = KIND_NAMES.flatMap((name, kind) =>
  Array.from({ length: OF_EACH }, (_unused, made) => formation(KINDS[name], 0x6c617474 + kind * 97 + made)),
);

/** How far each formation reaches from its foot across the ground, and how high it stands, metres, at its own size. */
export const FORMATION_REACH: readonly number[] = FORMATIONS.map((solids) =>
  Math.max(...solids.map((solid) => Math.hypot(solid.at[0], solid.at[1]) + solidReach(solid))),
);
export const FORMATION_HEIGHT: readonly number[] = FORMATIONS.map((solids) =>
  Math.max(...solids.map((solid) => solid.at[2] + solidTurn(solid, [0, 0, solid.size[2]])[2])),
);

/** Each formation meshed in a forged model's frame (x east, y up, z north), in the crystal's layer. */
export function formationMeshes(layer: number): MeshData[] {
  return FORMATIONS.map((solids) => solidModel(solids.map((solid) => ({ solid, layer }))));
}

/** Which formation of a kind, by a draw. */
export const formationOf = (name: KindName, draw: Draw): number =>
  KIND_NAMES.indexOf(name) * OF_EACH + Math.floor(draw() * OF_EACH);
/** The kind a formation is of. */
export const kindOf = (formationIndex: number): KindName => KIND_NAMES[Math.floor(formationIndex / OF_EACH)];
