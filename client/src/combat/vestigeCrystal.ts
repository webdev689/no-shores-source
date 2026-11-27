// A Vestige as a crystal: a faceted plumbob gem crusted with shards, cel-shaded as it turns and haloed in its rarity's
// glow. Built as faces and baked here the first time a rarity is shown, into pixel pictures: the frames of its spin
// for the world, and a still for the screens.

import { RARITIES } from '../player/gear.ts';
import type { PixelPicture } from './dropPictures.ts';

type Vector = readonly [number, number, number];

interface Face {
  readonly corners: readonly [Vector, Vector, Vector];
  readonly normal: Vector;
  readonly tone: Vector;
}

/** A rarity's crystal: its facets' middle, light and dark tones, and the colour its halo glows. */
interface Tones {
  readonly middle: Vector;
  readonly light: Vector;
  readonly dark: Vector;
  readonly glow: Vector;
}

/** White, then each finer rarity's own colours (green, yellow, red and cyan blue), each with its glow. */
const GLOWS: readonly Vector[] = [
  [120, 240, 150],
  [250, 236, 120],
  [255, 120, 110],
  [120, 232, 250],
];
const WHITE: Tones = { middle: [206, 213, 226], light: [245, 248, 253], dark: [142, 150, 170], glow: [206, 218, 245] };
const channels = (hex: string): Vector =>
  [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as unknown as Vector;
const TONES: readonly Tones[] = RARITIES.map((rarity, index) =>
  index === 0
    ? WHITE
    : {
        middle: channels(rarity.colour),
        light: channels(rarity.lit),
        dark: channels(rarity.shade),
        glow: GLOWS[index - 1] ?? WHITE.glow,
      },
);

/** The gem, in its own units: its facets round the waist, the waist's radius, how far its crown rises over the waist
 *  and its pavilion falls under it, how unevenly the waist is cut, and its shards and their length. */
const FACETS = 5;
const WAIST = 0.4;
const CROWN = 1.55;
const PAVILION = 0.85;
const JITTER = 0.2;
const SHARDS = 40;
const SHARD_LENGTH = 0.05;
const MIDDLE = (CROWN - PAVILION) / 2;
const HALF = (CROWN + PAVILION) / 2;

/** The world's frame, 0.7 m tall in 27 pixels with the gem filling two thirds of it, and the frames of one turn. The
 *  screens' still is 18 pixels, drawn twice over in a glyph's 36. */
const FRAME_M = 0.7;
const FRAME_PIXELS = 27;
const PIXEL_M = FRAME_M / FRAME_PIXELS;
const FILL = 0.66;
export const SPIN_FRAMES = 12;
const STILL_PIXELS = 18;
/** The still fills more of its square than a frame, and is turned to show its broadest side. */
const STILL_FILL = 0.92;
const STILL_TURN = Math.PI / 2;
/** How far the gem's crown stands over its middle, metres. */
export const CROWN_M = (FILL / 2) * FRAME_M;

/** How far the gem leans back to show its crown; the shades each tone bands into, and the least light. */
const LEAN = (16 * Math.PI) / 180;
const BANDS = 5;
const AMBIENT = 0.3;
/** How dark the outline is, how much of the halo lights the gem and how much shows round it, and the halo's steps. */
const EDGE = 0.4;
const INNER = 0.55;
const OUTER = 0.9;
const HALO_STEPS = 8;

const TAU = Math.PI * 2;

/** A number from 0 to 1 drawn from `seed`, the same each time. */
export function hashOf(seed: number): number {
  const value = Math.sin(seed * 127.1 + 11.7) * 43758.5453;
  return value - Math.floor(value);
}

const vector = (axis: (along: 0 | 1 | 2) => number): Vector => [axis(0), axis(1), axis(2)];
const scaled = (from: Vector, factor: number): Vector => vector((along) => from[along] * factor);
const between = (from: Vector, to: Vector, share: number): Vector =>
  vector((along) => from[along] + (to[along] - from[along]) * share);
const minus = (from: Vector, less: Vector): Vector => vector((along) => from[along] - less[along]);
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function unit(from: Vector): Vector {
  return scaled(from, 1 / (Math.hypot(...from) || 1));
}

/** The light, from the upper left and in front. */
const LIGHT = unit([-0.45, 0.66, 0.5]);

const triangle = (first: Vector, second: Vector, third: Vector, tone: Vector): Face => ({
  corners: [first, second, third],
  normal: unit(cross(minus(second, first), minus(third, first))),
  tone,
});

/** One shard: a three-sided spike from `base` along `way`, `width` across its foot. */
function shard(faces: Face[], base: Vector, way: Vector, length: number, width: number, tones: Tones): void {
  const across = unit(cross(way, Math.abs(way[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const over = unit(cross(way, across));
  const foot = [0, 1, 2].map((third) => {
    const angle = (third / 3) * TAU;
    return vector((along) => base[along] + (across[along] * Math.cos(angle) + over[along] * Math.sin(angle)) * width);
  });
  const tip = vector((along) => base[along] + way[along] * length);
  foot.forEach((corner, side) => {
    const next = foot[(side + 1) % 3] ?? corner;
    faces.push(triangle(corner, next, tip, side % 2 ? tones.light : tones.middle));
  });
}

/** The gem's faces in a rarity's tones: its waist of facets, a tall crown, a short pavilion, and the shards. */
function crystalFaces(tones: Tones): Face[] {
  const faces: Face[] = [];
  const waist = Array.from({ length: FACETS }, (unused, facet): Vector => {
    const angle = (facet / FACETS) * TAU;
    const radius = WAIST * (0.82 + hashOf(facet) * JITTER);
    return [Math.cos(angle) * radius, (hashOf(facet + 20) - 0.5) * JITTER * 0.5, Math.sin(angle) * radius];
  });
  const top: Vector = [0, CROWN, 0];
  const bottom: Vector = [0, -PAVILION, 0];
  waist.forEach((point, facet) => {
    const next = waist[(facet + 1) % FACETS] ?? point;
    faces.push(triangle(point, next, top, facet % 2 ? tones.light : tones.middle));
    faces.push(triangle(point, next, bottom, facet % 2 ? tones.dark : tones.middle));
  });
  for (let each = 0; each < SHARDS; each++) {
    const upward = hashOf(each + 30) > 0.45;
    const base = between(waist[each % FACETS] ?? top, upward ? top : bottom, 0.2 + hashOf(each + 40) * 0.5);
    const out = unit([base[0], 0, base[2]]);
    const way = unit([
      out[0] + (hashOf(each + 50) - 0.5) * 0.7,
      (upward ? 0.5 : -0.5) + (hashOf(each + 51) - 0.5) * 0.4,
      out[2] + (hashOf(each + 52) - 0.5) * 0.7,
    ]);
    const length = SHARD_LENGTH + hashOf(each + 60) * SHARD_LENGTH;
    shard(faces, base, way, length, 0.06 + hashOf(each + 70) * 0.04, tones);
  }
  return faces;
}

/** A point of the gem leant back and turned `angle` round its axis. */
function posed(point: Vector, angle: number): Vector {
  const [leanCos, leanSin, turnCos, turnSin] = [Math.cos(LEAN), Math.sin(LEAN), Math.cos(angle), Math.sin(angle)];
  const leant: Vector = [point[0], point[1] * leanCos - point[2] * leanSin, point[1] * leanSin + point[2] * leanCos];
  return [leant[0] * turnCos + leant[2] * turnSin, leant[1], -leant[0] * turnSin + leant[2] * turnCos];
}

/** A tone lit by `lit`, in one of its bands. */
function shade(tone: Vector, lit: number): Vector {
  const share = (Math.max(lit, AMBIENT) - AMBIENT) / (1 - AMBIENT);
  const band = Math.round(share * (BANDS - 1)) / (BANDS - 1);
  return vector((along) => Math.min(255, tone[along] * (0.55 + 0.62 * band)));
}

/** A baked frame, `size` pixels square: each pixel's colour from 0 to 255 and how much of it shows, from 0 to 1. */
interface Baked {
  readonly size: number;
  readonly colours: readonly Vector[];
  readonly shown: readonly number[];
}

/** The gem turned `angle` round its axis: its faces drawn nearest first, its outline darkened, and its silhouette
 *  blurred into a halo of its glow, in steps. */
function bake(tones: Tones, angle: number, size: number, fill = FILL): Baked {
  const scale = (size * fill) / 2 / HALF;
  const middle = size / 2;
  const colour: Vector[] = Array.from({ length: size * size }, (): Vector => [0, 0, 0]);
  const depth = new Float64Array(size * size).fill(-Infinity);
  const hit = new Uint8Array(size * size);
  for (const face of crystalFaces(tones)) {
    const facing = posed(face.normal, angle);
    const shaded = shade(face.tone, Math.max(0, facing[0] * LIGHT[0] + facing[1] * LIGHT[1] + facing[2] * LIGHT[2]));
    const [first, second, third] = face.corners.map((corner): Vector => {
      const placed = posed([corner[0], corner[1] - MIDDLE, corner[2]], angle);
      return [middle + placed[0] * scale, middle - placed[1] * scale, placed[2]];
    }) as unknown as [Vector, Vector, Vector];
    const area = (second[1] - third[1]) * (first[0] - third[0]) + (third[0] - second[0]) * (first[1] - third[1]);
    if (Math.abs(area) < 1e-9) continue;
    const columns = [first[0], second[0], third[0]];
    const lines = [first[1], second[1], third[1]];
    for (
      let y = Math.max(0, Math.floor(Math.min(...lines)));
      y <= Math.min(size - 1, Math.ceil(Math.max(...lines)));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(...columns)));
        x <= Math.min(size - 1, Math.ceil(Math.max(...columns)));
        x++
      ) {
        const [across, down] = [x + 0.5 - third[0], y + 0.5 - third[1]];
        const toFirst = ((second[1] - third[1]) * across + (third[0] - second[0]) * down) / area;
        const toSecond = ((third[1] - first[1]) * across + (first[0] - third[0]) * down) / area;
        const toThird = 1 - toFirst - toSecond;
        if (toFirst < 0 || toSecond < 0 || toThird < 0) continue;
        const near = toFirst * first[2] + toSecond * second[2] + toThird * third[2];
        const pixel = y * size + x;
        if (near <= (depth[pixel] ?? 0)) continue;
        depth[pixel] = near;
        colour[pixel] = shaded;
        hit[pixel] = 1;
      }
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && hit[y * size + x] === 1;
  const glowMean = (tones.glow[0] + tones.glow[1] + tones.glow[2]) / 3;
  const colours: Vector[] = [];
  const shown: number[] = [];
  blurred(Array.from(hit), size).forEach((blur, pixel) => {
    const glow = Math.round(blur * HALO_STEPS) / HALO_STEPS;
    const [x, y] = [pixel % size, Math.floor(pixel / size)];
    const edge = !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1));
    const body = hit[pixel] ? scaled(colour[pixel] ?? tones.middle, edge ? EDGE : 1) : ([0, 0, 0] as Vector);
    const mix = hit[pixel] ? INNER : OUTER;
    colours.push(vector((along) => Math.min(255, body[along] + tones.glow[along] * glow * mix)));
    shown.push(hit[pixel] ? 1 : Math.min(1, (glowMean * glow * 1.3) / 255));
  });
  return { size, colours, shown };
}

/** A silhouette blurred twice by a box across and down, its reach growing with the frame. */
function blurred(values: readonly number[], size: number): number[] {
  const reach = Math.max(2, Math.round((size * 7) / 128));
  let field = [...values];
  for (let pass = 0; pass < 4; pass++) {
    const sideways = pass % 2 === 0;
    field = field.map((unused, pixel) => {
      const [x, y] = [pixel % size, Math.floor(pixel / size)];
      let [sum, count] = [0, 0];
      for (let step = -reach; step <= reach; step++) {
        const [stepX, stepY] = sideways ? [x + step, y] : [x, y + step];
        if (stepX < 0 || stepY < 0 || stepX >= size || stepY >= size) continue;
        sum += field[stepY * size + stepX] ?? 0;
        count++;
      }
      return sum / count;
    });
  }
  return field;
}

const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
const colourHex = (colour: Vector) => `#${hex(colour[0])}${hex(colour[1])}${hex(colour[2])}`;

/** Baked pixels as a picture: each pixel `colourOf` gives a colour a letter of the picture's colours ('a' the first),
 *  the rest dots. */
function pictured(baked: Baked, colourOf: (pixel: number) => string | null, pixelM?: number): PixelPicture {
  const colours: string[] = [];
  const letters = new Map<string, string>();
  const rows = Array.from({ length: baked.size }, (unused, y) =>
    Array.from({ length: baked.size }, (unusedToo, x) => {
      const colour = colourOf(y * baked.size + x);
      if (colour === null) return '.';
      const letter = letters.get(colour) ?? String.fromCharCode(97 + colours.length);
      if (!letters.has(colour)) {
        letters.set(colour, letter);
        colours.push(colour);
      }
      return letter;
    }).join(''),
  );
  return pixelM === undefined ? { rows, colours } : { rows, colours, pixelM };
}

/** One frame of a crystal in the world: the gem, drawn solid, and its halo, light added to what stands behind it. */
export interface CrystalFrame {
  readonly body: PixelPicture;
  readonly halo: PixelPicture;
}

const toneOf = (rarity: number): Tones => TONES[rarity] ?? (TONES[0] as Tones);
const frames = new Map<string, CrystalFrame>();
const stills = new Map<string, PixelPicture>();

/** A frame of a rarity's turn, baked the first time it is shown: one at a time, so a crystal first seen costs a frame
 *  of baking, not its whole turn. */
export function crystalFrame(rarity: number, frame: number): CrystalFrame {
  const key = `${rarity}:${frame}`;
  const kept = frames.get(key);
  if (kept) return kept;
  const baked = bake(toneOf(rarity), (frame / SPIN_FRAMES) * TAU, FRAME_PIXELS);
  const colourAt = (pixel: number) => baked.colours[pixel] ?? ([0, 0, 0] as Vector);
  const solid = (pixel: number) => (baked.shown[pixel] === 1 ? colourHex(colourAt(pixel)) : null);
  const glowing = (pixel: number) => {
    const alpha = baked.shown[pixel] ?? 0;
    return alpha > 0 && alpha < 1 ? colourHex(scaled(colourAt(pixel), alpha)) : null;
  };
  const made = { body: pictured(baked, solid, PIXEL_M), halo: pictured(baked, glowing, PIXEL_M) };
  frames.set(key, made);
  return made;
}

/** A rarity's crystal still, for the screens: its halo see-through, its colours then `#rrggbbaa`, which only an SVG
 *  reads; or without its halo, solid, for a mark in the world. */
export function crystalStill(rarity: number, halo = true, pixels = STILL_PIXELS): PixelPicture {
  const key = `${rarity}:${halo}:${pixels}`;
  const kept = stills.get(key);
  if (kept) return kept;
  const baked = bake(toneOf(rarity), STILL_TURN, pixels, STILL_FILL);
  const still = pictured(baked, (pixel) => {
    const alpha = baked.shown[pixel] ?? 0;
    const colour = colourHex(baked.colours[pixel] ?? [0, 0, 0]);
    if (alpha >= 1) return colour;
    return alpha > 0 && halo ? `${colour}${hex(alpha * 255)}` : null;
  });
  stills.set(key, still);
  return still;
}
