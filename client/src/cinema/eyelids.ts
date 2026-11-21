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
const LASHES = { top: { count: 72, long: [0.025, 0.07] }, bottom: { count: 46, long: [0.012, 0.034] } } as const;
/** The share of lashes left out, so the fringe is uneven. */
const GAPS = 0.12;

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

/** A lid as it is laid in its box: where its edge reaches furthest, how far its curve runs to each side of that, and
 *  its flat and curve's depth. */
interface Laid {
  readonly box: Box;
  readonly middle: number;
  readonly left: number;
  readonly right: number;
  readonly flat: number;
  readonly deep: number;
}

/** The light through a lid, in bands across its flat from the far edge of the view to its curve. */
const LIGHT_BANDS = 16;

/**
 * A lid at `shut` (its own, `lidShut`'s), `top` for the upper, with `light` (0 none to 1 a lit place) coming through
 * it as it shuts: its body lit more toward the eye, its edge's curve reaching each side of the view, darkening toward
 * the eye and fading into it, its lashes along the edge.
 */
export function lidOf(top: boolean, shut: number, light: number): Drawing {
  return (renderer, box, scale, clip, fade) => {
    const lit = light * smooth(0.45, 1, shut);
    const deep = Math.round(box.height * CURVE);
    const flat = box.height - deep;
    const middle = box.x + box.width * (top ? REACH_AT.top : REACH_AT.bottom);
    const laid: Laid = { box, middle, left: middle - box.x, right: box.x + box.width - middle, flat, deep };
    const soft = Math.max(2, Math.round(box.height * SOFT));
    const { quads } = renderer;
    // Light comes through the thin of the lid toward the eye more than through the brow and the cheek.
    const bodyAt = (near: number) => toward(LID, LID_LIT, lit * (0.4 + 0.6 * near), fade);
    for (let band = 0; band < LIGHT_BANDS; band++) {
      const [from, to] = [Math.round((band * flat) / LIGHT_BANDS), Math.round(((band + 1) * flat) / LIGHT_BANDS)];
      const near = (band + 0.5) / LIGHT_BANDS;
      const y = top ? box.y + from : box.y + box.height - to;
      quads.add({ x: box.x, y, width: box.width, height: to - from }, bodyAt(near), clip);
    }
    const body = bodyAt(1);
    for (let row = 0; row < deep; row++) {
      // How far down the curve this row lies, from its widest by the flat to its tip, its last rows soft.
      const down = (row + 0.5) / deep;
      const across = Math.sqrt(Math.max(0, 1 - down * down));
      const [left, right] = [laid.left * across, laid.right * across];
      const tone = toward(body, LID, down ** 1.5, fade * Math.min(1, (deep - row) / soft));
      const y = top ? box.y + flat + row : box.y + deep - 1 - row;
      const feather = Math.min(left, right, soft);
      quads.add({ x: middle - left + feather, y, width: left + right - 2 * feather, height: 1 }, tone, clip);
      const wide = feather / FEATHER_STEPS;
      for (let step = 0; step < FEATHER_STEPS; step++) {
        const faded = toward(tone, tone, 0, tone[3] * (1 - (step + 0.5) / FEATHER_STEPS));
        quads.add({ x: middle - left + feather - (step + 1) * wide, y, width: wide, height: 1 }, faded, clip);
        quads.add({ x: middle + right - feather + step * wide, y, width: wide, height: 1 }, faded, clip);
      }
    }
    lashes(quads, top, laid, { scale, clip }, fade * smooth(0.1, 0.55, shut));
  };
}

/** A lid's lashes along its edge, each from the edge out into the eye, turned away from the middle, unevenly set: some
 *  longer, some fainter, a few gaps. */
function lashes(
  quads: QuadList,
  top: boolean,
  laid: Laid,
  { scale, clip }: { readonly scale: number; readonly clip: Box },
  shown: number,
): void {
  if (shown <= 0.01) return;
  const { box, middle, left, right, flat, deep } = laid;
  const { count, long } = top ? LASHES.top : LASHES.bottom;
  const thick = Math.max(1, Math.round(scale * 1.6));
  const reach = 0.92;
  const seed = top ? 0 : 97;
  for (let index = 0; index < count; index++) {
    if (scatter(index + seed + 7) < GAPS) continue;
    const across = Math.max(
      -1,
      Math.min(1, ((index + 0.5 + (scatter(index + seed + 11) - 0.5) * 0.8) / count) * 2 - 1),
    );
    const edge = deep * Math.sqrt(Math.max(0, 1 - (across * reach) ** 2));
    const length = box.height * (long[0] + (long[1] - long[0]) * scatter(index + seed) ** 0.7);
    const turn = (across * 0.55 + (scatter(index + seed + 31) - 0.5) * 0.4) * (top ? 1 : -1);
    const y = top ? box.y + flat + edge - length * 0.15 : box.y + deep - edge - length * 0.85;
    const alpha = shown * (0.5 + 0.5 * scatter(index + seed + 53));
    const x = middle + across * reach * (across < 0 ? left : right);
    quads.add(
      { x: x - thick / 2, y, width: thick, height: length },
      toward(LASH, LASH, 0, alpha),
      clip,
      undefined,
      turn,
    );
  }
}
