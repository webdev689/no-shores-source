// A dungeon's light: no sky and no sun. Each light burns in its kind's colour and fades to nothing at its reach,
// flickering as its kind does; a faint light lies everywhere, in the mood of the style of the cell, so a wall past
// every light still reads. The page lights the figures by the same sums the shader lights the walls by (`LIGHT_WGSL`).
import { type DungeonLayout, openAt, SIDE_STEPS, type StyleKey } from './dungeonLayout.ts';

type Colour = readonly [number, number, number];
type Point = readonly [number, number, number];

/** How a kind of light burns: its colour at its foot, how far it reaches (m), how much it flickers (0 steady), how
 *  fast it swells and fades, radians a second (none: it holds), and whether still water shows its gleam (unless
 *  false). */
export interface Burning {
  readonly colour: Colour;
  readonly reach: number;
  readonly flicker: number;
  readonly pulse?: number;
  readonly gleams?: boolean;
}

/** Each kind of light: a wall's torch, the fixtures (`FIXTURE`, in its order), the open portal, and the landmarks'
 *  glows past the fixtures': a spirit's pale green, daylight down a shaft, water's faint teal and a rune's violet.
 *  Water's glow is the water's own, lying on it, so it lights round it but makes no gleam on it. */
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
  water: { colour: [0.22, 0.55, 0.6], reach: 5, flicker: 0.1, gleams: false },
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
 *  the sanctum's pale gold, the caverns' deep teal, the mines' dusty brown, the chalk's pale cream and the barrow's
 *  grey-green. */
export const MOODS: Readonly<Record<StyleKey, Colour>> = {
  crypt: [0.17, 0.2, 0.28],
  halls: [0.2, 0.2, 0.22],
  cells: [0.18, 0.24, 0.18],
  sanctum: [0.26, 0.23, 0.17],
  caverns: [0.13, 0.24, 0.26],
  mines: [0.25, 0.2, 0.15],
  chalk: [0.26, 0.25, 0.22],
  barrow: [0.17, 0.22, 0.2],
};

/** Set in a cell's word for rock, over its look. */
export const CELL_ROCK = 1 << 16;

/** Each cell's word for the shader: its look for its mood, an open cell's own and rock the look of the first open cell
 *  beside it (east, south, west, north), so a face that lies a little into the rock, as a cave's wall bulges, takes the
 *  mood of its room; and on rock `CELL_ROCK`, so still water mirrors no flame that rock hides. */
export function cellWords(layout: DungeonLayout): Uint32Array {
  return Uint32Array.from(layout.cellLooks, (look, cell) => {
    if (look >= 0) return look;
    const [column, row] = [cell % layout.columns, Math.floor(cell / layout.columns)];
    const open = SIDE_STEPS.find(([east, south]) => openAt(layout, column + east, row + south));
    return (
      CELL_ROCK | (open ? Math.max(0, layout.cellLooks[(row + open[1]) * layout.columns + column + open[0]] ?? 0) : 0)
    );
  });
}

/** A flame's own glow, as the city's braziers glow; a crystal's, a fungus cap's, a lantern's glass and an ember's.
 *  A crystal and a lantern's glass are drawn by their facets, so each peaks at 1: brighter, every facet clips alike. */
export const FLAME: Colour = [1.4, 1.0, 0.5];
export const CRYSTAL_GLOW: Colour = [0.36, 0.86, 1];
export const FUNGUS_GLOW: Colour = [0.75, 1.35, 0.45];
export const LANTERN_GLOW: Colour = [1, 0.77, 0.43];
export const EMBER_GLOW: Colour = [0.9, 0.3, 0.08];
/** Candle wax, lit as a surface is. */
export const WAX: Colour = [0.86, 0.8, 0.66];

/** A light where it burns, its number among the dungeon's (no two flicker in step), and how it burns. */
export interface Light {
  readonly at: Point;
  readonly number: number;
  readonly burning: Burning;
}

/** Every light a dungeon burns but the portal's: its torches, its fixtures and its landmarks' glows, numbered in that
 *  order. */
export function burningOf(layout: DungeonLayout): Light[] {
  const torch = { ...LIGHT_KINDS.torch, reach: layout.torchReach };
  const placed =
    (kinds: readonly Burning[], first: number) =>
    ([x, y, z, kind]: readonly [number, number, number, number], index: number): Light => ({
      at: [x, y, z],
      number: first + index,
      burning: kinds[kind] ?? torch,
    });
  return [
    ...layout.torches.map(([x, y, z], number): Light => ({ at: [x, y, z], number, burning: torch })),
    ...layout.fixtures.map(placed(FIXTURE_KINDS, layout.torches.length)),
    ...layout.glows.map(placed(GLOW_KINDS, layout.torches.length + layout.fixtures.length)),
  ];
}

/**
 * The lights a frame is lit by: the nearest the eye by how far each reaches past it, so a brazier's wide light
 * outranks a candle's at one distance. Kept in order from frame to frame, where it barely changes, and sorted again in
 * place, so a frame allocates nothing.
 */
