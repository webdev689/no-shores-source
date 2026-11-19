// The spells' pictures, made cell by cell as the forge's figures are drawn pixel by pixel: each cell one stop of its
// element's glow, dark to white-hot, with nothing blended between, stood upright and turned to the eye as a figure's
// card is. A shape lights its own outline, its inside and its heart, so every picture reads as pixel art.
import { GLOW_RAMPS, type GlowElement } from '../elementGlow.ts';
import { PX_PER_M } from '../player/figures.ts';

type Point = readonly [number, number, number];
type Flat = readonly [number, number];

/** A spell's cell is two of a figure's pixels across (metres). */
export const CELL_M = 2 / PX_PER_M;
/** A cell with nothing in it. */
export const CLEAR = -1;
/** The stops of an element's glow: its dark, its body, its light and its white-hot. */
export const DARK = 0;
export const BODY = 1;
export const LIGHT = 2;
export const HOT = 3;
/** A picture nearer the eye than this (metres) is not drawn: it would fill the view. */
const NEAR_M = 0.6;

/** A picture of cells, row by row from the top: each one its element's stop, or CLEAR. */
export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly cells: Int8Array;
}

/** A sprite `width` by `height` whose cell `across` and `up` from its middle (in cells, up positive) is `stopAt`'s. */
export function sprite(width: number, height: number, stopAt: (across: number, up: number) => number): Sprite {
  const cells = new Int8Array(width * height);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      cells[row * width + column] = stopAt(column - (width - 1) / 2, (height - 1) / 2 - row);
  return { width, height, cells };
}

/** A sprite's stop at a column and a row; CLEAR off it. */
export function stopOf(picture: Sprite, column: number, row: number): number {
  if (column < 0 || row < 0 || column >= picture.width || row >= picture.height) return CLEAR;
  return picture.cells[row * picture.width + column] ?? CLEAR;
}

/** A number from 0 to 1 that only its whole-number parts choose: the same parts, the same number. */
export function hashOf(...parts: readonly number[]): number {
  let mixed = 0x811c9dc5;
  for (const part of parts) {
    mixed = Math.imul(mixed ^ (Math.floor(part) | 0), 0x01000193);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x2c1b3c6d);
    mixed ^= mixed >>> 12;
  }
  return (mixed >>> 0) / 4294967296;
}

/** Which of `steps` equal steps a share from 0 to 1 is in. */
export const stepOf = (share: number, steps: number): number =>
  Math.min(steps - 1, Math.max(0, Math.floor(share * steps)));

/** Whether a point lies inside a polygon, by the crossings of a ray from it. */
export function within(across: number, up: number, polygon: readonly Flat[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [fromX, fromY] = polygon[index] ?? [0, 0];
    const [toX, toY] = polygon[previous] ?? [0, 0];
    if (fromY > up !== toY > up && across < ((toX - fromX) * (up - fromY)) / (toY - fromY) + fromX) inside = !inside;
  }
  return inside;
}

/** A shape `width` by `height` lit as pixel art: its outline (a cell with a side off the shape) at `edge`, its inside
 *  at BODY or LIGHT, and its heart (`heart`) white-hot. */
function shaded(
  width: number,
  height: number,
  shape: { inside: (across: number, up: number) => boolean; heart: (across: number, up: number) => boolean },
  edge: number,
  fill = LIGHT,
): Sprite {
  const filled = sprite(width, height, (across, up) => (shape.inside(across, up) ? fill : CLEAR));
  return sprite(width, height, (across, up) => {
    const [column, row] = [across + (width - 1) / 2, (height - 1) / 2 - up];
    if (stopOf(filled, column, row) === CLEAR) return CLEAR;
    const sides = [stopOf(filled, column - 1, row), stopOf(filled, column + 1, row)];
    sides.push(stopOf(filled, column, row - 1), stopOf(filled, column, row + 1));
    if (sides.includes(CLEAR)) return edge;
    return shape.heart(across, up) ? HOT : fill;
  });
}

