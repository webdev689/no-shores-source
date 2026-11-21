// A keeper drawn large on their screen, from the forge in their own dress (keepers.ts), idle and facing the viewer:
// grown by whole device pixels only, so every pixel of the forge's stays square, and breathing between the idle's two
// frames unless the player asked for less motion. Each keeper's frames are drawn once and kept.
import type { Cards } from '../../player/cards.ts';
import type { Picture } from '../../player/picture.ts';
import { drawnBounds } from '../../player/iconFit.ts';
import type { Node } from '../../ui/node.ts';
import { KEEPERS, type KeeperKind } from '../keepers.ts';

/** The idle's frames, and how long each is held. */
const FRAMES = [0, 1];
const FRAME_MS = 600;
/** The forge's view of a figure facing the viewer. */
const FACING = 0;

/** Each keeper's frames, trimmed to the first one's drawn box so the figure never shifts as it breathes. */
interface Frames {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly Uint8Array[];
}
const drawn = new Map<KeeperKind, Frames>();
const asked = new Set<KeeperKind>();

/** `picture`'s pixels inside `bounds`, a row at a time. */
function trimmed(picture: Picture, [west, north, width, height]: readonly [number, number, number, number]) {
  const out = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((north + row) * picture.width + west) * 4;
    out.set(picture.pixels.subarray(from, from + width * 4), row * width * 4);
  }
  return out;
}

/** The keeper's frames, drawn once; null while they are drawn. A failed drawing is not kept: the next frame asks
 *  again. */
export function framesOf(kind: KeeperKind, forge: Cards): Frames | null {
  const kept = drawn.get(kind);
  if (kept || asked.has(kind)) return kept ?? null;
  asked.add(kind);
  const { dress } = KEEPERS[kind];
  void Promise.all(FRAMES.map((frame) => forge.picture(dress, 'idle', FACING, frame).catch(() => null))).then(
    (pictures) => {
      asked.delete(kind);
      const [first] = pictures;
      if (!first) return;
      const bounds = drawnBounds(first.width, first.height, first.pixels) ?? [0, 0, first.width, first.height];
      const pixels = pictures.filter((each): each is Picture => each !== null).map((each) => trimmed(each, bounds));
      drawn.set(kind, { width: bounds[2], height: bounds[3], pixels });
    },
  );
  return null;
}

/** The keeper's figure for a box `height` CSS pixels tall at `ratio` device pixels a CSS pixel, at `millis` on the
 *  clock; null while it is drawn. */
export function keeperFigure(
  kind: KeeperKind,
  forge: Cards | null,
  height: number,
  ratio: number,
  millis: number,
  still: boolean,
): Node | null {
  const frames = forge ? framesOf(kind, forge) : null;
  if (!frames || frames.pixels.length === 0) return null;
  const scale = Math.max(1, Math.floor((height * ratio) / frames.height));
  const shown = still ? 0 : Math.floor(millis / FRAME_MS) % frames.pixels.length;
  const pixels = frames.pixels[shown] ?? frames.pixels[0];
  if (!pixels) return null;
  return {
    width: (frames.width * scale) / ratio,
    height: (frames.height * scale) / ratio,
    picture: {
      key: `keeper ${kind} ${shown}`,
      source: { pixels: () => pixels },
      pixel: { width: frames.width, height: frames.height },
    },
  };
}
