// The eyelids a waking eye sees from inside: two lids whose edges curve toward the eye and fade softly into it, the
// upper leading and the lower lagging, their lowest and highest points a little off the middle so they never meet as a
// mirror; a fringe of lashes along each edge, showing as the lids come down; and, shut, the warm red of light coming
// through them, as a lit place is seen with the eyes closed. Drawn by the interface's quads, a device pixel row at a
// time over each lid's curve.
import type { Drawing } from '../ui/node.ts';
import { type Box, type Colour, colourOf, type QuadList } from '../ui/quads.ts';

const LID = colourOf('#050403');
/** Light seen through a shut lid. */
const LID_LIT = colourOf('#3e1009');
const LASH = colourOf('#010101');
/** How deep each lid's curve toward the eye is, a share of its height, and how much of it fades softly into the eye. */
const CURVE = 0.22;
const SOFT = 0.045;
/** The soft edge's steps across, each fainter. */
const FEATHER_STEPS = 4;
/** Where across the view each lid's edge reaches the eye furthest: the upper's lowest point, the lower's highest. */
const REACH_AT = { top: 0.46, bottom: 0.53 } as const;
/** Each lid's lashes: how many along its edge, and how long, a share of the lid's height. */
const LASHES = { top: { count: 54, long: [0.035, 0.06] }, bottom: { count: 34, long: [0.016, 0.03] } } as const;

/** How far each lid has come down at `shut` (0 open to 1 shut): the upper leads and the lower lags, meeting shut. */
export function lidShut(shut: number): { readonly top: number; readonly bottom: number } {
  const share = Math.min(1, Math.max(0, shut));
  return { top: share ** 0.75, bottom: share ** 1.4 };
}

/** 0 to 1 between `from` and `to`, eased at both ends. */
const smooth = (from: number, to: number, value: number): number => {
  const share = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
};

/** `from` toward `to` by `share`, at `alpha`. */
const toward = (from: Colour, to: Colour, share: number, alpha: number): Colour => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
  alpha,
];

/** A number in [0, 1) that is the same for the same lash every frame. */
const scatter = (index: number): number => {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

/** A lid as it is laid in its box: where its edge reaches furthest, how wide its curve is, its flat and curve's depth. */
interface Laid {
  readonly box: Box;
  readonly middle: number;
  readonly widest: number;
  readonly flat: number;
  readonly deep: number;
}

/**
 * A lid at `shut` (its own, `lidShut`'s), `top` for the upper, with `light` (0 none to 1 a lit place) coming through
 * it as it shuts: its body flat, its edge's curve darkening toward the eye and fading into it, its lashes along the
 * edge.
 */
export function lidOf(top: boolean, shut: number, light: number): Drawing {
  return (renderer, box, scale, clip, fade) => {
    const body = toward(LID, LID_LIT, light * smooth(0.45, 1, shut), fade);
    const deep = Math.round(box.height * CURVE);
    const flat = box.height - deep;
    const middle = box.x + box.width * (top ? REACH_AT.top : REACH_AT.bottom);
    const laid: Laid = { box, middle, widest: Math.min(middle - box.x, box.x + box.width - middle), flat, deep };
    const soft = Math.max(2, Math.round(box.height * SOFT));
    const { quads } = renderer;
    quads.add({ x: box.x, y: top ? box.y : box.y + deep, width: box.width, height: flat }, body, clip);
    for (let row = 0; row < deep; row++) {
      // How far down the curve this row lies, from its widest by the flat to its tip, its last rows soft.
      const down = (row + 0.5) / deep;
      const half = laid.widest * Math.sqrt(Math.max(0, 1 - down * down));
      const tone = toward(body, LID, down ** 1.5, fade * Math.min(1, (deep - row) / soft));
      const y = top ? box.y + flat + row : box.y + deep - 1 - row;
      // Past the curve's widest the lid runs on flat to the view's edge.
      quads.add({ x: box.x, y, width: middle - laid.widest - box.x, height: 1 }, body, clip);
      quads.add({ x: middle + laid.widest, y, width: box.x + box.width - middle - laid.widest, height: 1 }, body, clip);
      const feather = Math.min(half, soft);
      quads.add({ x: middle - half + feather, y, width: 2 * (half - feather), height: 1 }, tone, clip);
      const wide = feather / FEATHER_STEPS;
      for (let step = 0; step < FEATHER_STEPS; step++) {
        const faded = toward(tone, tone, 0, tone[3] * (1 - (step + 0.5) / FEATHER_STEPS));
        const inner = half - feather + step * wide;
        quads.add({ x: middle - inner - wide, y, width: wide, height: 1 }, faded, clip);
        quads.add({ x: middle + inner, y, width: wide, height: 1 }, faded, clip);
      }
    }
    lashes(quads, top, laid, { scale, clip }, fade * smooth(0.1, 0.55, shut));
  };
}

/** A lid's lashes along its edge, each from the edge out into the eye, turned away from the middle. */
function lashes(
  quads: QuadList,
  top: boolean,
  laid: Laid,
  { scale, clip }: { readonly scale: number; readonly clip: Box },
  shown: number,
): void {
  if (shown <= 0.01) return;
  const { box, middle, widest, flat, deep } = laid;
  const { count, long } = top ? LASHES.top : LASHES.bottom;
  const thick = Math.max(1, Math.round(scale * 1.6));
  const reach = 0.92;
  for (let index = 0; index < count; index++) {
    const across = ((index + 0.5) / count) * 2 - 1;
    const edge = deep * Math.sqrt(Math.max(0, 1 - (across * reach) ** 2));
    const length = box.height * (long[0] + (long[1] - long[0]) * scatter(index + (top ? 0 : 97)));
    const turn = (across * 0.5 + (scatter(index + 31) - 0.5) * 0.16) * (top ? 1 : -1);
    const y = top ? box.y + flat + edge - length * 0.15 : box.y + deep - edge - length * 0.85;
    const alpha = shown * (0.75 + 0.25 * scatter(index + 53));
    const lash = { x: middle + across * widest * reach - thick / 2, y, width: thick, height: length };
    quads.add(lash, toward(LASH, LASH, 0, alpha), clip, undefined, turn);
  }
}