/**
 * Lays `picture` upright with its middle at `middle`, turned to an eye at `eye` about the upright as a figure's card is,
 * in `look`'s stops at `opacity` (below none, light added to what is behind), mirrored with `flip`: mark vertices.
 * Each row's run of one stop is one quad. A picture too near the eye is left out.
 */
export function billboard(
  out: number[],
  picture: Sprite,
  look: GlowElement,
  middle: Point,
  eye: Point,
  { flip = false, opacity = 1, cell = CELL_M }: { flip?: boolean; opacity?: number; cell?: number } = {},
): void {
  const [toX, toY] = [middle[0] - eye[0], middle[1] - eye[1]];
  if (Math.hypot(toX, toY, middle[2] - eye[2]) < NEAR_M) return;
  const apart = Math.hypot(toX, toY);
  const side = flip ? -1 : 1;
  const [rightX, rightY] = apart > 1e-6 ? [(-toY / apart) * side, (toX / apart) * side] : [side, 0];
  const ramp = GLOW_RAMPS[look];
  const corner = (across: number, up: number) => [
    middle[0] + rightX * across * cell,
    middle[1] + rightY * across * cell,
    middle[2] + up * cell,
  ];
  for (let row = 0; row < picture.height; row++) {
    const [top, bottom] = [picture.height / 2 - row, picture.height / 2 - row - 1];
    for (let column = 0; column < picture.width;) {
      const stop = stopOf(picture, column, row);
      let end = column + 1;
      while (end < picture.width && stopOf(picture, end, row) === stop) end++;
      const colour = ramp[stop];
      if (colour) {
        const [left, right] = [column - picture.width / 2, end - picture.width / 2];
        const quad = [corner(left, top), corner(right, top), corner(right, bottom), corner(left, bottom)];
        for (const index of [0, 1, 2, 0, 2, 3]) out.push(...(quad[index] ?? []), ...colour, opacity);
      }
      column = end;
    }
  }
}

/** A Tempest orb crackling: a white-hot heart in Volt's steps, its rim broken afresh at each `strike`, and three arcs
 *  thrown off it. */
export function orbSprite(strike: number): Sprite {
  const arcs = new Map<string, number>();
  for (let arc = 0; arc < 3; arc++) {
    let angle = hashOf(strike, arc) * 2 * Math.PI;
    for (let reach = 4.5; reach <= 6.6; reach += 0.7) {
      angle += (hashOf(strike, arc, reach * 10) - 0.5) * 0.8;
      arcs.set(
        `${Math.round(Math.cos(angle) * reach)},${Math.round(Math.sin(angle) * reach)}`,
        reach < 5.5 ? LIGHT : BODY,
      );
    }
  }
  return sprite(15, 15, (across, up) => {
    const apart = Math.hypot(across, up);
    if (apart <= 1.2) return HOT;
    if (apart <= 2.3) return LIGHT;
    if (apart <= 3.4) return BODY;
    if (apart <= 4.4) return hashOf(strike, across, up) < 0.18 ? CLEAR : DARK;
    return arcs.get(`${across},${up}`) ?? CLEAR;
  });
}

/** The Sunwell's sun: a white-hot disc in Blaze's steps ringed dark, its eight rays (long and short in turn) turned
 *  to `turn` (radians) in sixteenth-turns. */
export function sunSprite(turn: number): Sprite {
  const turned = Math.round((turn * 32) / (2 * Math.PI)) * ((2 * Math.PI) / 32);
  return sprite(37, 37, (across, up) => {
    const apart = Math.hypot(across, up);
    if (apart <= 4) return HOT;
    if (apart <= 6.8) return LIGHT;
    if (apart <= 9) return BODY;
    for (let ray = 0; ray < 8; ray++) {
      const angle = turned + (ray * Math.PI) / 4;
      const along = across * Math.cos(angle) + up * Math.sin(angle);
      const aside = Math.abs(-across * Math.sin(angle) + up * Math.cos(angle));
      if (along > 0 && aside <= 0.9 && apart <= (ray % 2 ? 13 : 17)) return apart <= 12 ? LIGHT : BODY;
    }
    return apart <= 10 ? DARK : CLEAR;
  });
}