export class NearestLights {
  private readonly order: Light[];
  /** How far each light reaches past the eye, by its number. */
  private readonly past: Float64Array;
  private readonly portal: Light;
  private readonly chosen: Light[] = [];

  /** `burning` the lights always lit, each its own number, and `portal` the one lit only while it stands open. */
  constructor(burning: readonly Light[], portal: Light) {
    this.order = [...burning, portal];
    this.past = new Float64Array(Math.max(portal.number, ...burning.map((light) => light.number)) + 1);
    this.portal = portal;
  }

  /** The `most` lights nearest `eye`, the portal among them only while `open`: the same array every frame. */
  nearest(eye: Point, open: boolean, most: number): readonly Light[] {
    const { order, past, chosen } = this;
    for (let index = 0; index < order.length; index++) {
      const { at, number, burning } = order[index];
      const east = at[0] - eye[0];
      const south = at[1] - eye[1];
      const up = at[2] - eye[2];
      past[number] = Math.sqrt(east * east + south * south + up * up) - burning.reach;
    }
    if (!open) past[this.portal.number] = Infinity;
    for (let index = 1; index < order.length; index++) {
      const light = order[index];
      let place = index;
      for (; place > 0 && past[order[place - 1].number] > past[light.number]; place--) order[place] = order[place - 1];
      order[place] = light;
    }
    chosen.length = Math.min(most, open ? order.length : order.length - 1);
    for (let index = 0; index < chosen.length; index++) chosen[index] = order[index];
    return chosen;
  }
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

/** Where summed light, each channel, starts to ease, and what it eases toward and never reaches. */
export const SHOULDER = { knee: 0.8, ceiling: 1.4 } as const;

/** One channel of summed light as it is drawn: as it is up to the knee, and past it eased toward the ceiling, so
 *  where many lights burn together a wall keeps its colour and its picture rather than clipping to flat. */
export function shoulder(light: number): number {
  const over = Math.max(light - SHOULDER.knee, 0);
  return Math.min(light, SHOULDER.knee) + over / (1 + over / (SHOULDER.ceiling - SHOULDER.knee));
}

/** The light at a point at `time`, from the lights and the faint light of the mood there, eased past its knee: what
 *  a figure standing there is lit by. */
export function lightAt(lights: readonly Light[], point: Point, time: number, mood: Colour): [number, number, number] {
  const light: [number, number, number] = [...mood];
  for (const { at, number, burning } of lights) {
    const distance = Math.hypot(at[0] - point[0], at[1] - point[1], at[2] - point[2]);
    const strength =
      falloff(distance, burning.reach) * flicker(time, number, burning.flicker) * pulse(time, number, burning.pulse);
    for (let channel = 0; channel < 3; channel++)
      light[channel] = (light[channel] ?? 0) + (burning.colour[channel] ?? 0) * strength;
  }
  return [shoulder(light[0]), shoulder(light[1]), shoulder(light[2])];
}

const vector = (colour: Colour) => `vec3f(${colour.map((value) => value.toFixed(3)).join(', ')})`;

/** The same light in WGSL: `lights_at(point, normal, time, mood, span)` sums the lights `span` names of those the view
 *  holds (`reaching`), each turned by how squarely it faces the surface, the mood coming from no way at all, and eases
 *  the sum as `shoulder` does. */
export const LIGHT_WGSL = /* wgsl */ `
const LIGHT_KNEE = ${SHOULDER.knee.toFixed(3)};
const LIGHT_CEILING = ${SHOULDER.ceiling.toFixed(3)};
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
  // how much it flickers, how fast it pulses, and how much of a gleam still water shows of it
  shape: vec4f,
};

fn flicker(time: f32, number: f32, amount: f32) -> f32 {
  let wave = 0.07 * sin(time * 9.3 + number * 2.17) + 0.05 * sin(time * 15.1 + number * 4.41);
  return 1.0 - amount * (0.12 - wave);
}

fn pulse(time: f32, number: f32, rate: f32) -> f32 {
  return select(1.0, 0.8 + 0.2 * cos(time * rate + number * 2.17), rate > 0.0);
}

fn shoulder(light: f32) -> f32 {
  return min(light, LIGHT_KNEE) + max(light - LIGHT_KNEE, 0.0) / (1.0 + max(light - LIGHT_KNEE, 0.0) / (LIGHT_CEILING - LIGHT_KNEE));
}

fn lights_at(point: vec3f, normal: vec3f, time: f32, mood: vec3f, span: vec3u) -> vec3f {
  var light = mood;
  for (var order = 0u; order < span.y; order++) {
    let lamp = lights[reaching_light(span, order)];
    let towards = lamp.place.xyz - point;
    let distance = length(towards);
    let share = max(0.0, 1.0 - distance / lamp.colour.w);
    // Half the light wraps round, so a face turned a little away from a light still catches some.
    let facing = 0.5 + 0.5 * dot(normal, towards / max(distance, 1e-3));
    let burns = flicker(time, lamp.place.w, lamp.shape.x) * pulse(time, lamp.place.w, lamp.shape.y);
    light += lamp.colour.rgb * share * share * facing * burns;
  }
  return vec3f(shoulder(light.r), shoulder(light.g), shoulder(light.b));
}
`;
