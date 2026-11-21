// The eyelids a waking eye sees from inside: two lids whose edges curve away from the eye's middle, so the opening
// between them is an almond, widest a little off the middle and closing from its corners; the upper lid leading and
// the lower lagging; a soft edge into the eye; a fringe of lashes along each edge, showing as the lids come down; and,
// shut, the warm red of light coming through them, more toward the eye, as a lit place is seen with the eyes closed.
// Drawn by the interface's quads, a device pixel row at a time over each lid's edge.
import type { Drawing } from '../ui/node.ts';
import { type Box, type Colour, colourOf, type QuadList } from '../ui/quads.ts';

const LID = colourOf('#050403');
/** Light seen through a shut lid. */
const LID_LIT = colourOf('#3e1009');
const LASH = colourOf('#010101');
/** How much further toward the eye a lid's corners reach than its middle, a share of its height, and how much of its
 *  edge fades softly into the eye. */
const CURVE = 0.22;
const SOFT = 0.045;
/** The soft edge's steps across, each fainter. */
const FEATHER_STEPS = 4;
/** Where across the view each lid's edge stands furthest from the eye: the opening's widest. */
const REACH_AT = { top: 0.46, bottom: 0.53 } as const;
/** Each lid's lashes: how many along its edge, and how long, a share of the lid's height. */
const LASHES = { top: { count: 72, long: [0.025, 0.07] }, bottom: { count: 46, long: [0.012, 0.034] } } as const;
/** The share of lashes left out, so the fringe is uneven. */
const GAPS = 0.12;
/** The light through a lid, in bands across its body from the far edge of the view to its edge. */
const LIGHT_BANDS = 16;

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

/** How far a lid `tall` CSS pixels stands down from its place (the upper's; the lower's is up, the same) at `shut`, its
 *  own (`lidShut`): wholly off the view open, and shut past its own edge's depth, so its middle and its corners meet
 *  the other lid's with no crack between. */
export function lidDrop(top: boolean, shut: number, tall: number): number {
  const down = (shut - 1) * 1.04 * tall + shut * shut * (CURVE + SOFT) * tall;
  return top ? down : -down;
}

/** How far toward the eye a lid's edge reaches `along` it (0 its middle, 1 a corner), a share of its curve: none at
 *  its middle, all of it at its corners. */
const reachAt = (along: number): number => 1 - Math.sqrt(Math.max(0, 1 - along * along));
/** How far along a lid's edge it reaches `reach` of its curve toward the eye: `reachAt` turned about. */
const alongAt = (reach: number): number => (reach <= 0 ? 0 : reach >= 1 ? 1 : Math.sqrt(1 - (1 - reach) ** 2));

/** A lid as it is laid in its box: the edge's middle, how far its edge runs to each side of that, and its body's and
 *  curve's depth. */
interface Laid {
  readonly box: Box;
  readonly middle: number;
  readonly left: number;
  readonly right: number;
  readonly flat: number;
  readonly deep: number;
}

/**
 * A lid at `shut` (its own, `lidShut`'s), `top` for the upper, with `light` (0 none to 1 a lit place) coming through
 * it as it shuts: its body lit more toward the eye, its edge curving away from the eye's middle out to each side of the
 * view, darkening toward the eye and fading into it, its lashes along the edge.
 */
export function lidOf(top: boolean, shut: number, light: number): Drawing {
  return (renderer, box, scale, clip, fade) => {
    const lit = light * smooth(0.45, 1, shut);
    const deep = Math.round(box.height * CURVE);
    const flat = box.height - deep;
    const soft = Math.max(2, Math.round(box.height * SOFT));
    const middle = box.x + box.width * (top ? REACH_AT.top : REACH_AT.bottom);
    const laid: Laid = { box, middle, left: middle - box.x, right: box.x + box.width - middle, flat, deep };
    const { quads } = renderer;
    // Rows by their depth toward the eye from the body's edge: the body above `-soft`, the edge's rows below it.
    const rowAt = (depth: number, rows: number): Box => ({
      x: box.x,
      y: top ? box.y + flat + depth : box.y + deep - depth - rows,
      width: box.width,
      height: rows,
    });
    // Light comes through the thin of the lid toward the eye more than through the brow and the cheek.
    const bodyAt = (near: number) => toward(LID, LID_LIT, lit * (0.4 + 0.6 * near), fade);
    const solid = flat - soft;
    // The body runs on past its box, as far again, so a lid pushed past its place leaves none of the view behind it.
    quads.add({ ...box, y: top ? box.y - box.height : box.y + box.height }, bodyAt(0), clip);
    for (let band = 0; band < LIGHT_BANDS; band++) {
      const [from, to] = [Math.round((band * solid) / LIGHT_BANDS), Math.round(((band + 1) * solid) / LIGHT_BANDS)];
      quads.add(rowAt(from - flat, to - from), bodyAt((band + 0.5) / LIGHT_BANDS), clip);
    }
    const body = bodyAt(1);
    const side = (from: number, to: number, y: number, colour: Colour) => {
      quads.add({ x: middle - to * laid.left, y, width: (to - from) * laid.left, height: 1 }, colour, clip);
      quads.add({ x: middle + from * laid.right, y, width: (to - from) * laid.right, height: 1 }, colour, clip);
    };
    for (let depth = -soft; depth < deep; depth++) {
      // Where along the edge this row is covered: wholly past where the edge reaches a soft width beyond it, fading
      // in from where the edge reaches it, so the edge is as soft along its corners as across its middle.
      const into = depth + 0.5;
      const tone = toward(body, LID, Math.max(0, into / deep) ** 1.5, fade);
      const { y } = rowAt(depth, 1);
      side(alongAt((into + soft) / deep), 1, y, tone);
      for (let step = 0; step < FEATHER_STEPS; step++) {
        const [near, far] = [into + (step * soft) / FEATHER_STEPS, into + ((step + 1) * soft) / FEATHER_STEPS];
        const shown = toward(tone, tone, 0, fade * ((step + 0.5) / FEATHER_STEPS));
        side(alongAt(near / deep), alongAt(far / deep), y, shown);
      }
    }
    // The lashes show as the lid comes down, and go as the lids meet.
    lashes(quads, top, laid, { scale, clip }, fade * smooth(0.1, 0.55, shut) * (1 - smooth(0.96, 1, shut)));
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
    const jitter = (scatter(index + seed + 11) - 0.5) * 0.8;
    const across = Math.max(-1, Math.min(1, ((index + 0.5 + jitter) / count) * 2 - 1));
    const edge = deep * reachAt(Math.abs(across) * reach);
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
