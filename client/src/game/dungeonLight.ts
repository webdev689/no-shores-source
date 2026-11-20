// A dungeon's light: no sky and no sun. Each light burns in its kind's colour and fades to nothing at its reach,
// flickering as its kind does; a faint light lies everywhere, in the mood of the style of the cell, so a wall past
// every light still reads. The page lights the figures by the same sums the shader lights the walls by (`LIGHT_WGSL`).
import { type DungeonLayout, openAt, SIDE_STEPS, type StyleKey } from './dungeonLayout.ts';

type Colour = readonly [number, number, number];
type Point = readonly [number, number, number];

/** How a kind of light burns: its colour at its foot, how far it reaches (m), how much it flickers (0 steady), and
 *  how fast it swells and fades, radians a second (none: it holds). */
export interface Burning {
  readonly colour: Colour;
  readonly reach: number;
  readonly flicker: number;
  readonly pulse?: number;
}

/** Each kind of light: a wall's torch, the fixtures (`FIXTURE`, in its order), the open portal, and the landmarks'
 *  glows past the fixtures': a spirit's pale green, daylight down a shaft, water's faint teal and a rune's violet. */
export const LIGHT_KINDS = {
  torch: { colour: [1.5, 0.95, 0.5], reach: 8, flicker: 1 },
  brazier: { colour: [1.8, 0.9, 0.4], reach: 9, flicker: 1.2 },
  candles: { colour: [1.25, 1.0, 0.68], reach: 4.5, flicker: 0.7 },
  crystals: { colour: [0.45, 1.0, 1.25], reach: 7, flicker: 0.15 },
  lantern: { colour: [1.45, 1.05, 0.6], reach: 8, flicker: 0.35 },
  hearth: { colour: [1.9, 0.8, 0.32], reach: 9.5, flicker: 1.3 },
  fungus: { colour: [0.6, 1.2, 0.5], reach: 5.5, flicker: 0.1 },
  portal: { colour: [0.85, 0.95, 1.4], reach: 8, flicker: 0.2 },
  spirit: { colour: [0.8, 1.25, 0.9], reach: 6, flicker: 0.25 },
  daylight: { colour: [1.1, 1.2, 1.35], reach: 14, flicker: 0 },
  water: { colour: [0.22, 0.55, 0.6], reach: 5, flicker: 0.1 },
  rune: { colour: [0.85, 0.4, 1.4], reach: 6, flicker: 0, pulse: 0.9 },
} as const satisfies Record<string, Burning>;

/** The fixtures' kinds by their number in the layout. */
export const FIXTURE_KINDS: readonly Burning[] = [
  LIGHT_KINDS.brazier,
  LIGHT_KINDS.candles,
  LIGHT_KINDS.crystals,
  LIGHT_KINDS.lantern,
  LIGHT_KINDS.hearth,
  LIGHT_KINDS.fungus,
];

/** A landmark's glows by their kind's number (`landmarks.json` `glowKinds`): the fixtures' kinds, then its own. */
export const GLOW_KINDS: readonly Burning[] = [
  ...FIXTURE_KINDS,
  LIGHT_KINDS.spirit,
  LIGHT_KINDS.daylight,
  LIGHT_KINDS.water,
  LIGHT_KINDS.rune,
];

/** The faint light everywhere, by style: the crypt's cold grey-blue, the halls' plain grey, the cells' sickly green,
 *  the sanctum's pale gold, the caverns' deep teal and the mines' dusty brown. */
export const MOODS: Readonly<Record<StyleKey, Colour>> = {
  crypt: [0.17, 0.2, 0.28],
  halls: [0.2, 0.2, 0.22],
  cells: [0.18, 0.24, 0.18],
  sanctum: [0.26, 0.23, 0.17],
  caverns: [0.13, 0.24, 0.26],
  mines: [0.25, 0.2, 0.15],
};

/** Each cell's look for its mood: an open cell's own, and rock the look of the first open cell beside it (east, south,
 *  west, north), so a face that lies a little into the rock, as a cave's wall bulges, takes the mood of its room. */
export function moodLooks(layout: DungeonLayout): Uint32Array {
  return Uint32Array.from(layout.cellLooks, (look, cell) => {
    if (look >= 0) return look;
    const [column, row] = [cell % layout.columns, Math.floor(cell / layout.columns)];
    const open = SIDE_STEPS.find(([east, south]) => openAt(layout, column + east, row + south));
    return open ? Math.max(0, layout.cellLooks[(row + open[1]) * layout.columns + column + open[0]] ?? 0) : 0;
  });
}

