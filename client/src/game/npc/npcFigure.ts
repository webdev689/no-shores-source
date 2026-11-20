// A keeper drawn large on their screen, from the forge in their own dress (keepers.ts), idle and facing the viewer:
// grown by whole pixels only, so every pixel of the forge's stays square, and breathing between the idle's two frames
// unless the player asked for less motion. Each keeper's frames are drawn once and kept.
import { make } from '../../editor/dom.ts';
import type { Cards } from '../../player/cards.ts';
import type { Picture } from '../../player/picture.ts';
import { drawnBounds } from '../../player/iconFit.ts';
import { motionReduced } from '../../plus/kit.ts';
import { KEEPERS, type KeeperKind } from '../keepers.ts';

/** The idle's frames, and how long each is held. */
const FRAMES = [0, 1];
const FRAME_MS = 600;
/** The forge's view of a figure facing the viewer. */
const FACING = 0;

const drawn = new Map<KeeperKind, (Picture | null)[]>();
const asked = new Set<KeeperKind>();
/** Each keeper's frames grown for the last size asked, so a page built again reuses them. */
const grown = new Map<KeeperKind, { readonly scale: number; readonly canvases: HTMLCanvasElement[] }>();

/** The keeper's frames, drawn once; `ready` runs as they come. A failed drawing is not kept: the next build asks
 *  again, and `ready` is not run for it, so a forge that keeps failing never loops the page. */
function framesOf(kind: KeeperKind, forge: Cards, ready: () => void): (Picture | null)[] | null {
  const kept = drawn.get(kind);
  if (kept || asked.has(kind)) return kept ?? null;
  asked.add(kind);
  const { dress } = KEEPERS[kind];
  void Promise.all(FRAMES.map((frame) => forge.picture(dress, 'idle', FACING, frame).catch(() => null))).then(
    (pictures) => {
      asked.delete(kind);
      if (!pictures[0]) return;
      drawn.set(kind, pictures);
      ready();
    },
  );
  return null;
}

/** One frame on a canvas, its clear margin trimmed, grown by the largest whole number that fits `height`. */
function frameCanvas(picture: Picture, bounds: readonly [number, number, number, number], scale: number) {
  const [west, north, width, height] = bounds;
  const own = document.createElement('canvas');
  [own.width, own.height] = [width, height];
  own
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(picture.pixels), picture.width),
      -west,
      -north,
      west,
      north,
      width,
      height,
    );
  const canvas = make('canvas', '', 'npc-figure-frame');
  [canvas.width, canvas.height] = [width * scale, height * scale];
  const drawing = canvas.getContext('2d');
  if (drawing) {
    drawing.imageSmoothingEnabled = false;
    drawing.drawImage(own, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/** The keeper's figure for a box `height` CSS pixels tall, or a word while it is drawn. */
export function keeperFigure(kind: KeeperKind, forge: Cards | null, height: number, ready: () => void): HTMLElement {
  const stand = make('div', '', 'npc-figure');
  stand.setAttribute('aria-hidden', 'true');
  const frames = forge ? framesOf(kind, forge, ready) : null;
  const first = frames?.[0];
  if (!frames || !first) return stand;
  // The frames share one box, so the figure never shifts as it breathes.
  const bounds = drawnBounds(first.width, first.height, first.pixels) ?? [0, 0, first.width, first.height];
  const ratio = devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor((height * ratio) / bounds[3]));
  const known = grown.get(kind);
  const canvases =
    known?.scale === scale
      ? known.canvases
      : frames.filter((each): each is Picture => each !== null).map((each) => frameCanvas(each, bounds, scale));
  grown.set(kind, { scale, canvases });
  for (const canvas of canvases) {
    canvas.style.width = `${canvas.width / ratio}px`;
    canvas.style.height = `${canvas.height / ratio}px`;
  }
  const [shown] = canvases;
  if (!shown) return stand;
  stand.append(shown);
  if (canvases.length > 1 && !motionReduced()) {
    let shownAt = 0;
    const timer = window.setInterval(() => {
      if (!stand.isConnected) return window.clearInterval(timer);
      shownAt = (shownAt + 1) % canvases.length;
      stand.replaceChildren(canvases[shownAt] ?? shown);
    }, FRAME_MS);
  }
  return stand;
}