/** A bird's shape in cells, facing along +across: its size, its body's half-length and half-height, its head's middle
 *  and radius, its beak and tail, its wing's root along its back (front, back, height), the wing's tip (its front and
 *  back) at each of its four beats, its eye if only that is white-hot (else its body and head are), and its outline's
 *  stop. */
export interface BirdShape {
  readonly width: number;
  readonly height: number;
  readonly body: Flat;
  readonly head: readonly [number, number, number];
  readonly beak: readonly Flat[];
  readonly tail: readonly Flat[];
  readonly shoulder: readonly [number, number, number];
  readonly tips: readonly (readonly [Flat, Flat])[];
  readonly eye: Flat | null;
  readonly edge: number;
}

/** The Dawnflare: a small bird of fire, its tail a fan of flame, lit white-hot through its body and head. */
export const FIRE_BIRD: BirdShape = {
  width: 33,
  height: 27,
  body: [6.5, 2.4],
  head: [7, 1.8, 2.5],
  beak: [
    [9, 2.8],
    [12.5, 1.4],
    [9, 0.6],
  ],
  tail: [
    [-5, 1.4],
    [-15, 4.8],
    [-15.5, 0.5],
    [-15, -3.6],
    [-5, -1.2],
  ],
  shoulder: [3, -3.5, 1.4],
  tips: [
    [
      [0.5, 12],
      [-5.5, 11],
    ],
    [
      [2, 6],
      [-5, 5],
    ],
    [
      [0.5, -11],
      [-5.5, -10],
    ],
    [
      [2, -4.5],
      [-5, -4],
    ],
  ],
  eye: null,
  edge: BODY,
};

/** The Duskraven: a raven of light, its wedge of a tail and long beak, white-hot only at its eye. */
export const RAVEN: BirdShape = {
  width: 29,
  height: 21,
  body: [5.5, 2],
  head: [5.5, 1.4, 2.1],
  beak: [
    [7.2, 2.2],
    [11, 0.8],
    [7.2, 0.1],
  ],
  tail: [
    [-4.5, 1],
    [-12, 2.6],
    [-12, -2.8],
    [-4.5, -1.1],
  ],
  shoulder: [2.5, -3, 1.2],
  tips: [
    [
      [0, 9.5],
      [-5, 8.5],
    ],
    [
      [1.5, 5],
      [-4.5, 4],
    ],
    [
      [0, -8.5],
      [-5, -7.5],
    ],
    [
      [1.5, -3.5],
      [-4.5, -3],
    ],
  ],
  eye: [6.5, 2],
  edge: BODY,
};

/** A bird at beat `beat` (0 to 3: up, half, down, half), its outline flickering afresh at each `strike` as a
 *  flame's or a light's does: a few of its cells gone, a few lit a step higher. */
export function birdSprite(shape: BirdShape, beat: number, strike: number): Sprite {
  const [halfLength, halfHeight] = shape.body;
  const [headX, headY, headRadius] = shape.head;
  const [front, back, rootUp] = shape.shoulder;
  const [tipFront, tipBack] = shape.tips[((beat % 4) + 4) % 4] ?? [
    [0, 0],
    [0, 0],
  ];
  const wing: Flat[] = [[front, rootUp], tipFront, tipBack, [back, rootUp]];
  const inBody = (across: number, up: number, share = 1) =>
    (across / (halfLength * share)) ** 2 + (up / (halfHeight * share)) ** 2 <= 1;
  const inHead = (across: number, up: number, share = 1) =>
    Math.hypot(across - headX, up - headY) <= headRadius * share;
  const { eye } = shape;
  const drawn = shaded(
    shape.width,
    shape.height,
    {
      inside: (across, up) =>
        inBody(across, up) ||
        inHead(across, up) ||
        within(across, up, shape.beak) ||
        within(across, up, shape.tail) ||
        within(across, up, wing),
      heart: (across, up) =>
        eye ? Math.hypot(across - eye[0], up - eye[1]) <= 0.75 : inBody(across, up, 0.5) || inHead(across, up, 0.45),
    },
    shape.edge,
  );
  const cells = drawn.cells.map((stop, index) => {
    if (stop !== shape.edge) return stop;
    const chance = hashOf(strike, index);
    return chance < 0.15 ? CLEAR : chance < 0.4 ? stop + 1 : stop;
  });
  return { ...drawn, cells };
}