/** A flame's own glow, as the city's braziers glow; a crystal's, a fungus cap's, a lantern's glass and an ember's. */
export const FLAME: Colour = [1.4, 1.0, 0.5];
export const CRYSTAL_GLOW: Colour = [0.5, 1.2, 1.4];
export const FUNGUS_GLOW: Colour = [0.75, 1.35, 0.45];
export const LANTERN_GLOW: Colour = [1.5, 1.15, 0.65];
export const EMBER_GLOW: Colour = [0.9, 0.3, 0.08];
/** Candle wax, lit as a surface is. */
export const WAX: Colour = [0.86, 0.8, 0.66];

/** A light where it burns, its number among the dungeon's (no two flicker in step), and how it burns. */
export interface Light {
  readonly at: Point;
  readonly number: number;
  readonly burning: Burning;
}

/** How bright a light burns at `time`, by its number and how much its kind flickers: a steady one never changes. */
export function flicker(time: number, number: number, amount = 1): number {
  const wave = 0.07 * Math.sin(time * 9.3 + number * 2.17) + 0.05 * Math.sin(time * 15.1 + number * 4.41);
  return 1 - amount * (0.12 - wave);
}

/** How bright a pulsing light burns at `time`, by its number: from full to six tenths and back, `rate` radians a
 *  second; a light that does not pulse is always full. */
export function pulse(time: number, number: number, rate = 0): number {
  return rate > 0 ? 0.8 + 0.2 * Math.cos(time * rate + number * 2.17) : 1;
}

/** How much of a light reaches `distance` metres off: all of it at the light, none at `reach`. */
export function falloff(distance: number, reach: number): number {
  const share = Math.max(0, 1 - distance / reach);
  return share * share;
}

/** The light at a point at `time`, from the lights and the faint light of the mood there: what a figure standing
 *  there is lit by. */
export function lightAt(lights: readonly Light[], point: Point, time: number, mood: Colour): [number, number, number] {
  const light: [number, number, number] = [...mood];
  for (const { at, number, burning } of lights) {
    const distance = Math.hypot(at[0] - point[0], at[1] - point[1], at[2] - point[2]);
    const strength =
      falloff(distance, burning.reach) * flicker(time, number, burning.flicker) * pulse(time, number, burning.pulse);
    for (let channel = 0; channel < 3; channel++)
      light[channel] = (light[channel] ?? 0) + (burning.colour[channel] ?? 0) * strength;
  }
  return light;
}

const vector = (colour: Colour) => `vec3f(${colour.map((value) => value.toFixed(3)).join(', ')})`;

/** The same light in WGSL: `lights_at(point, normal, time, mood)` sums the lights the view holds, each turned by how
 *  squarely it faces the surface; the mood comes from no way at all. */
export const LIGHT_WGSL = /* wgsl */ `
const FLAME = ${vector(FLAME)};
const CRYSTAL_GLOW = ${vector(CRYSTAL_GLOW)};
const FUNGUS_GLOW = ${vector(FUNGUS_GLOW)};
const LANTERN_GLOW = ${vector(LANTERN_GLOW)};
const EMBER_GLOW = ${vector(EMBER_GLOW)};
const WAX = ${vector(WAX)};
const PORTAL_LIGHT = ${vector(LIGHT_KINDS.portal.colour)};

struct Light {
  // where it burns, and its number
  place: vec4f,
  // its colour, and its reach
  colour: vec4f,
  // how much it flickers, and how fast it pulses
  shape: vec4f,
};

fn flicker(time: f32, number: f32, amount: f32) -> f32 {
  let wave = 0.07 * sin(time * 9.3 + number * 2.17) + 0.05 * sin(time * 15.1 + number * 4.41);
  return 1.0 - amount * (0.12 - wave);
}

fn pulse(time: f32, number: f32, rate: f32) -> f32 {
  return select(1.0, 0.8 + 0.2 * cos(time * rate + number * 2.17), rate > 0.0);
}

fn lights_at(point: vec3f, normal: vec3f, time: f32, mood: vec3f) -> vec3f {
  var light = mood;
  for (var index = 0u; index < u32(view.lights.x); index++) {
    let lamp = lights[index];
    let towards = lamp.place.xyz - point;
    let distance = length(towards);
    let share = max(0.0, 1.0 - distance / lamp.colour.w);
    // Half the light wraps round, so a face turned a little away from a light still catches some.
    let facing = 0.5 + 0.5 * dot(normal, towards / max(distance, 1e-3));
    let burns = flicker(time, lamp.place.w, lamp.shape.x) * pulse(time, lamp.place.w, lamp.shape.y);
    light += lamp.colour.rgb * share * share * facing * burns;
  }
  return light;
}
`;
