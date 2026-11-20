// The Appearance screen's display, after Destiny's: the player's figure large, turning slowly a whole view at a time
// (still where less motion is asked for), and their horse beside it in its coat and barding. Shown a dress, it draws
// that one: the player's own, or with the hovered piece worn. Pictures come from the forge, composed once and kept.

import { HORSE_LAYER } from '../../forge/looks.ts';
import { bardingLayer } from '../../forge/cosmetics.ts';
import type { Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import { drawnBounds } from '../../player/iconFit.ts';
import type { Picture } from '../../player/picture.ts';
import { make } from '../../editor/dom.ts';
import { motionReduced } from '../../plus/kit.ts';

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
/** Pictures kept between builds of the screen, the least lately shown let go past this many. */
const KEPT_MOST = 96;
const kept = new Map<string, Promise<Picture | null>>();

/** A forge picture of a dress, composed once and kept by what of the dress it draws (`drawn`, the whole dress unless
 *  told). */
function pictureOf(
  forge: Cards,
  dress: Dress,
  anim: string,
  view: number,
  flip: boolean,
  alone?: readonly string[],
  drawn: unknown = dress,
): Promise<Picture | null> {
  const key = JSON.stringify([drawn, anim, view, flip, alone ?? null]);
  const found = kept.get(key);
  if (found) {
    kept.delete(key);
    kept.set(key, found);
    return found;
  }
  // A picture that failed is not kept, so it is asked for again once the forge's store retries its strips.
  const asked: Promise<Picture | null> = forge.picture(dress, anim, view, 0, alone, flip).catch(() => {
    if (kept.get(key) === asked) kept.delete(key);
    return null;
  });
  kept.set(key, asked);
  if (kept.size > KEPT_MOST) kept.delete(kept.keys().next().value ?? '');
  return asked;
}

/** A dress as its figure stands: no horse under it, so its coat and barding change nothing drawn. */
export const unhorsed = (dress: Dress): Dress => ({ ...dress, outfit: { ...dress.outfit, coat: null, barding: null } });

/** The horse of a dress by itself: its coat, and its barding stacked over it; nothing of the rider changes it but the
 *  body it is drawn for. */
export function horseOf(forge: Cards, dress: Dress, view = HORSE_VIEW): Promise<Picture | null> {
  const barding = bardingLayer(dress.outfit.barding);
  const { body, outfit } = dress;
  const layers = barding ? [HORSE_LAYER, barding] : [HORSE_LAYER];
  return pictureOf(forge, dress, 'horseidle', view, false, layers, [body, outfit.coat ?? null, barding]);
}

/** Draws a picture on a canvas `box` wide and tall at a whole multiple, `scale` texels a pixel, standing on the
 *  canvas's foot: centred on its feet (`root`), so a turning figure stays where it stands, or with `centred` on what
 *  it draws (the horse). */
function paint(
  canvas: HTMLCanvasElement,
  picture: Picture,
  scale: number,
  box: readonly [number, number],
  centred = false,
): void {
  const [west, north, wide, tall] = drawnBounds(picture.width, picture.height, picture.pixels) ?? [0, 0, 0, 0];
  const own = document.createElement('canvas');
  [own.width, own.height] = [picture.width, picture.height];
  own.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(picture.pixels), picture.width), 0, 0);
  [canvas.width, canvas.height] = box;
  const drawing = canvas.getContext('2d');
  if (!drawing) return;
  drawing.imageSmoothingEnabled = false;
  const middle = centred ? west + wide / 2 : (picture.root?.[0] ?? picture.width / 2);
  const [left, top] = [Math.round(box[0] / 2 - middle * scale), box[1] - (north + tall) * scale];
  drawing.drawImage(own, left, top, picture.width * scale, picture.height * scale);
}

/** The whole multiple a picture is drawn at to stand within `box`, at least one: its height, and its width each way
 *  from its feet (`root`), or with `centred` its width, fit. */
function scaleIn(picture: Picture, box: readonly [number, number], centred = false): number {
  const [west, , wide, tall] = drawnBounds(picture.width, picture.height, picture.pixels) ?? [0, 0, 1, 1];
  const rootX = picture.root?.[0] ?? picture.width / 2;
  const across = centred ? wide : 2 * Math.max(rootX - west, west + wide - rootX);
  return Math.max(1, Math.min(Math.floor(box[1] / tall), Math.floor(box[0] / across)));
}

/** The display: its node, and the way to show a dress on it. */
export interface Display {
  readonly node: HTMLElement;
  show(dress: Dress | null): void;
}

/** The display in a box `width` by `height` pixels: the figure in most of its height, the horse under it. With no
 *  forge or no dress yet, it says it is drawing. */
export function appearanceDisplay(forge: Cards | null, dress: Dress | null, width: number, height: number): Display {
  const node = make('div', '', 'appearance-display');
  node.setAttribute('aria-hidden', 'true');
  const figureBox = [width, Math.round(height * 0.55)] as const;
  const horseBox = [width, height - figureBox[1]] as const;
  const figure = make('canvas', '', 'appearance-figure');
  const horse = make('canvas', '', 'appearance-horse');
  node.append(figure, horse);
  let shown = dress;
  /** The scale each dress's figure and horse are drawn at, fixed by their first view so a turn never jumps. */
  const scales = new Map<string, number>();
  const still = motionReduced();
  const step = () => (still ? 0 : Math.floor(performance.now() / TURN_MS) % TURN.length);
  let drawnStep = -1;
  const draw = (turning: boolean) => {
    const wanted = shown;
    if (!forge || !wanted) return;
    const now = step();
    if (turning && now === drawnStep) return;
    drawnStep = now;
    const [view, flip] = TURN[now] ?? [0, false];
    const standing = unhorsed(wanted);
    const dressKey = JSON.stringify(standing);
    void pictureOf(forge, standing, 'idle', view, flip).then((picture) => {
      if (!picture || shown !== wanted) return;
      const scale = scales.get(`figure${dressKey}`) ?? scaleIn(picture, figureBox);
      scales.set(`figure${dressKey}`, scale);
      paint(figure, picture, scale, figureBox);
    });
    if (turning) return;
    void horseOf(forge, wanted).then((picture) => {
      if (!picture || shown !== wanted) return;
      paint(horse, picture, scaleIn(picture, horseBox, true), horseBox, true);
    });
  };
  const timer = window.setInterval(() => {
    // The screen built again or closed: this display is gone, and so is its turning.
    if (node.isConnected) draw(true);
    else window.clearInterval(timer);
  }, TURN_MS / 4);
  draw(false);
  return {
    node,
    show(next) {
      if (next === shown || JSON.stringify(next) === JSON.stringify(shown)) return;
      shown = next;
      drawnStep = -1;
      draw(false);
    },
  };
}