/** One of Dusk Daggers' blades turned to `turn` (radians) in sixteenth-turns: a white-hot blade edged in light, its
 *  guard, its grip and its pommel. */
export function bladeSprite(turn: number): Sprite {
  const turned = Math.round((turn * 16) / (2 * Math.PI)) * ((2 * Math.PI) / 16);
  const [cos, sin] = [Math.cos(turned), Math.sin(turned)];
  return sprite(25, 25, (across, up) => {
    const along = across * cos + up * sin;
    const aside = Math.abs(-across * sin + up * cos);
    if (along >= -1 && along <= 10.2 && aside <= 1.6 - Math.max(0, along - 6) / 2.6) return aside < 0.7 ? HOT : LIGHT;
    if (along >= -2.6 && along < -1 && aside <= 3.4) return BODY;
    if (along >= -6.5 && along < -2.6 && aside <= 0.9) return DARK;
    if (along >= -7.6 && along < -6.5 && aside <= 1.5) return BODY;
    return CLEAR;
  });
}

/** How much of Vanish's puff is gone at each of its steps. */
const PUFF_GONE = [0, 0.2, 0.45, 0.7] as const;

/** Vanish's puff of dusk `share` of its way through (0 to 1): a blob that swells in four steps, its edge ragged by
 *  `seed`, thinning as it goes, dark with a few glints. */
export function puffSprite(share: number, seed: number): Sprite {
  const step = stepOf(share, 4);
  const radius = 7 + step * 4;
  return sprite(43, 43, (across, up) => {
    const apart = Math.hypot(across, up);
    if (apart > radius + (hashOf(seed, across, up, 1) - 0.5) * 3) return CLEAR;
    const chance = hashOf(seed, across, up, step + 2);
    if (chance < (PUFF_GONE[step] ?? 0)) return CLEAR;
    if (chance > 0.94) return LIGHT;
    return apart < radius * 0.5 ? BODY : DARK;
  });
}

/** Mend's burst `share` of its way through: a white-hot flash with a cross through it, then a ring swelling and
 *  cooling in four steps. */
export function novaSprite(share: number): Sprite {
  const step = stepOf(share, 4);
  const radius = 2.5 + step * 2.5;
  const ring = [HOT, HOT, LIGHT, BODY][step] ?? BODY;
  return sprite(21, 21, (across, up) => {
    const apart = Math.hypot(across, up);
    if (Math.abs(apart - radius) <= 0.75) return ring;
    if (step === 0 && apart <= 1.5) return HOT;
    if (step < 2 && apart < radius && (across === 0 || up === 0)) return LIGHT;
    return CLEAR;
  });
}

/** A star of four points: white-hot in the middle, its arms cooling to the tips. */
export const STAR: Sprite = sprite(5, 5, (across, up) => {
  if (across !== 0 && up !== 0) return CLEAR;
  return [HOT, LIGHT, BODY][Math.abs(across) + Math.abs(up)] ?? CLEAR;
});

/** A mote: one cell at each stop. */
export const MOTES: readonly Sprite[] = [DARK, BODY, LIGHT, HOT].map((stop) => sprite(1, 1, () => stop));

/** A glint: a cross of five cells, its middle at each stop and its arms a stop darker. */
export const GLINTS: readonly Sprite[] = [DARK, BODY, LIGHT, HOT].map((stop) =>
  sprite(3, 3, (across, up) => {
    if (across !== 0 && up !== 0) return CLEAR;
    return across === 0 && up === 0 ? stop : Math.max(DARK, stop - 1);
  }),
);
