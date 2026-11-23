// The Appearance screen's display, after Destiny's: the player's figure large, turning slowly a whole view at a time
// (still where less motion is asked for), with no horse: a horse is worn in the Mount slot. Shown a dress, it draws
// that one: the player's own, or with the hovered piece worn. Pictures come from the forge, composed once and kept;
// each frame shows what has come, the last view drawn standing until the next one has. The horse's own picture, which
// a barding's tile is cut from, is drawn here too (`horseOf`).

import { HORSE_LAYER } from '../../forge/looks.ts';
import { bardingLayer } from '../../forge/cosmetics.ts';
import type { Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import { drawnBounds } from '../../player/iconFit.ts';
import type { Picture } from '../../player/picture.ts';
import type { Node } from '../../ui/node.ts';

/** The figure's turn, a view a step: the forge's five views round to the back, then the other side mirrored. */
const TURN: readonly (readonly [view: number, flip: boolean])[] = [
  [0, false],
  [1, false],
  [2, false],
  [3, false],
  [4, false],
  [3, true],
  [2, true],
  [1, true],
];
/** How long the figure shows each view, in milliseconds. */
const TURN_MS = 1200;
/** The horse's view: from the side, as Destiny shows a Sparrow. */
const HORSE_VIEW = 2;
/** Pictures kept between frames, the least lately shown let go past this many. */
const KEPT_MOST = 96;
/** Each picture asked for, by what it draws: the forge's promise, and once it has come, the picture (null if none). */
const kept = new Map<string, { readonly asked: Promise<Picture | null>; come?: Picture | null }>();

/** A forge picture of a dress, composed once and kept by what of the dress it draws (`drawn`, the whole dress unless
 *  told): the picture once it has come, null if it could not be drawn, undefined while it is drawn. */
function pictureOf(
  forge: Cards,
  dress: Dress,
  anim: string,
  view: number,
  flip: boolean,
  alone?: readonly string[],
  drawn: unknown = dress,
): Picture | null | undefined {
  const key = JSON.stringify([drawn, anim, view, flip, alone ?? null]);
  const found = kept.get(key);
  if (found) {
    kept.delete(key);
    kept.set(key, found);
    return found.come;
  }
  // A picture that failed is not kept, so it is asked for again once the forge's store retries its strips.
  const entry: { readonly asked: Promise<Picture | null>; come?: Picture | null } = {
    asked: forge.picture(dress, anim, view, 0, alone, flip).catch(() => {
      if (kept.get(key) === entry) kept.delete(key);
      return null;
    }),
  };
  void entry.asked.then((picture) => {
    entry.come = picture;
    // Named by what it draws, so a picture asked for again after it was let go lies where it lay in the atlas.
    if (picture) named.set(picture, `forge ${numberOf(key)}`);
  });
  kept.set(key, entry);
  if (kept.size > KEPT_MOST) kept.delete(kept.keys().next().value ?? '');
  return undefined;
}

/** A dress as its figure stands: no horse under it, so its coat and barding change nothing drawn. */
export const unhorsed = (dress: Dress): Dress => ({ ...dress, outfit: { ...dress.outfit, coat: null, barding: null } });

/** The horse of a dress by itself: its coat, and its barding stacked over it; nothing of the rider changes it but the
 *  body it is drawn for. Undefined while it is drawn. */
export function horseOf(forge: Cards, dress: Dress, view = HORSE_VIEW): Picture | null | undefined {
  const barding = bardingLayer(dress.outfit.barding);
  const { body, outfit } = dress;
  const layers = barding ? [HORSE_LAYER, barding] : [HORSE_LAYER];
  return pictureOf(forge, dress, 'horseidle', view, false, layers, [body, outfit.coat ?? null, barding]);
}

/** Each picture's name for the atlas, by the picture it is. */
const named = new WeakMap<Picture, string>();
let pictures = 0;
/** Each drawing's number, by what it draws. */
const numbers = new Map<string, number>();
const numberOf = (key: string): number => {
  let number = numbers.get(key);
  if (number === undefined) numbers.set(key, (number = pictures++));
  return number;
};
/** Where each picture's drawn pixels lie, found once. */
const bounds = new WeakMap<Picture, readonly [number, number, number, number]>();
function boundsOf(picture: Picture): readonly [number, number, number, number] {
  let found = bounds.get(picture);
  if (!found) bounds.set(picture, (found = drawnBounds(picture.width, picture.height, picture.pixels) ?? [0, 0, 0, 0]));
  return found;
}
export const pictureName = (picture: Picture): string => {
  let name = named.get(picture);
  if (!name) named.set(picture, (name = `forge ${pictures++}`));
  return name;
};

/** A forge picture as the interface draws it, its texels kept whole. */
export const pixelsOf = (picture: Picture): Node['picture'] => ({
  key: pictureName(picture),
  source: { pixels: () => new Uint8Array(picture.pixels.buffer, picture.pixels.byteOffset, picture.pixels.byteLength) },
  pixel: { width: picture.width, height: picture.height },
});

/** The whole multiple a picture is drawn at to stand within `box`, at least one: its height, and its width each way
 *  from its feet (`root`), fit. */
function scaleIn(picture: Picture, box: readonly [number, number]): number {
  const [west, , wide, tall] = boundsOf(picture);
  const rootX = picture.root?.[0] ?? picture.width / 2;
  const across = 2 * Math.max(rootX - west, west + wide - rootX);
  return Math.max(1, Math.min(Math.floor(box[1] / Math.max(1, tall)), Math.floor(box[0] / Math.max(1, across))));
}

/** A picture in a box `box` pixels at `scale` texels a pixel, standing on the box's foot, centred on its feet
 *  (`root`), so a turning figure stays where it stands. */
function stood(picture: Picture | null, scale: number, box: readonly [number, number]): Node {
  const holder: Node = { width: box[0], height: box[1], clip: true };
  if (!picture) return holder;
  const [, north, , tall] = boundsOf(picture);
  const middle = picture.root?.[0] ?? picture.width / 2;
  const [left, top] = [Math.round(box[0] / 2 - middle * scale), box[1] - (north + tall) * scale];
  return {
    ...holder,
    children: [
      {
        width: picture.width * scale,
        height: picture.height * scale,
        picture: pixelsOf(picture),
        float: { to: 'parent', x: left, y: top },
      },
    ],
  };
}

/** What the display last drew, so a view or a dress still drawn leaves the last one standing; and the scale each
 *  dress's figure is drawn at, fixed by its first view so a turn never jumps. */
const shown = { figure: null as Picture | null, scale: 1 };
const scales = new Map<string, number>();

/** The display of `dress` in a box `width` by `height` pixels at `millis` on the clock: the figure alone, in its whole
 *  height. Null with no forge or no dress yet. */
export function displayNode(
  forge: Cards | null,
  dress: Dress | null,
  width: number,
  height: number,
  millis: number,
  still: boolean,
): Node | null {
  if (!forge || !dress) return null;
  const figureBox = [width, height] as const;
  const [view, flip] = TURN[still ? 0 : Math.floor(millis / TURN_MS) % TURN.length] ?? [0, false];
  const standing = unhorsed(dress);
  const dressKey = JSON.stringify(standing);
  const figure = pictureOf(forge, standing, 'idle', view, flip);
  if (figure) {
    // Scaled to nine tenths of the height, so its head stands clear of the frame.
    const scale = scales.get(dressKey) ?? scaleIn(figure, [width, Math.round(height * 0.9)]);
    scales.set(dressKey, scale);
    [shown.figure, shown.scale] = [figure, scale];
  }
  return { direction: 'column', children: [stood(shown.figure, shown.scale, figureBox)] };
}
