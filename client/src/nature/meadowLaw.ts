// The meadow's law: which of the owner's sprites a tuft wears, how tall it stands and how its colours are moved by
// the ground under it. Flowers and taller grass gather where a patch is lush, dry tufts and short grass where it is
// poor, a bush now and then, every tuft its own size and whole patches running taller. The shader runs the same law
// from these numbers (meadowShader.ts); the tests hold the two together.
import { MEADOW_SPRITES } from './meadowArt.ts';
import { spriteBox, spriteMean, type SpriteBox } from './meadowAtlas.ts';
import { smooth } from './ground.ts';

/** A sprite's part in the meadow: its card's side over a tuft's height, how much of its own lean it keeps (a bush is
 *  woody and stands a third as crooked), and its share of the wind's lean (a bush six tenths, as shrubs sway). */
export interface Variant {
  readonly name: string;
  readonly scale: number;
  readonly stiff: number;
  readonly sway: number;
}

/** The five, in the atlas's order: a tuft's drawn top is about three quarters of its card, so 4/3 stands it as tall as
 *  its height; the bush at 2.25 stands half a metre to a metre and a half. */
export const VARIANTS: readonly Variant[] = [
  { name: 'tall', scale: 4 / 3, stiff: 1, sway: 1 },
  { name: 'short', scale: 4 / 3, stiff: 1, sway: 1 },
  { name: 'flowers', scale: 4 / 3, stiff: 1, sway: 1 },
  { name: 'dry', scale: 4 / 3, stiff: 1, sway: 1 },
  { name: 'bush', scale: 2.25, stiff: 0.3, sway: 0.6 },
];
export const [TALL, SHORT, FLOWERS, DRY, BUSH] = [0, 1, 2, 3, 4];
/** Each sprite's drawn box, in the atlas's order. */
export const BOXES: readonly SpriteBox[] = MEADOW_SPRITES.map(({ picture }) => spriteBox(picture));

/** A patch's tint read as how lush it is: 0 poor, 1 lush. */
export const LUSH = [0.3, 0.7] as const;
/** Each sprite's share at the poor end and the lush end. Bush, flowers and dry are taken off a tuft's draw in that
 *  order; of what is left, the short tuft takes its share and the tall the rest. */
export const SHARES = {
  bush: [0.008, 0.02],
  flowers: [0.01, 0.14],
  dry: [0.24, 0.02],
  short: [0.62, 0.3],
} as const;
/** A whole patch runs this much shorter (poor) to taller (lush), over every sprite's own size. */
export const PATCH_SCALE = [0.8, 1.25] as const;
/** A tuft's height: from this, and this much more as its draw rises, metres. */
export const HEIGHT_M = [0.246, 0.47] as const;

/** Which sprite a tuft wears, from its draw (0..1) and its patch's tint (0..1), and its card's side over its height. */
export function pick(draw: number, tint: number): { variant: number; scale: number; lush: number } {
  const lush = smooth(LUSH[0], LUSH[1], tint);
  const between = (pair: readonly [number, number]) => pair[0] * (1 - lush) + pair[1] * lush;
  const [bush, flowers, dry] = [between(SHARES.bush), between(SHARES.flowers), between(SHARES.dry)];
  let variant = TALL;
  if (draw < bush) variant = BUSH;
  else if (draw < bush + flowers) variant = FLOWERS;
  else if (draw < bush + flowers + dry) variant = DRY;
  else if ((draw - bush - flowers - dry) / (1 - bush - flowers - dry) < between(SHARES.short)) variant = SHORT;
  return { variant, scale: (VARIANTS[variant]?.scale ?? 1) * between(PATCH_SCALE), lush };
}

/** The green the art is anchored by: the tall tuft's mean. The owner's green is lighter and bluer than a grass ground,
 *  so each texel is moved by the ratio of its ground to the ground this green would stand a shade lighter over. */
export const GREEN = spriteMean(MEADOW_SPRITES[0]?.picture ?? { rows: [], colours: [] });
/** How much lighter than its ground a tuft's green stands, a channel each. */
export const TONE = [1.18, 1.24, 1.08] as const;
/** The ratio is held to this span, so a ground far off grass's tints the art and never repaints it. */
export const SHIFT = [0.5, 1.6] as const;
/** A texel takes the ground's hue as far as it is green: its green over its larger other channel, times this. Petals
 *  and dry stalks take only the ground's light. */
export const GREEN_EDGE = 12;

/** A texel's colour (0..1 a channel) over a ground (0..1), before the light: the shader's own law. */
export function texelOver(art: readonly number[], ground: readonly number[]): number[] {
  const shift = ground.map((value, channel) =>
    Math.min(SHIFT[1], Math.max(SHIFT[0], value / ((GREEN[channel] ?? 1) / (TONE[channel] ?? 1)))),
  );
  const light = (shift[0] ?? 1) * 0.299 + (shift[1] ?? 1) * 0.587 + (shift[2] ?? 1) * 0.114;
  const green = Math.min(1, Math.max(0, ((art[1] ?? 0) - Math.max(art[0] ?? 0, art[2] ?? 0)) * GREEN_EDGE));
  return art.map((value, channel) => value * (light + ((shift[channel] ?? 1) - light) * green));
}

/** The most a tuft's standing lean, wind lean (a gale's push, metres a metre of height) and its place's cluster carry
 *  it, as the shader lays them. */
const STANDING_LEAN = Math.hypot(0.25, 0.25);
const GALE_LEAN = 2.2 * 6 * (0.6 + 0.45) * 0.032;
const CLUSTER_M = 0.55;
/** The steepest ground a tuft grows on (meadowField.ts grassShare), its card's foot raised as far again. */
const STEEPEST = 0.45;

/** How high over its cell's ground a tuft's card reaches at most, and how far past its cell's edge, metres: a cell is
 *  culled by its box grown by these, so no tuft still in view is dropped with it. */
export function cardReach(): { tallest: number; widest: number } {
  const most = (HEIGHT_M[0] + HEIGHT_M[1]) * PATCH_SCALE[1];
  const sides = VARIANTS.map((variant, place) => {
    const box = BOXES[place] ?? { u0: 0, u1: 1, v0: 0, v1: 1 };
    const side = most * variant.scale;
    const lean = (STANDING_LEAN * variant.stiff + GALE_LEAN * variant.sway) * box.v1 * box.v1;
    return { side, across: side * (Math.max(0.5 - box.u0, box.u1 - 0.5) + lean), up: side * box.v1 };
  });
  const widest = Math.max(...sides.map(({ across }) => across)) + CLUSTER_M;
  const tallest = Math.max(...sides.map(({ up }) => up)) + widest * STEEPEST;
  return { tallest, widest };
}
